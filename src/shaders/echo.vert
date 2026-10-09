// Echo — the 2016 wave's ripples, finally carrying the song.
// A polar spectrogram: the angle around the centre is frequency (mirrored so
// there's no seam), the distance from the centre is how long ago it was heard.
// Every ring is a moment travelling outward.
// Anwar Ali-Ahmad, 2016 / 2026

varying vec2 vUv;
varying float d; // displacement, 0..1

float radius(vec2 u) {
	float x = u.x-.5;
	float y = u.y-.5;
	return sqrt(x*x + y*y);
}

void main() {
	vUv = uv;
	float age = radius(uv) * 2.;                      // 0 at the centre, 1 at the edge
	float f = abs(atan(uv.y-.5, uv.x-.5)) / 3.14159;  // 0..1 around the centre
	d = echo(f, age) * smoothstep(1.2, .7, age);       // settle into the corners

	// Away from the heart: up from the ceiling, down from the floor.
	float side = modelMatrix[3].y > 0. ? -1. : 1.;
	vec3 newposition = position + side*normal*d*size*.3;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(newposition, 1.0);
}
