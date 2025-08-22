import * as THREE from 'three';

export interface AudioAnalysis {
  frequencyData: Float32Array;
  timeDomainData: Float32Array;
  bass: number;
  mid: number;
  treble: number;
  volume: number;
  beat: boolean;
  bpm: number;
}

export interface ShaderConfig {
  name: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms?: Record<string, THREE.IUniform>;
  features?: string[];
}

export interface VisualizerShape {
  id: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  config: ShapeConfig;
  animation?: AnimationConfig;
}

export interface ShapeConfig {
  type: 'sphere' | 'plane' | 'cube' | 'torus' | 'icosahedron' | 'octahedron' | 'custom';
  size: number;
  segments?: number;
  position: THREE.Vector3;
  rotation?: THREE.Euler;
  scale?: THREE.Vector3;
  shader: string;
  wireframe?: boolean;
  transparent?: boolean;
  opacity?: number;
}

export interface AnimationConfig {
  rotation?: {
    speed: THREE.Vector3;
    enabled: boolean;
  };
  scale?: {
    min: number;
    max: number;
    speed: number;
    enabled: boolean;
  };
  position?: {
    amplitude: THREE.Vector3;
    frequency: THREE.Vector3;
    enabled: boolean;
  };
}

export interface PostProcessingConfig {
  bloom?: {
    enabled: boolean;
    threshold: number;
    strength: number;
    radius: number;
  };
  chromaticAberration?: {
    enabled: boolean;
    offset: THREE.Vector2;
  };
  vignette?: {
    enabled: boolean;
    darkness: number;
    offset: number;
  };
  filmGrain?: {
    enabled: boolean;
    intensity: number;
  };
}

export interface VisualizerConfig {
  audio: {
    fftSize: number;
    smoothingTimeConstant: number;
    minDecibels: number;
    maxDecibels: number;
  };
  rendering: {
    antialias: boolean;
    shadowMap: boolean;
    postProcessing: PostProcessingConfig;
  };
  performance: {
    maxShapes: number;
    instancing: boolean;
    levelOfDetail: 'low' | 'medium' | 'high';
  };
}

export interface FeatureFlags {
  advancedShaders: boolean;
  postProcessing: boolean;
  instancing: boolean;
  beatDetection: boolean;
  proceduralGeneration: boolean;
  realtimeAudio: boolean;
  mobileOptimization: boolean;
}