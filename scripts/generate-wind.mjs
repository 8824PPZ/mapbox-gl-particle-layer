/**
 * Generates `public/wind-global.png` — a synthetic global wind field used by
 * the demos, so the repository ships with data and needs no external service.
 *
 * Encoding (same convention the layer decodes):
 *   r = u component, g = v component, 128 = calm, 0/255 = ∓30 m/s
 *
 * Usage: npm run wind
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 720;
const HEIGHT = 360;
const BOUNDS = { west: -180, south: -85, east: 180, north: 85 };
const MAX_SPEED = 30;

// --- CRC32 (needed by every PNG chunk) ------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, payload) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the field ------------------------------------------------------------
/** Slow, banded circulation with enough curl to look alive. */
function windAt(lon, lat) {
  const lonR = (lon * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;

  // Jet bands whose strength and latitude wander with longitude: no mirror
  // symmetry, so the particles do not look like they are on a lattice.
  const jets = 13 * Math.cos(latR * 4.2 + 0.45 * Math.sin(lonR * 1.3));
  const u =
    jets * (0.6 + 0.4 * Math.cos(lonR * 1.7 - latR * 0.8)) +
    5 * Math.sin(lonR * 2.3 + latR * 3.1) +
    2 * Math.cos(lonR * 4.1 - latR * 2.7);

  const v =
    8 * Math.cos(latR * 2.7 + 0.6 * Math.sin(lonR * 1.1)) *
      Math.sin(lonR * 1.9 + latR * 2.3) +
    4 * Math.sin(lonR * 3.7 - latR * 1.4) +
    2 * Math.cos(lonR * 5.3 + latR * 3.9);

  // taper at the poles so the mercator edges do not smear
  const taper = Math.max(0, Math.min(1, (85 - Math.abs(lat)) / 15));
  return [u * taper, v * taper];
}

function build() {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y++) {
    const lat = BOUNDS.north - ((y + 0.5) / HEIGHT) * (BOUNDS.north - BOUNDS.south);
    for (let x = 0; x < WIDTH; x++) {
      const lon = BOUNDS.west + ((x + 0.5) / WIDTH) * (BOUNDS.east - BOUNDS.west);
      const [u, v] = windAt(lon, lat);

      const r = Math.round((clamp(u / MAX_SPEED, -1, 1) * 0.5 + 0.5) * 255);
      const g = Math.round((clamp(v / MAX_SPEED, -1, 1) * 0.5 + 0.5) * 255);
      const i = (y * WIDTH + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = 0; // b/a are unused by the shader
      rgba[i + 3] = 255;
    }
  }

  return rgba;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/wind-global.png');
mkdirSync(dirname(out), { recursive: true });

const png = encodePng(WIDTH, HEIGHT, build());
writeFileSync(out, png);

console.log(
  `wind field written to ${out} (${WIDTH}×${HEIGHT}, ${(png.length / 1024).toFixed(1)} kB)`,
);
console.log(`windBounds: [${BOUNDS.west}, ${BOUNDS.south}, ${BOUNDS.east}, ${BOUNDS.north}]`);
