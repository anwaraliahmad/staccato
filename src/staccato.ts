// Staccato handler class
import * as THREE from 'three';
import ShaderUtil from './shaderUtil'

export default class Staccato {
    private readonly PI2: number = Math.PI*2;
    private readonly FFT_SIZE: number = 1024;
    
    private ctx: globalThis.AudioContext;
    private analyser: AnalyserNode;
    private source;
    private waveData: Float32Array | number[];
      

    private scene: THREE.Scene;
    private camera: THREE.Camera;
    private mouse = {x: 0, y: 0};
    private shaderTypes = ['heart', 'wave', 'abyss'];
    private shaders: {[key: string]: string} = {};
    private uniforms = {
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

    private objectMat = [];
    private shapes = [];

    private fileDrop: Element;



    constructor(scene: THREE.Scene, camera: THREE.Camera) {
      this.scene = scene;
      this.camera = camera;

      // Defining audio context
      this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      // Analyser to retrive FFT data from audio stream
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = this.FFT_SIZE;
      this.source;
      this.waveData = new Float32Array(this.FFT_SIZE/2);

      this.initDOM();
    }

    initDOM() {
      // Load shaders supported by Staccato
      for (let i = 0; i < this.shaderTypes.length; i++) {
        this.shaders[this.shaderTypes[i]+"-vertex"] = document.getElementById(this.shaderTypes[i]+"-vertex").textContent;
        this.shaders[this.shaderTypes[i]+"-fragment"] = document.getElementById(this.shaderTypes[i]+"-fragment").textContent;
        var node = document.createElement("div");
        node.innerHTML = this.shaderTypes[i];
        node.id = this.shaderTypes[i];
        document.getElementById('shaders').appendChild(node);
      }  

      var node = document.createElement("div");
      node.innerHTML = "+";
      node.id = "add-shader";
      document.getElementById('shaders').appendChild(node);
      node.addEventListener('click', (e) => {
        this.addShader();
        document.getElementById('shaders').appendChild(node);
        node.addEventListener('click', this.changeShader, false);
      });
  

      // Adding drag + drop event listeners
      this.fileDrop = document.getElementById("file-drop");
      this.fileDrop.addEventListener('dragover', this.fileDragHover, false);
      this.fileDrop.addEventListener('drop', this.fileHandler, false);

      // Track mouse movement for scene / object orientation
      document.addEventListener("mousemove", (e) => {
        e.preventDefault();
        this.mouse.x = (e.clientX / globalThis.innerWidth ) - .5;
        this.mouse.y = (e.clientY / globalThis.innerHeight) - .5;
      });
    }


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
      var files = e.target.files || e.dataTransfer.files;
      var reader = new FileReader();
      reader.onload = function (f) {
        var dat = f.target.result;
        this.initAudio(dat);
      }.bind(this);

      reader.readAsArrayBuffer(files[0]);
    }

    load(url: string) {

    }

    initAudio(data) {
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

    addShape(params) {
      var g; 
      var shape = params.shape;
      var shader = params.shader; 
      var pos = params.position;
      var size = params.size;
      switch(shape) { 
        case "plane": g = new THREE.PlaneGeometry(size,size,32,32); break;
        case "sphere": g = new THREE.SphereGeometry(size,32,32); break;
        case "cube": g = new THREE.BoxGeometry(size, size,128,128); break;
        case "circle":  g = new THREE.CircleGeometry(size, 256 ); break;
        case "tetrahedron": g = new THREE.TetrahedronGeometry(size, 1);
      }
      
      var vs = (shader.toLowerCase() == "generate") ? ShaderUtil.genVertexShader() : this.shaders[shader+"-vertex"];
      var fs = (shader.toLowerCase() == "generate") ? ShaderUtil.genFragmentShader() : this.shaders[shader+"-fragment"];
  

      var hm = new THREE.ShaderMaterial({
        wireframe: true,
        transparent: true,
        opacity: 0.5,
        uniforms: this.uniforms,
        vertexShader:   vs,
        //vertexShader:   document.getElementById(shader + '-vertex').textContent,
        fragmentShader: fs
      });
    
      var m = new THREE.Mesh(g, hm); // Building mesh 
      m.name = shader + "-" + shape; // Giving ID to Object 
      m.position.set(pos.x, pos.y, pos.z);
      if (shape == "plane")  
        m.rotation.x += Math.PI/2;
      this.shapes.push(m);
      this.scene.add(m);
    }

    addShader() {
      var s = ShaderUtil.genVertexShader();
      var sn = `sn-${Math.random()*this.FFT_SIZE}`;
      this.shaderTypes.push(sn);
      var vertex = document.createElement("script");
      vertex.innerHTML = s;
      vertex.id = sn+"-vertex";
      this.shaders[sn+"-vertex"] = s;
  
      var f = ShaderUtil.genFragmentShader();
      var frag = document.createElement("script");
      frag.innerHTML = f;
      frag.id = sn+"-fragment";
      this.shaders[sn+"-fragment"] = f;
      var node = document.createElement("div");
      node.innerHTML = sn;
      node.id = sn;
      document.getElementById('shaders').appendChild(node);
  
      node.addEventListener('click', (e) => {
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
      }, false);
  
    }
  

    changeShader(e)  {
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
    }

    // Update scene
    update(delta) {

      // Update FFT audio data
      this.waveData = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(this.waveData);
      this.waveData = (this.source) ? this.waveData : [0.0, 0.0, 0.0];
      const average = array => array.reduce((a, b) => a + b) / array.length;
      var avg = average(this.waveData);
      // Update the uniforms for each object
      for (var i = 0; i < this.shapes.length; i++) {
        this.shapes[i].material.uniforms['frequency'].value = this.waveData; 
        this.shapes[i].material.uniforms['time'].value += delta;
      }

      this.camera.position.x += (this.mouse.x*4000- this.camera.position.x) * (delta*3)
      this.camera.position.y += (this.mouse.y*4000 -this.camera.position.y) * (delta*3)
      this.camera.lookAt( this.scene.position ); 
    }
}
