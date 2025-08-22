import * as THREE from 'three';
import { AudioAnalyzer } from './audio/AudioAnalyzer';
import { AdvancedShaderGenerator } from './shaders/AdvancedShaderGenerator';
import { PostProcessor } from './rendering/PostProcessor';
import { 
  VisualizerShape, 
  ShapeConfig, 
  AudioAnalysis, 
  ShaderConfig,
  VisualizerConfig,
  FeatureFlags 
} from './types';
import { Constants, GeometryTypes, ShaderTypes } from './constants';

export class StaccatoModern {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private audioAnalyzer: AudioAnalyzer;
  private postProcessor: PostProcessor;
  
  private shapes: Map<string, VisualizerShape> = new Map();
  private shaders: Map<string, ShaderConfig> = new Map();
  private config: VisualizerConfig;
  private features: FeatureFlags;
  
  private time: number = 0;
  private deltaTime: number = 0;
  private lastTime: number = 0;
  
  private uniforms: Record<string, THREE.IUniform> = {
    time: { value: 0.0 },
    frequency: { value: new Float32Array(512) },
    bass: { value: 0.0 },
    mid: { value: 0.0 },
    treble: { value: 0.0 },
    volume: { value: 0.0 },
    beat: { value: false },
    mDb: { value: Constants.MIN_DECIBELS }
  };
  
  constructor(scene: THREE.Scene, camera: THREE.Camera, config?: Partial<VisualizerConfig>) {
    this.scene = scene;
    this.camera = camera;
    
    this.config = {
      audio: {
        fftSize: Constants.FFT_SIZE,
        smoothingTimeConstant: Constants.SMOOTHING_TIME_CONSTANT,
        minDecibels: Constants.MIN_DECIBELS,
        maxDecibels: Constants.MAX_DECIBELS
      },
      rendering: {
        antialias: true,
        shadowMap: true,
        postProcessing: {
          bloom: { enabled: true, threshold: 0.8, strength: 1.5, radius: 0.8 },
          chromaticAberration: { enabled: true, offset: new THREE.Vector2(0.002, 0.002) },
          vignette: { enabled: true, darkness: 0.3, offset: 0.5 },
          filmGrain: { enabled: true, intensity: 0.1 }
        }
      },
      performance: {
        maxShapes: Constants.MAX_SHAPES,
        instancing: true,
        levelOfDetail: 'high'
      },
      ...config
    };
    
    this.features = Constants.FEATURES;
    
    this.audioAnalyzer = new AudioAnalyzer();
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    await this.audioAnalyzer.initialize();
    this.loadLegacyShaders();
    this.loadModernShaders();
    this.setupEventListeners();
  }
  
  private loadLegacyShaders(): void {
    // Load legacy shaders for compatibility
    const legacyShaders = ['heart', 'wave', 'abyss'];
    
    legacyShaders.forEach(shaderName => {
      const vertexElement = document.getElementById(`${shaderName}-vertex`);
      const fragmentElement = document.getElementById(`${shaderName}-fragment`);
      
      if (vertexElement && fragmentElement) {
        this.shaders.set(shaderName, {
          name: shaderName,
          vertexShader: vertexElement.textContent || '',
          fragmentShader: fragmentElement.textContent || '',
          features: ['legacy']
        });
      }
    });
  }
  
  private loadModernShaders(): void {
    // Load modern shaders
    const neonShader = AdvancedShaderGenerator.generateNeonShader();
    const particleShader = AdvancedShaderGenerator.generateParticleShader();
    
    this.shaders.set(neonShader.name, neonShader);
    this.shaders.set(particleShader.name, particleShader);
  }
  
