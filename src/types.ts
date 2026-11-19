/**
 * Public types for `mapbox-gl-particle-layer`.
 *
 * The library deliberately does **not** import the types of `mapbox-gl` or
 * `maplibre-gl`: it only relies on the small structural surface below, so the
 * same build works with either runtime (and with bundlers that tree-shake one
 * of them away). `test/types-compat.ts` asserts that `ParticleLayer` still
 * satisfies both `CustomLayerInterface` contracts.
 */

/** `[west, south, east, north]` in degrees (EPSG:4326). */
export type LonLatBounds = [west: number, south: number, east: number, north: number];

/** Color ramp stops: `[position 0..1, css color]`, sorted ascending. */
export type ColorRampStops = Array<[number, string]>;

/** Built-in palettes, see `COLOR_RAMP_PRESETS`. */
export type ColorRampPreset = 'wind' | 'viridis' | 'plasma' | 'thermal' | 'mono';

export type MapRuntime = 'mapbox' | 'maplibre';

export type GLContext = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * A wind field decoded straight from memory, e.g. generated procedurally.
 * `data` must be RGBA (`width * height * 4`), where `r`/`g` carry the `u`/`v`
 * components and `128` means "no wind".
 */
export interface RawWindData {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  /** Optional per-source bounds override. */
  bounds?: LonLatBounds;
}

/**
 * Anything that can produce pixels for the wind texture:
 * - `string` — URL (fetched as an `ImageBitmap`, CORS must be allowed)
 * - `ImageBitmap` / `HTMLImageElement` / `HTMLCanvasElement` / `OffscreenCanvas`
 * - `RawWindData` — raw RGBA bytes
 */
export type WindSource = string | TexImageSource | RawWindData;

export interface ParticleLayerOptions {
  /** Layer id, must be unique inside the style. */
  id: string;
  /**
   * Wind field source. Can be omitted and supplied later with
   * `setWindSource()`, the layer simply renders nothing until then.
   */
  windSource?: WindSource;
  /**
   * Geographic bounds of the wind image, `[west, south, east, north]`.
   * Defaults to the whole world in equirectangular projection.
   * Must be supplied for `RawWindData` unless it carries its own `bounds`.
   */
  windBounds?: LonLatBounds;
  /**
   * Wind speed, in m/s, that corresponds to a fully saturated channel
   * (`0`/`255`). The image is decoded as `(channel / 255 * 2 - 1) * maxWindSpeed`.
   * @default 30
   */
  maxWindSpeed?: number;
  /**
   * Speed mapped to the end of the color ramp, in m/s. Defaults to
   * `maxWindSpeed`. Lower it to make a weak wind field look more colorful.
   */
  colorScale?: number;
  /**
   * Number of simulated particles. The internal texture is square, so the
   * effective count is rounded up to the next perfect square.
   * @default 16384
   */
  numParticles?: number;
  /**
   * Base probability of a particle respawning, expressed per frame at 60 fps.
   * @default 0.003
   */
  dropRate?: number;
  /**
   * Extra drop probability, proportional to the local wind speed. Fast
   * particles die (and respawn) sooner, which keeps the field evenly seeded.
   * (per frame at 60 fps, same unit as `dropRate`)
   * @default 0.006
   */
  dropRateBump?: number;
  /**
   * Multiplier applied to the simulated time step. `1` means "as fast as the
   * physics says", which is far too slow to look at, so `timeScale` already
   * fast-forwards time. Use it for slow-motion / timelapse effects.
   * @default 1
   */
  speedFactor?: number;
  /**
   * Simulated seconds per real second.
   * @default 2400
   */
  timeScale?: number;
  /**
   * Velocity → color mapping. Either a list of stops or a preset name.
   * @default 'wind'
   */
  colorRamp?: ColorRampStops | ColorRampPreset;
  /**
   * Particle diameter in CSS pixels.
   * @default 2.2
   */
  particleSize?: number;
  /** Global particle opacity, `0..1`. @default 1 */
  opacity?: number;
  /**
   * Trail persistence per frame. `1` disables trails (fully repainted each
   * frame), `0.9` shows a long comet tail. Values below `1` cost one extra
   * full-screen framebuffer.
   * @default 1
   */
  fadeOpacity?: number;
  /**
   * Respawn particles inside the current viewport instead of the whole wind
   * field. Great for deep-zoom views, where the field is mostly off screen.
   * @default false
   */
  constrainToViewport?: boolean;
  /** Keep animating (calls `map.triggerRepaint()` every frame). @default true */
  animate?: boolean;
  /** Cap the simulation step rate, `0` = uncapped. @default 0 */
  maxFPS?: number;
  /**
   * Wrap particles that cross the antimeridian instead of killing them.
   * @default true
   */
  wrapLongitude?: boolean;
  /**
   * Which runtime the layer is attached to. Informational only — the code path
   * is identical — but it documents intent and may be used for diagnostics.
   */
  mapRuntime?: MapRuntime;
}

/** Options accepted by `updateOptions()`. `id` cannot be changed. */
export type ParticleLayerUpdateOptions = Partial<Omit<ParticleLayerOptions, 'id'>>;

/** The slice of the map object the layer actually uses. */
export interface MapLike {
  getCanvas(): HTMLCanvasElement;
  getBounds(): {
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
  };
  triggerRepaint(): void;
}

/** Structural equivalent of `CustomLayerInterface`. */
export interface CustomLayerLike {
  readonly id: string;
  readonly type: 'custom';
  readonly renderingMode?: '2d' | '3d';
  onAdd(map: MapLike, gl: GLContext): void;
  render(gl: GLContext, matrix: ArrayLike<number>): void;
  onRemove?(map: MapLike, gl: GLContext): void;
  prerender?(gl: GLContext, matrix: ArrayLike<number>): void;
}
