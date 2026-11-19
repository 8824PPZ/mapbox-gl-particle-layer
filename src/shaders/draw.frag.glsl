precision highp float;

uniform float u_opacity;

varying vec4 v_color;

void main() {
  // Round, anti-aliased dot: discard outside the inscribed circle, then fade
  // the last couple of pixels so dense fields do not look like a grid.
  vec2 offset = gl_PointCoord - 0.5;
  float dist2 = dot(offset, offset);
  if (dist2 > 0.25) discard;

  float coverage = smoothstep(0.25, 0.02, dist2);
  gl_FragColor = vec4(v_color.rgb, v_color.a * coverage * u_opacity);
}
