varying vec2 vUv;
varying float d;

void main() {
	float pulse = pow(0.5 + 0.5 * sin(vUv.x * 6.2832 * 3.0 - time * 2.0), 6.0);
	gl_FragColor = vec4(vec3(0.7, 0.8, 1.0) + pulse * d * 0.6, 1.0);
}
