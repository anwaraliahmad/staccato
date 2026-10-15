// Seafloor — a bathymetric map. The terrain is the deep ocean floor, still
// and old; the song passes over it as swells, low notes on the left, high on
// the right, the newest nearest you.

varying vec2 vUv;
varying float d; // height, 0 (trench) .. 1 (peak)

// Ashima / stegu simplex noise (MIT), the same family the abyss used in 2016.
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
	const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
	vec2 i  = floor(v + dot(v, C.yy));
	vec2 x0 = v - i + dot(i, C.xx);
	vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
	vec4 x12 = x0.xyxy + C.xxzz;
	x12.xy -= i1;
	i = mod289(i);
	vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
	vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
	m = m*m; m = m*m;
	vec3 x = 2.0 * fract(p * C.www) - 1.0;
	vec3 h = abs(x) - 0.5;
	vec3 ox = floor(x + 0.5);
	vec3 a0 = x - ox;
	m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
	vec3 g;
	g.x  = a0.x  * x0.x  + h.x  * x0.y;
	g.yz = a0.yz * x12.xz + h.yz * x12.yw;
	return 130.0 * dot(m, g);
}

float floorHeight(vec2 p) {
	float h = 0.0, amp = 0.5, freq = 0.00028;
	for (int i = 0; i < 5; i++) {
		// Ridged octaves: sharp crests, soft basins.
		float n = 1.0 - abs(snoise(p * freq + float(i) * 17.0));
		h += amp * n * n;
		amp *= 0.5;
		freq *= 2.1;
	}
	return h;
}

void main() {
	vUv = uv;
	float h = floorHeight(position.xy);
	// The song: x across the floor is pitch, distance from the near edge is time.
	float swell = echo(uv.x * 0.85 + 0.03, uv.y);
	h += swell * swell * 0.55;
	d = smoothstep(0.22, 1.0, h);
	// The floor is rotated to lie flat; its normal points down, so up is -normal.
	vec3 p = position - normal * (h * size * 0.12 - size * 0.06);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
