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

import { GEOMETRIES, build, superellipsoid, torus } from '../src/gl/geometry';
import { compose } from '../src/gl/math';

describe('parametric shapes', () => {
  it('build every library shape as a closed-or-open grid', () => {
    for (const [name, spec] of Object.entries(GEOMETRIES)) {
      const g = build(spec);
      expect(g.positions.length / 3, name).toBe(g.cols * g.rows);
      expect(g.indices.length, name).toBe((g.cols - 1) * (g.rows - 1) * 6 - (spec.kind === 'sphere' ? 2 * 3 * (g.cols - 1) : 0));
      expect(Number.isFinite(g.radius) && g.radius > 0, name).toBe(true);
      for (const v of g.normals) expect(Number.isFinite(v), name).toBe(true);
    }
  });

  it('wrap where they close', () => {
    const t = torus(300, 50, 16, 8);
    expect([t.wrapX, t.wrapY]).toEqual([true, true]);
    // The seam column repeats the first.
    expect(t.positions[0]).toBeCloseTo(t.positions[(t.cols - 1) * 3]!, 3);
  });

  it('normals point outward', () => {
    const g = superellipsoid([100, 200, 100], 0.5, 1, 24, 24);
    for (let i = 0; i < g.positions.length; i += 3) {
      const dot = g.positions[i]! * g.normals[i]! + g.positions[i + 1]! * g.normals[i + 1]! + g.positions[i + 2]! * g.normals[i + 2]!;
      expect(dot).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('a superellipsoid at (1, 1) is a sphere', () => {
    const g = superellipsoid([100, 100, 100], 1, 1, 16, 16);
    for (let i = 0; i < g.positions.length; i += 3) {
      expect(Math.hypot(g.positions[i]!, g.positions[i + 1]!, g.positions[i + 2]!)).toBeCloseTo(100, 3);
    }
  });
});

describe('compose', () => {
  it('rotates then translates', () => {
    const m = compose([10, 0, 0], [0, Math.PI / 2, 0], 2);
    // (1,0,0) scaled by 2, turned 90° about Y → (0,0,-2), moved by +10 in x.
    const x = m[0]! * 1 + m[12]!, z = m[2]! * 1 + m[14]!;
    expect(x).toBeCloseTo(10, 6);
    expect(z).toBeCloseTo(-2, 6);
  });
});
