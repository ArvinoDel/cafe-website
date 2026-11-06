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
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import {
  BranchLocation,
  getBranchCoordinates,
  calculateDistanceKm,
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
}

export default function BranchMap({
  branches,
  onSelectBranch,
  onClosestFound,
  selectedBranchId,
}: BranchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersLayerRef = useRef<LayerGroup | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);

  const [L, setL] = useState<typeof import('leaflet') | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'detecting' | 'success' | 'error'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [closestBranch, setClosestBranch] = useState<{ branch: BranchLocation; distanceKm: number } | null>(null);

  // Dynamically load leaflet on client side only
  useEffect(() => {
    let mounted = true;
    Promise.all([
      import('leaflet'),
      // @ts-expect-error leaflet css import
      import('leaflet/dist/leaflet.css'),
    ]).then(([leaflet]) => {
      if (mounted) {
        setL(leaflet.default || leaflet);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Compute branches with coordinates
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

  // Initialize Leaflet map
  useEffect(() => {
    if (!L || !mapContainerRef.current || mapInstanceRef.current) return;

    // Calculate initial center and bounds
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

    // Add zoom control in top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    // Initial fit bounds to include all branches
    if (branchesWithCoords.length > 1) {
      const bounds = L.latLngBounds(branchesWithCoords.map((b) => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [L]);

  // Render / update markers on map
  useEffect(() => {
    if (!L || !mapInstanceRef.current || !markersLayerRef.current) return;

    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    // 1. Add branch markers
    branchesWithCoords.forEach((branch) => {
      const isClosest = closestBranch?.branch.id === branch.id;
      const isSelected = selectedBranchId === branch.id;

      // Custom HTML Marker Pin
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

      // Popup Content
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
            ${
              branch.maps_url
                ? `<a href="${branch.maps_url}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold px-2.5 py-1 rounded bg-sand-200 text-coffee-900 hover:bg-sand-300 transition-colors inline-flex items-center gap-1">
                    Arah ↗
                  </a>`
                : ''
            }
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 260, closeButton: false });
      marker.on('click', () => {
        onSelectBranch?.(branch.id);
      });

      layer.addLayer(marker);
    });

    // 2. Add or update user GPS marker
    if (userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
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
        userMarkerRef.current = userMarker;
      }
    }
  }, [L, branchesWithCoords, closestBranch?.branch.id, selectedBranchId, userLocation]);

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

        if (mapInstanceRef.current && L) {
          // If we have branches, fit bounds to show both user and closest branch
          const map = mapInstanceRef.current;
          const points: [number, number][] = [[latitude, longitude]];

          // Find closest branch to focus
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
          setGpsErrorMsg('Akses lokasi belum diizinkan. Silakan izinkan izin lokasi di browser.');
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
  }, [L, branchesWithCoords]);

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

  // Reset map view to show all branches
  const handleResetView = () => {
    if (!mapInstanceRef.current || !L || branchesWithCoords.length === 0) return;
    const map = mapInstanceRef.current;
    if (branchesWithCoords.length > 1) {
      const bounds = L.latLngBounds(branchesWithCoords.map((b) => [b.lat, b.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else {
      map.setView([branchesWithCoords[0].lat, branchesWithCoords[0].lng], 13);
    }
  };

  // Pan to closest branch
  const handleFocusClosest = () => {
    if (!closestBranch || !mapInstanceRef.current || !L) return;
    const map = mapInstanceRef.current;
    const b = closestBranch.branch;
    const coords = getBranchCoordinates(b);
    map.flyTo([coords.lat, coords.lng], 15, { duration: 1.2 });
    onSelectBranch?.(b.id);
  };

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
          {closestBranch && (
            <button
              type="button"
              onClick={handleFocusClosest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Lihat di Peta</span>
            </button>
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
        </div>
      </div>
    </div>
  );
}

