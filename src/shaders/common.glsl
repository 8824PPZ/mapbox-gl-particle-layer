// Shared helpers, inlined by `#include "common.glsl"`.
// Keep this file free of uniforms/attributes so it can be reused by any pass.

const float PI = 3.141592653589793;

// --- hashing ---------------------------------------------------------------
// Sin-free hashes (after Dave Hoskins) behave better than `fract(sin(x)*N)`
// on mobile GPUs, which lose precision in the sine argument.

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// --- 16 bit position packing ----------------------------------------------
// x lives in (r, b), y lives in (g, a): high byte, low byte.

float unpack16(vec2 hiLo) {
  return (hiLo.x * 65025.0 + hiLo.y * 255.0) / 65025.0;
}

vec2 decodeParticle(vec4 state) {
  return vec2(unpack16(state.rb), unpack16(state.ga));
}

vec4 encodeParticle(vec2 uv) {
  vec2 scaled = clamp(uv, 0.0, 1.0) * 255.0;
  vec2 hi = floor(scaled);
  vec2 lo = floor((scaled - hi) * 255.0 + 0.5);
  hi += step(255.0, lo);
  lo = mod(lo, 255.0);
  return vec4(hi.x, hi.y, lo.x, lo.y) / 255.0;
}

// --- geography ------------------------------------------------------------
// `bounds` is `vec4(west, south, east, north)` in degrees.
// `uv` is (0, 0) at the north-west corner, matching the raw image rows.

vec2 lonLatFromUv(vec2 uv, vec4 bounds) {
  return vec2(mix(bounds.x, bounds.z, uv.x), mix(bounds.w, bounds.y, uv.y));
}

vec2 uvFromLonLat(vec2 lonLat, vec4 bounds) {
  return vec2(
    (lonLat.x - bounds.x) / max(bounds.z - bounds.x, 1e-6),
    (bounds.w - lonLat.y) / max(bounds.w - bounds.y, 1e-6)
  );
}

// Normalized EPSG:3857 (0, 0 = north-west corner), same convention as
// `MercatorCoordinate.fromLngLat`, which is what custom layer matrices expect.
vec2 mercator(vec2 lonLat) {
  float x = (lonLat.x + 180.0) / 360.0;
  float s = clamp(sin(lonLat.y * PI / 180.0), -0.9999, 0.9999);
  float y = 0.5 - 0.25 * log((1.0 + s) / (1.0 - s)) / PI;
  return vec2(x, y);
}

// --- wind sampling --------------------------------------------------------
// Manual bilinear filtering: encoded channels interpolate linearly, so we can
// blend the raw bytes and decode once. Returns metres per second.

vec2 lookupWind(vec2 uv, sampler2D tex, vec2 size, float maxSpeed) {
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec2 tl = texture2D(tex, (i + vec2(0.5, 0.5)) / size).rg;
  vec2 tr = texture2D(tex, (i + vec2(1.5, 0.5)) / size).rg;
  vec2 bl = texture2D(tex, (i + vec2(0.5, 1.5)) / size).rg;
  vec2 br = texture2D(tex, (i + vec2(1.5, 1.5)) / size).rg;
  vec2 encoded = mix(mix(tl, tr, f.x), mix(bl, br, f.x), f.y);
  return (encoded * 2.0 - 1.0) * maxSpeed;
}
