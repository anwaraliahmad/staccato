import * as THREE from 'three';
import { StaccatoModern } from '../StaccatoModern';
import { ShaderConfig, ShapeConfig } from '../types';
import { GeometryTypes, ShaderTypes } from '../constants';

export class ModernUI {
  private visualizer: StaccatoModern;
  private container: HTMLElement;
  private isVisible: boolean = true;
  
  constructor(visualizer: StaccatoModern) {
    this.visualizer = visualizer;
    this.container = this.createContainer();
    this.initialize();
  }
  
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'modern-ui';
    container.innerHTML = `
      <div class="ui-overlay">
        <header class="ui-header">
          <h1 class="ui-title">Staccato</h1>
          <div class="ui-controls">
            <button class="ui-btn" id="toggle-ui">UI</button>
            <button class="ui-btn" id="fullscreen">⛶</button>
          </div>
        </header>
        
        <div class="ui-panels">
          <div class="ui-panel" id="audio-panel">
            <h3>Audio</h3>
            <div class="audio-controls">
              <input type="file" id="audio-file" accept="audio/*" style="display: none;">
              <button class="ui-btn primary" id="load-audio">Load Audio</button>
              <button class="ui-btn" id="mic-input">🎤</button>
              <div class="volume-control">
                <label>Volume</label>
                <input type="range" id="volume" min="0" max="1" step="0.01" value="0.5">
              </div>
            </div>
            <div class="audio-info">
              <div class="audio-meter">
                <div class="meter-bar">
                  <div class="meter-fill" id="volume-meter"></div>
                </div>
                <span id="volume-text">0%</span>
              </div>
              <div class="audio-stats">
                <div>BPM: <span id="bpm-display">--</span></div>
                <div>Bass: <span id="bass-display">--</span></div>
                <div>Mid: <span id="mid-display">--</span></div>
                <div>Treble: <span id="treble-display">--</span></div>
              </div>
            </div>
          </div>
          
          <div class="ui-panel" id="shapes-panel">
            <h3>Shapes</h3>
            <div class="shape-controls">
              <select id="shape-type">
                <option value="sphere">Sphere</option>
                <option value="torus">Torus</option>
                <option value="cube">Cube</option>
                <option value="plane">Plane</option>
                <option value="icosahedron">Icosahedron</option>
                <option value="octahedron">Octahedron</option>
              </select>
              <input type="number" id="shape-size" placeholder="Size" value="200" min="10" max="1000">
              <button class="ui-btn" id="add-shape">Add Shape</button>
            </div>
            <div class="shapes-list" id="shapes-list">
              <!-- Shapes will be listed here -->
            </div>
          </div>
          
          <div class="ui-panel" id="shaders-panel">
            <h3>Shaders</h3>
            <div class="shader-controls">
              <button class="ui-btn" id="generate-shader">Generate Random</button>
            </div>
            <div class="shaders-list" id="shaders-list">
              <!-- Shaders will be listed here -->
            </div>
          </div>
          
          <div class="ui-panel" id="effects-panel">
            <h3>Effects</h3>
            <div class="effect-controls">
              <label>
                <input type="checkbox" id="bloom-toggle" checked>
                Bloom
              </label>
              <label>
                <input type="checkbox" id="chromatic-toggle" checked>
                Chromatic Aberration
              </label>
              <label>
                <input type="checkbox" id="vignette-toggle" checked>
                Vignette
              </label>
              <label>
                <input type="checkbox" id="grain-toggle" checked>
                Film Grain
              </label>
            </div>
          </div>
        </div>
        
        <footer class="ui-footer">
          <div class="ui-info">
            <span>Drag & drop audio files</span>
            <span>Space: Toggle rotation</span>
            <span>R: Reset camera</span>
            <span>G: Toggle gyroscope</span>
          </div>
        </footer>
      </div>
    `;
    
