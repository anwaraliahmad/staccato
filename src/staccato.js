// Anwar Ali-Ahmad
// Copyright (c) Anwar Ali-Ahmad 2016-2017 All Rights Reserved
// License: MIT License
var randomWords = require('random-words');
import * as THREE from "./three";
"use strict";


class Staccato {
	constructor (scene, camera) {
		this.scene = scene;
		this.camera = camera;

		this.uniforms = {
		  time: { // Elapsed time
		    type: "f",
		    value: 0.0
		  },
		  frequency: { // FFT data array
		    type: "fv1",
		    value: [1.0, 1.0, 1.0]
		  },
		  mDb: { // Minimum decibel value
		    type: "f",
		    value: -100.0
		  }
		};
		// Size for AnalysisNode's fft samples
		this.FFT = 1024;
		this.shaderTypes = ['heart', 'wave', 'abyss'];

		this.shaders = {};

		// Load shaders supported by Staccato
		for (var i = 0; i < this.shaderTypes.length; i++) {
			this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
			this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
			var node = document.createElement("div");
			node.innerHTML = this.shaderTypes[i];
			node.id = this.shaderTypes[i];
			document.getElementById("shaders").appendChild(node);
		}

		var node = document.createElement("div");
		node.innerHTML = "+";
		node.id = "add-shader";
		var s = this;
		document.getElementById('shaders').appendChild(node);
		node.addEventListener('click', function(e) {
			s.addShader(s);
			document.getElementById('shaders').appendChild(node);
		});

		// Defining audio context
		this.ctx = new (window.AudioContext || window.webkitAudioContext)();
		// Analyser to retrive FFT data from audio stream
		this.analyser = this.ctx.createAnalyser();
		this.analyser.fftSize = 1024;
		this.source;
		this.waveData = new Float32Array(this.FFT/2);
		this.mouse = {x: 0, y:0};
		this.objectMat = [];
		this.shapes = [];


		document.addEventListener("mousemove", function(e) {
			e.preventDefault();
			this.mouse.x = (e.clientX / window.innerWidth ) - .5;
			this.mouse.y = (e.clientY / window.innerHeight) - .5;
		}.bind(this));

		// Because ES6 doesn't auto-bind.
		this.changeShader = this.changeShader.bind(this);
		this.fileDragHover = this.fileDragHover.bind(this);
		this.fileHandler = this.fileHandler.bind(this);
		this.initAudio = this.initAudio.bind(this);
		this.play = this.play.bind(this);
		this.addShape = this.addShape.bind(this);
		this.genVertexShader = this.genVertexShader.bind(this);
		this.addShader = this.addShader.bind(this);
		this.update = this.update.bind(this);





		// Adding drag + drop event listeners
		this.fileDrop = document.getElementById("file-drop");
		this.fileDrop.addEventListener('dragover', this.fileDragHover, false);
		this.fileDrop.addEventListener('drop', this.fileHandler, false);

		let shades = document.getElementById('shaders').childNodes;
		var s = this;
		for (var i = 1; i < shades.length; i++) {
			if (shades[i].id == 'add-shader') continue;
			shades[i].addEventListener('click',
				function(e) {
					s.changeShader(e);
				}, false);
		}


	}

	// When file is dragged over file drop element
 	fileDragHover (e) {
	    e.preventDefault();
	    e.stopPropagation();
	    e.preventDefault();
	    e.target.className = (e.type === 'dragover' ? 'hover' : '');
  	}

  		// Retrieve data from dropped file to be decoded
	fileHandler (e) {
		e.preventDefault();
		e.stopPropagation();
		e.preventDefault();
		e.target.className = "";
		var files = e.target.files || e.dataTransfer.files;
		var reader = new FileReader();
		var scope  = this;
		reader.onload = function (f) {
		  var dat = f.target.result;
		  scope.initAudio(dat);
		}
		reader.readAsArrayBuffer(files[0]);
	}

