// Drift — translucent capsules, the colours of a 1999 computer, floating
// through the space. They bob on their own, and swell with the bass.

varying vec2 vUv;
varying float d;
varying float vInstance;

void main() {
	vUv = uv;
	d = bass;
	vInstance = instance;
	float a = time * (0.15 + 0.1 * instance) + instance * 9.0;
	float tip = 0.4 * sin(time * 0.3 + instance * 5.0);
	vec3 p = position * (1.0 + 0.12 * bass + 0.05 * onset);
	p = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a))
	  * mat3(cos(tip), sin(tip), 0.0, -sin(tip), cos(tip), 0.0, 0.0, 0.0, 1.0) * p;
	p.y += size * 0.4 * sin(time * 0.5 + instance * 4.0);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
