// Source-level GLSL handling, kept free of any WebGL calls so it can be tested.
//
// Every shader gets a prelude (uniforms, attributes, the audio helpers) and is
// compiled as GLSL ES 3.00. Shaders written in the 2016 dialect — no #version,
// `varying`, `gl_FragColor`, `uniform float frequency[512]` indexed with
// `frequency[int(x)]` — are translated in place so they compile unmodified.
// Translation never adds or removes lines, so `#line 1` after the prelude keeps
// compiler errors pointing at the author's own line numbers.

export type Stage = 'vertex' | 'fragment';

/** Width of the spectrum and history textures. Matches the 2016 `frequency[512]`. */
export const BINS = 512;
/** Rows of spectrum history kept on the GPU (~2s at 60fps). */
export const HISTORY = 128;

/** Uniforms Staccato provides to every shader. Re-declaring one is harmless. */
export const PROVIDED_UNIFORMS = [
  'time', 'frequency', 'minDecibels', 'maxDecibels', 'mDb', 'od',
  'size', 'level', 'onset', 'bass', 'mid', 'treble', 'resolution', 'mouse',
  'spectrumTex', 'historyTex', 'historyHead',
  'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition',
] as const;

export const COMMON = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform float time;          // seconds, advances with the frame clock
uniform float size;          // the shape's radius (sphere) or half-width (plane)
uniform float minDecibels;   // analyser floor in dB (default -100)
uniform float maxDecibels;   // analyser ceiling in dB (default -30)
uniform float mDb;           // 2016 alias of minDecibels
uniform float od;            // average dB of the current spectrum (2016)
uniform float level;         // overall loudness, 0..1
uniform float onset;         // 1 on a detected note attack, decays to 0
uniform float bass;          // band energies, 0..1
uniform float mid;
uniform float treble;
uniform vec2 resolution;     // drawing buffer size in pixels
uniform vec2 mouse;          // pointer, -0.5..0.5
uniform sampler2D spectrumTex;
uniform sampler2D historyTex;
uniform float historyHead;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;

// dB of FFT bin 0..511 — the 2016 frequency[int(bin)], clamped like Chrome clamped it.
float frequency(int bin) {
  return texelFetch(spectrumTex, ivec2(clamp(bin, 0, ${BINS - 1}), 0), 0).r;
}
// Same, but interpolated between bins.
float frequency(float bin) {
  return texture(spectrumTex, vec2((bin + 0.5) / ${BINS}.0, 0.5)).r;
}
// Loudness 0..1 at position t (0 = low, 1 = high) along the spectrum.
float spectrum(float t) {
  float db = texture(spectrumTex, vec2(t, 0.5)).r;
  return clamp((db - minDecibels) / (maxDecibels - minDecibels), 0.0, 1.0);
}
// Loudness 0..1 at spectrum position t, 'age' ago (0 = now, 1 = ~2 seconds ago).
float echo(float t, float age) {
  float v = historyHead - clamp(age, 0.0, 1.0) * ${HISTORY - 1}.0 / ${HISTORY}.0;
  return texture(historyTex, vec2(t, v)).r;
}
`;

// Objects can be drawn many times (a colonnade, a row of louvers). Each copy's
// transform lives in a texture; the matrices shaders know from 2016 are set
// per copy before their main() runs, and \`instance\` says which copy, 0..1.
export const INSTANCE_GLSL = /* glsl */ `
uniform mat4 staccato_objectMatrix;
uniform highp sampler2D staccato_instances;
uniform float staccato_instanceCount;
mat4 modelMatrix;
mat4 modelViewMatrix;
mat3 normalMatrix;
float instance;
void staccato_setupInstance(int i) {
  mat4 m = mat4(
    texelFetch(staccato_instances, ivec2(0, i), 0),
    texelFetch(staccato_instances, ivec2(1, i), 0),
    texelFetch(staccato_instances, ivec2(2, i), 0),
    texelFetch(staccato_instances, ivec2(3, i), 0));
  modelMatrix = staccato_objectMatrix * m;
  modelViewMatrix = viewMatrix * modelMatrix;
  normalMatrix = mat3(modelViewMatrix);
  instance = staccato_instanceCount > 1.0 ? float(i) / (staccato_instanceCount - 1.0) : 0.0;
}
`;

export const VERTEX_PRELUDE = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec2 uv;
${INSTANCE_GLSL}`;


export function isClassic(source: string): boolean {
  return !/^\s*#version/.test(source);
}

/**
 * Translate the 2016 dialect to GLSL ES 3.00 without changing line structure.
 * Sources that start with `#version 300 es` only lose that line (the prelude
 * supplies it) and duplicate uniform declarations.
 */
