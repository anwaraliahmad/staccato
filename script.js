// Staccato - WebGL music visualizer using shaders and FFT audio data
// Copyright (c) Anwar Ali-Ahmad 2016 All rights reserved.
// License: MIT License
// github.com/anwaraliahmad/staccato


var scene, renderer, camera, clock, winResize;
var ambientLight, frontLight, backLight;

var uniforms, geometry, material, skyBox;
var winResize;

// STACCATO OBJECT 
function Staccato(scene, camera) {
  var objectMat, PI2;
  PI2 = Math.PI*2;
  this.scene = scene;
  this.camera = camera; 
  this.shaderTypes = ['heart', 'wave', 'abyss'];
  this.shaders = {};

  // All the GLSL uniforms used by Staccato for visualization
  this.uniforms = {
      disp: { 
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
      }
  };
  // Size for AnalysisNode's fft samples 
  this.FFT = 1024;
  // Load shaders supported by Staccato
  for (var i = 0; i < this.shaderTypes.length; i++) {
    this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
    this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
    var node = document.createElement("div");
    node.innerHTML = this.shaderTypes[i];
    node.id = this.shaderTypes[i];
    document.getElementById('side-bar').appendChild(node);
  }  
  // Defining audio context
  this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Analyser to retrive FFT data from audio stream
  this.analyser = this.ctx.createAnalyser();
  this.analyser.fftSize = 1024;
  this.source;
  this.waveData = new Float32Array(this.FFT/2);
  var mouse = {x: 0, y:0};
  this.objectMat = [];
  this.shapes = [];
  // Load a song from url path
  this.load = function (url) {
    // Make a get request to song's URL 
    var r = new XMLHttpRequest();
    var scope = this;
    r.open("GET", url, true); 
    r.responseType = "arraybuffer";
    var buffer = null;
    r.onload = function() {
      // Build audio buffer from sound
      this.ctx.decodeAudioData(r.response, function(buff) {
        scope.play(buff);
        scope.sound = buff;
      }.bind(this));
    }.bind(this);
    r.send();
  }.bind(this); 


  // change shader of shape(s) 
  this.changeShader = function(e)  {
    var shader = e.target.id;
    for (var i = 0; i < this.shapes.length; i++) {
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
      console.log(shader);
    }
  }.bind(this);


  // Play the sound buffer
  this.play = function(buffer) {
    this.analyser = this.ctx.createAnalyser();
    if (this.source)
        this.source.stop();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.analyser);
    this.source.connect(this.ctx.destination);
    this.source.start(0);

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
    e.preventDefault();
    e.stopPropagation();
    e.preventDefault();
    e.target.className = (e.type === 'dragover' ? 'hover' : '');
  }.bind(this);

  // Decode the song file data into an audio buffer, which will then be played
  this.initAudio = function(data) {
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
  }.bind(this);

  // Retrieve data from dropped file to be decoded
  this.fileHandler = function (e) {
    e.preventDefault();
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



  // Adding drag + drop event listeners
  this.fileDrop = document.getElementById("file-drop");
  this.fileDrop.addEventListener('dragover', this.fileDragHover, false);
  this.fileDrop.addEventListener('drop', this.fileHandler, false);





  var shades = document.getElementById('side-bar').childNodes;
  for (var i = 1; i < shades.length; i++) {
    shades[i].addEventListener('mouseover', this.changeShader, false);
  }


  document.addEventListener("mousemove", function(e) {
    e.preventDefault();
    mouse.x = (e.clientX / window.innerWidth ) - .5;
    mouse.y = (e.clientY / window.innerHeight) - .5;
  });

  // Add a shape with Staccato's shaders to the scene
  this.addShape = function(params) {
    var g; 
    var shape = params.shape;
    var shader = params.shader; 
    var pos = params.position;
    var size = params.size;
    switch(shape) { 
      case "plane": g = new THREE.PlaneGeometry(size,size,32,32); break;
      case "sphere": g = new THREE.SphereGeometry(size,32,32); break;
    }
    var hm = new THREE.ShaderMaterial({
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      uniforms: this.uniforms,
      vertexShader:   document.getElementById(shader + '-vertex').textContent,
      fragmentShader: document.getElementById(shader + '-fragment').textContent
    });
	
    var m = new THREE.Mesh(g, hm); // Building mesh 
    m.name = shader + "-" + shape; // Giving ID to Object 
    m.position.set(pos.x, pos.y, pos.z);
    if (shape == "plane")  
      m.rotation.x += Math.PI/2;
    this.objectMat.push(hm);
    this.shapes.push(m);
    scene.add(m);


  }.bind(this);


  // Update scene
  this.update = function(delta) {

    // Update FFT audio data
    this.waveData = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatFrequencyData(this.waveData);
    this.waveData = (this.source) ? this.waveData : [0.0, 0.0, 0.0];
    var avg = this.avg(this.waveData);
    // Update the uniforms for each object
    for (var i = 0; i < this.objectMat.length; i++) {
      this.objectMat[i].uniforms['frequency'].value = this.waveData; 
      this.objectMat[i].uniforms['time'].value += delta;
    }

    camera.position.x += (mouse.x*4000- camera.position.x) * (delta*3)
    camera.position.y += (mouse.y*4000 - camera.position.y) * (delta*3)
    camera.lookAt( scene.position ); 
  }
}

