// Audio graph, sources and per-frame analysis.
//
//   file / demo ─┐                  ┌─> analyser (smoothed)   → what shaders see
//   mic / tab ───┴─> input ─────────┼─> raw analyser (no smoothing) → onsets
//                                   ├─> monitor ─> speakers (file & demo only)
//                                   └─> recorder stream (on demand)

import { OnsetDetector } from './onset';
import { Pizzicato } from './pizzicato';
import { BANDS, bandEnergy, mean, normalize, remap, sanitizeDb, type Scale } from './spectrum';
import { BINS } from '../gl/glsl';

export type SourceKind = 'none' | 'file' | 'mic' | 'tab' | 'demo';

export const FFT_SIZE = 2048;
export const MIN_DB = -100;
export const MAX_DB = -30;

export interface Features {
  /** Smoothed spectrum in dB, BINS texels, scale-mapped. Feeds `frequency()`. */
  spectrumDb: Float32Array;
  /** Same, normalized 0..1. Feeds the history texture. */
  spectrum: Float32Array;
  level: number;
  bass: number;
  mid: number;
  treble: number;
  /** Mean dB of the raw bins — the 2016 `od` uniform. */
  od: number;
  onset: number;
}

export interface EngineEvents {
  onSourceChange?: (kind: SourceKind, label: string) => void;
  onBlocked?: () => void;
  onError?: (message: string) => void;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly input: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly rawAnalyser: AnalyserNode;
  private readonly monitor: GainNode;
  private readonly element: HTMLAudioElement;
  private readonly demo: Pizzicato;

  private stream: MediaStream | null = null;
  private streamNode: MediaStreamAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;

  kind: SourceKind = 'none';
  label = '';
  scale: Scale = 'log';

  private readonly bins: Float32Array<ArrayBuffer>;
  private readonly rawBins: Float32Array<ArrayBuffer>;
  private readonly rawTexels = new Float32Array(BINS);
  private readonly onsets = new OnsetDetector();
  readonly features: Features = {
    spectrumDb: new Float32Array(BINS).fill(MIN_DB),
    spectrum: new Float32Array(BINS),
    level: 0, bass: 0, mid: 0, treble: 0, od: MIN_DB, onset: 0,
  };

  /** A play() the browser refused until the user interacts. */
  private pendingPlay = false;

  constructor(private readonly events: EngineEvents = {}) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.input = this.ctx.createGain();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.minDecibels = MIN_DB;
    this.analyser.maxDecibels = MAX_DB;
    this.analyser.smoothingTimeConstant = 0.8;

    this.rawAnalyser = this.ctx.createAnalyser();
    this.rawAnalyser.fftSize = FFT_SIZE;
    this.rawAnalyser.minDecibels = MIN_DB;
    this.rawAnalyser.maxDecibels = MAX_DB;
    this.rawAnalyser.smoothingTimeConstant = 0;

    this.monitor = this.ctx.createGain();
    this.input.connect(this.analyser);
    this.input.connect(this.rawAnalyser);
    this.input.connect(this.monitor).connect(this.ctx.destination);

    this.element = new Audio();
    this.element.crossOrigin = 'anonymous';
    this.element.loop = false;
    this.ctx.createMediaElementSource(this.element).connect(this.input);
    this.element.addEventListener('ended', () => this.setSource('none', ''));

    this.demo = new Pizzicato(this.ctx, this.input);

    this.bins = new Float32Array(this.analyser.frequencyBinCount);
    this.rawBins = new Float32Array(this.rawAnalyser.frequencyBinCount);

