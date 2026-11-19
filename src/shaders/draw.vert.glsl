precision highp float;

#include "common.glsl"

attribute vec2 a_tex_pos;

uniform sampler2D u_particles;
uniform sampler2D u_wind;
uniform sampler2D u_color_ramp;

uniform mat4 u_matrix;
uniform vec2 u_wind_size;
uniform vec4 u_wind_bounds;
uniform float u_max_wind_speed;
uniform float u_color_scale;
uniform float u_point_size;   // device pixels

varying vec4 v_color;

void main() {
  vec2 uv = decodeParticle(texture2D(u_particles, a_tex_pos));
  vec2 lonLat = lonLatFromUv(uv, u_wind_bounds);

  gl_Position = u_matrix * vec4(mercator(lonLat), 0.0, 1.0);
  gl_PointSize = u_point_size;

  // Velocity → color. Sampling the 1D ramp in the vertex shader keeps the
  // fragment shader free of texture fetches.
  vec2 velocity = lookupWind(uv, u_wind, u_wind_size, u_max_wind_speed);
  float speed = clamp(length(velocity) / max(u_color_scale, 1e-4), 0.0, 1.0);
  v_color = texture2D(u_color_ramp, vec2(speed, 0.5));
}
