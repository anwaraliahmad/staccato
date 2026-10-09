import { describe, expect, it } from 'vitest';
import { assemble, fragmentOutput, parseInfoLog, rewriteFrequencyIndexing, translate, vertexVaryings, WRAPPER_LINE } from '../src/gl/glsl';
import heartVert from '../src/shaders/heart.vert?raw';
import heartFrag from '../src/shaders/heart.frag?raw';

describe('translate', () => {
  it('turns the 2016 dialect into GLSL ES 3.00 without moving any line', () => {
    for (const [src, stage] of [[heartVert, 'vertex'], [heartFrag, 'fragment']] as const) {
      const out = translate(src, stage);
      expect(out.split('\n').length).toBe(src.split('\n').length);
      expect(out).not.toMatch(/\bvarying\b|\bgl_FragColor\b|frequency\s*\[/);
    }
  });

  it('strips re-declared provided uniforms but keeps unknown ones', () => {
    const out = translate('uniform float time;\nuniform float frequency[512]; // FFT\nuniform float drop;\n', 'fragment');
    expect(out).toContain('// provided: time');
    expect(out).toContain('// provided: frequency');
    expect(out).toContain('uniform float drop;');
  });

  it('gives a user-declared color output an explicit location', () => {
    const out = translate('#version 300 es\nout vec4 color;\nvoid main() { color = vec4(1.); }', 'fragment');
    expect(out).toContain('layout(location = 0) out vec4 color;');
    expect(fragmentOutput(out)).toBe('color');
  });
});

describe('rewriteFrequencyIndexing', () => {
  it('handles nested brackets', () => {
    expect(rewriteFrequencyIndexing('frequency[int(a[1])] + frequency [2]')).toBe('frequency(int(a[1])) + frequency(2)');
  });
});

describe('vertexVaryings', () => {
  it('finds outputs, including comma lists', () => {
    expect(vertexVaryings('out vec2 vUv;\nout float d, e; // c\n')).toEqual([
      { name: 'vUv', type: 'vec2', size: 2 },
      { name: 'd', type: 'float', size: 1 },
      { name: 'e', type: 'float', size: 1 },
    ]);
  });

  it('refuses what the capture cannot carry', () => {
    expect(vertexVaryings('flat out float a;')).toBeNull();
    expect(vertexVaryings('out mat3 m;')).toBeNull();
    expect(vertexVaryings('out float a[2];')).toBeNull();
  });

  it('ignores commented-out declarations', () => {
    expect(vertexVaryings('// out vec3 nope;\n/* out vec4 no; */ out float yes;')).toEqual([{ name: 'yes', type: 'float', size: 1 }]);
  });
});

describe('errors', () => {
  it('map to the author\'s lines, and flag the wrapper\'s own', () => {
    const src = assemble('void main() { gl_Position = vec4(0.); }', 'vertex');
    expect(src.split('\n').indexOf('#line 1')).toBeGreaterThan(0);
    expect(parseInfoLog(`ERROR: 0:3: 'x' : undeclared identifier\nERROR: 0:${WRAPPER_LINE + 2}: boom\n`, 'vertex')).toEqual([
      { stage: 'vertex', line: 3, message: "'x' : undeclared identifier" },
      { stage: 'vertex', line: 0, message: '(staccato) boom' },
    ]);
  });
});
