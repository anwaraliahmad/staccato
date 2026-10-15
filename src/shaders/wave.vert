varying vec2 vUv;
varying float d;// displacement
uniform float time;

float radius(vec3 p) {
	return sqrt(p.x*p.x + p.y*p.y);
}

void main() {
    vUv = uv;
   	d =	5.*cos(2.*3.14*radius(position)/180.+ time);

   	vec3 newposition = position - normal*d*d;
   	gl_Position = projectionMatrix * modelViewMatrix * vec4( newposition, 1.0 );

}
