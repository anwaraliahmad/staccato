// A small synthesized demo so Staccato moves before you have a song to drop.
// Plucked, staccato arpeggios over i–VI–III–VII in A minor, with a kick and
// hats so bass and treble both have something to say. Named for Pizzicato.js,
// which played the very first sounds through this visualizer in October 2016.
//
// Scheduling follows Chris Wilson's "A Tale of Two Clocks": a coarse JS timer
// queues notes slightly ahead on the precise AudioContext clock.

const BPM = 112;
const STEP = 60 / BPM / 4; // sixteenth notes
const LOOKAHEAD = 0.12; // seconds of notes queued ahead
const TICK_MS = 25;

// Chord roots as MIDI notes, with minor/major triads.
const PROGRESSION: { root: number; third: number }[] = [
  { root: 57, third: 3 }, // Am
  { root: 53, third: 4 }, // F
  { root: 48, third: 4 }, // C
  { root: 55, third: 4 }, // G
];
// Arpeggio pattern over chord tones (0 root, 1 third, 2 fifth, +3 = octave up). -1 rests.
const PATTERN = [0, 2, 3, 2, 4, 2, 3, -1, 0, 2, 3, 5, 4, 2, 3, 1];

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Pizzicato {
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private readonly out: GainNode;
  private noise: AudioBuffer | null = null;

  constructor(private readonly ctx: AudioContext, destination: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(destination);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.noise ??= this.makeNoise();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.out.disconnect();
  }

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.play(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  private play(step: number, t: number): void {
    const bar = Math.floor(step / 16) % PROGRESSION.length;
    const pos = step % 16;
    const chord = PROGRESSION[bar]!;
    const tones = [0, chord.third, 7];

    const degree = PATTERN[pos]!;
    if (degree >= 0) {
      const note = chord.root + 12 + tones[degree % 3]! + 12 * Math.floor(degree / 3);
      this.pluck(midiToHz(note), t, pos % 4 === 0 ? 0.32 : 0.22);
    }
    if (pos === 0 || pos === 8) this.kick(t);
    if (pos === 0) this.bass(midiToHz(chord.root - 24), t);
    if (pos % 2 === 1) this.hat(t, pos % 4 === 3 ? 0.05 : 0.025);
  }

  private pluck(hz: number, t: number, velocity: number): void {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(velocity, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(hz * 8, t);
    tone.frequency.exponentialRampToValueAtTime(hz * 1.5, t + 0.2);

    for (const [type, mult, gain] of [['triangle', 1, 1], ['sine', 2, 0.35]] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = hz * mult;
      g.gain.value = gain;
      osc.connect(g).connect(tone);
      osc.start(t);
      osc.stop(t + 0.25);
    }
    tone.connect(env).connect(this.out);
  }

  private bass(hz: number, t: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 7);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + STEP * 8);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.7, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private hat(t: number, velocity: number): void {
    if (!this.noise) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(velocity, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp).connect(env).connect(this.out);
    src.start(t);
    src.stop(t + 0.05);
  }

  private makeNoise(): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * 0.1);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic noise (LCG) so the demo sounds the same every time.
    let s = 1;
    for (let i = 0; i < length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 2 ** 31 - 1;
    }
    return buffer;
  }
}
