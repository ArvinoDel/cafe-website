export type BranchLocation = {
  id: string;
  name: string;
  address: string | null;
  opening_hours?: string | null;
  maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

// Known coordinates mapping by branch IDs
const KNOWN_COORDINATES: Record<string, { lat: number; lng: number }> = {
  '89ab9179-bf91-42de-a5ae-fc1913c290f2': { lat: -6.7212, lng: 108.5559 }, // Cirebon
  '2fa23724-99f3-4d61-a26e-902954527bd8': { lat: -6.2615, lng: 106.8106 }, // Jakarta Selatan
  'a0000000-0000-0000-0000-000000000001': { lat: -6.1754, lng: 106.8272 }, // Jakarta Pusat
};

export function getBranchCoordinates(branch: BranchLocation): { lat: number; lng: number } {
  if (branch.latitude != null && branch.longitude != null && !isNaN(branch.latitude) && !isNaN(branch.longitude)) {
    return { lat: Number(branch.latitude), lng: Number(branch.longitude) };
  }
  if (KNOWN_COORDINATES[branch.id]) {
    return KNOWN_COORDINATES[branch.id];
  }
  if (branch.maps_url) {
    const match = branch.maps_url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || branch.maps_url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }
  }
  const str = `${branch.name} ${branch.address || ''}`.toLowerCase();
  if (str.includes('cirebon')) return { lat: -6.7212, lng: 108.5559 };
  if (str.includes('jakarta') || str.includes('jaksel') || str.includes('selatan')) return { lat: -6.2615, lng: 106.8106 };
  if (str.includes('bogor')) return { lat: -6.5971, lng: 106.8060 };
  if (str.includes('bandung')) return { lat: -6.9175, lng: 107.6191 };
  if (str.includes('surabaya')) return { lat: -7.2575, lng: 112.7521 };
  if (str.includes('semarang')) return { lat: -6.9667, lng: 110.4167 };
  if (str.includes('jogja') || str.includes('yogyakarta')) return { lat: -7.7956, lng: 110.3695 };
  if (str.includes('tangerang')) return { lat: -6.1783, lng: 106.6319 };
  if (str.includes('bekasi')) return { lat: -6.2383, lng: 106.9756 };
  if (str.includes('depok')) return { lat: -6.4025, lng: 106.7942 };
  return { lat: -6.2088, lng: 106.8456 }; // Default Jakarta
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

