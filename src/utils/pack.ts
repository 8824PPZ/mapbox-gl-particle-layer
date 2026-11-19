/**
 * 16-bit packing of normalized coordinates into two 8-bit texture channels.
 *
 * The particle simulation runs on plain RGBA8 render targets (every WebGL1
 * device can render to them) instead of float textures, so a position in
 * `[0, 1]` is stored as `hi`/`lo` bytes across two channels:
 *
 *   `r` = high byte of x, `b` = low byte of x
 *   `g` = high byte of y, `a` = low byte of y
 *
 * That gives ~1/65025 of the wind field — around 0.006° for a global image,
 * i.e. sub-pixel at any usable zoom, with no visible stepping.
 */

export function packChannel(value: number): [number, number] {
  const clamped = value <= 0 ? 0 : value >= 1 ? 1 : value;
  const v = clamped * 255;
  const hi = Math.floor(v);
  const lo = Math.floor((v - hi) * 255 + 0.5);
  if (lo >= 255) return [Math.min(255, hi + 1), 0];
  return [hi, lo];
}

export function unpackChannel(hi: number, lo: number): number {
  return (hi * 255 + lo) / 65025;
}

/** Pack `[x, y]` in `[0, 1]` into the four byte channels (`r, g, b, a`). */
export function packPosition(x: number, y: number): [number, number, number, number] {
  const [hx, lx] = packChannel(x);
  const [hy, ly] = packChannel(y);
  return [hx, hy, lx, ly];
}

/** Inverse of `packPosition`. */
export function unpackPosition(r: number, g: number, b: number, a: number): [number, number] {
  return [unpackChannel(r, b), unpackChannel(g, a)];
}
