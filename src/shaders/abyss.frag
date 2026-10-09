varying vec2 vUv;
uniform float time;
uniform float od;

float radius(vec2 uv) {
	uv.x -= .5;
	uv.y -= .5;
	return sqrt(uv.x*uv.x + uv.y*uv.y);
}

void main() {

	// compose the colour using the UV coordinate
	// and modulate it with the noise like ambient occlusion
 	gl_FragColor = vec4(1.0- 1.0*sin(radius(vUv)*od)*od, 1.0 - od*1.0*cos(radius(vUv)*od), 1.0, 1.0 );

}
