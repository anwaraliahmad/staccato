varying vec2 vUv;
varying float d;

void main() {
	// A band of light rising through the glass, quicker when it's loud.
	float h = fract(time * (0.05 + 0.1 * d) + vUv.x * 0.0);
	float band = smoothstep(0.08, 0.0, abs(vUv.y - h));
	gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) + band * (0.3 + d), 1.0);
}
