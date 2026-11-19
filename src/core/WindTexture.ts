import type { GLContext, LonLatBounds, RawWindData } from '../types';
import { createTexture } from './gl';

/**
 * Default bounds for a plain equirectangular world image.
 * Latitudes are kept just inside the poles, where web-mercator is undefined.
 */
export const DEFAULT_WIND_BOUNDS: LonLatBounds = [-180, -89.9, 180, 89.9];

function isRawWindData(source: unknown): source is RawWindData {
  const candidate = source as RawWindData | undefined;
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    (candidate.data instanceof Uint8Array || candidate.data instanceof Uint8ClampedArray)
  );
}

/**
 * Owns the GL texture holding the wind field and its geographic bounds.
 *
 * Channel encoding (the convention used by most public wind rasters):
 * `r` = u, `g` = v, both remapped so `128` means zero and the extremes mean
 * `±maxWindSpeed`. Decoding happens on the GPU, see `common.glsl`.
 */
export class WindTexture {
  private gl: GLContext;
  private texture: WebGLTexture | null = null;
  private boundsValue: LonLatBounds;
  private versionValue = 0;
  private widthValue: number;
  private heightValue: number;

  constructor(gl: GLContext, bounds: LonLatBounds = DEFAULT_WIND_BOUNDS, size: [number, number] = [1, 1]) {
    this.gl = gl;
    this.boundsValue = bounds;
    this.widthValue = size[0];
    this.heightValue = size[1];
  }

  get bounds(): LonLatBounds {
    return this.boundsValue;
  }

  get width(): number {
    return this.widthValue;
  }

  get height(): number {
    return this.heightValue;
  }

  get size(): [number, number] {
    return [this.widthValue, this.heightValue];
  }

  get ready(): boolean {
    return this.texture !== null;
  }

  /** Increments every time new pixels are uploaded, so callers can reseed. */
  get version(): number {
    return this.versionValue;
  }

  /** Upload a bitmap/canvas or raw RGBA bytes. */
  setSource(source: TexImageSource | RawWindData, bounds?: LonLatBounds): void {
    const gl = this.gl;
    if (bounds) this.boundsValue = bounds;

    if (isRawWindData(source)) {
      const { width, height, data } = source;
      if (data.length !== width * height * 4) {
        throw new Error(
          `[particle-layer] wind data length ${data.length} does not match ${width}×${height}×4`,
        );
      }
      this.replaceTexture(createTexture(gl, { width, height, data }), width, height);
      if (source.bounds) this.boundsValue = source.bounds;
      return;
    }

    // Mapbox flips/premultiplies textures for its own uploads; be explicit.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const image = source as TexImageSource;
    const pixel = source as { width?: number; height?: number };
    const width = Number(pixel.width) || this.widthValue;
    const height = Number(pixel.height) || this.heightValue;

    const texture = createTexture(gl, { width, height });
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    this.replaceTexture(texture, width, height);
  }

  /** Fetch an image and upload it. Rejects on network/CORS errors. */
  async loadUrl(url: string, bounds?: LonLatBounds): Promise<void> {
    const image = await loadWindImage(url);
    try {
      this.setSource(image, bounds);
    } finally {
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
    }
  }

  /** Bind to a texture unit. Returns `false` while no pixels are available. */
  bind(unit: number): boolean {
    if (!this.texture) return false;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    return true;
  }

  dispose(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }

  private replaceTexture(texture: WebGLTexture, width: number, height: number): void {
    this.dispose();
    this.texture = texture;
    this.widthValue = width;
    this.heightValue = height;
    this.versionValue++;
  }
}

/**
 * Load an image as an `ImageBitmap` (preferred: no layout, off-thread decode),
 * falling back to an `<img>` on browsers without `createImageBitmap`.
 */
export async function loadWindImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof fetch === 'function' && typeof createImageBitmap === 'function') {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) {
      throw new Error(`[particle-layer] failed to load wind image (${response.status}): ${url}`);
    }
    const blob = await response.blob();
    return await createImageBitmap(blob, {
      imageOrientation: 'none',
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[particle-layer] failed to load wind image: ${url}`));
    img.src = url;
  });
}
