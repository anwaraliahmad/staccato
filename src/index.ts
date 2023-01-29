import * as THREE from 'three';
import Staccato from './staccato';

var scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera;
var clock: THREE.Clock,
 ambientLight: THREE.AmbientLight;
var frontLight: THREE.DirectionalLight, backLight: THREE.DirectionalLight;

var skyBox:  THREE.Mesh;
var stacc; 
var delta: number, waveData: Float32Array;

class Main {
	constructor () { // Set up the scene
		scene = new THREE.Scene();
		//this.scene.fog = new THREE.Fog(new THREE.Color(0xFFFAFA), .1, 1000);
		renderer = new THREE.WebGLRenderer();
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(new THREE.Color(0xffffff), 1);

		camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 20000);
		camera.position.z = 1000;
		camera.position.y = 0;

		try {
			document.body.appendChild(renderer.domElement);
		} catch (e) {
			console.log("ERROR: Could not add renderer to document.");
		}

		clock = new THREE.Clock();


  		// Industry-standard three-point lighting technique
		var ambientLight= new THREE.AmbientLight( 0x020202 );
		scene.add( ambientLight);
		var frontLight  = new THREE.DirectionalLight('white', 1);
		frontLight.position.set(0.5, 0.5, 2);
		scene.add( frontLight );
		var backLight = new THREE.DirectionalLight('white', 0.75);
		backLight.position.set(-0.5, -0.5, -2);
		scene.add( backLight );
		delta = 0;
		waveData = new Float32Array(512);

		skyBox = this.initSkybox();
		console.log(skyBox);
		scene.add(skyBox); 

		stacc = new Staccato(scene, camera);
    	stacc.addShape({shape: "sphere", shader: "generate", position: new THREE.Vector3(0,0,0), size: 800});
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

}
// INITIALIZATION (happens once the globalThis loads) 
globalThis.onload = () => {
  let main = new Main();

  var animate = () => {
    var d = clock.getDelta();
    stacc.update(d);
    renderer.render( scene, camera ); // render frame
    requestAnimationFrame(animate);//keep looping
  }

  animate();
}
  
  
  
  