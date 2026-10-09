// Note-attack detection by spectral flux.
//
// The November 2016 render loop compared the average dB of consecutive frames
// ("compare the rate of dB change between last and current bin") but never used
// the result. Spectral flux is that idea done per bin: sum only the *increases*
// in loudness, so a new note lights up while a sustained one doesn't. A frame is
// an onset when the flux beats an adaptive threshold built from recent history.

export interface OnsetOptions {
  /** Frames of flux history for the adaptive threshold (~0.7s at 60fps). */
  window: number;
  /** Standard deviations above the mean flux needed to fire. */
  sensitivity: number;
  /** Flux below this never fires — keeps silence and noise floors quiet. */
  floor: number;
  /** Minimum seconds between onsets. */
  refractory: number;
  /** Seconds for the envelope to fall to 1/e. */
  decay: number;
}

export const DEFAULT_ONSET: OnsetOptions = {
  window: 43,
  sensitivity: 1.6,
  floor: 0.012,
  refractory: 0.09,
  decay: 0.14,
};

export class OnsetDetector {
  /** 1 on an onset, decaying towards 0. What shaders see as `onset`. */
  envelope = 0;
  flux = 0;

  private readonly options: OnsetOptions;
  private previous: Float32Array | null = null;
  private readonly history: Float32Array;
  private head = 0;
  private filled = 0;
  private lastOnset = -Infinity;
  private lastTime: number | null = null;

  constructor(options: Partial<OnsetOptions> = {}) {
    this.options = { ...DEFAULT_ONSET, ...options };
    this.history = new Float32Array(this.options.window);
  }

  /**
   * Feed one frame of normalized (0..1) spectrum at time `now` (seconds).
   * Returns true if this frame is an onset.
   */
  push(frame: Float32Array, now: number): boolean {
    const { sensitivity, floor, refractory, decay } = this.options;

    const dt = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;
    this.envelope *= Math.exp(-dt / decay);

    let flux = 0;
    if (this.previous) {
      for (let i = 0; i < frame.length; i++) {
        const rise = frame[i]! - this.previous[i]!;
        if (rise > 0) flux += rise;
      }
      flux /= frame.length;
    } else {
      this.previous = new Float32Array(frame.length);
    }
    this.previous.set(frame);
    this.flux = flux;

    // Threshold from history *before* adding this frame.
    let mean = 0;
    let sq = 0;
    for (let i = 0; i < this.filled; i++) {
      mean += this.history[i]!;
      sq += this.history[i]! * this.history[i]!;
    }
    const n = Math.max(1, this.filled);
    mean /= n;
    const std = Math.sqrt(Math.max(0, sq / n - mean * mean));
    const threshold = Math.max(floor, mean + sensitivity * std);

    this.history[this.head] = flux;
    this.head = (this.head + 1) % this.history.length;
    this.filled = Math.min(this.filled + 1, this.history.length);

    const warmedUp = this.filled >= Math.min(8, this.history.length);
    if (warmedUp && flux > threshold && now - this.lastOnset >= refractory) {
      this.lastOnset = now;
      this.envelope = 1;
      return true;
    }
    return false;
  }

  reset(): void {
    this.previous = null;
    this.history.fill(0);
    this.head = 0;
    this.filled = 0;
    this.envelope = 0;
    this.flux = 0;
    this.lastOnset = -Infinity;
    this.lastTime = null;
  }
}
