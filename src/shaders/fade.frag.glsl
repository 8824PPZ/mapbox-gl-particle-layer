precision highp float;

uniform float u_fade;

// Multiplied into the trail buffer (`blendFunc(ZERO, SRC_COLOR)`), so older
// frames keep an ever smaller fraction of their brightness.
void main() {
  gl_FragColor = vec4(vec3(u_fade), u_fade);
}
