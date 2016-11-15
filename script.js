var scene, renderer, camera, clock, winResize;
var ambientLight, frontLight, backLight;

var uniforms, geometry, material, skyBox;

var wavesGeo, wavesUniforms, wavesMaterial, waves;

var abyssGeo, abyssUniforms, abyssMaterial, abyss;

var heartMaterial, heartUniforms, heartGeometry, heart;

function Staccato(scene, camera) {

  this.scene = scene;
  this.camera = camera; 
  this.shaderTypes = ['heart', 'wave', 'abyss'];
  this.shaders = {};
  this.uniforms = {
      d: { 
        type: "f",
        value: 0.0
      },
      time: {
        type: "f",
        value: 0.0
      },
      frequency: {
        type: "fv1",
        value: [1.0, 1.0, 1.0]
      },
      mDb: {
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
  for (var i = 0; i < this.shaderTypes.length; i++) {
    this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
    this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
  }  
  this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  var ctx = this.ctx;
  this.analyser = this.ctx.createAnalyser();
  this.analyser.fftSize = 1024;
  var analyser = this.analyser;
  this.source;
  this.waveData = new Float32Array(this.FFT/2);
  this.mouse = {x: 0, y:0};
  var objectMat = [];

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
  }


  // Play the sound buffer
  this.play = function(buffer) {
    var s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(this.ctx.destination);
    s.start(0);
    this.source = s;
    console.log(s);
  }

  // Calculating average of FFT data
  this.avg = function (arr) {
    var s = 0; 
    for (var i = 0; i < arr.length; i++) {
      s += arr[i];
    }
    return s/arr.length;
  }


  this.fileDragHover = function (e) {
    e.stopPropagation();
    e.preventDefault();
    e.target.className = (e.type === 'dragover' ? 'hover' : '');
  }

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
  }

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
  }

  // Setting the scope of event handler functions to be Staccato
  this.fileHandler = this.fileHandler.bind(this);
  this.fileDragHover= this.fileDragHover.bind(this);
  this.initAudio = this.initAudio.bind(this);


  this.fileDrop = document.getElementById("file-drop");
  this.fileDrop.addEventListener('dragover', this.fileDragHover, false);
  this.fileDrop.addEventListener('drop', this.fileHandler, false);

  this.addShape = function(shape, shader, pos) {
    var g; 
    switch(shape) {
      case "plane": g = new THREE.PlaneGeometry(1500,1500,64,64); break;
      case "sphere": g = new THREE.SphereGeometry(250, 128, 128); break;
    }
    var uniforms =    {
        time: { // float initialized to 0
          type: "f", 
          value: 0.0 
        },
        minDecibels: {
          type: "f",
          value: -100.
        },
        frequency: { // byte array of FFT frequencies
          type: "fv1",
          value: this.waveData
        },
        od: {
          type: "f",
          value: 0.0
        }
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
  }



  this.update = function(delta) {
   // if (this.source) {
      this.waveData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(this.waveData);
      var avg; 
      if (this.waveData)
        avg = this.avg(this.waveData);
      for (var i = 0; i < objectMat.length; i++) {
        objectMat[i].uniforms['frequency'].value = this.waveData;
        objectMat[i].uniforms['od'].value = avg;
        objectMat[i].uniforms['time'].value += delta;
      }
  //  }
    camera.position.x = 800*Math.sin(clock.getElapsedTime()/Math.PI);
    camera.position.y = 750*(Math.cos(clock.getElapsedTime()/Math.PI));
    camera.position.z = 800*Math.cos(clock.getElapsedTime()/Math.PI);

    camera.lookAt( scene.position ); 
  }
}

var stacc;

window.onload = function() {
  // detect WebGL
  //if( !Detector.webgl ){
  //  Detector.addGetWebGLMessage();
   // throw 'WebGL Not Available'
  //} 

    // setup webgl renderer full page
  renderer  = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );
  // setup a scene and camera
  scene = new THREE.Scene();
  camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 10000);
  camera.position.z = 800;
  camera.position.y = 150;
  clock = new THREE.Clock();
//  winResize = new THREEx.WindowResize(renderer, camera);

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


    /*********SKYDOME**********/
  geometry = new THREE.SphereGeometry(3000, 32, 32);  
  uniforms = {  
    texture: { type: 't', value: THREE.ImageUtils.loadTexture('./vendor/img/skydome.jpg') }
  };

  material = new THREE.ShaderMaterial( {  
    uniforms:       uniforms,
    vertexShader:   document.getElementById('sky-vertex').textContent,
    fragmentShader: document.getElementById('sky-fragment').textContent
  });

  skyBox = new THREE.Mesh(geometry, material);  
  skyBox.scale.set(-1, 1, 1);  
  skyBox.rotation.order = 'XZY'; 
  skyBox.rotation.y -= Math.PI/8; 
  skyBox.renderDepth = 1000.0;  
  scene.add(skyBox); 
  
 
  stacc = new Staccato(scene, camera);
  stacc.addShape("sphere",'heart', new THREE.Vector3(0,0,0));
  stacc.addShape("plane",'abyss', new THREE.Vector3(0, -750, 0));
  stacc.addShape("plane",'wave', new THREE.Vector3(0, 800, 0));

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



