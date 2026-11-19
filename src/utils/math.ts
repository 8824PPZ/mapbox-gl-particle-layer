export type LonLatBoundsTuple = readonly [number, number, number, number];

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/** Meters per degree at the equator. */
export const METERS_PER_DEGREE_LON = 111320;
export const METERS_PER_DEGREE_LAT = 110540;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wrap `lon` into `[-180, 180)`. */
export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Web-mercator `x` in `[0, 1]` (west → east). */
export function mercatorX(lon: number): number {
  return (lon + 180) / 360;
}

/** Web-mercator `y` in `[0, 1]` (north → south), the same axis Mapbox uses. */
export function mercatorY(lat: number): number {
  const clamped = clamp(lat, -85.0511287798, 85.0511287798);
  const sin = Math.sin(clamped * DEG_TO_RAD);
  return 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;
}

/** `[lon, lat]` → normalized web-mercator `[x, y]`. */
export function lonLatToMercator(lon: number, lat: number): [number, number] {
  return [mercatorX(lon), mercatorY(lat)];
}

/** `[x, y]` normalized web-mercator → `[lon, lat]`. */
export function mercatorToLonLat(x: number, y: number): [number, number] {
  const lon = x * 360 - 180;
  const lat = RAD_TO_DEG * (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2);
  return [lon, lat];
}

/** Smallest perfect square `>= count` (the particle texture is square). */
export function squareSide(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
}

/** Whether the four numbers are finite and define a non-degenerate box. */
export function isValidBounds(bounds: unknown): bounds is LonLatBoundsTuple {
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  if (!bounds.every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  const [w, s, e, n] = bounds as number[];
  return e > w && n > s;
}

/** Clamp a bounding box to the valid lon/lat domain. */
export function normalizeBounds(bounds: LonLatBoundsTuple): [number, number, number, number] {
  const west = clamp(wrapLongitude(bounds[0]), -180, 180);
  const south = clamp(bounds[1], -89.9, 89.9);
  const east = clamp(wrapLongitude(bounds[2]), -180, 180);
  const north = clamp(bounds[3], -89.9, 89.9);
  return [
    Math.min(west, east),
    Math.min(south, north),
    Math.max(west, east),
    Math.max(south, north),
  ];
}

/** Number of metres per degree of longitude at a given latitude. */
export function metersPerDegreeLon(lat: number): number {
  return METERS_PER_DEGREE_LON * Math.max(Math.cos(lat * DEG_TO_RAD), 0.05);
}

/** Intersect `a` with `b`; returns `a` when there is no overlap. */
export function intersectBounds(
  a: LonLatBoundsTuple,
  b: LonLatBoundsTuple,
): [number, number, number, number] {
  const west = Math.max(a[0], b[0]);
  const south = Math.max(a[1], b[1]);
  const east = Math.min(a[2], b[2]);
  const north = Math.min(a[3], b[3]);
  if (east <= west || north <= south) return [a[0], a[1], a[2], a[3]];
  return [west, south, east, north];
}
