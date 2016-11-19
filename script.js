// Staccato - WebGL music visualizer using shaders and FFT audio data
// Copyright (c) Anwar Ali-Ahmad 2016 All rights reserved.
// This code is released under the conditions of the MIT license.
// See LICENSE file for details.
// github.com/anwaraliahmad/staccato


var scene, renderer, camera, clock, winResize;
var ambientLight, frontLight, backLight;

var uniforms, geometry, material, skyBox;
var winResize;

/****** STACCATO OBJECT ***********/
function Staccato(scene, camera) {


  var ctx, analyser, objectMat, PI2;
  PI2 = Math.PI*2;
  this.scene = scene;
  this.camera = camera; 
  this.shaderTypes = ['heart', 'wave', 'abyss'];
  this.shaders = {};

  // All the GLSL uniforms used by Staccato for visualization
  this.uniforms = {
      d: { 
        type: "f",
        value: 0.0
      },
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
      }, 
      od: {
        type: "f",
        value: 0.0
      }
  };
  // Size for AnalysisNode's fft samples 
  this.FFT = 1024;
  // Load shaders supported by Staccato
  for (var i = 0; i < this.shaderTypes.length; i++) {
    this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
    this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
  }  
  // Defining audio context
  this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  var ctx = this.ctx;
  // Analyser to retrive FFT data from audio stream
  this.analyser = this.ctx.createAnalyser();
  this.analyser.fftSize = 1024;
  var analyser = this.analyser;
  this.source;
  this.waveData = new Float32Array(this.FFT/2);
  var mouse = {x: 0, y:0};
  var objectMat = [];

  // Load a song from url path
  this.load = function (url) {
    // Make a get request to song's URL 
    var r = new XMLHttpRequest();
    var scope = this;
    r.open("GET", url, true); 
    r.responseType = "arraybuffer";
    var buffer = null;
    var ctx = this.ctx;
    r.onload = function() {
      // Build audio buffer from sound
      ctx.decodeAudioData(r.response, function(buff) {
        buffer = buff;
        scope.play(buffer);

      }.bind(this));
    }.bind(this);
    r.send();
  }.bind(this); 


  // Play the sound buffer
  this.play = function(buffer) {
    var s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(this.ctx.destination);
    s.start(0);
    this.source = s;
    console.log(s);
  }.bind(this);

  // Calculating average of FFT data
  this.avg = function (arr) {
    var s = 0; 
    for (var i = 0; i < arr.length; i++) {
      s += arr[i];
    }
    return s/arr.length;
  }


  // When file is dragged over file drop element
  this.fileDragHover = function (e) {
    e.stopPropagation();
    e.preventDefault();
    e.target.className = (e.type === 'dragover' ? 'hover' : '');
  }.bind(this);

  // Decode the song file data into an audio buffer, which will then be played
  this.initAudio = function(data) {
    var source = ctx.createBufferSource();
    if (ctx.decodeAudioData) {
      ctx.decodeAudioData(data, function(buffer) {
        var s = ctx.createBufferSource();
        s.buffer = buffer;
        s.connect(ctx.destination);
        s.connect(analyser);
        s.start(0);
      }, function (e) {
        console.error(e);
      });
    } else {
      console.log("Error: could not initialize audio data.");
    }
  }.bind(this);

  // Retrieve data from dropped file to be decoded
  this.fileHandler = function (e) {
    e.stopPropagation();
    e.preventDefault();
    e.target.className = "";
    var files = e.target.files || e.dataTransfer.files;
    var reader = new FileReader();
    reader.onload = function (f) {
      var dat = f.target.result;
      this.initAudio(dat);
    }.bind(this);

    reader.readAsArrayBuffer(files[0]);
  }.bind(this);



  var mousedown = false;
  // Adding drag + drop event listeners
  this.fileDrop = document.getElementById("file-drop");
  this.fileDrop.addEventListener('dragover', this.fileDragHover, false);
  this.fileDrop.addEventListener('drop', this.fileHandler, false);
  document.addEventListener("mousemove", function(e) {
    e.preventDefault();
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  document.addEventListener("mousedown", function(e) {
    e.preventDefault();
    mousedown = true;

  });

  document.addEventListener("mouseup", function(e) {
    e.preventDefault();
    mousedown = false;

  });

  this.addShape = function(shape, shader, pos) {
    var g; 
    switch(shape) {
      case "plane": g = new THREE.PlaneGeometry(1500,1500,32,32); break;
      case "sphere": g = new THREE.SphereGeometry(250, 128, 128); break;
    }
    var hm = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      uniforms: this.uniforms,
      vertexShader:   document.getElementById(shader + '-vertex').textContent,
      fragmentShader: document.getElementById(shader + '-fragment').textContent
    });


    var m = new THREE.Mesh(g, hm);
    m.name = shader + "-" + shape;
    m.position.set(pos.x, pos.y, pos.z);
    if (shape == "plane")  
      m.rotation.x += Math.PI/2;
    objectMat.push(hm);
    scene.add(m);
  }.bind(this);



  this.update = function(delta) {
    var spdy =  (window.innerHeight/ 2 - mouse.y);
    var spdx =  (window.innerWidth / 2 - mouse.x);

    // Update FFT audio data
    this.waveData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(this.waveData);
    var avg; 
    if (this.waveData)
      avg = this.avg(this.waveData);
    // Update the uniforms for each object
    for (var i = 0; i < objectMat.length; i++) {
      objectMat[i].uniforms['frequency'].value = this.waveData;
      objectMat[i].uniforms['od'].value = avg;
      objectMat[i].uniforms['time'].value += delta;
    }

    // Have camera glide about the center in a cylindrical path
  //  camera.position.x = 800*Math.sin(clock.getElapsedTime()/PI2);
   // camera.position.y = 750*(Math.cos(clock.getElapsedTime()/PI2));
    //camera.position.z = 800*Math.cos(clock.getElapsedTime()/PI2);
    if (mousedown) {
      camera.position.x += (spdx*5- camera.position.x)*delta;
      camera.position.y += (spdy*5- camera.position.y)*delta;
    }
    camera.lookAt( scene.position ); 
  }
}

