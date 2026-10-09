// Orbit — gyroscope rings around the core. Each ring is one band of the
// spectrum: it tumbles at its own pace, and a pulse runs around it when its
// band is loud.

varying vec2 vUv;
varying float d;

mat3 rotateX(float a) { return mat3(1.0, 0.0, 0.0, 0.0, cos(a), sin(a), 0.0, -sin(a), cos(a)); }
mat3 rotateZ(float a) { return mat3(cos(a), sin(a), 0.0, -sin(a), cos(a), 0.0, 0.0, 0.0, 1.0); }

void main() {
	vUv = uv;
	d = spectrum(0.06 + 0.7 * instance);

	// A pulse travelling around the ring.
	float pulse = pow(0.5 + 0.5 * sin(uv.x * 6.2832 * 3.0 - time * 2.0), 6.0);
	vec3 p = position + normal * size * (0.012 + 0.05 * d * pulse);
	p *= 1.0 + 0.03 * onset;

	float pace = 0.12 + 0.2 * instance;
	p = rotateZ(time * pace * 0.7 + instance * 2.0) * rotateX(time * pace + instance * 4.0) * p;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
