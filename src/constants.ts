export const Constants = {
  // Audio Configuration
  FFT_SIZE: 2048,
  SMOOTHING_TIME_CONSTANT: 0.8,
  MIN_DECIBELS: -90,
  MAX_DECIBELS: -10,
  
  // Performance Configuration
  MAX_SHAPES: 50,
  TARGET_FPS: 60,
  LOD_DISTANCE: 1000,
  
  // Rendering Configuration
  SHADOW_MAP_SIZE: 2048,
  BLOOM_THRESHOLD: 0.8,
  BLOOM_STRENGTH: 1.5,
  BLOOM_RADIUS: 0.8,
  
  // Animation Configuration
  ROTATION_SPEED: 0.5,
  SCALE_ANIMATION_SPEED: 2.0,
  POSITION_ANIMATION_SPEED: 1.0,
  
  // Shader Configuration
  SHADER_PRECISION: 'highp',
  MAX_UNIFORMS: 64,
  
  // UI Configuration
  UI_OPACITY: 0.8,
  UI_BLUR: 10,
  
  // Feature Flags
  FEATURES: {
    ADVANCED_SHADERS: true,
    POST_PROCESSING: true,
    INSTANCING: true,
    BEAT_DETECTION: true,
    PROCEDURAL_GENERATION: true,
    REALTIME_AUDIO: true,
    MOBILE_OPTIMIZATION: true,
    WEBGL2: true
  }
} as const;

export const AudioBands = {
  BASS: { start: 0, end: 60 },
  LOW_MID: { start: 60, end: 250 },
  MID: { start: 250, end: 2000 },
  HIGH_MID: { start: 2000, end: 4000 },
  TREBLE: { start: 4000, end: 8000 },
  PRESENCE: { start: 8000, end: 16000 }
} as const;

export const GeometryTypes = {
  SPHERE: 'sphere',
  PLANE: 'plane',
  CUBE: 'cube',
  TORUS: 'torus',
  ICOSAHEDRON: 'icosahedron',
  OCTAHEDRON: 'octahedron',
  CUSTOM: 'custom'
} as const;

export const ShaderTypes = {
  HEART: 'heart',
  WAVE: 'wave',
  ABYSS: 'abyss',
  NEON: 'neon',
  PARTICLE: 'particle',
  FLUID: 'fluid',
  CRYSTAL: 'crystal',
  GENERATE: 'generate'
} as const;