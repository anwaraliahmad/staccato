import { ShaderConfig } from '../types';
import { Constants } from '../constants';

export class AdvancedShaderGenerator {
  private static readonly NOISE_FUNCTIONS = `
    // Improved noise functions
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy));
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m;
      m = m*m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
    
    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      return value;
    }
    
    vec3 palette(float t) {
      vec3 a = vec3(0.5, 0.5, 0.5);
      vec3 b = vec3(0.5, 0.5, 0.5);
      vec3 c = vec3(1.0, 1.0, 1.0);
      vec3 d = vec3(0.263, 0.416, 0.557);
      return a + b * cos(6.28318 * (c * t + d));
    }
  `;

  private static readonly UTILITY_FUNCTIONS = `
    float map(float value, float min1, float max1, float min2, float max2) {
      return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
    }
    
    float smoothstep(float edge0, float edge1, float x) {
      float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
      return t * t * (3.0 - 2.0 * t);
    }
    
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    
    float getFrequencyData(float index) {
      return abs(frequency[int(index)]);
    }
    
    float getBass() {
      float sum = 0.0;
      for (int i = 0; i < 60; i++) {
        sum += getFrequencyData(float(i));
      }
      return sum / 60.0;
    }
    
    float getMid() {
      float sum = 0.0;
      for (int i = 60; i < 250; i++) {
        sum += getFrequencyData(float(i));
      }
      return sum / 190.0;
    }
    
    float getTreble() {
      float sum = 0.0;
      for (int i = 250; i < 512; i++) {
        sum += getFrequencyData(float(i));
      }
      return sum / 262.0;
    }
  `;

  static generateVertexShader(complexity: number = 3): string {
    const shader = `
      precision ${Constants.SHADER_PRECISION} float;
      
      uniform float time;
      uniform float frequency[512];
      uniform float bass;
      uniform float mid;
      uniform float treble;
      uniform float volume;
      uniform bool beat;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vDisplacement;
      
      ${this.NOISE_FUNCTIONS}
      ${this.UTILITY_FUNCTIONS}
      
      void main() {
        vUv = uv;
        vPosition = position;
        vNormal = normal;
        
        // Calculate displacement based on audio
        float displacement = 0.0;
        float radius = length(position.xy);
        
        // Base displacement from frequency data
        float freqIndex = map(radius, 0.0, 1.0, 0.0, 512.0);
        displacement += getFrequencyData(freqIndex) * 0.5;
        
        // Add noise-based displacement
        vec2 noiseCoord = position.xy * 2.0 + time * 0.5;
        float noise = fbm(noiseCoord);
        displacement += noise * 0.3;
        
        // Add beat-reactive displacement
        if (beat) {
          displacement += sin(time * 20.0) * 0.2;
        }
        
        // Add frequency band-specific effects
        displacement += getBass() * 0.4 * sin(radius * 10.0 + time);
        displacement += getMid() * 0.3 * cos(radius * 15.0 + time * 2.0);
        displacement += getTreble() * 0.2 * sin(radius * 20.0 + time * 3.0);
        
        // Apply displacement
        vec3 newPosition = position + normal * displacement * 0.1;
        
        vDisplacement = displacement;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `;
    
    return shader;
  }

