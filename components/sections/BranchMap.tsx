'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as LeafletMap, Marker, LayerGroup } from 'leaflet';
import {
  MapPin,
  Crosshair,
  Navigation,
  Compass,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import {
  BranchLocation,
  getBranchCoordinates,
  calculateDistanceKm,
  getGoogleMapsDirectionsUrl,
} from '@/lib/branch-coords';

export type BranchWithDistance = BranchLocation & {
  lat: number;
  lng: number;
  distanceKm?: number;
};

interface BranchMapProps {
  branches: BranchLocation[];
  onSelectBranch?: (branchId: string) => void;
  onClosestFound?: (closest: { branchId: string; distanceKm: number } | null) => void;
  selectedBranchId?: string | null;
  onUserLocationChange?: (loc: { lat: number; lng: number } | null) => void;
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function BranchMap({
  branches,
  onSelectBranch,
  onClosestFound,
  selectedBranchId,
  onUserLocationChange,
}: BranchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Engine state: 'google' | 'osm'
  const [activeEngine, setActiveEngine] = useState<'google' | 'osm'>(
    GOOGLE_MAPS_KEY ? 'google' : 'osm'
  );

  // Leaflet refs
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletMarkersRef = useRef<LayerGroup | null>(null);
  const leafletUserMarkerRef = useRef<Marker | null>(null);

  // Google Maps refs
  const googleMapRef = useRef<any>(null);
  const googleMarkersRef = useRef<any[]>([]);
  const googleUserMarkerRef = useRef<any>(null);
  const googleInfoWindowRef = useRef<any>(null);

  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [googleMapsLoaded, setGoogleMapsLoaded] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'detecting' | 'success' | 'error'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [closestBranch, setClosestBranch] = useState<{ branch: BranchLocation; distanceKm: number } | null>(null);

  // Load Google Maps script if key exists
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) {
      setActiveEngine('osm');
      return;
    }

    if (typeof window !== 'undefined' && (window as any).google?.maps) {
      setGoogleMapsLoaded(true);
      setActiveEngine('google');
      return;
    }

    const scriptId = 'google-maps-api-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => {
      setGoogleMapsLoaded(true);
      setActiveEngine('google');
    };

    const handleError = () => {
      console.warn('[BranchMap] Google Maps failed to load, falling back to OpenStreetMap.');
      setActiveEngine('osm');
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, []);

  // Dynamically load leaflet when OSM engine is active
  useEffect(() => {
    if (activeEngine !== 'osm') return;
    let mounted = true;
    Promise.all([
      import('leaflet'),
      // @ts-expect-error leaflet css import
      import('leaflet/dist/leaflet.css'),
    ])
      .then(([leaflet]) => {
        if (mounted) {
          setL(leaflet.default || leaflet);
        }
      })
      .catch((err) => {
        console.error('[BranchMap] Failed to load Leaflet:', err);
      });
    return () => {
      mounted = false;
    };
  }, [activeEngine]);

  // Compute branches with coordinates and live distance
  const branchesWithCoords: BranchWithDistance[] = branches.map((branch) => {
    const coords = getBranchCoordinates(branch);
    let distanceKm: number | undefined;
    if (userLocation) {
      distanceKm = calculateDistanceKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng);
    }
    return {
      ...branch,
      lat: coords.lat,
      lng: coords.lng,
      distanceKm,
    };
  });

  // Calculate closest branch whenever user location changes
  useEffect(() => {
    if (!userLocation || branchesWithCoords.length === 0) {
      setClosestBranch(null);
      onClosestFound?.(null);
      return;
    }

    let minDistance = Infinity;
    let closestItem: BranchWithDistance | null = null;

    branchesWithCoords.forEach((b) => {
      if (b.distanceKm !== undefined && b.distanceKm < minDistance) {
        minDistance = b.distanceKm;
        closestItem = b;
      }
    });

    if (closestItem) {
      const result = { branch: closestItem, distanceKm: minDistance };
      setClosestBranch(result);
      onClosestFound?.({ branchId: (closestItem as BranchWithDistance).id, distanceKm: minDistance });
    }
  }, [userLocation, branches.length]);

  // Inform parent of user location change
  useEffect(() => {
    onUserLocationChange?.(userLocation);
  }, [userLocation, onUserLocationChange]);

  // ─── GOOGLE MAPS ENGINE INITIALIZATION ─────────────────────────────────────
  useEffect(() => {
    if (activeEngine !== 'google' || !googleMapsLoaded || !mapContainerRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    if (!googleMapRef.current) {
      const lats = branchesWithCoords.map((b) => b.lat);
      const lngs = branchesWithCoords.map((b) => b.lng);
      const avgLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : -6.2088;
      const avgLng = lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 106.8456;

      const map = new google.maps.Map(mapContainerRef.current, {
        center: { lat: avgLat, lng: avgLng },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      googleMapRef.current = map;
      googleInfoWindowRef.current = new google.maps.InfoWindow();

      if (branchesWithCoords.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        branchesWithCoords.forEach((b) => bounds.extend({ lat: b.lat, lng: b.lng }));
        map.fitBounds(bounds, 50);
      }
    }
  }, [activeEngine, googleMapsLoaded]);

  // ─── GOOGLE MAPS MARKERS UPDATE ───────────────────────────────────────────
  useEffect(() => {
    if (activeEngine !== 'google' || !googleMapRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;
    const map = googleMapRef.current;

    // Clear existing markers
    googleMarkersRef.current.forEach((m) => m.setMap(null));
    googleMarkersRef.current = [];

    // Add branch markers
    branchesWithCoords.forEach((branch) => {
      const isClosest = closestBranch?.branch.id === branch.id;
      const directionsUrl = getGoogleMapsDirectionsUrl(branch, userLocation);

      // SVG Pin Icon
      const pinColor = isClosest ? '%23059669' : '%236b4122';
      const svgIcon = `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46"><path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28c0-9.94-8.06-18-18-18z" fill="${pinColor}" stroke="%23ffffff" stroke-width="2"/><circle cx="18" cy="18" r="7" fill="%23faf6f2"/></svg>`;

      const marker = new google.maps.Marker({
        position: { lat: branch.lat, lng: branch.lng },
        map,
        title: branch.name,
        icon: {
          url: svgIcon,
          scaledSize: new google.maps.Size(36, 46),
          anchor: new google.maps.Point(18, 46),
        },
      });

      const popupContent = `
        <div style="padding: 8px; font-family: sans-serif; max-width: 240px; text-align: left;">
          <div style="font-weight: bold; font-size: 14px; color: #3a2415; margin-bottom: 4px;">
            ${branch.name} ${isClosest ? '<span style="color:#059669; font-size:11px;">(★ Terdekat)</span>' : ''}
          </div>
          ${branch.address ? `<div style="font-size: 12px; color: #666; margin-bottom: 6px;">${branch.address}</div>` : ''}
          ${
            branch.distanceKm !== undefined
              ? `<div style="font-size: 11px; font-weight: bold; color: #6b4122; margin-bottom: 8px;">
                  📍 ± ${branch.distanceKm} km dari kamu
                </div>`
              : ''
          }
          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <a href="/menu" style="display:inline-block; padding: 4px 10px; background:#6b4122; color:#fff; font-size:11px; font-weight:bold; border-radius:6px; text-decoration:none;">
              Pesan di sini
            </a>
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding: 4px 10px; background:#e4c298; color:#3a2415; font-size:11px; font-weight:bold; border-radius:6px; text-decoration:none;">
              Petunjuk Arah ↗
            </a>
          </div>
        </div>
      `;

      marker.addListener('click', () => {
        if (googleInfoWindowRef.current) {
          googleInfoWindowRef.current.setContent(popupContent);
          googleInfoWindowRef.current.open(map, marker);
        }
        onSelectBranch?.(branch.id);
      });

      googleMarkersRef.current.push(marker);
    });

    // User GPS location marker
    if (userLocation) {
      if (!googleUserMarkerRef.current) {
        const userSvg = `data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%232563eb" stroke="%23ffffff" stroke-width="3"/></svg>`;
        const userMarker = new google.maps.Marker({
          position: { lat: userLocation.lat, lng: userLocation.lng },
          map,
          title: 'Lokasimu Saat Ini',
          icon: {
            url: userSvg,
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 12),
          },
        });
        googleUserMarkerRef.current = userMarker;
      } else {
        googleUserMarkerRef.current.setPosition({ lat: userLocation.lat, lng: userLocation.lng });
      }
    }
  }, [activeEngine, branchesWithCoords, closestBranch?.branch.id, userLocation]);

  // ─── LEAFLET (OPENSTREETMAP) ENGINE INITIALIZATION ─────────────────────────
  useEffect(() => {
    if (activeEngine !== 'osm' || !L || !mapContainerRef.current || leafletMapRef.current) return;

    const lats = branchesWithCoords.map((b) => b.lat);
    const lngs = branchesWithCoords.map((b) => b.lng);
    const avgLat = lats.length > 0 ? lats.reduce((a, b) => a + b, 0) / lats.length : -6.2088;
    const avgLng = lngs.length > 0 ? lngs.reduce((a, b) => a + b, 0) / lngs.length : 106.8456;

    const map = L.map(mapContainerRef.current, {
      center: [avgLat, avgLng],
      zoom: 11,
      scrollWheelZoom: false,
      zoomControl: false,
    });

    // 100% Free OpenStreetMap tile layer (no API key, no trial, no account needed)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    leafletMarkersRef.current = markersLayer;
    leafletMapRef.current = map;

    if (branchesWithCoords.length > 1) {
      const bounds = L.latLngBounds(branchesWithCoords.map((b) => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [activeEngine, L]);

  // ─── LEAFLET MARKERS UPDATE ───────────────────────────────────────────────
  useEffect(() => {
    if (activeEngine !== 'osm' || !L || !leafletMapRef.current || !leafletMarkersRef.current) return;

    const map = leafletMapRef.current;
    const layer = leafletMarkersRef.current;
    layer.clearLayers();

    branchesWithCoords.forEach((branch) => {
      const isClosest = closestBranch?.branch.id === branch.id;
      const isSelected = selectedBranchId === branch.id;
      const directionsUrl = getGoogleMapsDirectionsUrl(branch, userLocation);

      const iconHtml = `
        <div class="relative group cursor-pointer -translate-x-1/2 -translate-y-full">
          ${
            isClosest
              ? `
            <div class="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-emerald-600 text-cream text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-emerald-400/50 animate-bounce">
              <span>★ Terdekat</span>
            </div>
            <div class="absolute -inset-1.5 rounded-full bg-emerald-500/30 animate-ping"></div>
          `
              : ''
          }
          <div class="flex items-center justify-center w-10 h-10 rounded-2xl ${
            isClosest
              ? 'bg-emerald-600 ring-4 ring-emerald-200 text-cream'
              : isSelected
              ? 'bg-coffee-900 ring-4 ring-coffee-300 text-cream scale-110'
              : 'bg-coffee-700 ring-2 ring-white text-cream hover:bg-coffee-800 hover:scale-105'
          } shadow-lg transition-transform duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z"/><path d="M6 2v2"/><path d="M17 10h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2"/>
            </svg>
          </div>
          <div class="w-2.5 h-2.5 bg-coffee-800 rotate-45 mx-auto -mt-1 shadow-xs"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-cafe-marker',
        iconSize: [40, 48],
        iconAnchor: [20, 48],
        popupAnchor: [0, -48],
      });

      const marker = L.marker([branch.lat, branch.lng], { icon: customIcon });

      const popupHtml = `
        <div class="p-2 min-w-[210px] text-left font-sans">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-xs font-bold text-coffee-900">${branch.name}</span>
            ${
              isClosest
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Terdekat</span>'
                : ''
            }
          </div>
          ${
            branch.address
              ? `<p class="text-xs text-charcoal/70 mb-2 leading-relaxed">${branch.address}</p>`
              : ''
          }
          ${
            branch.distanceKm !== undefined
              ? `<div class="inline-flex items-center gap-1 px-2 py-0.5 mb-2 rounded bg-coffee-50 text-coffee-800 text-[11px] font-semibold">
                  <span>📍 ± ${branch.distanceKm} km dari kamu</span>
                </div>`
              : ''
          }
          <div class="flex items-center gap-2 mt-2 pt-2 border-t border-coffee-100">
            <a href="/menu" class="text-xs font-semibold px-2.5 py-1 rounded bg-coffee-700 text-cream hover:bg-coffee-800 transition-colors">
              Pesan di sini
            </a>
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold px-2.5 py-1 rounded bg-sand-200 text-coffee-900 hover:bg-sand-300 transition-colors inline-flex items-center gap-1">
              Petunjuk Arah ↗
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 260, closeButton: false });
      marker.on('click', () => {
        onSelectBranch?.(branch.id);
      });

      layer.addLayer(marker);
    });

    if (userLocation) {
      if (leafletUserMarkerRef.current) {
        leafletUserMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      } else {
        const userIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center w-7 h-7 -translate-x-1/2 -translate-y-1/2">
              <div class="absolute w-10 h-10 rounded-full bg-blue-500/25 animate-ping"></div>
              <div class="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
            </div>
          `,
          className: 'custom-user-marker',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon });
        userMarker.bindPopup(
          '<div class="p-1 text-xs font-semibold text-charcoal">📍 Lokasi Kamu Sekarang</div>',
          { closeButton: false }
        );
        userMarker.addTo(map);
        leafletUserMarkerRef.current = userMarker;
      }
    }
  }, [activeEngine, L, branchesWithCoords, closestBranch?.branch.id, selectedBranchId, userLocation]);

  // Request GPS Location from browser
  const handleDetectGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsErrorMsg('Browser kamu belum mendukung akses lokasi GPS.');
      return;
    }

    setGpsStatus('detecting');
    setGpsErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newLocation = { lat: latitude, lng: longitude };
        setUserLocation(newLocation);
        setGpsStatus('success');

        // Center on Google Map or Leaflet
        if (activeEngine === 'google' && googleMapRef.current) {
          const google = (window as any).google;
          const map = googleMapRef.current;
          const bounds = new google.maps.LatLngBounds();
          bounds.extend({ lat: latitude, lng: longitude });

          // Find closest branch
          let closest: BranchWithDistance | null = null;
          let minDist = Infinity;
          branchesWithCoords.forEach((b) => {
            const dist = calculateDistanceKm(latitude, longitude, b.lat, b.lng);
            if (dist < minDist) {
              minDist = dist;
              closest = b;
            }
          });

          if (closest) {
            bounds.extend({ lat: (closest as BranchWithDistance).lat, lng: (closest as BranchWithDistance).lng });
            map.fitBounds(bounds, 60);
          } else {
            map.setCenter({ lat: latitude, lng: longitude });
            map.setZoom(14);
          }
        } else if (activeEngine === 'osm' && leafletMapRef.current && L) {
          const map = leafletMapRef.current;
          const points: [number, number][] = [[latitude, longitude]];

          let closest: BranchWithDistance | null = null;
          let minDist = Infinity;
          branchesWithCoords.forEach((b) => {
            const dist = calculateDistanceKm(latitude, longitude, b.lat, b.lng);
            if (dist < minDist) {
              minDist = dist;
              closest = b;
            }
          });

          if (closest) {
            points.push([(closest as BranchWithDistance).lat, (closest as BranchWithDistance).lng]);
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
          } else {
            map.setView([latitude, longitude], 13);
          }
        }
      },
      (err) => {
        setGpsStatus('error');
        if (err.code === err.PERMISSION_DENIED) {
          setGpsErrorMsg('Akses lokasi belum diizinkan. Silakan aktifkan izin lokasi di browser.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsErrorMsg('Sinyal GPS tidak ditemukan. Pastikan GPS perangkatmu aktif.');
        } else {
          setGpsErrorMsg('Gagal mendeteksi lokasi. Coba beberapa saat lagi.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [activeEngine, L, branchesWithCoords]);

  // Auto-check if permission is already granted on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((permission) => {
          if (permission.state === 'granted') {
            handleDetectGps();
          }
        })
        .catch(() => {});
    }
  }, [handleDetectGps]);

  // Reset map view
  const handleResetView = () => {
    if (branchesWithCoords.length === 0) return;

    if (activeEngine === 'google' && googleMapRef.current) {
      const google = (window as any).google;
      const map = googleMapRef.current;
      const bounds = new google.maps.LatLngBounds();
      branchesWithCoords.forEach((b) => bounds.extend({ lat: b.lat, lng: b.lng }));
      map.fitBounds(bounds, 50);
    } else if (activeEngine === 'osm' && leafletMapRef.current && L) {
      const map = leafletMapRef.current;
      if (branchesWithCoords.length > 1) {
        const bounds = L.latLngBounds(branchesWithCoords.map((b) => [b.lat, b.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      } else {
        map.setView([branchesWithCoords[0].lat, branchesWithCoords[0].lng], 13);
      }
    }
  };

  // Pan to closest branch
  const handleFocusClosest = () => {
    if (!closestBranch) return;
    const b = closestBranch.branch;
    const coords = getBranchCoordinates(b);

    if (activeEngine === 'google' && googleMapRef.current) {
      const map = googleMapRef.current;
      map.panTo({ lat: coords.lat, lng: coords.lng });
      map.setZoom(15);
    } else if (activeEngine === 'osm' && leafletMapRef.current) {
      const map = leafletMapRef.current;
      map.flyTo([coords.lat, coords.lng], 15, { duration: 1.2 });
    }
    onSelectBranch?.(b.id);
  };

  const closestDirectionsUrl = closestBranch
    ? getGoogleMapsDirectionsUrl(closestBranch.branch, userLocation)
    : null;

  return (
    <div className="w-full mb-10 sm:mb-14">
      {/* Top Banner / GPS Action bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3 bg-white p-3 sm:px-4 sm:py-3 rounded-2xl border border-coffee-100 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-coffee-50 text-coffee-700 shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            {closestBranch ? (
              <p className="text-xs sm:text-sm font-semibold text-coffee-900 truncate">
                Cabang Terdekat:{' '}
                <span className="font-extrabold text-coffee-700">{closestBranch.branch.name}</span>
                <span className="text-emerald-700 font-bold ml-1.5">
                  (± {closestBranch.distanceKm} km dari kamu)
                </span>
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-charcoal/70 truncate">
                Aktifkan GPS untuk menemukan cabang kopi terdekat dari lokasimu
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {closestBranch && closestDirectionsUrl && (
            <a
              href={closestDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Petunjuk Arah Google Maps ↗</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleDetectGps}
            disabled={gpsStatus === 'detecting'}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-coffee-700 text-cream text-xs font-semibold hover:bg-coffee-800 disabled:opacity-75 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            {gpsStatus === 'detecting' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Mendeteksi GPS...</span>
              </>
            ) : userLocation ? (
              <>
                <Crosshair className="w-3.5 h-3.5 text-emerald-300" />
                <span>Perbarui Lokasi GPS</span>
              </>
            ) : (
              <>
                <Navigation className="w-3.5 h-3.5" />
                <span>Cari yang Terdekat (GPS)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {gpsErrorMsg && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center justify-between">
          <span>{gpsErrorMsg}</span>
          <button
            type="button"
            onClick={() => setGpsErrorMsg(null)}
            className="text-amber-600 hover:text-amber-900 font-bold ml-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Map Canvas Container */}
      <div className="relative w-full h-[320px] sm:h-[400px] lg:h-[450px] rounded-2xl sm:rounded-3xl overflow-hidden border border-coffee-200/80 shadow-soft-lg bg-sand-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Quick Controls on the Map */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleResetView}
            title="Reset tampilan semua cabang"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xs text-coffee-800 border border-coffee-200 shadow-md hover:bg-white transition-all cursor-pointer active:scale-90"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDetectGps}
            title="Deteksi lokasi saya saat ini"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/95 backdrop-blur-xs text-coffee-800 border border-coffee-200 shadow-md hover:bg-white transition-all cursor-pointer active:scale-90"
          >
            <Crosshair className="w-4 h-4 text-coffee-700" />
          </button>
        </div>

        {/* Legend Tag in Bottom-Left */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-coffee-100 text-[11px] font-medium text-coffee-900 shadow-sm pointer-events-none">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-coffee-700 inline-block"></span> Cabang
          </span>
          {closestBranch && (
            <span className="flex items-center gap-1 text-emerald-700 font-bold ml-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span> Terdekat
            </span>
          )}
          {userLocation && (
            <span className="flex items-center gap-1 text-blue-700 font-bold ml-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span> Lokasimu
            </span>
          )}
          <span className="text-[10px] text-charcoal/40 ml-1 border-l border-coffee-200 pl-2">
            {activeEngine === 'google' ? 'Google Maps' : 'OpenStreetMap'}
          </span>
        </div>
      </div>
    </div>
  );
}
