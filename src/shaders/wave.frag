varying vec2 vUv;
varying float d; // displacement
uniform float time;
uniform float frequency[512];
uniform float mDb;

// Adjusting for minimum decibel values given by FFT
float LinearToDecibel(float linear)
{
	return linear-mDb;
}

float radius(vec2 u) {
	float x = u.x-.5;
	float y = u.y-.5;
	return sqrt(x*x + y*y);
}
void main() {
	// Making the color a red scale with respect to vertex displacement
  gl_FragColor = vec4(1.0, sin(radius(vUv)*2.*3.14 + time) , cos(radius(vUv)), 1.0);

}
