import { describe, expect, it } from 'vitest';
import { plane, sphere, wireframe } from '../src/gl/geometry';
import { invert, lookAt, multiply, perspective } from '../src/gl/math';

describe('geometry', () => {
  it('matches three.js vertex and triangle counts', () => {
    const s = sphere(300, 128, 128);
    expect(s.positions.length / 3).toBe(129 * 129);
    expect(s.indices.length / 3).toBe(128 * 128 * 2 - 2 * 128);
    const p = plane(3000, 3000, 32, 32);
    expect(p.positions.length / 3).toBe(33 * 33);
    expect(p.indices.length / 3).toBe(32 * 32 * 2);
  });

  it('dedupes shared edges, keeping the diagonals', () => {
    // A 1x1 plane: two triangles, five unique edges.
    expect(wireframe(plane(1, 1, 1, 1).indices).length / 2).toBe(5);
  });
});

describe('math', () => {
  it('inverts', () => {
    const m = multiply(perspective(90, 1.5, 1, 1000), lookAt([300, 200, 1000], [0, 0, 0], [0, 1, 0]));
    const id = multiply(m, invert(m));
    for (let i = 0; i < 16; i++) expect(id[i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 4);
  });
});