  static generateFragmentShader(complexity: number = 3): string {
    const shader = `
      precision ${Constants.SHADER_PRECISION} float;
      
      uniform float time;
      uniform float frequency[512];
      uniform float bass;
      uniform float mid;
      uniform float treble;
      uniform float volume;
      uniform bool beat;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vDisplacement;
      
      ${this.NOISE_FUNCTIONS}
      ${this.UTILITY_FUNCTIONS}
      
      void main() {
        vec2 uv = vUv;
        vec3 color = vec3(0.0);
        
        // Base color from displacement
        float displacement = vDisplacement;
        
        // Create gradient based on position
        vec3 gradient = palette(displacement * 2.0 + time * 0.1);
        
        // Add frequency-based color modulation
        float bassColor = getBass() * 0.8;
        float midColor = getMid() * 0.6;
        float trebleColor = getTreble() * 0.4;
        
        color += gradient * (bassColor + midColor + trebleColor);
        
        // Add noise texture
        vec2 noiseCoord = uv * 3.0 + time * 0.2;
        float noise = fbm(noiseCoord);
        color += noise * 0.1;
        
        // Add beat-reactive effects
        if (beat) {
          color += vec3(0.2, 0.1, 0.3) * sin(time * 30.0);
        }
        
        // Add rim lighting
        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        color += rim * 0.3 * vec3(0.5, 0.8, 1.0);
        
        // Add volume-based brightness
        color *= 1.0 + volume * 0.5;
        
        // Add glow effect
        float glow = smoothstep(0.0, 1.0, displacement);
        color += glow * 0.2 * vec3(0.8, 0.4, 1.0);
        
        // Clamp and output
        color = clamp(color, 0.0, 1.0);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    return shader;
  }

  static generateNeonShader(): ShaderConfig {
    return {
      name: 'neon',
      vertexShader: `
        precision ${Constants.SHADER_PRECISION} float;
        
        uniform float time;
        uniform float frequency[512];
        uniform float volume;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying float vIntensity;
        
        void main() {
          vUv = uv;
          vPosition = position;
          
          float intensity = 0.0;
          for (int i = 0; i < 512; i++) {
            intensity += abs(frequency[i]) * 0.001;
          }
          
          vIntensity = intensity;
          
          vec3 newPosition = position + normal * intensity * 0.1;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        precision ${Constants.SHADER_PRECISION} float;
        
        uniform float time;
        uniform float volume;
        
        varying vec2 vUv;
        varying vec3 vPosition;
        varying float vIntensity;
        
        void main() {
          vec2 uv = vUv;
          
          // Create neon effect
          float neon = sin(uv.x * 50.0 + time * 5.0) * sin(uv.y * 50.0 + time * 3.0);
          neon = abs(neon) * vIntensity;
          
          vec3 color = vec3(0.0);
          color.r = neon * (0.5 + 0.5 * sin(time));
          color.g = neon * (0.5 + 0.5 * sin(time + 2.094));
          color.b = neon * (0.5 + 0.5 * sin(time + 4.188));
          
          // Add glow
          color += color * color * 0.5;
          
          gl_FragColor = vec4(color, 1.0);
        }
      `
    };
  }

  static generateParticleShader(): ShaderConfig {
    return {
      name: 'particle',
      vertexShader: `
        precision ${Constants.SHADER_PRECISION} float;
        
        uniform float time;
        uniform float frequency[512];
        
        varying vec2 vUv;
        varying float vSize;
        
        void main() {
          vUv = uv;
          
          float size = 0.0;
          for (int i = 0; i < 512; i++) {
            size += abs(frequency[i]) * 0.001;
          }
          
          vSize = size;
          
          vec3 newPosition = position + normal * size * 2.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
          gl_PointSize = size * 10.0;
        }
      `,
      fragmentShader: `
        precision ${Constants.SHADER_PRECISION} float;
        
        uniform float time;
        
        varying vec2 vUv;
        varying float vSize;
        
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float dist = length(uv);
          
          if (dist > 0.5) discard;
          
          float alpha = 1.0 - dist * 2.0;
          alpha = pow(alpha, 2.0);
          
          vec3 color = vec3(0.8, 0.4, 1.0) * alpha;
          color += vec3(0.2, 0.6, 1.0) * sin(time + dist * 10.0) * 0.5;
          
          gl_FragColor = vec4(color, alpha);
        }
      `
    };
  }

  static generateRandomShader(): ShaderConfig {
    const complexity = Math.floor(Math.random() * 3) + 2;
    const name = `generated-${Date.now()}`;
    
    return {
      name,
      vertexShader: this.generateVertexShader(complexity),
      fragmentShader: this.generateFragmentShader(complexity)
    };
  }
}