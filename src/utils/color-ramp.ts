import type { ColorRampPreset, ColorRampStops } from '../types';

export type RGBA = [number, number, number, number];

export const COLOR_RAMP_PRESETS: Record<ColorRampPreset, ColorRampStops> = {
  /** Calm → gale. Reads well on light and satellite basemaps. */
  wind: [
    [0.0, '#2c7bb6'],
    [0.22, '#00a6ca'],
    [0.45, '#00ccbc'],
    [0.68, '#90eb9d'],
    [0.86, '#f9d057'],
    [1.0, '#f29e2e'],
  ],
  viridis: [
    [0.0, '#440154'],
    [0.25, '#3b528b'],
    [0.5, '#21918c'],
    [0.75, '#5ec962'],
    [1.0, '#fde725'],
  ],
  plasma: [
    [0.0, '#0d0887'],
    [0.25, '#7e03a8'],
    [0.5, '#cc4778'],
    [0.75, '#f89540'],
    [1.0, '#f0f921'],
  ],
  /** Cold blue → magenta → fire, nice over dark styles. */
  thermal: [
    [0.0, '#0b1a3a'],
    [0.3, '#2c5aa0'],
    [0.55, '#b7416e'],
    [0.8, '#f08a24'],
    [1.0, '#fce38a'],
  ],
  /** Single-hue ramp for dense particle fields. */
  mono: [
    [0.0, '#c9dcee'],
    [0.5, '#6f8fae'],
    [1.0, '#12293f'],
  ],
};

const NAMED: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  white: [255, 255, 255, 255],
  black: [0, 0, 0, 255],
  red: [255, 0, 0, 255],
  green: [0, 128, 0, 255],
  blue: [0, 0, 255, 255],
  yellow: [255, 255, 0, 255],
  orange: [255, 165, 0, 255],
};

function hex2(value: string): number {
  const n = Number.parseInt(value, 16);
  if (Number.isNaN(n)) throw new Error(`Invalid color: "${value}"`);
  return n;
}

function channel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

/**
 * Tiny CSS color parser: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `rgb()/rgba()` and a handful of keywords. Enough for ramps, no dependencies.
 */
export function parseColor(input: string): RGBA {
  const color = input.trim().toLowerCase();

  if (color in NAMED) return [...NAMED[color]] as RGBA;

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return [
        hex2(hex[0] + hex[0]),
        hex2(hex[1] + hex[1]),
        hex2(hex[2] + hex[2]),
        hex.length === 4 ? hex2(hex[3] + hex[3]) : 255,
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        hex2(hex.slice(0, 2)),
        hex2(hex.slice(2, 4)),
        hex2(hex.slice(4, 6)),
        hex.length === 8 ? hex2(hex.slice(6, 8)) : 255,
      ];
    }
    throw new Error(`Invalid hex color: "${input}"`);
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(color);
  if (fn) {
    const parts = fn[1]
      .split(/[,/\s]+/)
      .filter(Boolean)
      .map((p) => (p.endsWith('%') ? Number.parseFloat(p) * 2.55 : Number.parseFloat(p)));
    // alpha is 0..1 in CSS but 0..255 for the texture
    const alpha = parts.length > 3 ? (parts[3] <= 1 ? parts[3] * 255 : parts[3]) : 255;
    return [channel(parts[0]), channel(parts[1]), channel(parts[2]), channel(alpha)];
  }

  throw new Error(`Unsupported color: "${input}"`);
}

/** Resolve a preset name or a user supplied stop list into a valid stop list. */
export function resolveColorRamp(ramp: ColorRampStops | ColorRampPreset | undefined): ColorRampStops {
  if (!ramp) return COLOR_RAMP_PRESETS.wind.map((s) => [...s] as [number, string]);

  if (typeof ramp === 'string') {
    const preset = COLOR_RAMP_PRESETS[ramp as ColorRampPreset];
    if (!preset) {
      throw new Error(
        `Unknown color ramp "${ramp}". Known presets: ${Object.keys(COLOR_RAMP_PRESETS).join(', ')}`,
      );
    }
    return preset.map((s) => [...s] as [number, string]);
  }

  if (!Array.isArray(ramp) || ramp.length === 0) {
    throw new Error('colorRamp must be a preset name or a non-empty array of [stop, color]');
  }

  return ramp
    .map(([stop, color]) => [Number(stop), String(color)] as [number, string])
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Sample a ramp into an RGBA byte array, used as a 256×1 lookup texture.
 * Colors are interpolated in sRGB, which is what designers expect from
 * gradient stops.
 */
export function buildColorRampData(stops: ColorRampStops, size = 256): Uint8Array {
  if (size < 2) throw new Error('Color ramp texture must be at least 2 texels wide');

  const parsed = stops.map(([stop, color]) => [Math.min(1, Math.max(0, stop)), parseColor(color)] as const);
  const data = new Uint8Array(size * 4);

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let lo = parsed[0];
    let hi = parsed[parsed.length - 1];

    for (let s = 0; s < parsed.length - 1; s++) {
      if (t >= parsed[s][0] && t <= parsed[s + 1][0]) {
        lo = parsed[s];
        hi = parsed[s + 1];
        break;
      }
    }

    const span = hi[0] - lo[0];
    const k = span <= 0 ? 0 : (t - lo[0]) / span;
    for (let c = 0; c < 4; c++) {
      data[i * 4 + c] = channel(lo[1][c] + (hi[1][c] - lo[1][c]) * k);
    }
  }

  return data;
}
