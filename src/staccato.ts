// Staccato handler class
import * as THREE from 'three';
import { Shader, Shaders } from './shader';
import ShaderUtil from './shaderUtil';
import { Constants } from './constants'

export default class Staccato {
    ctx: globalThis.AudioContext;
    analyser: AnalyserNode;
    source;
    waveData: Float32Array | number[];
    scene: THREE.Scene;
    camera: THREE.Camera;
    shaderTypes = ['heart', 'wave', 'abyss'];
    shaders: Shaders;
    uniforms = {
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

    objectMat = [];
    shapes = [];
    currentShape: THREE.Mesh;

    fileDrop: Element;



    constructor(scene: THREE.Scene, camera: THREE.Camera) {
      this.scene = scene;
      this.camera = camera;

      // Defining audio context
      this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      
      // Analyser to retrive FFT data from audio stream
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = Constants.FFT_SIZE;
      this.source;
      this.waveData = new Float32Array(Constants.FFT_SIZE/2);
      this.shaders = new Shaders();
      this.initDOM();
    }

    initShaders() {
      // Load shaders supported by Staccato
      for (let i = 0; i < this.shaderTypes.length; i++) {
        const shaderID = this.shaderTypes[i];
        const shaderObj: Shader = new Shader();
        shaderObj.vertex = document.getElementById(this.shaderTypes[i]+"-vertex" );
        shaderObj.fragment = document.getElementById(this.shaderTypes[i]+"-fragment");
        shaderObj.element.innerHTML = this.shaderTypes[i];
        shaderObj.element.id = this.shaderTypes[i];
        shaderObj.element.addEventListener('click', this.changeShader.bind(this), false);
        this.shaders.push(shaderObj);
        this.shaders.element.append(shaderObj.element);
      }  
    }

    //  Add DOM element for procedurally generating a shader
    initGenShader() {
      let node = document.createElement("div");
      node.innerHTML = "+";
      node.id = "add-shader";
      document.getElementById('shaders').appendChild(node);
      node.addEventListener('click', (e) => {
        this.addShader();
        document.getElementById('shaders').appendChild(node);
        node.addEventListener('click', this.changeShader, false);
      });
    }

    // Initialize the UI and event listeners
    initDOM() {
      // Add premade shaders into DOM and memory
      this.initShaders();

      // Add "generate shader" option to DOM
      this.initGenShader();
  
      // Adding drag + drop event listeners
      this.fileDrop = document.getElementById("file-drop");
      this.fileDrop.addEventListener('dragover', this.fileDragHover.bind(this), false);
      this.fileDrop.addEventListener('drop', this.fileHandler.bind(this), false);
    }


    // Override default file drag & drop behavior
    fileDragHover(e) {
      e.preventDefault();
      e.stopPropagation();
      e.preventDefault();
      e.target.className = (e.type === 'dragover' ? 'hover' : '');
    }
    
    // Retrieve data from dropped file to be decoded
    fileHandler(e) {
      e.preventDefault();
      e.stopPropagation();
      e.preventDefault();
      e.target.className = "";
      let files = e.target.files || e.dataTransfer.files;
      let reader = new FileReader();
      reader.onload = function (f) {
        let dat = f.target.result;
        this.initAudio(dat);
      }.bind(this);

      reader.readAsArrayBuffer(files[0]);
    }

    // Decode an audio file
    initAudio(data) {
      let scope = this;
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

    // Play buffer from audio file
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

    // Initialize a new mesh for the scence
    addShape(params) {
      let g; 
      let shape = params.shape;
      let shader = params.shader; 
      let pos = params.position;
      let size = params.size;
      switch(shape) { 
        case "plane": g = new THREE.PlaneGeometry(size,size,32,32); break;
        case "sphere": g = new THREE.SphereGeometry(size,32,32); break;
        case "cube": g = new THREE.BoxGeometry(size, size,128,128); break;
        case "circle":  g = new THREE.CircleGeometry(size, 256 ); break;
        case "tetrahedron": g = new THREE.TetrahedronGeometry(size, 1);
      }
      
      const vShader = document.getElementById(`${shader}-vertex` );
      const fShader = document.getElementById(`${shader}-fragment`);
      let vs = (shader.toLowerCase() == "generate") ? ShaderUtil.genVertexShader() : vShader.textContent;
      let fs = (shader.toLowerCase() == "generate") ? ShaderUtil.genFragmentShader() : fShader.textContent;
  

      let hm = new THREE.ShaderMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        uniforms: this.uniforms,
        vertexShader:   vs,
        //vertexShader:   document.getElementById(shader + '-vertex').textContent,
        fragmentShader: fs
      });
    
      let m = new THREE.Mesh(g, hm); // Building mesh 
      m.name = shader + "-" + shape; // Giving ID to Object 
      m.position.set(pos.x, pos.y, pos.z);
      if (shape == "plane")  
        m.rotation.x += Math.PI/2;
      this.shapes.push(m);
      this.currentShape = m;
      this.scene.add(m);
    }

    // Procedurally generate new shader and add UI element
    addShader() {
      const formatID = (id) => id.toFixed(4);
      const s = ShaderUtil.genVertexShader();
      const f = ShaderUtil.genFragmentShader();
      let sn = ShaderUtil.genRandID();
      this.shaderTypes.push(sn);
      
      // Create new procedural shader
      const shaderObj = new Shader();
      shaderObj.setShaderHTML( `${sn}-vertex`, s);
      shaderObj.setShaderHTML( `${sn}-fragment`, f, false);
      let node = document.createElement("div");
      node.innerHTML = sn;
      node.id = sn;
      
      // Add select to shader list
      document.getElementById('shaders').appendChild(node);
      node.addEventListener('click', (e) => {
        // Listensers for the cases of additional geometries (Not yet implemented)
        for (let i = 0; i < this.shapes.length; i++) {
          this.scene.remove(this.shapes[i]);
          this.shapes[i] = new THREE.Mesh(this.shapes[i].geometry, new THREE.ShaderMaterial({
            wireframe: true,
            transparent: true,
            opacity: 1.,
            uniforms: this.uniforms,
            vertexShader:  shaderObj.vertex.textContent,
            fragmentShader: shaderObj.fragment.textContent
          }));
          this.scene.add(this.shapes[i]);
        }
      }, false);
  
    }
    
    // Apply the selected shader (precoded or procedural)
    changeShader(e)  {
      let shader = e.target.id;
      for (let i = 0; i < this.shapes.length; i++) {
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
    }

    // Update scene
    update(delta) {

      // Update FFT audio data
      this.waveData = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(this.waveData);
      this.waveData = (this.source) ? this.waveData : [0.0, 0.0, 0.0];
      const average = array => array.reduce((a, b) => a + b) / array.length;
      let avg = average(this.waveData);
      
      // Update the uniforms for each object
      for (let i = 0; i < this.shapes.length; i++) {
        this.shapes[i].material.uniforms['frequency'].value = this.waveData; 
        this.shapes[i].material.uniforms['time'].value += delta;
      }
    }
}
