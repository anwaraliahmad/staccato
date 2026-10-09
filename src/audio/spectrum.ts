// Turning AnalyserNode output into what the shaders read. Pure functions only.

export type Scale = 'log' | 'linear';

export interface Band {
  lo: number;
  hi: number;
}

export const BANDS = {
  bass: { lo: 30, hi: 250 },
  mid: { lo: 250, hi: 2000 },
  treble: { lo: 2000, hi: 16000 },
} satisfies Record<string, Band>;

/** Range covered by the log scale. Below 30Hz is rumble; above 16kHz is mostly empty. */
export const LOG_MIN_HZ = 30;
export const LOG_MAX_HZ = 16000;

/**
 * Replace -Infinity (silence) and out-of-range values so they are safe to
 * upload. The 2016 shaders fed -Infinity straight into the GPU.
 */
export function sanitizeDb(db: Float32Array, minDb: number, maxDb: number): Float32Array {
  for (let i = 0; i < db.length; i++) {
    const v = db[i]!;
    db[i] = v > maxDb ? maxDb : v >= minDb ? v : minDb; // NaN and -Infinity land on the floor
  }
  return db;
}

/** dB → 0..1 between the analyser's floor and ceiling. */
export function normalize(db: number, minDb: number, maxDb: number): number {
  const t = (db - minDb) / (maxDb - minDb);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Resample FFT bins (dB) onto `out.length` texels.
 *
 * 'linear' halves the 2048-point FFT down to 512 bins, matching what the 2016
 * build saw with fftSize 1024 — bass crammed into the first few texels.
 * 'log' spaces texels evenly in pitch from LOG_MIN_HZ to LOG_MAX_HZ, the way
 * we hear: each octave gets the same room.
 */
export function remap(bins: Float32Array, out: Float32Array, scale: Scale, sampleRate: number): Float32Array {
  const n = out.length;
  const binHz = sampleRate / 2 / bins.length;
  if (scale === 'linear') {
    const ratio = bins.length / n;
    for (let i = 0; i < n; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
      let peak = -Infinity;
      for (let b = start; b < end && b < bins.length; b++) peak = Math.max(peak, bins[b]!);
      out[i] = peak;
    }
    return out;
  }

  const span = Math.log(LOG_MAX_HZ / LOG_MIN_HZ);
  const hzAt = (i: number) => LOG_MIN_HZ * Math.exp((span * i) / (n - 1));
  for (let i = 0; i < n; i++) {
    const lo = hzAt(i - 0.5) / binHz;
    const hi = hzAt(i + 0.5) / binHz;
    if (hi - lo < 1) {
      // Low end: several texels share a bin, so interpolate for smooth curves.
      const pos = hzAt(i) / binHz;
      const b = Math.min(Math.floor(pos), bins.length - 2);
      const f = pos - b;
      out[i] = bins[b]! * (1 - f) + bins[b + 1]! * f;
    } else {
      // High end: each texel covers many bins; keep the peak so detail survives.
      let peak = -Infinity;
      const end = Math.min(Math.ceil(hi), bins.length);
      for (let b = Math.max(0, Math.floor(lo)); b < end; b++) peak = Math.max(peak, bins[b]!);
      out[i] = peak;
    }
  }
  return out;
}

/** Mean normalized loudness of FFT bins between two frequencies. */
export function bandEnergy(bins: Float32Array, band: Band, sampleRate: number, minDb: number, maxDb: number): number {
  const binHz = sampleRate / 2 / bins.length;
  const start = Math.max(0, Math.floor(band.lo / binHz));
  const end = Math.min(bins.length, Math.ceil(band.hi / binHz));
  if (end <= start) return 0;
  let sum = 0;
  for (let b = start; b < end; b++) sum += normalize(bins[b]!, minDb, maxDb);
  return sum / (end - start);
}

export function mean(values: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]!;
  return values.length ? sum / values.length : 0;
}