export function translate(source: string, stage: Stage): string {
  let src = source;
  const classic = isClassic(src);
  if (!classic) {
    // Keep the line, drop the directive: the prelude already declared it.
    src = src.replace(/^(\s*)#version[^\n]*/, '$1');
  }

  // Strip re-declarations of uniforms the prelude provides — leaves the line in place.
  src = src.replace(
    /^([ \t]*)uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)\s*(\[[^\]]*\])?\s*;([^\n]*)$/gm,
    (whole, indent: string, name: string) =>
      (PROVIDED_UNIFORMS as readonly string[]).includes(name) ? `${indent}// provided: ${name}` : whole,
  );

  if (classic) {
    src = src.replace(/\btexture2D\b/g, 'texture');
    if (stage === 'vertex') {
      src = src.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, 'out');
    } else {
      src = src.replace(/\bvarying\b/g, 'in').replace(/\bgl_FragColor\b/g, 'fragColor');
    }
  }

  if (stage === 'fragment') {
    // Staccato adds a second (glow) output, so the color output needs a location.
    src = src.replace(/^([ \t]*)out(\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+\w+\s*;)/m, '$1layout(location = 0) out$2');
  }

  return rewriteFrequencyIndexing(src);
}

/** `frequency[expr]` → `frequency(expr)`, respecting nested brackets. */
export function rewriteFrequencyIndexing(src: string): string {
  const re = /\bfrequency\s*\[/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') depth--;
    }
    if (depth !== 0) break; // unbalanced: leave it for the compiler to report
    out += src.slice(last, m.index) + 'frequency(' + src.slice(re.lastIndex, i - 1) + ')';
    last = i;
    re.lastIndex = i;
  }
  return out + src.slice(last);
}

/** Wrapper code after the user's source is numbered from here, so its errors are recognizable. */
export const WRAPPER_LINE = 10000;

/** Full source handed to the GL compiler, for drawing the user's shaders directly. */
export function assemble(source: string, stage: Stage): string {
  const body = translate(source, stage);
  if (stage === 'fragment') return `#version 300 es\n${COMMON}${fragmentPrelude(body)}\n#line 1\n${body}`;
  return `#version 300 es\n${COMMON}${VERTEX_PRELUDE}\n#line 1\n${renameMain(body)}
#line ${WRAPPER_LINE}
void main() {
  staccato_setupInstance(gl_InstanceID);
  staccato_user_main();
}
`;
}

/**
 * The user's color output. 2016-style shaders write gl_FragColor (translated to
 * fragColor, which the prelude declares); ES 3.00 shaders may declare their own.
 */
export function fragmentOutput(translated: string): string {
  const m = /^[ \t]*(?:layout\s*\([^)]*\)\s*)?out\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)\s*;/m.exec(translated);
  return m ? m[1]! : 'fragColor';
}

export function fragmentPrelude(translated: string): string {
  return fragmentOutput(translated) === 'fragColor' ? '\nlayout(location = 0) out vec4 fragColor;\n' : '\n';
}

export interface Varying {
  name: string;
  /** Component count: float 1 … vec4 4. */
  size: 1 | 2 | 3 | 4;
  type: 'float' | 'vec2' | 'vec3' | 'vec4';
}

/**
 * The `out` variables of a translated vertex shader, or null if any of them is
 * a type the capture passes can't carry (ints, matrices, arrays, flat).
 */
export function vertexVaryings(translated: string): Varying[] | null {
  const varyings: Varying[] = [];
  // A declaration starts a line or follows another statement's semicolon.
  const decl = /(?<=^|;)\s*((?:(?:flat|smooth|centroid|invariant|lowp|mediump|highp)\s+)*)out\s+(\w+)\s+([^;]+);/gm;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(stripComments(translated)))) {
    const qualifiers = m[1]!;
    const type = m[2]!;
    if (/\bflat\b/.test(qualifiers)) return null;
    if (type !== 'float' && type !== 'vec2' && type !== 'vec3' && type !== 'vec4') return null;
    for (const raw of m[3]!.split(',')) {
      const name = raw.trim();
      if (!/^\w+$/.test(name)) return null; // arrays, initializers
      varyings.push({ name, type, size: type === 'float' ? 1 : (Number(type[3]) as 2 | 3 | 4) });
    }
  }
  return varyings;
}

/** Rename the entry point so a wrapper can call it. Line structure is preserved. */
export function renameMain(source: string, to = 'staccato_user_main'): string {
  return source.replace(/\bvoid\s+main\s*\(\s*(?:void\s*)?\)/, `void ${to}()`);
}

/** Replace comments with spaces (keeping newlines) so declarations can be scanned. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (c) => ' '.repeat(c.length));
}

export interface CompileError {
  stage: Stage;
  /** 1-based line in the author's source, or 0 if unknown (e.g. link errors). */
  line: number;
  message: string;
}

/** Parse an info log ("ERROR: 0:12: 'x' : undeclared identifier") into structured errors. */
export function parseInfoLog(log: string, stage: Stage): CompileError[] {
  const errors: CompileError[] = [];
  for (const raw of log.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/.exec(line);
    if (m) {
      const n = Number(m[1]);
      // Lines past WRAPPER_LINE are Staccato's own code around the user's shader.
      if (n >= WRAPPER_LINE) errors.push({ stage, line: 0, message: `(staccato) ${m[2]!.trim()}` });
      else errors.push({ stage, line: n, message: m[2]!.trim() });
    }
    else if (!/^\W*$/.test(line)) errors.push({ stage, line: 0, message: line });
  }
  return errors;
}
