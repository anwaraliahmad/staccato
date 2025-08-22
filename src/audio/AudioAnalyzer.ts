import { AudioAnalysis, AudioBands } from '../types';
import { Constants } from '../constants';

export class AudioAnalyzer {
  private context: AudioContext;
  private analyser: AnalyserNode;
  private source: AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode;
  private compressor: DynamicsCompressorNode;
  
  private frequencyData: Float32Array;
  private timeDomainData: Float32Array;
  private previousFrequencyData: Float32Array;
  
  private beatThreshold = 0.3;
  private beatDecay = 0.95;
  private beatCutoff = 0.1;
  private beatTime = 0;
  private beatInterval = 0;
  private lastBeatTime = 0;
  
  private bpmHistory: number[] = [];
  private volumeHistory: number[] = [];
  
  constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create audio processing chain
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = Constants.FFT_SIZE;
    this.analyser.smoothingTimeConstant = Constants.SMOOTHING_TIME_CONSTANT;
    this.analyser.minDecibels = Constants.MIN_DECIBELS;
    this.analyser.maxDecibels = Constants.MAX_DECIBELS;
    
    this.gainNode = this.context.createGain();
    this.compressor = this.context.createDynamicsCompressor();
    
    // Configure compressor for better dynamic range
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    
    // Connect audio chain
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Float32Array(this.analyser.frequencyBinCount);
    this.previousFrequencyData = new Float32Array(this.analyser.frequencyBinCount);
  }
  
  async initialize(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }
  
  async loadAudioFile(file: File): Promise<void> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.playBuffer(audioBuffer);
    } catch (error) {
      console.error('Error loading audio file:', error);
      throw error;
    }
  }
  
  async loadAudioURL(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.playBuffer(audioBuffer);
    } catch (error) {
      console.error('Error loading audio URL:', error);
      throw error;
    }
  }
  
  async startMicrophone(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.context.createMediaStreamSource(stream);
      source.connect(this.gainNode);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }
  
  private playBuffer(buffer: AudioBuffer): void {
    if (this.source) {
      this.source.stop();
    }
    
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.gainNode);
    this.source.start(0);
  }
  
  getAnalysis(): AudioAnalysis {
    // Get current frequency and time domain data
    this.analyser.getFloatFrequencyData(this.frequencyData);
    this.analyser.getFloatTimeDomainData(this.timeDomainData);
    
    // Calculate frequency bands
    const bass = this.getFrequencyBand(AudioBands.BASS);
    const mid = this.getFrequencyBand(AudioBands.MID);
    const treble = this.getFrequencyBand(AudioBands.TREBLE);
    
    // Calculate overall volume
    const volume = this.calculateVolume();
    
    // Detect beats
    const beat = this.detectBeat();
    
    // Calculate BPM
    const bpm = this.calculateBPM();
    
    // Update history
    this.updateHistory(volume, bpm);
    
    return {
      frequencyData: this.frequencyData.slice(),
      timeDomainData: this.timeDomainData.slice(),
      bass,
      mid,
      treble,
      volume,
      beat,
      bpm
    };
  }
  
  private getFrequencyBand(band: { start: number; end: number }): number {
    const startIndex = Math.floor(band.start * this.frequencyData.length / (this.context.sampleRate / 2));
    const endIndex = Math.floor(band.end * this.frequencyData.length / (this.context.sampleRate / 2));
    
    let sum = 0;
    let count = 0;
    
    for (let i = startIndex; i < endIndex && i < this.frequencyData.length; i++) {
      sum += Math.max(0, (this.frequencyData[i] + 140) / 140); // Normalize to 0-1
      count++;
    }
    
    return count > 0 ? sum / count : 0;
  }
  
  private calculateVolume(): number {
    let sum = 0;
    for (let i = 0; i < this.timeDomainData.length; i++) {
      sum += this.timeDomainData[i] * this.timeDomainData[i];
    }
    return Math.sqrt(sum / this.timeDomainData.length);
  }
  
  private detectBeat(): boolean {
    const currentVolume = this.calculateVolume();
    const volumeChange = currentVolume - this.volumeHistory[this.volumeHistory.length - 1] || 0;
    
    // Update beat detection
    this.beatTime += 1 / 60; // Assuming 60 FPS
    
    if (volumeChange > this.beatThreshold && currentVolume > this.beatCutoff) {
      const timeSinceLastBeat = this.beatTime - this.lastBeatTime;
      if (timeSinceLastBeat > 0.1) { // Minimum beat interval
        this.lastBeatTime = this.beatTime;
        this.beatInterval = timeSinceLastBeat;
        return true;
      }
    }
    
    return false;
  }
  
  private calculateBPM(): number {
    if (this.beatInterval > 0) {
      const bpm = 60 / this.beatInterval;
      this.bpmHistory.push(bpm);
      
      // Keep only recent BPM values
      if (this.bpmHistory.length > 10) {
        this.bpmHistory.shift();
      }
      
      // Return average BPM
      return this.bpmHistory.reduce((a, b) => a + b, 0) / this.bpmHistory.length;
    }
    
    return 120; // Default BPM
  }
  
  private updateHistory(volume: number, bpm: number): void {
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > 60) { // Keep 1 second of history at 60 FPS
      this.volumeHistory.shift();
    }
  }
  
  setVolume(volume: number): void {
    this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
  }
  
  pause(): void {
    if (this.source && this.source.buffer) {
      this.context.suspend();
    }
  }
  
  resume(): void {
    this.context.resume();
  }
  
  stop(): void {
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
  }
  
  dispose(): void {
    this.stop();
    this.context.close();
  }
}