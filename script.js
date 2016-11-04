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


  // Set up a clock
  var clock = new THREE.Clock();

  // declare the rendering loop
  var onRenderFcts= [];

  // handle window resize events
  var winResize = new THREEx.WindowResize(renderer, camera)


  //////////////////////////////////////////////////////////////////////////////////
  //    default 3 points lightning          //
  //////////////////////////////////////////////////////////////////////////////////
  
  var ambientLight= new THREE.AmbientLight( 0x020202 )
  scene.add( ambientLight)
  var frontLight  = new THREE.DirectionalLight('white', 1)
  frontLight.position.set(0.5, 0.5, 2)
  scene.add( frontLight )
  var backLight = new THREE.DirectionalLight('white', 0.75)
  backLight.position.set(-0.5, -0.5, -2)
  scene.add( backLight )    

  ///// SKYDOME //////
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

  ///////// Setting up Web Audio Context and Pizzicato.js sound //////////
  var waveform_array, time_array;
  var WAVE_DATA = [];   
  var context = Pizzicato.context;
  var analyser = context.createAnalyser();
  var FFT = 2048;
  var FFT2 = FFT/2;
  analyser.fftSize = FFT;


  var sound = new Pizzicato.Sound('./vendor/audio/Prismatic.mp3', function() {
  // Linking the sound to the AudioNode analyser
  sound.connect(analyser);
  sound.play();
  
  });

  waveform_array = new Float32Array(FFT2);

  // Waves wireframe
  var waves_uniforms =    {
        time: { // float initialized to 0
          type: "f", 
          value: 0.0 
        },
        frequency: { // 32-bit float array of FFT generated frequencies
          type: "fv1",
          value: waveform_array
        }
      }

  //// WAVE GEOMETRY ////
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
  waves.position.y = 450;
  scene.add(waves);

  var abyss_uniforms = {
    time: {
      type: "f",
      value: 0.0
    },
    frequency: {
      type: "fv1",
      value: waveform_array
    },

    amplitude: {
      type: "f",
      value: 10.0
    }
  };

  //// ABYSS GEOMETRY ////

  var abyssGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);

  var abyssMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: abyss_uniforms,
    vertexShader:   document.getElementById('abyss-vertex').textContent,
    fragmentShader: document.getElementById('abyss-fragment').textContent
  });

  var abyss = new THREE.Mesh(abyssGeo, abyssMaterial); 
  abyss.rotation.x += Math.PI/2;
  abyss.position.y += 25;
  scene.add(abyss);
  
  //////////////////////////////////////////////////////////////////////////////////
  //    Camera Controls             //
  //////////////////////////////////////////////////////////////////////////////////
  var mouse = {x : 0, y : 0}
  document.addEventListener('mousemove', function(event){
    mouse.x = (event.clientX / window.innerWidth ) - 0.5
    mouse.y = (event.clientY / window.innerHeight) - 0.5
  }, false)
  
  
  onRenderFcts.push(function(delta, now){
    camera.position.x += (mouse.x*3000 - camera.position.x) * (delta*3)
    camera.position.y += (mouse.y*3000 - camera.position.y) * (delta*3)
    camera.lookAt( scene.position )
  })

  //////////////////////////////////////////////////////////////////////////////////
  //   render the scene            //
  //////////////////////////////////////////////////////////////////////////////////
  onRenderFcts.push(function(){
    renderer.render( scene, camera );   
  })
  
  //////////////////////////////////////////////////////////////////////////////////
  //    Rendering Loop runner           //
  //////////////////////////////////////////////////////////////////////////////////
  var lastTimeMsec= null
  var delta = 0.0;
  requestAnimationFrame(function animate(nowMsec){
    // keep looping
    requestAnimationFrame( animate );

    // measure time
    lastTimeMsec  = lastTimeMsec || nowMsec-1000/60
    var deltaMsec = Math.min(200, nowMsec - lastTimeMsec)
    lastTimeMsec  = nowMsec

    delta = clock.getDelta();

    // Updating the waveform array with the AudioNode
    waveform_array = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(waveform_array);
    wavesMaterial.uniforms['frequency'].value = waveform_array;
    abyssMaterial.uniforms['frequency'].value = waveform_array;
    wavesMaterial.uniforms['time'].value += delta*5;
    abyssMaterial.uniforms['time'].value += delta*5;
    
    // call each update function
    onRenderFcts.forEach(function(onRenderFct){
      onRenderFct(deltaMsec/1000, nowMsec/1000)
    })
  })
})