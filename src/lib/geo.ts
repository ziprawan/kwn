export interface LatLng {
  lat: number;
  lng: number;
}

export interface ToiletImageItem {
  id: string;
  imagePath: string;
  uploadedByEmail?: string | null;
  createdAt?: string | Date;
}

export interface ToiletPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imagePath: string | null;
  images: ToiletImageItem[];
  updatedAt?: string | Date;
}

export const ITB_CENTER: LatLng = {
  lat: -6.8909,
  lng: 107.6104,
};

export const ITB_DEFAULT_ZOOM = 17;
export const ITB_MIN_ZOOM = 15;
export const ITB_MAX_ZOOM = 19;

// Generous panning bounds centered on ITB Kampus Ganesha so campus stays in focus
// while nearby Tamansari / Cisitu / Dago users can still view walking routes in.
export const ITB_SOFT_BOUNDS: [[number, number], [number, number]] = [
  [-6.9005, 107.599],
  [-6.878, 107.6215],
];

// Validation bounds covering ITB Kampus Ganesha (Sabuga/Saraga through Jl. Ganesha & Salman/SBM)
export const ITB_PIN_BOUNDS = {
  minLat: -6.899,
  maxLat: -6.881,
  minLng: 107.601,
  maxLng: 107.619,
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function isValidLatitudeLongitude(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isWithinItbPinBounds(lat: number, lng: number): boolean {
  return (
    isValidLatitudeLongitude(lat, lng) &&
    lat >= ITB_PIN_BOUNDS.minLat &&
    lat <= ITB_PIN_BOUNDS.maxLat &&
    lng >= ITB_PIN_BOUNDS.minLng &&
    lng <= ITB_PIN_BOUNDS.maxLng
  );
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatDistanceId(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    return "-";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = (meters / 1000).toFixed(1).replace(".", ",");
  return `${km} km`;
}

export function formatDurationId(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  if (seconds < 60) {
    return "< 1 mnt jalan";
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} mnt jalan`;
}

export function findNearestCandidates<T extends { latitude: number; longitude: number }>(
  userLat: number,
  userLng: number,
  toilets: T[],
  limit = 3
): Array<{ toilet: T; straightDistanceMeters: number }> {
  return toilets
    .map((toilet) => ({
      toilet,
      straightDistanceMeters: haversineMeters(
        userLat,
        userLng,
        toilet.latitude,
        toilet.longitude
      ),
    }))
    .sort((a, b) => a.straightDistanceMeters - b.straightDistanceMeters)
    .slice(0, Math.max(1, limit));
}

export function buildGoogleMapsWalkingUrl(
  destLat: number,
  destLng: number,
  originLat?: number | null,
  originLng?: number | null
): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destLat},${destLng}`,
    travelmode: "walking",
  });
  if (
    typeof originLat === "number" &&
    typeof originLng === "number" &&
    isValidLatitudeLongitude(originLat, originLng)
  ) {
    params.set("origin", `${originLat},${originLng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
