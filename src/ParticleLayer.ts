import type {
  ColorRampPreset,
  ColorRampStops,
  CustomLayerLike,
  GLContext,
  LonLatBounds,
  MapLike,
  MapRuntime,
  ParticleLayerOptions,
  ParticleLayerUpdateOptions,
  RawWindData,
  WindSource,
} from './types';
import { ParticleSimulator } from './core/ParticleSimulator';
import { DEFAULT_WIND_BOUNDS, WindTexture } from './core/WindTexture';
import { buildColorRampData, resolveColorRamp } from './utils/color-ramp';
import { clamp, squareSide } from './utils/math';
import { hashString } from './utils/random';
import { maxPointSize } from './core/gl';

const COLOR_RAMP_SIZE = 256;

interface ResolvedOptions {
  id: string;
  windSource?: WindSource;
  windBounds: LonLatBounds;
  maxWindSpeed: number;
  colorScale: number;
  numParticles: number;
  dropRate: number;
  dropRateBump: number;
  speedFactor: number;
  timeScale: number;
  colorRamp: ColorRampStops | ColorRampPreset;
  particleSize: number;
  opacity: number;
  fadeOpacity: number;
  constrainToViewport: boolean;
  animate: boolean;
  maxFPS: number;
  wrapLongitude: boolean;
  mapRuntime?: MapRuntime;
}

type Defaults = Required<
  Pick<
    ResolvedOptions,
    | 'numParticles'
    | 'maxWindSpeed'
    | 'dropRate'
    | 'dropRateBump'
    | 'speedFactor'
    | 'timeScale'
    | 'colorRamp'
    | 'particleSize'
    | 'opacity'
    | 'fadeOpacity'
    | 'constrainToViewport'
    | 'animate'
    | 'maxFPS'
    | 'wrapLongitude'
  >
>;

const DEFAULTS: Defaults = {
  numParticles: 16384,
  maxWindSpeed: 30,
  dropRate: 0.003,
  dropRateBump: 0.006,
  speedFactor: 1,
  timeScale: 45000,
  colorRamp: 'wind',
  particleSize: 2.2,
  opacity: 1,
  fadeOpacity: 1,
  constrainToViewport: false,
  animate: true,
  maxFPS: 0,
  wrapLongitude: true,
};

/** `p` is a probability per frame at 60 fps → rate per second. */
function perSecond(probability: number): number {
  const p = clamp(probability, 0, 0.999);
  return -60 * Math.log(1 - p);
}

