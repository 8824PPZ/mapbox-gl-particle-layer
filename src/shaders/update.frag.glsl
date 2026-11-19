precision highp float;

#include "common.glsl"

uniform sampler2D u_particles;
uniform sampler2D u_wind;

uniform vec2 u_wind_size;        // wind texture size in texels
uniform vec4 u_wind_bounds;      // (west, south, east, north)
uniform vec4 u_respawn_bounds;   // where dropped particles are born again
uniform float u_max_wind_speed;  // m/s at a saturated channel
uniform float u_dt;              // simulated seconds for this step
uniform float u_drop_dt;         // real seconds since the previous step
uniform float u_drop_rate;       // respawn rate, per real second
uniform float u_drop_rate_bump;  // extra rate, proportional to speed
uniform float u_seed;            // changes every frame
uniform float u_wrap;            // 1.0 = wrap across the antimeridian

varying vec2 v_tex_pos;

void main() {
  vec2 uv = decodeParticle(texture2D(u_particles, v_tex_pos));
  vec2 lonLat = lonLatFromUv(uv, u_wind_bounds);

  // --- advect -------------------------------------------------------------
  vec2 velocity = lookupWind(uv, u_wind, u_wind_size, u_max_wind_speed);
  float speed = length(velocity);
  float speedT = clamp(speed / max(u_max_wind_speed, 1e-4), 0.0, 1.0);

  // Degrees per metre differs with latitude: keep the motion isotropic.
  float cosLat = max(cos(radians(lonLat.y)), 0.05);
  lonLat.x += velocity.x * u_dt / (111320.0 * cosLat);
  lonLat.y += velocity.y * u_dt / 110540.0;

  if (u_wrap > 0.5) {
    lonLat.x = mod(lonLat.x + 180.0, 360.0) - 180.0;
  }

  // --- drop / respawn -----------------------------------------------------
  // Faster particles die sooner, otherwise they all pile up wherever the wind
  // converges and the field slowly drains. Exponential so the rate is
  // independent of the frame rate.
  float dropRate = max(0.0, u_drop_rate + speedT * u_drop_rate_bump);
  float dropProb = 1.0 - exp(-dropRate * u_drop_dt);
  float rnd = hash12(v_tex_pos * 1024.0 + u_seed);

  bool respawn = rnd < dropProb;
  if (!respawn) {
    respawn =
      lonLat.x < u_respawn_bounds.x || lonLat.x > u_respawn_bounds.z ||
      lonLat.y < u_respawn_bounds.y || lonLat.y > u_respawn_bounds.w;
  }

  if (respawn) {
    vec2 target = hash22(v_tex_pos * 1024.0 + u_seed + 37.0);
    lonLat = vec2(
      mix(u_respawn_bounds.x, u_respawn_bounds.z, target.x),
      mix(u_respawn_bounds.y, u_respawn_bounds.w, target.y)
    );
  }

  gl_FragColor = encodeParticle(uvFromLonLat(lonLat, u_wind_bounds));
}
