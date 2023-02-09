import * as THREE from 'three';
import Staccato from './staccato';

class Main {

	// Critical THREE objects
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	camera: THREE.Camera;

	// Scene lighting and objects
	ambientLight: THREE.AmbientLight;
	frontLight: THREE.DirectionalLight;
	backLight: THREE.DirectionalLight;
	skyBox: THREE.Mesh;

	// Timing
	clock: THREE.Clock;
	delta: number;

	visualizer: Staccato;

	constructor () { // Set up the scene
		this.scene = new THREE.Scene();
		//this.scene.fog = new THREE.Fog(new THREE.Color(0xFFFAFA), .1, 1000);
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0xffffff), 1);

		this.camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 20000);
		this.camera.position.z = 1000;
		this.camera.position.y = 0;

		try {
			document.body.appendChild(this.renderer.domElement);
		} catch (e) {
			console.log("ERROR: Could not add renderer to document.");
		}

		this.clock = new THREE.Clock();


  		// Industry-standard three-point lighting technique
		this.ambientLight= new THREE.AmbientLight( 0x020202 );
		this.scene.add(this.ambientLight);
		this.frontLight  = new THREE.DirectionalLight('white', 1);
		this.frontLight.position.set(0.5, 0.5, 2);
		this.scene.add(this.frontLight);
		this.backLight = new THREE.DirectionalLight('white', 0.75);
		this.backLight.position.set(-0.5, -0.5, -2);
		this.scene.add(this.backLight);
		this.delta = 0;

		this.skyBox = this.initSkybox();
		this.scene.add(this.skyBox); 

		this.visualizer = new Staccato(this.scene, this.camera);
    	this.visualizer.addShape({shape: "sphere", shader: "heart", position: new THREE.Vector3(0,0,0), size: 800});
	}

	initSkybox() {
		const geometry = new THREE.SphereGeometry(10000, 64, 64); 
		// const geometry = new THREE.BoxGeometry(10000, 10000, 10000); 

		const texture = new THREE.TextureLoader().load('skydome.jpg');
		const uniforms = {  
			texture: { type: 't', value: texture }
		};
		
		/*let material = new THREE.ShaderMaterial( {  
			vertexShader:   document.getElementById('sky-vertex').textContent,
			fragmentShader: document.getElementById('sky-fragment').textContent,
			uniforms
		});*/
		const material = new THREE.MeshPhongMaterial({
			map: texture
		});
		material.side = THREE.BackSide;

		let skyBox = new THREE.Mesh(geometry, material);  
		skyBox.scale.set(-1, 1, 1);  
		skyBox.rotation.order = 'XZY'; 
		skyBox.rotation.y -= Math.PI/2; 
		// skyBox.renderDepth = 1000.0;  
		return skyBox;
	}

	update() {
		this.visualizer.update(this.clock.getDelta());
		this.renderer.render(this.scene, this.camera); // render frame
		requestAnimationFrame(this.update.bind(this)); // keep looping
	}

}
// INITIALIZATION (happens once the globalThis loads) 
globalThis.onload = () => {
  let main = new Main();
  let animate = main.update.bind(main);
  main.update();
}
  
  
  
  