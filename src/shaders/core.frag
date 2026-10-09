varying vec2 vUv;
varying float d;

void main() {
	// Cold steel that warms to white where it's singing.
	gl_FragColor = vec4(0.62 + 0.38 * d, 0.72 + 0.28 * d, 0.95 + 0.05 * d, 1.0);
}
