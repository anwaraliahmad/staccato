varying vec2 vUv;
varying float d;

float radius(vec2 u) {
	float x = u.x-.5;
	float y = u.y-.5;
	return sqrt(x*x + y*y);
}

void main() {
	// The geometry is coarse; the colour reads the spectrogram again per pixel,
	// so the detail runs along every wire.
	float age = radius(vUv) * 2.;
	float f = abs(atan(vUv.y-.5, vUv.x-.5)) / 3.14159;
	float e = echo(f, age) * smoothstep(1.2, .7, age);

	// Quiet is ink-blue, loud burns through magenta to white.
	gl_FragColor = vec4(e*1.8, e*e*1.4 + d*.2, 1.0 - e*.3, 1.0);
}
