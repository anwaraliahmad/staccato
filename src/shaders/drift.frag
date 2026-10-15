varying vec2 vUv;
varying float d;
varying float vInstance;

void main() {
	// Bondi, tangerine, grape, lime, strawberry, blueberry: one each.
	vec3 colours[6] = vec3[6](
		vec3(0.2, 0.85, 0.9), vec3(1.0, 0.55, 0.15), vec3(0.6, 0.38, 0.9),
		vec3(0.62, 0.92, 0.25), vec3(1.0, 0.38, 0.55), vec3(0.28, 0.5, 1.0));
	vec3 c = colours[int(floor(vInstance * 5.0 + 0.5)) % 6];
	gl_FragColor = vec4(c * (1.0 + 0.4 * d), 1.0);
}
