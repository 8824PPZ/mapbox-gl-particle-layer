import type { GLContext } from '../types';

/** Numbered source excerpt, so shader errors point at the offending line. */
function annotate(source: string): string {
  return source
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')} | ${line}`)
    .join('\n');
}

function compile(gl: GLContext, type: number, source: string, label: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error(`[particle-layer] could not create shader (${label})`);

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`[particle-layer] ${label} failed to compile:\n${log}\n\n${annotate(source)}`);
  }
  return shader;
}

/**
 * Thin wrapper around a linked program with cached uniform/attribute lookups.
 * Uniforms are looked up lazily and memoized, which keeps `render()` cheap.
 */
export class Program {
  readonly program: WebGLProgram;
  private readonly gl: GLContext;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly attribs = new Map<string, number>();
  private readonly label: string;

  constructor(gl: GLContext, vertexSource: string, fragmentSource: string, label = 'program') {
    this.gl = gl;
    this.label = label;

    const vs = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label}.vert`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label}.frag`);
    const program = gl.createProgram();
    if (!program) throw new Error(`[particle-layer] could not create program (${label})`);

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown error';
      gl.deleteProgram(program);
      throw new Error(`[particle-layer] ${label} failed to link:\n${log}`);
    }

    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  /** Uniform location; `null` when the compiler removed it as unused. */
  u(name: string): WebGLUniformLocation | null {
    let location = this.uniforms.get(name);
    if (location === undefined) {
      location = this.gl.getUniformLocation(this.program, name);
      this.uniforms.set(name, location);
    }
    return location;
  }

  a(name: string): number {
    let location = this.attribs.get(name);
    if (location === undefined) {
      location = this.gl.getAttribLocation(this.program, name);
      this.attribs.set(name, location);
    }
    return location;
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.uniforms.clear();
    this.attribs.clear();
  }

  toString(): string {
    return `Program(${this.label})`;
  }
}

/** RGBA8 texture with sane defaults for the ping-pong / lookup textures. */
export function createTexture(
  gl: GLContext,
  options: {
    width: number;
    height: number;
    filter?: 'nearest' | 'linear';
    wrap?: 'clamp' | 'repeat';
    data?: ArrayBufferView | null;
  },
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('[particle-layer] could not create texture');

  const filter = options.filter === 'linear' ? gl.LINEAR : gl.NEAREST;
  const wrap = options.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    options.width,
    options.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    (options.data as ArrayBufferView | null | undefined) ?? null,
  );

  return texture;
}

/** Two triangles covering clip space, used by the off-screen passes. */
export function createFullscreenQuad(gl: GLContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('[particle-layer] could not create quad buffer');
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

/** Largest point size the driver supports, in device pixels. */
export function maxPointSize(gl: GLContext): number {
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | number[] | null;
  const max = range && range.length > 1 ? Number(range[1]) : 1;
  return Number.isFinite(max) && max > 0 ? max : 1;
}
