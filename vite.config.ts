import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Minimal GLSL loader: turns `*.glsl` files into ES modules that export the
 * shader source as a string, and resolves `#include "file.glsl"` directives so
 * shaders can share helpers (see `src/shaders/common.glsl`).
 *
 * Everything is inlined at build time, so the published bundle has no runtime
 * dependency and works with any bundler (or none at all).
 */
function glsl(): Plugin {
  const SHADER_RE = /\.(glsl|vert|frag)$/;

  return {
    name: 'glsl-include',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!SHADER_RE.test(file)) return null;

      let out = code;
      for (let depth = 0; depth < 8; depth++) {
        let found = false;
        out = out.replace(/^[ \t]*#include\s+"([^"]+)"/gm, (_match, rel: string) => {
          found = true;
          const include = resolve(dirname(file), rel);
          // let the dev server invalidate this module when the include changes
          this.addWatchFile(include);
          return readFileSync(include, 'utf8');
        });
        if (!found) break;
        if (depth === 7) throw new Error(`[glsl] include depth exceeded in ${file}`);
      }

      return { code: `export default ${JSON.stringify(out)};`, map: null };
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {
      plugins: [glsl()],
      server: { port: 5173, open: '/index.html' },
    };
  }

  return {
    plugins: [glsl()],
    // `public/` only holds demo assets, never ship them in the package
    publicDir: false,
    build: {
      target: 'es2020',
      sourcemap: true,
      lib: {
        entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        formats: ['es', 'cjs'],
        fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      },
      rollupOptions: {
        // never bundle the map runtimes, they are peer dependencies
        external: ['mapbox-gl', 'maplibre-gl'],
      },
    },
  };
});