  private setupEventListeners(): void {
    // Setup drag and drop
    const dropZone = document.getElementById('file-drop') || document.body;
    
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('hover');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('hover');
    });
    
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('hover');
      
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        try {
          await this.audioAnalyzer.loadAudioFile(files[0]);
        } catch (error) {
          console.error('Error loading audio file:', error);
        }
      }
    });
  }
  
  async addShape(config: ShapeConfig): Promise<string> {
    const id = `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create geometry
    const geometry = this.createGeometry(config);
    
    // Get shader
    const shaderConfig = this.shaders.get(config.shader);
    if (!shaderConfig) {
      throw new Error(`Shader '${config.shader}' not found`);
    }
    
    // Create material
    const material = new THREE.ShaderMaterial({
      vertexShader: shaderConfig.vertexShader,
      fragmentShader: shaderConfig.fragmentShader,
      uniforms: { ...this.uniforms },
      wireframe: config.wireframe ?? false,
      transparent: config.transparent ?? true,
      opacity: config.opacity ?? 0.8,
      side: THREE.DoubleSide
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(config.position);
    
    if (config.rotation) {
      mesh.rotation.copy(config.rotation);
    }
    
    if (config.scale) {
      mesh.scale.copy(config.scale);
    }
    
    // Create shape object
    const shape: VisualizerShape = {
      id,
      mesh,
      geometry,
      material,
      config
    };
    
    // Add to scene and store
    this.scene.add(mesh);
    this.shapes.set(id, shape);
    
    return id;
  }
  
  private createGeometry(config: ShapeConfig): THREE.BufferGeometry {
    const { type, size, segments = 32 } = config;
    
    switch (type) {
      case GeometryTypes.SPHERE:
        return new THREE.SphereGeometry(size, segments, segments);
      case GeometryTypes.PLANE:
        return new THREE.PlaneGeometry(size, size, segments, segments);
      case GeometryTypes.CUBE:
        return new THREE.BoxGeometry(size, size, size, segments, segments);
      case GeometryTypes.TORUS:
        return new THREE.TorusGeometry(size * 0.5, size * 0.2, segments, segments);
      case GeometryTypes.ICOSAHEDRON:
        return new THREE.IcosahedronGeometry(size, 1);
      case GeometryTypes.OCTAHEDRON:
        return new THREE.OctahedronGeometry(size, 1);
      default:
        return new THREE.SphereGeometry(size, segments, segments);
    }
  }
  
  removeShape(id: string): boolean {
    const shape = this.shapes.get(id);
    if (shape) {
      this.scene.remove(shape.mesh);
      shape.geometry.dispose();
      shape.material.dispose();
      this.shapes.delete(id);
      return true;
    }
    return false;
  }
  
  async generateRandomShader(): Promise<string> {
    const shader = AdvancedShaderGenerator.generateRandomShader();
    this.shaders.set(shader.name, shader);
    return shader.name;
  }
  
  changeShader(shapeId: string, shaderName: string): boolean {
    const shape = this.shapes.get(shapeId);
    const shader = this.shaders.get(shaderName);
    
    if (!shape || !shader) {
      return false;
    }
    
    // Create new material
    const newMaterial = new THREE.ShaderMaterial({
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      uniforms: { ...this.uniforms },
      wireframe: shape.config.wireframe ?? false,
      transparent: shape.config.transparent ?? true,
      opacity: shape.config.opacity ?? 0.8,
      side: THREE.DoubleSide
    });
    
    // Dispose old material and assign new one
    shape.material.dispose();
    shape.material = newMaterial;
    shape.mesh.material = newMaterial;
    
    return true;
  }
  
  update(deltaTime: number): void {
    this.deltaTime = deltaTime;
    this.time += deltaTime;
    
    // Update audio analysis
    const audioAnalysis = this.audioAnalyzer.getAnalysis();
    
    // Update uniforms
    this.uniforms.time.value = this.time;
    this.uniforms.frequency.value = audioAnalysis.frequencyData;
    this.uniforms.bass.value = audioAnalysis.bass;
    this.uniforms.mid.value = audioAnalysis.mid;
    this.uniforms.treble.value = audioAnalysis.treble;
    this.uniforms.volume.value = audioAnalysis.volume;
    this.uniforms.beat.value = audioAnalysis.beat;
    
    // Update shapes
    this.shapes.forEach(shape => {
      // Update material uniforms
      Object.keys(this.uniforms).forEach(key => {
        if (shape.material.uniforms[key]) {
          shape.material.uniforms[key].value = this.uniforms[key].value;
        }
      });
      
      // Apply animations
      this.updateShapeAnimation(shape, audioAnalysis);
    });
  }
  
  private updateShapeAnimation(shape: VisualizerShape, audio: AudioAnalysis): void {
    const { mesh, config } = shape;
    
    // Rotation animation
    if (config.animation?.rotation?.enabled) {
      const speed = config.animation.rotation.speed;
      mesh.rotation.x += speed.x * this.deltaTime;
      mesh.rotation.y += speed.y * this.deltaTime;
      mesh.rotation.z += speed.z * this.deltaTime;
    }
    
    // Scale animation
    if (config.animation?.scale?.enabled) {
      const scaleConfig = config.animation.scale;
      const scale = scaleConfig.min + (scaleConfig.max - scaleConfig.min) * audio.volume;
      mesh.scale.setScalar(scale);
    }
    
    // Position animation
    if (config.animation?.position?.enabled) {
      const posConfig = config.animation.position;
      const time = this.time;
      mesh.position.x = config.position.x + Math.sin(time * posConfig.frequency.x) * posConfig.amplitude.x;
      mesh.position.y = config.position.y + Math.sin(time * posConfig.frequency.y) * posConfig.amplitude.y;
      mesh.position.z = config.position.z + Math.sin(time * posConfig.frequency.z) * posConfig.amplitude.z;
    }
  }
  
  setPostProcessor(postProcessor: PostProcessor): void {
    this.postProcessor = postProcessor;
  }
  
  getShapes(): VisualizerShape[] {
    return Array.from(this.shapes.values());
  }
  
  getShaders(): ShaderConfig[] {
    return Array.from(this.shaders.values());
  }
  
  getAudioAnalysis(): AudioAnalysis {
    return this.audioAnalyzer.getAnalysis();
  }
  
  getAudioAnalyzer(): AudioAnalyzer {
    return this.audioAnalyzer;
  }
  
  setVolume(volume: number): void {
    this.audioAnalyzer.setVolume(volume);
  }
  
  pause(): void {
    this.audioAnalyzer.pause();
  }
  
  resume(): void {
    this.audioAnalyzer.resume();
  }
  
  stop(): void {
    this.audioAnalyzer.stop();
  }
  
  dispose(): void {
    this.shapes.forEach(shape => {
      this.scene.remove(shape.mesh);
      shape.geometry.dispose();
      shape.material.dispose();
    });
    this.shapes.clear();
    this.shaders.clear();
    this.audioAnalyzer.dispose();
    if (this.postProcessor) {
      this.postProcessor.dispose();
    }
  }
}