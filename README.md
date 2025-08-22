# Staccato - Modern WebGL Music Visualizer

![Staccato Logo](https://img.shields.io/badge/Staccato-Music%20Visualizer-667eea?style=for-the-badge&logo=webgl)

A stunning, modern WebGL music visualizer with advanced shader effects, real-time audio analysis, and procedural generation capabilities. Built with Three.js, TypeScript, and modern web technologies.

## ✨ Features

### 🎵 Audio Processing
- **Real-time FFT Analysis**: Advanced frequency domain analysis with configurable FFT sizes
- **Beat Detection**: Intelligent beat detection with BPM calculation
- **Frequency Band Analysis**: Separate bass, mid, and treble frequency analysis
- **Audio Compression**: Built-in dynamics compressor for better dynamic range
- **Multiple Input Sources**: Support for audio files, URLs, and microphone input

### 🎨 Visual Effects
- **Advanced Shaders**: Sophisticated procedural shader generation with noise functions
- **Post-Processing Pipeline**: Bloom, chromatic aberration, vignette, and film grain effects
- **Dynamic Lighting**: Real-time lighting that responds to audio
- **Multiple Geometry Types**: Sphere, torus, cube, plane, icosahedron, octahedron
- **Wireframe & Solid Rendering**: Toggle between wireframe and solid rendering modes

### 🚀 Performance & Modern Features
- **WebGL 2.0 Support**: Modern graphics API with enhanced capabilities
- **Instanced Rendering**: Efficient rendering of multiple objects
- **Level of Detail**: Automatic LOD system for performance optimization
- **Mobile Optimization**: Touch controls and device orientation support
- **Responsive Design**: Adaptive UI that works on all screen sizes

### 🎛️ User Interface
- **Modern Glassmorphism Design**: Beautiful, translucent UI with backdrop blur
- **Real-time Audio Meters**: Visual feedback for audio levels and frequency bands
- **Interactive Controls**: Drag-and-drop file loading, volume control, effect toggles
- **Keyboard Shortcuts**: Quick access to common functions
- **Fullscreen Mode**: Immersive viewing experience

## 🛠️ Technology Stack

- **Three.js 0.162.0**: Modern 3D graphics library
- **TypeScript 5.3.3**: Type-safe JavaScript development
- **Vite 5.1.0**: Fast build tool and development server
- **Web Audio API**: Advanced audio processing
- **WebGL 2.0**: Modern graphics rendering
- **CSS Grid & Flexbox**: Modern layout system
- **ES2022**: Latest JavaScript features

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Modern web browser with WebGL support

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/staccato.git
cd staccato

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Usage
1. **Load Audio**: Drag and drop an audio file onto the canvas or use the "Load Audio" button
2. **Microphone Input**: Click the microphone button to use live audio input
3. **Add Shapes**: Use the Shapes panel to add different geometry types
4. **Generate Shaders**: Create unique procedural shaders with the "Generate Random" button
5. **Adjust Effects**: Toggle post-processing effects in the Effects panel
6. **Control Camera**: Use mouse/touch to orbit, zoom, and pan the camera

### Keyboard Shortcuts
- `Space`: Toggle auto-rotation
- `R`: Reset camera position
- `G`: Toggle device orientation controls
- `P`: Pause/resume audio
- `S`: Stop audio

## 🎨 Shader System

### Legacy Shaders (Preserved)
- **Heart**: Classic heart-shaped displacement shader
- **Wave**: Wave-based displacement with frequency response
- **Abyss**: Complex noise-based displacement with frequency mapping

### Modern Shaders
- **Neon**: Glowing neon effect with color cycling
- **Particle**: Particle system with audio-reactive sizing
- **Procedural**: Dynamically generated shaders with varying complexity

### Custom Shader Development
```typescript
// Create a custom shader
const customShader = {
  name: 'my-shader',
  vertexShader: `
    uniform float time;
    uniform float frequency[512];
    
    void main() {
      // Your vertex shader code
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    
    void main() {
      // Your fragment shader code
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `
};
```

## 🎛️ Configuration

### Audio Settings
```typescript
const audioConfig = {
  fftSize: 2048,                    // FFT analysis size
  smoothingTimeConstant: 0.8,       // Frequency smoothing
  minDecibels: -90,                 // Minimum decibel threshold
  maxDecibels: -10                  // Maximum decibel threshold
};
```

### Rendering Settings
```typescript
const renderConfig = {
  antialias: true,                  // Enable antialiasing
  shadowMap: true,                  // Enable shadow mapping
  postProcessing: {
    bloom: { enabled: true, threshold: 0.8, strength: 1.5, radius: 0.8 },
    chromaticAberration: { enabled: true, offset: new THREE.Vector2(0.002, 0.002) },
    vignette: { enabled: true, darkness: 0.3, offset: 0.5 },
    filmGrain: { enabled: true, intensity: 0.1 }
  }
};
```

### Performance Settings
```typescript
const performanceConfig = {
  maxShapes: 50,                    // Maximum number of shapes
  instancing: true,                 // Enable instanced rendering
  levelOfDetail: 'high'             // LOD quality: 'low' | 'medium' | 'high'
};
```

## 🔧 Development

### Project Structure
```
src/
├── audio/                 # Audio processing modules
│   └── AudioAnalyzer.ts   # Main audio analysis class
├── rendering/             # Rendering and effects
│   └── PostProcessor.ts   # Post-processing pipeline
├── shaders/               # Shader generation and management
│   └── AdvancedShaderGenerator.ts
├── ui/                    # User interface components
│   └── ModernUI.ts        # Modern UI implementation
├── types.ts               # TypeScript type definitions
├── constants.ts           # Application constants
├── main.ts               # Main application class
├── StaccatoModern.ts     # Modern visualizer implementation
└── index.ts              # Application entry point
```

### Building Custom Features

#### Adding New Geometry Types
```typescript
// In constants.ts
export const GeometryTypes = {
  // ... existing types
  CUSTOM: 'custom'
} as const;

// In StaccatoModern.ts
private createGeometry(config: ShapeConfig): THREE.BufferGeometry {
  switch (config.type) {
    // ... existing cases
    case GeometryTypes.CUSTOM:
      return new THREE.CustomGeometry(config.size, config.segments);
  }
}
```

#### Adding New Post-Processing Effects
```typescript
// In PostProcessor.ts
private createCustomEffect(): THREE.ShaderPass {
  return new THREE.ShaderPass({
    uniforms: { /* your uniforms */ },
    vertexShader: `/* your vertex shader */`,
    fragmentShader: `/* your fragment shader */`
  });
}
```

## 🎯 Performance Optimization

### Best Practices
1. **Limit Shape Count**: Keep shapes under 50 for optimal performance
2. **Use Instancing**: Enable instanced rendering for multiple similar objects
3. **Optimize Shaders**: Keep shader complexity reasonable for mobile devices
4. **Monitor FPS**: Use the built-in FPS counter to monitor performance
5. **LOD System**: Use the level of detail system for complex scenes

### Mobile Optimization
- Automatic touch controls
- Reduced shader complexity on mobile
- Optimized post-processing effects
- Responsive UI design

## 🌟 Feature Flags

Enable/disable features for different use cases:

```typescript
const features = {
  advancedShaders: true,      // Enable advanced shader generation
  postProcessing: true,       // Enable post-processing effects
  instancing: true,          // Enable instanced rendering
  beatDetection: true,       // Enable beat detection
  proceduralGeneration: true, // Enable procedural shader generation
  realtimeAudio: true,       // Enable real-time audio processing
  mobileOptimization: true   // Enable mobile-specific optimizations
};
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add proper type definitions
- Include JSDoc comments for public APIs
- Write clean, readable code
- Test on multiple browsers and devices

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Three.js Community**: For the amazing 3D graphics library
- **Web Audio API**: For powerful audio processing capabilities
- **Original Author**: Anwar Ali-Ahmad for the original 2016 implementation
- **Open Source Community**: For inspiration and contributions

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/staccato/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/staccato/discussions)
- **Documentation**: [Wiki](https://github.com/yourusername/staccato/wiki)

---

**Made with ❤️ and 🎵 by the Staccato Team**

*Experience the future of music visualization*