    document.body.appendChild(container);
    return container;
  }
  
  private initialize(): void {
    this.setupEventListeners();
    this.updateShadersList();
    this.updateShapesList();
    this.startAudioMeter();
  }
  
  private setupEventListeners(): void {
    // UI toggle
    const toggleBtn = this.container.querySelector('#toggle-ui');
    toggleBtn?.addEventListener('click', () => this.toggleVisibility());
    
    // Fullscreen
    const fullscreenBtn = this.container.querySelector('#fullscreen');
    fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    
    // Audio controls
    const loadAudioBtn = this.container.querySelector('#load-audio');
    const audioFileInput = this.container.querySelector('#audio-file') as HTMLInputElement;
    const micBtn = this.container.querySelector('#mic-input');
    const volumeSlider = this.container.querySelector('#volume') as HTMLInputElement;
    
    loadAudioBtn?.addEventListener('click', () => audioFileInput?.click());
    audioFileInput?.addEventListener('change', (e) => this.handleAudioFile(e));
    micBtn?.addEventListener('click', () => this.startMicrophone());
    volumeSlider?.addEventListener('input', (e) => {
      const volume = parseFloat((e.target as HTMLInputElement).value);
      this.visualizer.setVolume(volume);
    });
    
    // Shape controls
    const addShapeBtn = this.container.querySelector('#add-shape');
    addShapeBtn?.addEventListener('click', () => this.addShape());
    
    // Shader controls
    const generateShaderBtn = this.container.querySelector('#generate-shader');
    generateShaderBtn?.addEventListener('click', () => this.generateShader());
    
    // Effect toggles
    const effectToggles = this.container.querySelectorAll('input[type="checkbox"]');
    effectToggles.forEach(toggle => {
      toggle.addEventListener('change', (e) => this.handleEffectToggle(e));
    });
  }
  
  private async handleAudioFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (file) {
      try {
        await this.visualizer.getAudioAnalyzer().loadAudioFile(file);
      } catch (error) {
        console.error('Error loading audio file:', error);
        this.showNotification('Error loading audio file', 'error');
      }
    }
  }
  
  private async startMicrophone(): Promise<void> {
    try {
      await this.visualizer.getAudioAnalyzer().startMicrophone();
      this.showNotification('Microphone activated', 'success');
    } catch (error) {
      console.error('Error starting microphone:', error);
      this.showNotification('Error accessing microphone', 'error');
    }
  }
  
  private async addShape(): Promise<void> {
    const typeSelect = this.container.querySelector('#shape-type') as HTMLSelectElement;
    const sizeInput = this.container.querySelector('#shape-size') as HTMLInputElement;
    
    const type = typeSelect.value as keyof typeof GeometryTypes;
    const size = parseInt(sizeInput.value);
    
    try {
      const shapeId = await this.visualizer.addShape({
        type,
        size,
        position: new THREE.Vector3(0, 0, 0),
        shader: 'heart',
        wireframe: true,
        opacity: 0.8
      });
      
      this.updateShapesList();
      this.showNotification('Shape added successfully', 'success');
    } catch (error) {
      console.error('Error adding shape:', error);
      this.showNotification('Error adding shape', 'error');
    }
  }
  
  private async generateShader(): Promise<void> {
    try {
      const shaderName = await this.visualizer.generateRandomShader();
      this.updateShadersList();
      this.showNotification(`Generated shader: ${shaderName}`, 'success');
    } catch (error) {
      console.error('Error generating shader:', error);
      this.showNotification('Error generating shader', 'error');
    }
  }
  
  private handleEffectToggle(event: Event): void {
    const toggle = event.target as HTMLInputElement;
    const effect = toggle.id.replace('-toggle', '');
    const enabled = toggle.checked;
    
    // Update post-processing effects
    // This would need to be implemented in the PostProcessor class
    console.log(`Effect ${effect} ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  private updateShadersList(): void {
    const shadersList = this.container.querySelector('#shaders-list');
    if (!shadersList) return;
    
    const shaders = this.visualizer.getShaders();
    shadersList.innerHTML = shaders.map(shader => `
      <div class="shader-item" data-shader="${shader.name}">
        <span class="shader-name">${shader.name}</span>
        <div class="shader-features">
          ${shader.features?.map(f => `<span class="feature-tag">${f}</span>`).join('') || ''}
        </div>
      </div>
    `).join('');
  }
  
  private updateShapesList(): void {
    const shapesList = this.container.querySelector('#shapes-list');
    if (!shapesList) return;
    
    const shapes = this.visualizer.getShapes();
    shapesList.innerHTML = shapes.map(shape => `
      <div class="shape-item" data-shape="${shape.id}">
        <span class="shape-name">${shape.config.type}</span>
        <span class="shape-shader">${shape.config.shader}</span>
        <button class="ui-btn small" onclick="this.removeShape('${shape.id}')">Remove</button>
      </div>
    `).join('');
  }
  
  private startAudioMeter(): void {
    setInterval(() => {
      const audio = this.visualizer.getAudioAnalysis();
      
      // Update volume meter
      const volumeMeter = this.container.querySelector('#volume-meter') as HTMLElement;
      const volumeText = this.container.querySelector('#volume-text') as HTMLElement;
      
      if (volumeMeter && volumeText) {
        const volumePercent = Math.round(audio.volume * 100);
        volumeMeter.style.width = `${volumePercent}%`;
        volumeText.textContent = `${volumePercent}%`;
      }
      
      // Update audio stats
      const bpmDisplay = this.container.querySelector('#bpm-display');
      const bassDisplay = this.container.querySelector('#bass-display');
      const midDisplay = this.container.querySelector('#mid-display');
      const trebleDisplay = this.container.querySelector('#treble-display');
      
      if (bpmDisplay) bpmDisplay.textContent = Math.round(audio.bpm).toString();
      if (bassDisplay) bassDisplay.textContent = Math.round(audio.bass * 100).toString();
      if (midDisplay) midDisplay.textContent = Math.round(audio.mid * 100).toString();
      if (trebleDisplay) trebleDisplay.textContent = Math.round(audio.treble * 100).toString();
    }, 100);
  }
  
  private toggleVisibility(): void {
    this.isVisible = !this.isVisible;
    this.container.style.opacity = this.isVisible ? '1' : '0';
    this.container.style.pointerEvents = this.isVisible ? 'auto' : 'none';
  }
  
  private toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
  
  private showNotification(message: string, type: 'success' | 'error' | 'info'): void {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
  
  public destroy(): void {
    this.container.remove();
  }
}