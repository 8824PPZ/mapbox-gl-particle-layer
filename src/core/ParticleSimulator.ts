import type { GLContext, LonLatBounds } from '../types';
import { createFullscreenQuad, createTexture, Program } from './gl';
import { packPosition } from '../utils/pack';
import { mulberry32 } from '../utils/random';
import { squareSide } from '../utils/math';

import updateVert from '../shaders/fullscreen.vert.glsl';
import updateFrag from '../shaders/update.frag.glsl';
import drawVert from '../shaders/draw.vert.glsl';
import drawFrag from '../shaders/draw.frag.glsl';
import fadeFrag from '../shaders/fade.frag.glsl';
import screenFrag from '../shaders/screen.frag.glsl';
import type { WindTexture } from './WindTexture';

export interface StepParams {
  /** Simulated seconds elapsed since the previous step. */
  dt: number;
  /** Real seconds elapsed since the previous step (drives the drop rate). */
  dropDt: number;
  /** Respawn rate per real second. */
  dropRate: number;
  /** Speed dependent respawn rate, per real second. */
  dropRateBump: number;
  maxWindSpeed: number;
  wrapLongitude: boolean;
  /** Box particles are (re)born in — viewport bounds when constrained. */
  respawnBounds: LonLatBounds;
}

export interface DrawParams {
  matrix: ArrayLike<number>;
  /** Point size in device pixels. */
  pointSize: number;
  opacity: number;
  colorScale: number;
  maxWindSpeed: number;
  /** `1` draws straight to the canvas, `< 1` accumulates trails. */
  fadeOpacity: number;
}

/**
 * Owns every GL object needed by the particle field:
 *
 * - two RGBA8 position textures that ping-pong through an FBO (the simulation
 *   state lives entirely on the GPU, nothing is read back)
 * - the draw program (points, one vertex per particle)
 * - an optional full-canvas trail buffer used when `fadeOpacity < 1`
 */
export class ParticleSimulator {
  wind: WindTexture | null = null;

  private gl: GLContext;
  private side: number;
  private count: number;

  private updateProgram: Program;
  private drawProgram: Program;
  private fadeProgram: Program;
  private screenProgram: Program;

  private particleTextures: [WebGLTexture, WebGLTexture];
  private current = 0;
  private fbo: WebGLFramebuffer;
  private quadBuffer: WebGLBuffer;
  private particleBuffer: WebGLBuffer;

  private colorRampTexture: WebGLTexture;
  private colorRampWidth: number;

  private screenTexture: WebGLTexture | null = null;
  private screenFbo: WebGLFramebuffer | null = null;
  private screenWidth = 0;
  private screenHeight = 0;

  private frame = 0;
  private disposed = false;

  constructor(gl: GLContext, numParticles: number, colorRampData: Uint8Array) {
    this.gl = gl;
    this.side = squareSide(numParticles);
    this.count = this.side * this.side;

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (this.side > maxTextureSize) {
      throw new Error(
        `[particle-layer] ${this.count} particles need a ${this.side}² texture, ` +
          `but this device caps textures at ${maxTextureSize}²`,
      );
    }

    this.updateProgram = new Program(gl, updateVert, updateFrag, 'update');
    this.drawProgram = new Program(gl, drawVert, drawFrag, 'draw');
    this.fadeProgram = new Program(gl, updateVert, fadeFrag, 'fade');
    this.screenProgram = new Program(gl, updateVert, screenFrag, 'screen');

    this.quadBuffer = createFullscreenQuad(gl);

    const empty = new Uint8Array(this.side * this.side * 4);
    const a = createTexture(gl, { width: this.side, height: this.side, data: empty });
    const b = createTexture(gl, { width: this.side, height: this.side, data: empty });
    this.particleTextures = [a, b];

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('[particle-layer] could not create framebuffer');
    this.fbo = fbo;

    this.particleBuffer = this.createParticleBuffer();

    this.colorRampWidth = colorRampData.length / 4;
    this.colorRampTexture = createTexture(gl, {
      width: this.colorRampWidth,
      height: 1,
      filter: 'linear',
      data: colorRampData,
    });

    // put every particle somewhere valid before the first frame
    this.seed([-180, -89.9, 180, 89.9], [-180, -89.9, 180, 89.9], 1);
  }

  get particleCount(): number {
    return this.count;
  }

  get textureSide(): number {
    return this.side;
  }

  /** Randomise all particle positions inside `bounds` (clipped to the wind field). */
  seed(respawnBounds: LonLatBounds, windBounds: LonLatBounds, seed = 1): void {
    const gl = this.gl;
    const { side, count } = this;
    const data = new Uint8Array(side * side * 4);
    const rng = mulberry32(seed);

    const spanX = Math.max(windBounds[2] - windBounds[0], 1e-6);
    const spanY = Math.max(windBounds[3] - windBounds[1], 1e-6);
    const [west, south, east, north] = respawnBounds;

    for (let i = 0; i < count; i++) {
      const lon = west + rng() * (east - west);
      const lat = south + rng() * (north - south);
      const u = (lon - windBounds[0]) / spanX;
      const v = (windBounds[3] - lat) / spanY;
      const [r, g, b, a] = packPosition(u, v);
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }

    for (const texture of this.particleTextures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.current = 0;
  }

  /** One simulation step: advect + drop/respawn, written to the spare texture. */
  step(params: StepParams): void {
    const gl = this.gl;
    const program = this.updateProgram;
    const source = this.particleTextures[this.current];
    const target = this.particleTextures[1 - this.current];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, this.side, this.side);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    program.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(program.u('u_particles'), 0);

    if (this.wind) this.wind.bind(1);
    gl.uniform1i(program.u('u_wind'), 1);
    gl.uniform2fv(program.u('u_wind_size'), this.wind ? this.wind.size : [1, 1]);
    gl.uniform4fv(program.u('u_wind_bounds'), this.wind ? this.wind.bounds : [-180, -89.9, 180, 89.9]);

    gl.uniform4fv(program.u('u_respawn_bounds'), params.respawnBounds);
    gl.uniform1f(program.u('u_max_wind_speed'), params.maxWindSpeed);
    gl.uniform1f(program.u('u_dt'), params.dt);
    gl.uniform1f(program.u('u_drop_dt'), params.dropDt);
    gl.uniform1f(program.u('u_drop_rate'), params.dropRate);
    gl.uniform1f(program.u('u_drop_rate_bump'), params.dropRateBump);
    gl.uniform1f(program.u('u_wrap'), params.wrapLongitude ? 1 : 0);
    gl.uniform1f(program.u('u_seed'), (this.frame % 4096) * 0.6180339887);

    this.bindQuad(program, 'a_pos');
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.current = 1 - this.current;
    this.frame++;
  }

