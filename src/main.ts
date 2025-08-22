import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DeviceOrientationControls } from 'three/examples/jsm/controls/DeviceOrientationControls.js';
import Stats from 'stats.js';
import { StaccatoModern } from './StaccatoModern';
import { PostProcessor } from './rendering/PostProcessor';
import { Constants } from './constants';

export default class Main {
  // Core Three.js objects
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private orientation: DeviceOrientationControls;
  
  // Lighting
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;
  private pointLight: THREE.PointLight;
  
  // Timing and performance
  private clock: THREE.Clock;
  private stats: Stats;
  private deltaTime: number = 0;
  
  // Visualizer and effects
  private visualizer: StaccatoModern;
  private postProcessor: PostProcessor;
  
  // UI state
  private isInitialized: boolean = false;
  private loadingElement: HTMLElement | null = null;
  
  constructor() {
    this.initializeScene();
    this.initializeRenderer();
    this.initializeCamera();
    this.initializeControls();
    this.initializeLighting();
    this.initializeVisualizer();
    this.initializeUI();
    this.setupEventListeners();
    this.startRenderLoop();
  }
  
  private initializeScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.Fog(0x0a0a0a, 1000, 10000);
  }
  
  private initializeRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Add to DOM
    const app = document.getElementById('app');
    if (app) {
      app.appendChild(this.renderer.domElement);
    }
  }
  
  private initializeCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 1000);
  }
  
  private initializeControls(): void {
    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    
    // Device orientation controls (for mobile)
    this.orientation = new DeviceOrientationControls(this.camera);
    this.orientation.enabled = false; // Disabled by default
  }
  
  private initializeLighting(): void {
    // Ambient light for overall illumination
    this.ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(this.ambientLight);
    
    // Main directional light
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(100, 100, 50);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 500;
    this.scene.add(this.directionalLight);
    
    // Point light for dynamic lighting
    this.pointLight = new THREE.PointLight(0x667eea, 1, 1000);
    this.pointLight.position.set(0, 0, 200);
    this.pointLight.castShadow = true;
    this.scene.add(this.pointLight);
  }
  
  private async initializeVisualizer(): Promise<void> {
    this.visualizer = new StaccatoModern(this.scene, this.camera);
    
    // Initialize post-processing
    this.postProcessor = new PostProcessor(this.renderer, this.scene, this.camera);
    this.visualizer.setPostProcessor(this.postProcessor);
    
    // Add some initial shapes
    await this.addInitialShapes();
  }
  
  private async addInitialShapes(): Promise<void> {
    try {
      // Add a main sphere with heart shader
      await this.visualizer.addShape({
        type: 'sphere',
        size: 200,
        position: new THREE.Vector3(0, 0, 0),
        shader: 'heart',
        wireframe: true,
        opacity: 0.8,
        animation: {
          rotation: {
            speed: new THREE.Vector3(0.5, 1.0, 0.3),
            enabled: true
          },
          scale: {
            min: 0.8,
            max: 1.2,
            speed: 2.0,
            enabled: true
          }
        }
      });
      
      // Add a torus with neon shader
      await this.visualizer.addShape({
        type: 'torus',
        size: 300,
        position: new THREE.Vector3(0, 0, 0),
        shader: 'neon',
        wireframe: false,
        opacity: 0.6,
        animation: {
          rotation: {
            speed: new THREE.Vector3(-0.3, 0.5, 0.2),
            enabled: true
          }
        }
      });
      
      // Add particle system
      await this.visualizer.addShape({
        type: 'sphere',
        size: 400,
        position: new THREE.Vector3(0, 0, 0),
        shader: 'particle',
        wireframe: true,
        opacity: 0.4
      });
      
    } catch (error) {
      console.error('Error adding initial shapes:', error);
    }
  }
  
  private initializeUI(): void {
    // Initialize stats
    this.stats = new Stats();
    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '0px';
    this.stats.dom.style.left = '0px';
    document.body.appendChild(this.stats.dom);
    
    // Remove loading screen
    this.loadingElement = document.querySelector('.loading');
    if (this.loadingElement) {
      this.loadingElement.style.opacity = '0';
      setTimeout(() => {
        this.loadingElement?.remove();
      }, 500);
    }
    
    this.isInitialized = true;
  }
  
  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Keyboard controls
    document.addEventListener('keydown', this.onKeyDown.bind(this));
    
    // Touch controls for mobile
    if ('ontouchstart' in window) {
      this.orientation.enabled = true;
      this.controls.enabled = false;
    }
    
    // Performance monitoring
    window.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.visualizer.pause();
      } else {
        this.visualizer.resume();
      }
    });
  }
  
  private onWindowResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    this.postProcessor.resize(width, height);
  }
  
  private onKeyDown(event: KeyboardEvent): void {
    switch (event.key.toLowerCase()) {
      case ' ':
        // Toggle auto-rotation
        this.controls.autoRotate = !this.controls.autoRotate;
        break;
      case 'r':
        // Reset camera
        this.camera.position.set(0, 0, 1000);
        this.controls.reset();
        break;
      case 'g':
        // Toggle device orientation
        this.orientation.enabled = !this.orientation.enabled;
        this.controls.enabled = !this.orientation.enabled;
        break;
      case 'p':
        // Toggle pause
        if (this.visualizer) {
          this.visualizer.pause();
        }
        break;
      case 's':
        // Toggle stop
        if (this.visualizer) {
          this.visualizer.stop();
        }
        break;
    }
  }
  
  private startRenderLoop(): void {
    this.clock = new THREE.Clock();
    this.animate();
  }
  
  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    
    this.stats.begin();
    
    this.deltaTime = this.clock.getDelta();
    
    // Update controls
    this.controls.update();
    if (this.orientation.enabled) {
      this.orientation.update();
    }
    
    // Update visualizer
    if (this.visualizer) {
      this.visualizer.update(this.deltaTime);
    }
    
    // Update post-processing
    if (this.postProcessor) {
      this.postProcessor.update(this.clock.getElapsedTime());
    }
    
    // Update point light position based on audio
    if (this.visualizer) {
      const audio = this.visualizer.getAudioAnalysis();
      const time = this.clock.getElapsedTime();
      this.pointLight.position.x = Math.sin(time * 0.5) * 200 * audio.volume;
      this.pointLight.position.y = Math.cos(time * 0.3) * 200 * audio.volume;
      this.pointLight.intensity = 0.5 + audio.volume * 0.5;
    }
    
    // Render
    if (this.postProcessor) {
      this.postProcessor.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    
    this.stats.end();
  }
  
  // Public methods for external access
  public getVisualizer(): StaccatoModern {
    return this.visualizer;
  }
  
  public getScene(): THREE.Scene {
    return this.scene;
  }
  
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }
  
  public dispose(): void {
    this.visualizer.dispose();
    this.postProcessor.dispose();
    this.renderer.dispose();
    this.scene.clear();
  }
}