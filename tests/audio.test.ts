import { describe, expect, it } from 'vitest';
import { bandEnergy, normalize, remap, sanitizeDb } from '../src/audio/spectrum';
import { OnsetDetector } from '../src/audio/onset';

const SR = 48000;

describe('spectrum', () => {
  it('sanitizes silence and NaN onto the floor', () => {
    expect(Array.from(sanitizeDb(new Float32Array([-Infinity, NaN, -50, 10]), -100, -30))).toEqual([-100, -100, -50, -30]);
  });

  it('normalizes and clamps', () => {
    expect(normalize(-65, -100, -30)).toBeCloseTo(0.5);
    expect(normalize(-200, -100, -30)).toBe(0);
    expect(normalize(0, -100, -30)).toBe(1);
  });

  it('log scale puts a 1kHz tone about two thirds of the way along', () => {
    const bins = new Float32Array(1024).fill(-100);
    const binHz = SR / 2 / 1024;
    bins[Math.round(1000 / binHz)] = -30;
    const out = remap(bins, new Float32Array(512), 'log', SR);
    const peak = out.indexOf(Math.max(...out));
    // log(1000/30) / log(16000/30) ≈ 0.558
    expect(peak / 511).toBeGreaterThan(0.5);
    expect(peak / 511).toBeLessThan(0.62);
  });

  it('linear scale keeps peaks when halving resolution', () => {
    const bins = new Float32Array(1024).fill(-100);
    bins[301] = -40;
    expect(remap(bins, new Float32Array(512), 'linear', SR)[150]).toBe(-40);
  });

  it('measures band energy', () => {
    const bins = new Float32Array(1024).fill(-100);
    const binHz = SR / 2 / 1024;
    for (let b = Math.floor(30 / binHz); b < Math.ceil(250 / binHz); b++) bins[b] = -30;
    expect(bandEnergy(bins, { lo: 30, hi: 250 }, SR, -100, -30)).toBeGreaterThan(0.95);
    expect(bandEnergy(bins, { lo: 2000, hi: 16000 }, SR, -100, -30)).toBe(0);
  });
});

describe('onsets', () => {
  const quiet = new Float32Array(64).fill(0.1);
  const loud = new Float32Array(64).fill(0.8);

  it('fire on attacks, not on sustained sound or silence', () => {
    const d = new OnsetDetector();
    const fired: number[] = [];
    for (let i = 0; i < 240; i++) {
      // A note every half second, sustained for 0.2s.
      const t = i / 60;
      const frame = t % 0.5 < 0.2 && t > 0.3 ? loud : quiet;
      if (d.push(frame, t)) fired.push(Math.round(t * 100) / 100);
    }
    expect(fired.length).toBeGreaterThanOrEqual(6);
    expect(fired.length).toBeLessThanOrEqual(8);
    for (const t of fired) expect(t % 0.5).toBeLessThan(0.05);
  });

  it('decays the envelope', () => {
    const d = new OnsetDetector({ decay: 0.1 });
    for (let i = 0; i < 20; i++) d.push(quiet, i / 60);
    expect(d.push(loud, 20 / 60)).toBe(true);
    expect(d.envelope).toBe(1);
    d.push(loud, 20 / 60 + 0.1);
    expect(d.envelope).toBeCloseTo(Math.exp(-1), 2);
  });
});
