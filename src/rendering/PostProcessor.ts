import * as THREE from 'three';
import { PostProcessingConfig } from '../types';
import { Constants } from '../constants';

export class PostProcessor {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  
  private composer: THREE.EffectComposer;
  private renderPass: THREE.RenderPass;
  private bloomPass: THREE.UnrealBloomPass;
  private chromaticPass: THREE.ShaderPass;
  private vignettePass: THREE.ShaderPass;
  private filmPass: THREE.ShaderPass;
  
  private config: PostProcessingConfig;
  
  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.config = {
      bloom: { enabled: true, threshold: 0.8, strength: 1.5, radius: 0.8 },
      chromaticAberration: { enabled: true, offset: new THREE.Vector2(0.002, 0.002) },
      vignette: { enabled: true, darkness: 0.3, offset: 0.5 },
      filmGrain: { enabled: true, intensity: 0.1 }
    };
    
    this.initialize();
  }
  
  private initialize(): void {
    // Create effect composer
    this.composer = new THREE.EffectComposer(this.renderer);
    
    // Create render pass
    this.renderPass = new THREE.RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    
    // Create bloom pass
    this.bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this.config.bloom!.strength,
      this.config.bloom!.radius,
      this.config.bloom!.threshold
    );
    this.bloomPass.enabled = this.config.bloom!.enabled;
    this.composer.addPass(this.bloomPass);
    
    // Create chromatic aberration pass
    this.chromaticPass = new THREE.ShaderPass(this.createChromaticShader());
    this.chromaticPass.enabled = this.config.chromaticAberration!.enabled;
    this.composer.addPass(this.chromaticPass);
    
    // Create vignette pass
    this.vignettePass = new THREE.ShaderPass(this.createVignetteShader());
    this.vignettePass.enabled = this.config.vignette!.enabled;
    this.composer.addPass(this.vignettePass);
    
    // Create film grain pass
    this.filmPass = new THREE.ShaderPass(this.createFilmGrainShader());
    this.filmPass.enabled = this.config.filmGrain!.enabled;
    this.composer.addPass(this.filmPass);
  }
  
  private createChromaticShader(): THREE.Shader {
    return {
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: this.config.chromaticAberration!.offset }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 offset;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          vec4 color = vec4(0.0);
          
          color.r = texture2D(tDiffuse, uv + offset).r;
          color.g = texture2D(tDiffuse, uv).g;
          color.b = texture2D(tDiffuse, uv - offset).b;
          color.a = 1.0;
          
          gl_FragColor = color;
        }
      `
    };
  }
  
  private createVignetteShader(): THREE.Shader {
    return {
      uniforms: {
        tDiffuse: { value: null },
        darkness: { value: this.config.vignette!.darkness },
        offset: { value: this.config.vignette!.offset }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float darkness;
        uniform float offset;
        varying vec2 vUv;
        
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          
          vec2 center = uv - 0.5;
          float dist = length(center);
          float vignette = 1.0 - smoothstep(offset, offset + 0.5, dist);
          
          color.rgb *= mix(1.0, vignette, darkness);
          
          gl_FragColor = color;
        }
      `
    };
  }
  
  private createFilmGrainShader(): THREE.Shader {
    return {
      uniforms: {
        tDiffuse: { value: null },
        intensity: { value: this.config.filmGrain!.intensity },
        time: { value: 0.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float intensity;
        uniform float time;
        varying vec2 vUv;
        
        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          
          float noise = random(uv + time * 0.1);
          noise = (noise - 0.5) * 2.0;
          
          color.rgb += noise * intensity;
          
          gl_FragColor = color;
        }
      `
    };
  }
  
  update(time: number): void {
    // Update film grain time uniform
    if (this.filmPass && this.filmPass.uniforms.time) {
      this.filmPass.uniforms.time.value = time;
    }
  }
  
  render(): void {
    this.composer.render();
  }
  
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }
  
  setConfig(config: Partial<PostProcessingConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update bloom settings
    if (this.bloomPass && config.bloom) {
      this.bloomPass.enabled = config.bloom.enabled;
      this.bloomPass.strength = config.bloom.strength;
      this.bloomPass.radius = config.bloom.radius;
      this.bloomPass.threshold = config.bloom.threshold;
    }
    
    // Update chromatic aberration settings
    if (this.chromaticPass && config.chromaticAberration) {
      this.chromaticPass.enabled = config.chromaticAberration.enabled;
      if (this.chromaticPass.uniforms.offset) {
        this.chromaticPass.uniforms.offset.value = config.chromaticAberration.offset;
      }
    }
    
    // Update vignette settings
    if (this.vignettePass && config.vignette) {
      this.vignettePass.enabled = config.vignette.enabled;
      if (this.vignettePass.uniforms.darkness) {
        this.vignettePass.uniforms.darkness.value = config.vignette.darkness;
      }
      if (this.vignettePass.uniforms.offset) {
        this.vignettePass.uniforms.offset.value = config.vignette.offset;
      }
    }
    
    // Update film grain settings
    if (this.filmPass && config.filmGrain) {
      this.filmPass.enabled = config.filmGrain.enabled;
      if (this.filmPass.uniforms.intensity) {
        this.filmPass.uniforms.intensity.value = config.filmGrain.intensity;
      }
    }
  }
  
  dispose(): void {
    this.composer.dispose();
  }
}