var stacc;

// 3. This function creates an <iframe> (and YouTube player)
//    after the API code downloads.
var player;
function onYouTubeIframeAPIReady() {

  player = new YT.Player('player', {
    width: '400px',
    height: '200px',
    videoId: '8x4GC0-Z0ZI',
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

// 4. The API will call this function when the video player is ready.
function onPlayerReady(event) {
  event.target.playVideo();
}

// 5. The API calls this function when the player's state changes.
//    The function indicates that when playing a video (state=1),
//    the player should play for six seconds and then stop.
var done = false;
function onPlayerStateChange(event) {
  if (event.data == YT.PlayerState.PLAYING && !done) {
    document.getElementById('yt-input').innerText = player.getVideoData().title;
    done = true;
  }
}
function stopVideo() {
  player.stopVideo();
}


// INITIALIZATION (happens once the window loads) 
window.onload = function() {

  if( !Detector.webgl ){
    Detector.addGetWebGLMessage();
    throw 'WebGL Not Available'
  } 
  
  // Setup WebGL renderer full page
  renderer  = new THREE.WebGLRenderer({antialias: false});
  renderer.setSize( window.innerWidth, window.innerHeight );
  var fogColor = new THREE.Color(0x32CD32)
  renderer.setClearColor(new THREE.Color(0xC0C0ff), .5);
  document.body.appendChild( renderer.domElement );

  // Setup a scene and camera
  scene = new THREE.Scene();
  camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 10000);
  scene.fog = new THREE.Fog(fogColor, .1, 1000);

  camera.position.z = 1000;
  camera.position.y = 0;
 
  clock = new THREE.Clock();
  winResize = new THREEx.WindowResize(renderer, camera)

  
  

  // Using standard 3-point lighting technique
  
  
  ambientLight= new THREE.AmbientLight( 0x020202 )
  scene.add( ambientLight);
  frontLight  = new THREE.DirectionalLight('white', 1)
  frontLight.position.set(0.5, 0.5, 2)
  scene.add( frontLight );
  backLight = new THREE.DirectionalLight('white', 0.75)
  backLight.position.set(-0.5, -0.5, -2)
  scene.add( backLight );
  
 


  // Initializing a Staccato-powered scene
  stacc = new Staccato(scene, camera);

  stacc.addShape({shape: "sphere", shader: "heart", position: new THREE.Vector3(0,0,0), size: 300});



  // Render loop 
 
  requestAnimationFrame(function animate() {

    requestAnimationFrame( animate );//keep looping

    delta = clock.getDelta();

    stacc.update(delta);

    renderer.render( scene, camera ); // render frame
  })

}



