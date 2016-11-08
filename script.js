require([], function(){
  // detect WebGL
  if( !Detector.webgl ){
    Detector.addGetWebGLMessage();
    throw 'WebGL Not Available'
  } 
  // setup webgl renderer full page
  var renderer  = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  document.body.appendChild( renderer.domElement );
  // setup a scene and camera
  var scene = new THREE.Scene();
  var camera  = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.01, 10000);
  camera.position.z = 800;
  camera.position.y = 150;
  var clock = new THREE.Clock();
  var winResize = new THREEx.WindowResize(renderer, camera);

  ///////// Setting up Web Audio Context and Pizzicato.js sound //////////
  var waveform_array, time_array;
  var sumf = 0;
  var sumi = 0;
  var context = Pizzicato.context;
  var analyser = context.createAnalyser();
  var FFT = 512;
  analyser.fftSize = FFT;
  var mouse = {x : 0, y : 0};
  /* 
  * Using standard 3-point lighting technique
  */ 
  
  var ambientLight= new THREE.AmbientLight( 0x020202 )
  scene.add( ambientLight)
  var frontLight  = new THREE.DirectionalLight('white', 1)
  frontLight.position.set(0.5, 0.5, 2)
  scene.add( frontLight )
  var backLight = new THREE.DirectionalLight('white', 0.75)
  backLight.position.set(-0.5, -0.5, -2)
  scene.add( backLight )    

  /*********SKYDOME**********/
  var geometry = new THREE.SphereGeometry(3000, 32, 32);  
  var uniforms = {  
    texture: { type: 't', value: THREE.ImageUtils.loadTexture('./vendor/img/skydome.jpg') }
  };

  var material = new THREE.ShaderMaterial( {  
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


  var sound = new Pizzicato.Sound('./vendor/audio/Prismatic.mp3', function() {
  // Linking the sound to the AudioNode analyser
  sound.connect(analyser);
  sound.play();
  
  });

  waveform_array = new Float32Array(analyser.frequencyBinCount);

  // Waves wireframe
  var waves_uniforms =    {
        time: { // float initialized to 0
          type: "f", 
          value: 0.0 
        },
        frequency: { // 32-bit float array of FFT generated frequencies
          type: "iv1",
          value: waveform_array
        },
        drop: {
          type: "f",
          value: 1.0
        }
  }

  /*************WAVE GEOMETRY***************
  * A plane with a "wavy" shader applied to it.
  * Uses 
  */
  var wavesGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);
  var wavesMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: waves_uniforms,
    vertexShader:   document.getElementById('wave-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  });


  var waves = new THREE.Mesh(wavesGeo, wavesMaterial);
  waves.rotation.x += Math.PI/2;
  waves.position.y = 200;
  scene.add(waves);


  /***************ABYSS GEOMETRY**************I
  * A plane with an applied rocky, somewhat ravine like 
  * shader. Uses noise functions for the rockiness.
  */ 

  var abyssGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);
  
  var abyssUniforms = {
    time: {
      type: "f",
      value: 0.0
    },
    frequency: {
      type: "iv1",
      value: waveform_array
    },  
    drop: {
      type: "f",
      value: 1.0
    }
  };
  var abyssMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: abyssUniforms,
    vertexShader:   document.getElementById('abyss-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  });

  var abyss = new THREE.Mesh(abyssGeo, abyssMaterial); 
  abyss.rotation.x += Math.PI/2;
  abyss.position.y += 25;
  scene.add(abyss);
  
  
  /*************** HEART GEOMETRY *************
  * A sphere that "beats" and shifts color with the song.
  * Uses vertex displacement with respect to the Fourier transform 
  * data of the audio stream.
  */ 
  var heartGeometry = new THREE.SphereGeometry(250, 128, 128);
  var arry = []
  var heartbeat_uniforms =    {
    time: { // float initialized to 0
      type: "f", 
      value: 0.0 
    },
    minDecibels: {
      type: "f",
      value: analyser.minDecibels
    },
    frequency: { // byte array of FFT frequencies
      type: "fv1",
      value: waveform_array
    }
  }
  var heartMaterial = new THREE.ShaderMaterial({
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    uniforms: heartbeat_uniforms,
    vertexShader:   document.getElementById('heart-vertex').textContent,
    fragmentShader: document.getElementById('heart-fragment').textContent
  })

  var heart = new THREE.Mesh(heartGeometry, heartMaterial);
  heart.position.y = 350;
  scene.add(heart);


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

    // Updating the waveform array with the AudioNode
    sumi = sumf;
    waveform_array = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(waveform_array);
    sumf = avg(waveform_array);
    // Compare the rate of dB change between last and current bin
    var diff = Math.abs(sumf - sumi)/analyser.smoothingTimeConstant; 


    heartMaterial.uniforms['frequency'].value = waveform_array;
    wavesMaterial.uniforms['time'].value += delta;
    abyssMaterial.uniforms['time'].value += delta;
    heartMaterial.uniforms['time'].value += delta;
  
    camera.position.x = 500*Math.sin(clock.getElapsedTime())
    camera.position.y = 1000*Math.cos(Math.sin(clock.getElapsedTime()))
    camera.position.z = 500*Math.cos(clock.getElapsedTime())

    camera.lookAt( scene.position ); 

    renderer.render( scene, camera ); // render frame
  })
})