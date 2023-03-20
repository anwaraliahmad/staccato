import * as THREE from 'three';
import { OrbitControls } from './addons/OrbitControls.js';
import { DeviceOrientationControls } from './addons/DeviceOrientation.js';
import * as Stats from 'stats.js';
import Staccato from './staccato';

enum StatsPanel {
    FPS,
    MS,
    MB,
    CUSTOM
}

export default class Main {

	// Critical THREE objects
	scene: THREE.Scene;
	renderer: THREE.WebGLRenderer;
	camera: THREE.Camera;
	controls: OrbitControls;
	orientation: DeviceOrientationControls;
	


	// Scene lighting and objects
	ambientLight: THREE.AmbientLight;
	frontLight: THREE.DirectionalLight;
	backLight: THREE.DirectionalLight;
	skyBox: THREE.Mesh;

	// Timing
	clock: THREE.Clock;
    stats: Stats;
	delta: number;

	visualizer: Staccato;

    // Initialize scene and visualizer
	constructor () {
		this.scene = new THREE.Scene();
		this.renderer = new THREE.WebGLRenderer();
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(new THREE.Color(0xffffff), 1);

        // Create scene camera
		this.camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 20000);
		this.camera.position.z = 1000;
		this.camera.position.y = 0;

		// Orbit controls for camera
		this.controls = new OrbitControls( this.camera, this.renderer.domElement );
		this.controls.autoRotate = true;
		this.controls.enableDamping = true;

		// Device Orientation
		this.orientation = new DeviceOrientationControls(this.camera);
		this.orientation.initialOffset = 0;
		this.orientation.connect();

        // Implant renderer into DOM
		try {
			document.body.appendChild(this.renderer.domElement);
		} catch (e) {
			console.log("ERROR: Could not add renderer to document.");
		}

        // Used to get delta for runtime loop
		this.clock = new THREE.Clock();
        // Perfomance stats 
        this.stats = new Stats();
        this.stats.showPanel(StatsPanel.FPS); // 0: fps, 1: ms, 2: mb, 3+: custom
        this.stats.dom.style.position = 'default !important';
        document.getElementById('console').appendChild(this.stats.dom);
        this.update.bind(this);



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

        /* TODO: Add "toggle" feature for skydome
		this.skyBox = this.initSkybox();
		this.scene.add(this.skyBox); 
        */

        // Create the Staccato visualization module
		this.visualizer = new Staccato(this.scene, this.camera);
    	this.visualizer.addShape({shape: "sphere", shader: "heart", position: new THREE.Vector3(0,0,0), size: 800});
	}

	initSkybox() {
		const geometry = new THREE.SphereGeometry(10000, 64, 64); 
        
        const texture = new THREE.TextureLoader().load('skydome.jpg');
		const uniforms = {  
			texture: { type: 't', value: texture }
		};
		const material = new THREE.MeshPhongMaterial({
			map: texture
		});
		material.side = THREE.BackSide;

		let skyBox = new THREE.Mesh(geometry, material);  
		skyBox.scale.set(-1, 1, 1);  
		skyBox.rotation.order = 'XZY'; 
		skyBox.rotation.y -= Math.PI/2; 
		return skyBox;
	}

	update() {
        this.stats.begin();
		requestAnimationFrame(this.update.bind(this)); // keep looping
		this.controls.update();
		//this.orientation.update();
		//console.log(this.orientation.deviceOrientation)
		this.visualizer.update(this.clock.getDelta());
		this.renderer.render(this.scene, this.camera); // render frame
		this.stats.end();
	}

}