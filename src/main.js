// Anwar Ali-Ahmad
// Copyright (c) Anwar Ali-Ahmad 2016-2017 All Rights Reserved
// License: MIT License

"use strict";
import * as THREE from "./three";
import Staccato from "./staccato";

var scene, renderer, camera, clock,
 ambientLight, frontLight, backLight,
 uniforms, geometry, material, stacc, delta, waveData;

class Main {
	constructor () { // Set up the scene
		scene = new THREE.Scene();
		//this.scene.fog = new THREE.Fog(new THREE.Color(0xFFFAFA), .1, 1000);
		renderer = new THREE.WebGLRenderer();
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(new THREE.Color(0xffffff), 1);

		camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 10000);
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


		stacc = new Staccato(scene, camera);



    stacc.addShape({shape: "tetrahedron", shader: "generate", position: new THREE.Vector3(0,0,0), size: 800});

	}

}

window.onload = function() {
	let main = new Main();

	var animate = function() {
		var d = clock.getDelta();
	  stacc.update(d);
		renderer.render( scene, camera ); // render frame
		requestAnimationFrame(animate);//keep looping
	}

  animate();
}