function currentTime(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * GPU wind / flow particle layer for Mapbox GL JS and MapLibre GL JS.
 *
 * ```ts
 * const layer = new ParticleLayer({ id: 'wind', windSource: '/wind.png' });
 * map.addLayer(layer);
 * ```
 *
 * The layer implements `CustomLayerInterface`, so it can be added like any
 * other layer and is re-added automatically when the style is reloaded.
 */
export class ParticleLayer implements CustomLayerLike {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  /** Set when the wind image fails to load, handy for diagnostics. */
  error: Error | null = null;

  private options: ResolvedOptions;
  private map: MapLike | null = null;
  private gl: GLContext | null = null;
  private simulator: ParticleSimulator | null = null;
  private wind: WindTexture | null = null;

  private running: boolean;
  private lastTime = 0;
  private lastStepTime = 0;
  private seedCounter = 1;
  private loadToken = 0;
  private pointSizeLimit = 0;

  constructor(options: ParticleLayerOptions) {
    if (!options || typeof options.id !== 'string' || !options.id) {
      throw new Error('[particle-layer] `id` is required');
    }

    this.id = options.id;
    this.options = this.resolveOptions(options);
    this.running = this.options.animate;
  }

  // ---------------------------------------------------------------------
  // Custom layer interface
  // ---------------------------------------------------------------------

  onAdd(map: MapLike, gl: GLContext): void {
    this.map = map;
    this.gl = gl;
    this.disposeResources();
    this.pointSizeLimit = maxPointSize(gl);
    this.build();
  }

  onRemove(): void {
    this.disposeResources();
    this.map = null;
    this.gl = null;
  }

  render(gl: GLContext, matrix: ArrayLike<number>): void {
    const simulator = this.simulator;
    const wind = this.wind;
    if (!simulator || !wind || !wind.ready) return;

    const time = currentTime();
    let realDt = this.lastTime === 0 ? 1 / 60 : (time - this.lastTime) / 1000;
    this.lastTime = time;
    realDt = clamp(realDt, 0, 0.1);

    if (!this.running) {
      realDt = 0;
    } else if (this.options.maxFPS > 0) {
      const interval = 1000 / this.options.maxFPS;
      if (time - this.lastStepTime < interval - 1) realDt = 0;
      else this.lastStepTime = time;
    }

    simulator.resize(gl.drawingBufferWidth, gl.drawingBufferHeight);

    if (realDt > 0) {
      simulator.step({
        dt: realDt * this.options.timeScale * this.options.speedFactor,
        dropDt: realDt,
        dropRate: perSecond(this.options.dropRate),
        dropRateBump: perSecond(this.options.dropRateBump),
        maxWindSpeed: this.options.maxWindSpeed,
        wrapLongitude: this.options.wrapLongitude,
        respawnBounds: this.respawnBounds(),
      });
    }

    simulator.draw({
      matrix,
      pointSize: Math.min(this.options.particleSize * this.pixelRatio(), this.pointSizeLimit),
      opacity: clamp(this.options.opacity, 0, 1),
      colorScale: this.options.colorScale,
      maxWindSpeed: this.options.maxWindSpeed,
      fadeOpacity: clamp(this.options.fadeOpacity, 0, 1),
    });

    if (this.running && this.options.animate) this.map?.triggerRepaint();
  }

  // ---------------------------------------------------------------------
  // Runtime API
  // ---------------------------------------------------------------------

  /** `true` once the wind texture is uploaded and particles are simulated. */
  get ready(): boolean {
    return !!this.simulator && !!this.wind?.ready;
  }

  /** Effective particle count (the state texture is square, so it rounds up). */
  get particleCount(): number {
    const side = squareSide(this.options.numParticles);
    return side * side;
  }

  getOptions(): Readonly<ParticleLayerOptions> {
    return { ...this.options };
  }

  /** Merge new options, rebuilding GPU resources only when needed. */
  updateOptions(patch: ParticleLayerUpdateOptions): void {
    const previous = this.options;
    const next = this.resolveOptions({ ...previous, ...patch }, previous);

    this.options = next;
    if (patch.animate !== undefined) this.running = next.animate;

    if (next.numParticles !== previous.numParticles) {
      this.disposeResources();
      if (this.gl) this.build();
      return;
    }

    if (JSON.stringify(next.colorRamp) !== JSON.stringify(previous.colorRamp)) {
      this.simulator?.updateColorRamp(buildColorRampData(resolveColorRamp(next.colorRamp), COLOR_RAMP_SIZE));
    }

    if (
      (patch.windSource !== undefined && patch.windSource !== previous.windSource) ||
      (patch.windBounds !== undefined && patch.windBounds !== previous.windBounds)
    ) {
      this.setWindSource(next.windSource, next.windBounds);
    }

    this.map?.triggerRepaint();
  }

  /**
   * Swap the wind field at runtime. Accepts a URL, a bitmap/canvas or raw RGBA
   * bytes — the same values as the `windSource` option.
   */
  setWindSource(source: WindSource | undefined, bounds?: LonLatBounds): void {
    this.options.windSource = source;
    if (bounds) this.options.windBounds = bounds;
    if (!this.wind || source === undefined) return;

    const token = ++this.loadToken;
    this.error = null;

    if (typeof source === 'string') {
      this.wind
        .loadUrl(source, this.options.windBounds)
        .then(() => {
          if (token !== this.loadToken) return;
          this.reseed();
        })
        .catch((error: Error) => {
          if (token !== this.loadToken) return;
          this.error = error;
          console.error(error);
        });
      return;
    }

    this.wind.setSource(source as TexImageSource | RawWindData, this.options.windBounds);
    this.reseed();
  }

  setColorRamp(ramp: ColorRampStops | ColorRampPreset): void {
    this.options.colorRamp = ramp;
    this.simulator?.updateColorRamp(buildColorRampData(resolveColorRamp(ramp), COLOR_RAMP_SIZE));
    this.map?.triggerRepaint();
  }

  setNumParticles(count: number): void {
    if (count === this.options.numParticles) return;
    this.options.numParticles = count;
    this.disposeResources();
    if (this.gl) this.build();
  }

  /** Reseed every particle at a random position. */
  restart(): void {
    this.reseed();
  }

  /** Resume the animation loop. */
  start(): void {
    this.running = true;
    this.lastTime = 0;
    this.map?.triggerRepaint();
  }

  /** Freeze the simulation (the last frame stays on screen). */
  stop(): void {
    this.running = false;
  }

  /** Detach from the map and dispose GPU resources. */
  remove(): void {
    const map = this.map as (MapLike & { removeLayer?: (id: string) => void }) | null;
    map?.removeLayer?.(this.id);
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private build(): void {
    const gl = this.gl;
    if (!gl) return;

    const ramp = buildColorRampData(resolveColorRamp(this.options.colorRamp), COLOR_RAMP_SIZE);
    this.simulator = new ParticleSimulator(gl, this.options.numParticles, ramp);
    this.wind = new WindTexture(gl, this.options.windBounds);
    this.seedCounter = hashString(this.id) || 1;
    this.lastTime = 0;
    this.lastStepTime = 0;

    if (this.options.windSource !== undefined) {
      this.setWindSource(this.options.windSource, this.options.windBounds);
    }
  }

  private reseed(): void {
    if (!this.simulator || !this.wind?.ready) return;
    this.seedCounter = (this.seedCounter * 16807) % 2147483647;
    this.simulator.seed(this.respawnBounds(), this.wind.bounds, this.seedCounter);
    this.map?.triggerRepaint();
  }

  private disposeResources(): void {
    this.loadToken++;
    this.simulator?.dispose();
    this.wind?.dispose();
    this.simulator = null;
    this.wind = null;
  }

  /**
   * Box new particles are born in: the whole wind field, or the visible slice
   * of it when `constrainToViewport` is on.
   */
  private respawnBounds(): LonLatBounds {
    const windBounds = this.wind?.bounds ?? this.options.windBounds;
    if (!this.options.constrainToViewport || !this.map) return windBounds;

    const bounds = this.map.getBounds();
    const x0 = Math.max(bounds.getWest(), windBounds[0], -180);
    const y0 = Math.max(bounds.getSouth(), windBounds[1], -89.9);
    const x1 = Math.min(bounds.getEast(), windBounds[2], 180);
    const y1 = Math.min(bounds.getNorth(), windBounds[3], 89.9);

    if (x1 <= x0 || y1 <= y0) return windBounds;
    return [x0, y0, x1, y1];
  }

  private pixelRatio(): number {
    const canvas = this.map?.getCanvas();
    if (canvas && canvas.clientWidth > 0) return canvas.width / canvas.clientWidth;
    if (typeof window !== 'undefined') return window.devicePixelRatio || 1;
    return 1;
  }

  private resolveOptions(input: ParticleLayerOptions, previous?: ResolvedOptions): ResolvedOptions {
    const base: Defaults = previous ?? DEFAULTS;
    const numParticles = input.numParticles ?? base.numParticles;

    if (!Number.isFinite(numParticles) || numParticles < 1) {
      throw new Error('[particle-layer] numParticles must be a positive number');
    }

    const maxWindSpeed = input.maxWindSpeed ?? base.maxWindSpeed;
    const bounds = input.windBounds ?? previous?.windBounds ?? DEFAULT_WIND_BOUNDS;

    return {
      id: input.id,
      windSource: input.windSource,
      windBounds: [bounds[0], bounds[1], bounds[2], bounds[3]],
      maxWindSpeed,
      colorScale: input.colorScale ?? previous?.colorScale ?? maxWindSpeed,
      numParticles,
      dropRate: input.dropRate ?? base.dropRate,
      dropRateBump: input.dropRateBump ?? base.dropRateBump,
      speedFactor: input.speedFactor ?? base.speedFactor,
      timeScale: input.timeScale ?? base.timeScale,
      colorRamp: input.colorRamp ?? base.colorRamp,
      particleSize: input.particleSize ?? base.particleSize,
      opacity: input.opacity ?? base.opacity,
      fadeOpacity: input.fadeOpacity ?? base.fadeOpacity,
      constrainToViewport: input.constrainToViewport ?? base.constrainToViewport,
      animate: input.animate ?? base.animate,
      maxFPS: input.maxFPS ?? base.maxFPS,
      wrapLongitude: input.wrapLongitude ?? base.wrapLongitude,
      mapRuntime: input.mapRuntime ?? previous?.mapRuntime,
    };
  }
}
