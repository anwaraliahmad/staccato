// Column — a glass pillar. Each listens to its own band and breathes with it.

varying vec2 vUv;
varying float d;

void main() {
	vUv = uv;
	d = spectrum(0.05 + 0.75 * instance);
	vec3 p = position;
	p.xz *= 1.0 + 0.35 * d;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