    this.setupMediaSession();
  }

  get minDb(): number {
    return this.analyser.minDecibels;
  }

  get maxDb(): number {
    return this.analyser.maxDecibels;
  }

  get paused(): boolean {
    if (this.kind === 'file') return this.element.paused;
    if (this.kind === 'demo') return !this.demo.playing;
    return this.ctx.state !== 'running';
  }

  /**
   * Browsers keep an AudioContext suspended until a user gesture. Call this
   * from any pointerdown/keydown; it also starts anything that was blocked.
   */
  async unlock(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    if (this.pendingPlay) {
      this.pendingPlay = false;
      if (this.kind === 'file') await this.tryPlayElement();
    }
  }

  async playFile(file: File): Promise<void> {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !/\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(file.name)) {
      this.events.onError?.(`${file.name} doesn't look like audio`);
      return;
    }
    this.release();
    this.objectUrl = URL.createObjectURL(file);
    this.element.src = this.objectUrl;
    this.monitor.gain.value = 1;
    this.setSource('file', file.name.replace(/\.[^.]+$/, ''));
    await this.tryPlayElement();
  }

  async useDemo(): Promise<void> {
    this.release();
    this.monitor.gain.value = 1;
    await this.unlock();
    this.demo.start();
    this.setSource('demo', 'pizzicato');
  }

  async useMic(): Promise<void> {
    await this.useStream(
      () => navigator.mediaDevices.getUserMedia({
        // Music, not speech: turn off the voice-call processing.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      }),
      'mic',
      'microphone',
    );
  }

  /** Capture another tab's (or the system's) audio — visualize whatever is playing. */
  async useTab(): Promise<void> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.events.onError?.('This browser cannot share tab audio');
      return;
    }
    await this.useStream(async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // required by most browsers; dropped immediately
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chromium hints; ignored elsewhere.
        ...({ systemAudio: 'include', preferCurrentTab: false, selfBrowserSurface: 'exclude' } as object),
      });
      for (const track of stream.getVideoTracks()) track.stop();
      if (!stream.getAudioTracks().length) {
        throw new Error('No audio was shared. Pick a tab and turn on “Share tab audio”.');
      }
      return stream;
    }, 'tab', 'tab audio');
  }

  async togglePause(): Promise<void> {
    await this.unlock();
    if (this.kind === 'file') {
      if (this.element.paused) await this.tryPlayElement();
      else this.element.pause();
    } else if (this.kind === 'demo') {
      if (this.demo.playing) this.demo.stop();
      else this.demo.start();
    }
    this.updateMediaSessionState();
  }

  stop(): void {
    this.release();
    this.setSource('none', '');
  }

  /** An audio track of everything Staccato hears, for recording. */
  recordingStream(): MediaStream {
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.input.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  /** Run once per animation frame. `now` in seconds. */
  analyse(now: number): Features {
    const f = this.features;
    const minDb = this.minDb, maxDb = this.maxDb;
    const sr = this.ctx.sampleRate;

    if (this.kind === 'none' && f.level < 1e-4 && f.onset < 1e-4) return f;

    this.analyser.getFloatFrequencyData(this.bins);
    this.rawAnalyser.getFloatFrequencyData(this.rawBins);
    sanitizeDb(this.bins, minDb, maxDb);
    sanitizeDb(this.rawBins, minDb, maxDb);

    remap(this.bins, f.spectrumDb, this.scale, sr);
    for (let i = 0; i < BINS; i++) f.spectrum[i] = normalize(f.spectrumDb[i]!, minDb, maxDb);

    // Onsets on the unsmoothed signal, always in log scale so detection
    // doesn't change character when the display scale is toggled.
    remap(this.rawBins, this.rawTexels, 'log', sr);
    for (let i = 0; i < BINS; i++) this.rawTexels[i] = normalize(this.rawTexels[i]!, minDb, maxDb);
    this.onsets.push(this.rawTexels, now);

    f.level = mean(f.spectrum);
    f.bass = bandEnergy(this.bins, BANDS.bass, sr, minDb, maxDb);
    f.mid = bandEnergy(this.bins, BANDS.mid, sr, minDb, maxDb);
    f.treble = bandEnergy(this.bins, BANDS.treble, sr, minDb, maxDb);
    f.od = mean(this.bins);
    f.onset = this.onsets.envelope;
    return f;
  }

  private async useStream(open: () => Promise<MediaStream>, kind: SourceKind, label: string): Promise<void> {
    await this.unlock();
    let stream: MediaStream;
    try {
      stream = await open();
    } catch (e) {
      const err = e as DOMException;
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') this.events.onError?.(err.message || String(e));
      else if (kind === 'mic') this.events.onError?.('Microphone permission was denied');
      return;
    }
    this.release();
    this.stream = stream;
    this.streamNode = this.ctx.createMediaStreamSource(stream);
    this.streamNode.connect(this.input);
    // Never play captured audio back out: the mic would feed back, and a tab
    // is already audible on its own.
    this.monitor.gain.value = 0;
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (this.stream === stream) this.stop();
      });
    }
    this.setSource(kind, label);
  }

  private async tryPlayElement(): Promise<void> {
    try {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      await this.element.play();
      this.pendingPlay = this.ctx.state !== 'running';
    } catch (e) {
      if ((e as DOMException).name === 'NotAllowedError') this.pendingPlay = true;
      else this.events.onError?.(`Couldn't play that file (${(e as Error).message})`);
    }
    if (this.pendingPlay) this.events.onBlocked?.();
    this.updateMediaSessionState();
  }

  private release(): void {
    this.pendingPlay = false;
    this.demo.stop();
    this.element.pause();
    this.element.removeAttribute('src');
    this.element.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.streamNode?.disconnect();
    this.streamNode = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.onsets.reset();
  }

  private setSource(kind: SourceKind, label: string): void {
    this.kind = kind;
    this.label = label;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = kind === 'none' ? null : new MediaMetadata({ title: label, artist: 'Staccato' });
    }
    this.updateMediaSessionState();
    this.events.onSourceChange?.(kind, label);
  }

  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const toggle = () => void this.togglePause();
    try {
      navigator.mediaSession.setActionHandler('play', toggle);
      navigator.mediaSession.setActionHandler('pause', toggle);
    } catch {
      // Unsupported action: nothing to do.
    }
  }

  private updateMediaSessionState(): void {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.kind === 'none' ? 'none' : this.paused ? 'paused' : 'playing';
  }
}
