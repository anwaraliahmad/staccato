import { describe, expect, it } from 'vitest';
import { generate, idFromSeed, seedFromId } from '../src/generate/generator';

describe('generator', () => {
  it('is a pure function of its seed', () => {
    expect(generate(0x3fa9c)).toEqual(generate(0x3fa9c));
    expect(generate(1).vertex).not.toBe(generate(2).vertex);
  });

  it('round-trips ids', () => {
    for (const seed of [0, 1, 0xabcde, 0xfffff]) expect(seedFromId(idFromSeed(seed))).toBe(seed);
    expect(seedFromId('heart')).toBeNull();
  });

  it('always listens to the music', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(generate(seed).vertex).toMatch(/spectrum\(|echo\(|bass|level/);
    }
  });

  it('writes balanced GLSL with float literals', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { vertex, fragment } = generate(seed);
      for (const src of [vertex, fragment]) {
        expect(src.split('(').length).toBe(src.split(')').length);
        expect(src).not.toMatch(/[^\w.]\d+\*/); // a bare integer multiplied: GLSL won't coerce it
      }
    }
  });
});
