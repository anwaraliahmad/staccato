// Louver — a canopy of glass blades. At rest they ripple like breathing
// blinds; with music each blade is one band of an equalizer you could stand under.

varying vec2 vUv;
varying float d;

void main() {
	vUv = uv;
	d = spectrum(0.03 + 0.8 * instance);
	float tilt = 0.3 + 0.28 * sin(time * 0.45 - instance * 7.0) + d * 1.2;
	// Turn the blade about its long axis.
	vec3 p = vec3(position.x,
		position.y * cos(tilt) - position.z * sin(tilt),
		position.y * sin(tilt) + position.z * cos(tilt));
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
