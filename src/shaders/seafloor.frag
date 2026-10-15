varying vec2 vUv;
varying float d;

// Bathymetric colours: trench navy, through ultramarine and violet, to the
// pink and pale gold of the shallows.
vec3 bathymetry(float t) {
	vec3 c = mix(vec3(0.02, 0.03, 0.22), vec3(0.08, 0.1, 0.95), smoothstep(0.0, 0.35, t));
	c = mix(c, vec3(0.55, 0.18, 0.9), smoothstep(0.3, 0.55, t));
	c = mix(c, vec3(1.0, 0.36, 0.72), smoothstep(0.5, 0.72, t));
	c = mix(c, vec3(1.0, 0.92, 0.72), smoothstep(0.7, 0.95, t));
	return c;
}

void main() {
	// Contour lines every tenth of the depth.
	float k = d * 10.0;
	float toLine = 0.5 - abs(fract(k) - 0.5);
	float line = 1.0 - smoothstep(0.0, 1.5 * fwidth(k), toLine);
	gl_FragColor = vec4(bathymetry(d) * (1.15 + 0.5 * line), 1.0);
}
