varying vec2 vUv;
varying float d;
uniform float drop;
uniform float time;

void main() {
		// Making the color a red scale with respect to vertex displacement
    gl_FragColor = vec4(1.0*tan(2.*3.14*d/180.+time), vec2(1.0)*sin(2.*3.14*d/180.+time), 1.0);

}