	// Decode the song file data into an audio buffer, which will then be played
	initAudio (data) {
		var scope = this;
		if (this.ctx.decodeAudioData) {
		  this.ctx.decodeAudioData(data, function(buffer) {
		    scope.play(buffer);
		  }, function (e) {
		    console.error(e);
		  });
		} else {
		  console.log("Error: could not initialize audio data.");
		}
	}

	// Play an audio buffer using the Web Audio API.
	play(buffer) {
			this.analyser = this.ctx.createAnalyser();
	    if (this.source)
	        this.source.stop();
	    this.source = this.ctx.createBufferSource();
	    this.source.buffer = buffer;
	    this.source.connect(this.analyser);
	    this.source.connect(this.ctx.destination);
	    this.source.start(0);

	}


  // Calculating average of an array.
  avg (arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) {
      s += arr[i];
    }
    return s/arr.length;
  }


	// Change the shader for every music visualizing object in the scene.
	changeShader(e) {
		var shader = e.target.id;
		var l = this.shapes.length;
	  for (var i = 0; i < l; i++) {
	      this.scene.remove(this.shapes[i]);
	      this.shapes[i] = new THREE.Mesh(this.shapes[i].geometry, new THREE.ShaderMaterial({
	        wireframe: true,
	        transparent: true,
	        opacity: 0.5,
	        uniforms: this.uniforms,
	        vertexShader:   document.getElementById(shader + '-vertex').textContent,
	        fragmentShader: document.getElementById(shader + '-fragment').textContent
	      }));
	      this.scene.add(this.shapes[i]);
	    //  console.log(shader);
		}
	}

  // Add a shape with Staccato's shaders to the scene
  addShape (params) {
    var g;
    var shape = params.shape;
    var shader = params.shader;
    var pos = params.position;
    var size = params.size;
    switch(shape) {
      case "plane": g = new THREE.PlaneGeometry(size,size,128,128); break;
      case "sphere": g = new THREE.SphereGeometry(size,128,128); break;
      case "circle":  g = new THREE.CircleGeometry(size, 256 ); break;
      case "tetrahedron": g = new THREE.TetrahedronGeometry(size, 1);
    }

		var vs = (shader.toLowerCase() == "generate") ? this.genVertexShader() : this.shaders[shader+"-vertex"];
		var fs = (shader.toLowerCase() == "generate") ? this.genFragmentShader() : this.shaders[shader+"-fragment"];

    var hm = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      uniforms: this.uniforms,
      vertexShader:   vs,
      fragmentShader: fs
    });

    var m = new THREE.Mesh(g, hm); // Building mesh
    m.name = shader + "-" + shape; // Giving ID to Object
    m.position.set(pos.x, pos.y, pos.z);
    if (shape == "plane" || shape == "circle")
      m.rotation.x += Math.PI/2;
    this.shapes.push(m);
    this.scene.add(m);

  }



  // procedurally generate a shader
  genVertexShader() {
//    var shader = "varying vec2 vUv;\n";
		var shader = "";
	  shader += "uniform float time;\n"
              + "uniform float frequency[512];\n";

    shader += "float radius() {\n"
              + "return sqrt(position.x*position.x + position.y*position.y);\n"
              + "}\n";
    shader += "float getFreqData(float n) {\n" +
              " return abs(frequency[int(n)]);\n" +
              "}\n";
    shader += "void main() { \n";
    //      + "vUv = uv; \n";

    var disp = "("
    function _dFunct(n) {

      if (n <= 0) return "radius()*time/180.";
      n--;
      for (var i = 0; i < n+1; i++) {
        var ff = Math.floor(Math.random()*3)+1;
        var t;
        switch (ff) {
            case 0: t = "getFreqData";
                break;
            case 1: t = "cos";
                break;
            case 2: t = "log";
                break;
            case 3: t = "sin";
                break;
        }

        return ""+(Math.random()*12.0*(1./(n+1.)))+"*"+t+"("+_dFunct(n)+")";

      }

    }
    var ed = "";
    for (var p = 0; p < Math.floor(Math.random()*1)+2; p++) {
      var type = Math.floor(Math.random()*4);
      var f;
      switch(type) {
        case 0: f = "sin"; break;
        case 1: f = "cos"; break;
        case 2: f = "log"; break;
        case 3: f = "getFreqData"; break;

      }
      if (p > 0) ed="+";
			var dd = _dFunct(5);
      disp += ed+(Math.random()*100.0)+"*"+f+"("+dd+")";
    }
    disp += ")";
    shader += "gl_Position =  projectionMatrix * modelViewMatrix * vec4(position + normal*"+disp+", 1.0 );\n";
    shader += "}";
    return shader;
  }

  genFragmentShader() {
  //  var shader = ""varying vec2 vUv;\n";"
		var shader = "";
		shader += "uniform float time;\n"
    shader += "void main() { \n";
    function _cFunct (n) {
      if (n == 1) return "time/180.";
      n--;
      for (var i = 0; i < n+1; i++) {
        var ff = Math.floor(Math.random()*3);
        var t;
        switch (ff) {
            case 0: t = "cos";
                break;
            case 1: t = "log";
                break;
            case 2: t = "sin";
                break;
        }

        return ""+(Math.random()*12.0*(1./(n+1.)))+"*"+t+"("+_cFunct(n)+")";

      }
    }
    shader += "gl_FragColor = vec4(.1*sin("+_cFunct(2)+"), 0.1*cos("+_cFunct(2)+"), 0.1, 1.0);\n";
	//	shader += "gl_FragColor = vec4(0.9, 0.1, 0.1, 1);\n";
    shader += "}";
	//	console.log(shader);
    return shader;
  }

  // Generate a new shader (fragement + vertex together)
	addShader(scope) {
		var s = scope.genVertexShader();
		var sn = randomWords()
		this.shaderTypes.push(sn);
		var vertex = document.createElement("script");
		vertex.innerHTML = s;
		vertex.id = sn+"-vertex";
		this.shaders[sn+"-vertex"] = s;

		var f = scope.genFragmentShader();
		var frag = document.createElement("script");
		frag.innerHTML = f;
		frag.id = sn+"-fragment";
		this.shaders[sn+"-fragment"] = f;
		var node = document.createElement("div");
		node.innerHTML = sn;
		node.id = sn;
		document.getElementById('shaders').appendChild(node);

		node.addEventListener('click', function(e) {
				for (var i = 0; i < this.shapes.length; i++) {
				this.scene.remove(this.shapes[i]);
				this.shapes[i] = new THREE.Mesh(this.shapes[i].geometry, new THREE.ShaderMaterial({
					wireframe: true,
					transparent: true,
					opacity: 1.,
					uniforms: this.uniforms,
					vertexShader:  this.shaders[sn+"-vertex"],
					fragmentShader: this.shaders[sn+"-fragment"]
				}));
				this.scene.add(this.shapes[i]);
			}
		}.bind(this), false);

	}

  // Update scene
  update (delta) {

    // Update FFT audio data
    this.waveData = (this.analyser != null) ? new Float32Array(this.analyser.frequencyBinCount) : [0,0,0];
    this.analyser.getFloatFrequencyData(this.waveData);
    this.waveData = (this.source) ? this.waveData : [0.0, 0.0, 0.0];
    // Update the uniforms for each object
    for (var i = 0; i < this.shapes.length; i++) {
      this.shapes[i].material.uniforms['frequency'].value = this.waveData;
      this.shapes[i].material.uniforms['time'].value += delta;
    }
    this.camera.position.x += (this.mouse.x*4000- this.camera.position.x) * (delta*3)
    this.camera.position.y += (this.mouse.y*4000 - this.camera.position.y) * (delta*3)
    this.camera.lookAt( this.scene.position );
  }
}

export default Staccato