var stacc;

// Wait until the window loads
window.onload = function() {
  if( !Detector.webgl ){
    Detector.addGetWebGLMessage();
    throw 'WebGL Not Available'
  } 
    // setup webgl renderer full page
  renderer  = new THREE.WebGLRenderer({antialias: false});
  renderer.setSize( window.innerWidth, window.innerHeight );
  var fogColor = new THREE.Color(0x32CD32)
  renderer.setClearColor(new THREE.Color(0xC0C0ff), .5);

  document.body.appendChild( renderer.domElement );
  // setup a scene and camera
  scene = new THREE.Scene();
  camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 10000);
  scene.fog = new THREE.Fog(fogColor, .1, 1000);

  camera.position.z = 1000;
  camera.position.y = 0;
  clock = new THREE.Clock();

  winResize = new THREEx.WindowResize(renderer, camera)

  /* 
  * Using standard 3-point lighting technique
  */ 
  
  ambientLight= new THREE.AmbientLight( 0x020202 )
  scene.add( ambientLight);
  frontLight  = new THREE.DirectionalLight('white', 1)
  frontLight.position.set(0.5, 0.5, 2)
  scene.add( frontLight );
  backLight = new THREE.DirectionalLight('white', 0.75)
  backLight.position.set(-0.5, -0.5, -2)
  scene.add( backLight );
  
 
  stacc = new Staccato(scene, camera);
  stacc.addShape("sphere",'heart', new THREE.Vector3(0,0,0));
  stacc.addShape("plane",'abyss', new THREE.Vector3(0, -300, 0));
  stacc.addShape("plane",'wave', new THREE.Vector3(0, 300, 0));

  /*
  * Render loop
  */ 
  requestAnimationFrame(function animate() {

    requestAnimationFrame( animate );//keep looping

    delta = clock.getDelta();

    stacc.update(delta);

    renderer.render( scene, camera ); // render frame
  })

}



