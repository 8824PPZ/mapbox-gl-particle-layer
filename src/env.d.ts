/// <reference types="vite/client" />

declare module '*.glsl' {
  /** Shader source, inlined at build time by the `glsl-include` vite plugin. */
  const source: string;
  export default source;
}
