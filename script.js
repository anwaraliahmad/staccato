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
      t: {
        type: "f",
        value: 0.0
      },
      fft: {
        type: "iv1",
        value: [1.0, 1.0, 1.0]
      },
      mDb: {
        type: "f",
        value: -100.0
      }
  };
  // Size for AnalysisNode's fft samples 
  this.FFT = 1024;
  for (var i = 0; i < this.shaderTypes.length; i++) {
    this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
    this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
  }  
  this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  this.sources = [];
  // Load a new song
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

      });
    }
    r.send();

  }


  this.play = function(buffer) {
    var s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(this.ctx.destination);
    s.start(0);
  }



}


window.onload = function() {
  // detect WebGL
  if( !Detector.webgl ){
    Detector.addGetWebGLMessage();
    throw 'WebGL Not Available'
  } 

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
  winResize = new THREEx.WindowResize(renderer, camera);


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



  /*************WAVE GEOMETRY***************
  * A plane with a "wavy" shader applied to it.
  * Uses 
  */
  wavesGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);

  wavesUniforms =    {
        time: { // float initialized to 0
          type: "f", 
          value: 0.0 
        },
        frequency: { // 32-bit float array of FFT generated frequencies
          type: "iv1",
          value: [20., 20.]
        },
        drop: {
          type: "f",
          value: 1.0
        }
  }

  wavesMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: wavesUniforms,
    vertexShader:   document.getElementById('wave-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  });


  waves = new THREE.Mesh(wavesGeo, wavesMaterial);
  waves.rotation.x += Math.PI/2;
  waves.position.y = 200;
  scene.add(waves);


  /***************ABYSS GEOMETRY**************I
  * A plane with an applied rocky, somewhat ravine like 
  * shader. Uses noise functions for the rockiness.
  */ 

  abyssGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);
  
  abyssUniforms = {
    time: {
      type: "f",
      value: 0.0
    }
  };
  abyssMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: abyssUniforms,
    vertexShader:   document.getElementById('abyss-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  });

  abyss = new THREE.Mesh(abyssGeo, abyssMaterial); 
  abyss.rotation.x += Math.PI/2;
  abyss.position.y += 25;
  scene.add(abyss);
  
  
  /*************** HEART GEOMETRY *************
  * A sphere that "beats" and shifts color with the song.
  * Uses vertex displacement with respect to the Fourier transform 
  * data of the audio stream.
  */ 
  heartGeometry = new THREE.SphereGeometry(250, 128, 128);
  arry = []
  heartUniforms =    {
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
      value: [20., 20.]
    }
  }
  heartMaterial = new THREE.ShaderMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    uniforms: heartUniforms,
    vertexShader:   document.getElementById('heart-vertex').textContent,
    fragmentShader: document.getElementById('heart-fragment').textContent
  })

  heart = new THREE.Mesh(heartGeometry, heartMaterial);
  heart.position.y = 350;
  scene.add(heart);

}

// Calculating average (used to compare between batches of Fourier data)
function avg(arr) {
var s = 0; 
for (var i = 0; i < arr.length; i++) {
  s += arr[i];
}
return s/arr.length;
}

/*
* Render loop
*/ 
requestAnimationFrame(function animate() {

  requestAnimationFrame( animate );//keep looping

  delta = clock.getDelta();

  wavesMaterial.uniforms['time'].value += delta;
  abyssMaterial.uniforms['time'].value += delta;
  heartMaterial.uniforms['time'].value += delta;

  camera.position.x = 800*Math.sin(clock.getElapsedTime()/Math.PI);
  camera.position.y = 750*Math.abs(Math.cos(clock.getElapsedTime()/Math.PI))+50;
  camera.position.z = 800*Math.cos(clock.getElapsedTime()/Math.PI);

  camera.lookAt( scene.position ); 

  renderer.render( scene, camera ); // render frame
})