  /** Draw pass: one point per particle, optionally through the trail buffer. */
  draw(params: DrawParams): void {
    const gl = this.gl;
    const trails = params.fadeOpacity < 1 && this.screenFbo !== null;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    // Mapbox may leave a scissor from a previous pass; the layer owns the
    // whole canvas while it draws.
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.enable(gl.BLEND);

    if (trails) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.screenFbo);
      gl.viewport(0, 0, this.screenWidth, this.screenHeight);

      // dst *= fadeOpacity — keeps the buffer premultiplied and fades to zero
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      this.fadeProgram.use();
      gl.uniform1f(this.fadeProgram.u('u_fade'), params.fadeOpacity);
      this.bindQuad(this.fadeProgram, 'a_pos');
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }

    const program = this.drawProgram;
    program.use();
    // additive while accumulating trails, straight alpha when composing on top
    gl.blendFunc(gl.SRC_ALPHA, trails ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.particleTextures[this.current]);
    gl.uniform1i(program.u('u_particles'), 0);

    if (this.wind) this.wind.bind(1);
    gl.uniform1i(program.u('u_wind'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTexture);
    gl.uniform1i(program.u('u_color_ramp'), 2);

    gl.uniform2fv(program.u('u_wind_size'), this.wind ? this.wind.size : [1, 1]);
    gl.uniform4fv(program.u('u_wind_bounds'), this.wind ? this.wind.bounds : [-180, -89.9, 180, 89.9]);
    gl.uniform1f(program.u('u_max_wind_speed'), params.maxWindSpeed);
    gl.uniform1f(program.u('u_color_scale'), params.colorScale);
    gl.uniform1f(program.u('u_point_size'), params.pointSize);
    gl.uniform1f(program.u('u_opacity'), params.opacity);
    gl.uniformMatrix4fv(
      program.u('u_matrix'),
      false,
      params.matrix instanceof Float32Array ? params.matrix : Float32Array.from(params.matrix as ArrayLike<number>),
    );

    const attrib = program.a('a_tex_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
    gl.enableVertexAttribArray(attrib);
    gl.vertexAttribPointer(attrib, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.disableVertexAttribArray(attrib);

    if (trails) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.screenProgram.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.screenTexture);
      gl.uniform1i(this.screenProgram.u('u_screen'), 0);
      this.bindQuad(this.screenProgram, 'a_pos');
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.disable(gl.BLEND);
  }

  /** Keeps the trail buffer in sync with the drawing buffer. */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    if (width === this.screenWidth && height === this.screenHeight && this.screenFbo) return;

    const gl = this.gl;
    this.disposeScreenTarget();

    this.screenWidth = width;
    this.screenHeight = height;
    this.screenTexture = createTexture(gl, { width, height, filter: 'linear' });

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('[particle-layer] could not create trail framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.screenTexture, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.screenFbo = fbo;
  }

  /** Replace the color ramp, keeping the same texel count. */
  updateColorRamp(data: Uint8Array): void {
    const gl = this.gl;
    const width = data.length / 4;
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTexture);
    if (width === this.colorRampWidth) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      this.colorRampWidth = width;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const gl = this.gl;
    this.updateProgram.dispose();
    this.drawProgram.dispose();
    this.fadeProgram.dispose();
    this.screenProgram.dispose();
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.particleBuffer);
    for (const texture of this.particleTextures) gl.deleteTexture(texture);
    gl.deleteTexture(this.colorRampTexture);
    gl.deleteFramebuffer(this.fbo);
    this.disposeScreenTarget();
  }

  private disposeScreenTarget(): void {
    const gl = this.gl;
    if (this.screenFbo) gl.deleteFramebuffer(this.screenFbo);
    if (this.screenTexture) gl.deleteTexture(this.screenTexture);
    this.screenFbo = null;
    this.screenTexture = null;
    this.screenWidth = 0;
    this.screenHeight = 0;
  }

  private createParticleBuffer(): WebGLBuffer {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('[particle-layer] could not create particle buffer');

    // one texel centre per particle: the draw shader reads its state from here
    const coords = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      const x = i % this.side;
      const y = Math.floor(i / this.side);
      coords[i * 2] = (x + 0.5) / this.side;
      coords[i * 2 + 1] = (y + 0.5) / this.side;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, coords, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buffer;
  }

  private bindQuad(program: Program, attribute: string): void {
    const gl = this.gl;
    const location = program.a(attribute);
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }
}
