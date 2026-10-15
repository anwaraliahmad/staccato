varying vec2 vUv;
varying float d;// displacement
uniform float time;
uniform float frequency[512]; // FFT decibel data
uniform float minDecibels;

float radius(vec3 p) {
	return sqrt(p.x*p.x+p.y*p.y);
}

// Adjusting for minimum decibel values given by FFT
float LinearToDecibel(float linear)
{
	return linear-minDecibels;
}

void main() {
    vUv = uv;
    /*
		* Displacement is a function of the FFT frequencies
		*	provided by the Web Audio API's AudioNode analyser
    */
    d = LinearToDecibel(frequency[int(radius(position))]);

   	vec3 newposition = position + normal*d*d/15.;
   	gl_Position = projectionMatrix * modelViewMatrix * vec4( newposition, 1.0 );

}
