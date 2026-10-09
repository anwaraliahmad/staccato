// Core — a chrome star that sings from the inside out.
// Like the heart, the angle from the axis picks the frequency: the poles hear
// the bass, the waist hears the treble. Silent, it turns and breathes.

varying vec2 vUv;
varying float d; // how far the music has pushed this point, 0..1

void main() {
	vUv = uv;
	vec3 dir = normalize(position + vec3(1e-4));

	// Rings of frequency from the poles to the waist.
	float f = acos(abs(dir.y)) / 1.5708;
	d = pow(spectrum(0.04 + 0.62 * f), 1.6);

	// At rest it breathes; on an attack the spikes lunge.
	float breath = 0.025 * sin(time * 0.7 + dir.y * 3.0);
	float push = d * 0.42 + onset * 0.06 + breath;
	// Fine crystal ridges, only when there's treble to hear.
	push += 0.02 * treble * sin(dir.x * 40.0) * sin(dir.z * 40.0);

	// A slow precession, so the reflections are always moving.
	float a = time * 0.11, b = 0.35 * sin(time * 0.07);
	mat3 spin = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a))
	          * mat3(1.0, 0.0, 0.0, 0.0, cos(b), sin(b), 0.0, -sin(b), cos(b));
	vec3 p = spin * (position + normal * size * push);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
