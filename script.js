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
  var sumf = 0;
  var sumi = 0;
  var context = Pizzicato.context;
  var analyser = context.createAnalyser();
  var FFT = 512;
  analyser.fftSize = FFT;
  var mouse = {x : 0, y : 0};


  var sound = new Pizzicato.Sound('./vendor/audio/Prismatic.mp3', function() {
  // Linking the sound to the AudioNode analyser
  sound.connect(analyser);
  sound.play();
  
  });

/*
  var sound = new Pizzicato.Sound(function(e) {
    console.log("Sound function", e.outputBuffer);
  })*/  
 // waveform_array = new UintArray(analyser.frequencyBinCount);
  waveform_array = new Float32Array(analyser.frequencyBinCount);
  console.log(typeof waveform_array);
  for (var i = 0; i < waveform_array.length; i++) {
    waveform_array[i] = Math.random()*255;
  }
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
  waves.position.y = 200;
  scene.add(waves);

  var abyss_uniforms = {
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

  //// ABYSS GEOMETRY ////

  var abyssGeo = new THREE.PlaneGeometry(1500, 1500, 64, 64);

  var abyssMaterial = new THREE.ShaderMaterial( { 
    wireframe: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide, 
    uniforms: abyss_uniforms,
    vertexShader:   document.getElementById('abyss-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  });

  var abyss = new THREE.Mesh(abyssGeo, abyssMaterial); 
  abyss.rotation.x += Math.PI/2;
  abyss.position.y += 25;
  scene.add(abyss);
  
  
  /////////////////////////////////////////////
  ////////// HEARTBEAT GEOMETRY ////////////////
  ////////////////////////////////////////////
  var heartGeometry = new THREE.SphereGeometry(200, 32, 32);
  var arry = []
  var heartbeat_uniforms =    {
    time: { // float initialized to 0
      type: "f", 
      value: 0.0 
    },
    frequency: { // byte array of FFT frequencies
      type: "fv1",
      value: waveform_array
    }
  }
  var heartMaterial = new THREE.ShaderMaterial({
    wireframe: true,
    uniforms: heartbeat_uniforms,
    vertexShader:   document.getElementById('heart-vertex').textContent,
    fragmentShader: document.getElementById('wave-fragment').textContent
  })
  var heart = new THREE.Mesh(heartGeometry, heartMaterial);
  heart.position.y = 350;
  scene.add(heart);

  //////////////////////////////////////////////////////////////////////////////////
  //   render the scene            //
  //////////////////////////////////////////////////////////////////////////////////
  onRenderFcts.push(function(){
    renderer.render( scene, camera );   
  })

  onRenderFcts.push(function(delta, now){
    camera.position.x += (mouse.x*3000 - camera.position.x) * (delta*3)
    camera.position.y += (mouse.y*3000 - camera.position.y) * (delta*3)
    camera.lookAt( scene.position )
  })

  ///////////////////////////////////////////////////////////////
  ////////////// Average frequency of waveforms /////////////////
  ///////////////////////////////////////////////////////////////
  function avg(arr) {
    var s = 0; 
    for (var i = arr.length/2-1; i < arr.length; i++) {
      s += arr[i];
    }
    return s/arr.length;
  }
  //////////////////////////////////////////////////////////////////////////////////
  //    Camera Controls             //
  //////////////////////////////////////////////////////////////////////////////////
  document.addEventListener('mousemove', function(event){
    mouse.x = (event.clientX / window.innerWidth ) - 0.5
    mouse.y = (event.clientY / window.innerHeight) - 0.5
  }, false);
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
    sumi = sumf;
    waveform_array = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(waveform_array);
    sumf = avg(waveform_array);
    /* If the difference between the averages of the previous waveform and current 
    * is large enough, change a scalar to cause a "jump" in the visuals
    */
    if (Math.abs(sumf - sumi) >= 23) {
      wavesMaterial.uniforms['drop'].value = 95.;
      abyssMaterial.uniforms['drop'].value = 95.;
    }
    else if (abyssMaterial.uniforms['drop'].value > 1 || wavesMaterial.uniforms['drop'].value > 1){
      wavesMaterial.uniforms['drop'].value = 1.+ wavesMaterial.uniforms['drop'].value*.75;
      abyssMaterial.uniforms['drop'].value = 1.+ abyssMaterial.uniforms['drop'].value*.75;
    }

   // wavesMaterial.uniforms['frequency'].value = waveform_array;
   // abyssMaterial.uniforms['frequency'].value = waveform_array;
    heartMaterial.uniforms['frequency'].value = waveform_array;
  //  console.log(heartMaterial.uniforms['frequency'].value);


    wavesMaterial.uniforms['time'].value += delta;
    abyssMaterial.uniforms['time'].value += delta;
    heartMaterial.uniforms['time'].value += delta;

    // call each update function
    onRenderFcts.forEach(function(onRenderFct){
      onRenderFct(deltaMsec/1000, nowMsec/1000)
    })
  })
})