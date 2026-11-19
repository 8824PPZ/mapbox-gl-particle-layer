precision highp float;

uniform sampler2D u_screen;

varying vec2 v_tex_pos;

// The trail buffer holds premultiplied color (particles are composited with
// `blendFunc(SRC_ALPHA, ONE)`), so the final blit uses
// `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)`.
void main() {
  gl_FragColor = texture2D(u_screen, v_tex_pos);
}
