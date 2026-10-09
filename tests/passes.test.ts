import { describe, expect, it } from 'vitest';
import { captureLayout, captureShaders, lineShaders, surfaceShaders, MAX_CAPTURE_SLOTS } from '../src/gl/passes';
import { BUILTIN } from '../src/shaders';
import { generate } from '../src/generate/generator';

describe('capture layout', () => {
  it('fits every built-in and a run of generated shaders', () => {
    for (const s of [...BUILTIN, ...Array.from({ length: 50 }, (_, i) => generate(i * 7919))]) {
      const layout = captureLayout(s.vertex);
      expect(layout, s.id).not.toBeNull();
      expect(layout!.slots).toBeLessThanOrEqual(MAX_CAPTURE_SLOTS);
    }
  });

  it('packs varyings across slots and unpacks them symmetrically', () => {
    const vertex = 'varying vec3 a; varying vec2 b; varying float c;\nvoid main() { gl_Position = vec4(0.); }';
    const layout = captureLayout(vertex)!;
    expect(layout.slots).toBe(3); // position + 6 floats in two vec4s
    const cap = captureShaders(vertex, layout).vertex;
    expect(cap).toContain('_c1.w = b.x;');
    expect(cap).toContain('_c2.x = b.y;');
    const lines = lineShaders('void main() { gl_FragColor = vec4(1.); }', layout).vertex;
    expect(lines).toContain('b.x = c1.w;');
    expect(lines).toContain('b.y = c2.x;');
  });

  it('keeps the user source at line 1 in every pass', () => {
    const layout = captureLayout(BUILTIN[0]!.vertex)!;
    for (const pair of [captureShaders(BUILTIN[0]!.vertex, layout), lineShaders(BUILTIN[0]!.fragment, layout), surfaceShaders(BUILTIN[0]!.fragment, layout)]) {
      expect(pair.vertex.startsWith('#version 300 es')).toBe(true);
      expect(pair.fragment.startsWith('#version 300 es')).toBe(true);
    }
    expect(captureShaders(BUILTIN[0]!.vertex, layout).vertex).toMatch(/#line 1\n/);
    expect(lineShaders(BUILTIN[0]!.fragment, layout).fragment).toMatch(/#line 1\n/);
  });
});
