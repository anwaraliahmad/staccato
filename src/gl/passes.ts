// Shader generation for the three passes that turn a user's shader pair into
// anti-aliased wireframe and liquid chrome.
//
//   capture  The user's vertex shader runs once per vertex as a point drawn into
//            float textures: clip position in one, its varyings packed into the
//            rest. The textures are laid out like the mesh grid, so texel (x, y)
//            is grid vertex (x, y).
//   lines    Every edge becomes a screen-space quad of any width with analytic
//            anti-aliasing. Endpoints and varyings come from the capture, so the
//            user's fragment shader runs unmodified and still sees its varyings.
//   surface  The mesh's triangles, with smooth normals rebuilt from each vertex's
//            displaced grid neighbours, shaded as iridescent chrome reflecting a
//            procedural studio, tinted by the user's fragment color.
//
// Everything is plain source generation (no GL calls) so it can be tested.

import {
  COMMON, VERTEX_PRELUDE, WRAPPER_LINE, fragmentOutput, fragmentPrelude, renameMain, translate, vertexVaryings,
  type Varying,
} from './glsl';

/** Capture textures: one for position, up to three for varyings (MAX_DRAW_BUFFERS ≥ 4). */
export const MAX_CAPTURE_SLOTS = 4;
/** Width of the edge-list texture. */
export const EDGE_TEXTURE_WIDTH = 1024;

const COMPONENTS = 'xyzw';

export interface CaptureLayout {
  varyings: Varying[];
  /** Total capture textures, position included. */
  slots: number;
}

/** Plan where each varying component lives, or null if they don't fit. */
export function captureLayout(vertexSource: string): CaptureLayout | null {
  const varyings = vertexVaryings(translate(vertexSource, 'vertex'));
  if (!varyings) return null;
  const floats = varyings.reduce((n, v) => n + v.size, 0);
  const slots = 1 + Math.ceil(floats / 4);
  return slots <= MAX_CAPTURE_SLOTS ? { varyings, slots } : null;
}

/** `[slot, component]` for every float of every varying, in order. */
function components(layout: CaptureLayout): { varying: Varying; index: number; slot: number; comp: string }[] {
  const out: { varying: Varying; index: number; slot: number; comp: string }[] = [];
  let k = 0;
  for (const varying of layout.varyings) {
    for (let index = 0; index < varying.size; index++, k++) {
      out.push({ varying, index, slot: 1 + Math.floor(k / 4), comp: COMPONENTS[k % 4]! });
    }
  }
  return out;
}

const access = (v: Varying, i: number) => (v.size === 1 ? v.name : `${v.name}.${COMPONENTS[i]}`);

// ——— capture ———

export function captureShaders(vertexSource: string, layout: CaptureLayout): { vertex: string; fragment: string } {
  const user = renameMain(translate(vertexSource, 'vertex'));
  const slots = Array.from({ length: layout.slots }, (_, i) => i);
  const pack = components(layout).map((c) => `  _c${c.slot}.${c.comp} = ${access(c.varying, c.index)};`).join('\n');

  const vertex = `#version 300 es
${COMMON}${VERTEX_PRELUDE}
#line 1
${user}
#line ${WRAPPER_LINE}
uniform ivec2 staccato_grid;
${slots.map((i) => `flat out vec4 _c${i};`).join('\n')}
void main() {
  staccato_user_main();
${slots.slice(1).map((i) => `  _c${i} = vec4(0.0);`).join('\n')}
  _c0 = gl_Position;
${pack}
  ivec2 cell = ivec2(gl_VertexID % staccato_grid.x, gl_VertexID / staccato_grid.x);
  gl_Position = vec4((vec2(cell) + 0.5) / vec2(staccato_grid) * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`;

  const fragment = `#version 300 es
precision highp float;
${slots.map((i) => `flat in vec4 _c${i};\nlayout(location = ${i}) out vec4 _o${i};`).join('\n')}
void main() {
${slots.map((i) => `  _o${i} = _c${i};`).join('\n')}
}
`;
  return { vertex, fragment };
}

// ——— shared pieces of the draw passes ———

function captureSamplers(layout: CaptureLayout): string {
  return Array.from({ length: layout.slots }, (_, i) => `uniform highp sampler2D staccato_cap${i};`).join('\n');
}

/** Declares the user's varyings as outputs and a function that fills them for a vertex. */
function unpackVaryings(layout: CaptureLayout): string {
  const decls = layout.varyings.map((v) => `out ${v.type} ${v.name};`).join('\n');
  const fetches = Array.from({ length: layout.slots - 1 }, (_, i) => `  vec4 c${i + 1} = texelFetch(staccato_cap${i + 1}, cell, 0);`).join('\n');
  const assigns = components(layout).map((c) => `  ${access(c.varying, c.index)} = c${c.slot}.${c.comp};`).join('\n');
  return `${decls}
void staccato_unpack(ivec2 cell) {
${fetches}
${assigns}
}`;
}

/** The user's fragment shader with its main renamed, ready to be wrapped. */
function userFragment(fragmentSource: string): { body: string; out: string } {
  const translated = translate(fragmentSource, 'fragment');
  return { body: renameMain(translated), out: fragmentOutput(translated) };
}

// Procedural studio environment: a gradient sky with a bright horizon, softbox
// strips that turn slowly and pulse with the bass, and an overhead ring light.
// Chrome only looks like chrome if it has something worth reflecting.
export const ENVIRONMENT = /* glsl */ `
uniform vec3 staccato_skyTop;
uniform vec3 staccato_skyHorizon;
uniform vec3 staccato_skyBottom;
uniform vec3 staccato_lightA;
uniform vec3 staccato_lightB;

vec3 staccato_sky(vec3 d) {
  float y = clamp(d.y, -1.0, 1.0);
  vec3 c = y > 0.0
    ? mix(staccato_skyHorizon, staccato_skyTop, pow(y, 0.55))
    : mix(staccato_skyHorizon, staccato_skyBottom, pow(-y, 0.4));
  return c;
}

vec3 staccato_environment(vec3 d) {
  vec3 c = staccato_sky(d);
  float y = d.y;
  float az = atan(d.z, d.x);
  // Hard chrome horizon.
  c += staccato_skyHorizon * 0.9 * exp(-abs(y + 0.02) * 60.0);
  // Softbox strips.
  float strips = smoothstep(0.93, 0.975, cos(az * 3.0 + time * 0.07))
    * smoothstep(0.05, 0.25, y) * smoothstep(0.85, 0.55, y);
  c += strips * staccato_lightA * (1.4 + bass * 2.5);
  // A low counter-light, warm against the cool strips.
  float low = smoothstep(0.985, 0.999, cos(az - 2.2 - time * 0.03)) * smoothstep(-0.05, -0.2, y) * smoothstep(-0.6, -0.3, y);
  c += low * staccato_lightB * (1.0 + treble * 3.0);
  // Ring light overhead; flares on note attacks.
  c += smoothstep(0.03, 0.0, abs(y - 0.93)) * staccato_lightA * (0.8 + onset * 2.0);
  return c;
}
`;

// ——— lines ———

export function lineShaders(fragmentSource: string, layout: CaptureLayout): { vertex: string; fragment: string } {
  const vertex = `#version 300 es
${COMMON}
${captureSamplers(layout)}
uniform highp usampler2D staccato_edges;
uniform float staccato_lineWidth; // device pixels
${unpackVaryings(layout)}
out float staccato_across;
out float staccato_halfWidth;

// Two triangles per edge: (endpoint, side) for each of the six corners.
const ivec2 CORNERS[6] = ivec2[6](ivec2(0, -1), ivec2(1, -1), ivec2(1, 1), ivec2(0, -1), ivec2(1, 1), ivec2(0, 1));

ivec2 cellOf(uint v, int width) {
  return ivec2(int(v) % width, int(v) / width);
}

void main() {
  int edge = gl_VertexID / 6;
  ivec2 corner = CORNERS[gl_VertexID % 6];
  uvec2 ab = texelFetch(staccato_edges, ivec2(edge % ${EDGE_TEXTURE_WIDTH}, edge / ${EDGE_TEXTURE_WIDTH}), 0).xy;
  int width = textureSize(staccato_cap0, 0).x;
  ivec2 cellA = cellOf(ab.x, width);
  ivec2 cellB = cellOf(ab.y, width);
  vec4 a = texelFetch(staccato_cap0, cellA, 0);
  vec4 b = texelFetch(staccato_cap0, cellB, 0);
  ivec2 cell = corner.x == 0 ? cellA : cellB;
  staccato_unpack(cell);

  // Behind the camera, or a broken vertex: drop the whole segment.
  if (a.w <= 1e-3 || b.w <= 1e-3 || any(isnan(a)) || any(isnan(b))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    staccato_across = 0.0;
    staccato_halfWidth = 0.0;
    return;
  }

  vec2 half_ = resolution * 0.5;
  vec2 sa = a.xy / a.w * half_;
  vec2 sb = b.xy / b.w * half_;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  float hw = staccato_lineWidth * 0.5;
  float reach = hw + 1.0; // one pixel of feather for the anti-aliasing
  vec2 offset = normal * float(corner.y) * reach + dir * (corner.x == 0 ? -1.0 : 1.0) * 0.5;

  vec4 p = corner.x == 0 ? a : b;
  gl_Position = p;
  gl_Position.xy += offset / half_ * p.w;
  gl_Position.z -= 0.0004 * p.w; // sit just in front of a chrome surface underneath
  staccato_across = float(corner.y) * reach;
  staccato_halfWidth = hw;
}
`;

  const user = userFragment(fragmentSource);
  const fragment = `#version 300 es
${COMMON}${fragmentPrelude(translate(fragmentSource, 'fragment'))}
#line 1
${user.body}
#line ${WRAPPER_LINE}
in float staccato_across;
in float staccato_halfWidth;
uniform float staccato_lineAlpha;
uniform float staccato_glow;
layout(location = 1) out vec4 staccato_bloom;
void main() {
  staccato_user_main();
  // Analytic coverage: a pixel-wide ramp at the edge of the quad.
  float coverage = clamp(staccato_halfWidth + 0.5 - abs(staccato_across), 0.0, 1.0);
  vec4 c = ${user.out};
  // 2016 shaders happily output tan() and dB-sized values; keep them from blinding the bloom.
  c.rgb = clamp(c.rgb, 0.0, 1.25);
  float alpha = clamp(c.a, 0.0, 1.0) * coverage * staccato_lineAlpha;
  ${user.out} = vec4(c.rgb, alpha);
  staccato_bloom = vec4(c.rgb * staccato_glow, alpha);
}
`;
  return { vertex, fragment };
}

// ——— surface ———

export function surfaceShaders(fragmentSource: string, layout: CaptureLayout): { vertex: string; fragment: string } {
  const vertex = `#version 300 es
${COMMON}
${captureSamplers(layout)}
in vec3 normal;
uniform mat4 staccato_inverseProjection;
uniform bool staccato_wrapX; // the sphere's first and last columns are the same seam
${unpackVaryings(layout)}
out vec3 staccato_viewPosition;
out vec3 staccato_viewNormal;

vec3 viewAt(ivec2 cell) {
  vec4 v = staccato_inverseProjection * texelFetch(staccato_cap0, cell, 0);
  return v.xyz / v.w;
}

void main() {
  ivec2 grid = textureSize(staccato_cap0, 0);
  ivec2 cell = ivec2(gl_VertexID % grid.x, gl_VertexID / grid.x);
  staccato_unpack(cell);
  vec4 clip = texelFetch(staccato_cap0, cell, 0);
  vec3 p = viewAt(cell);

  int left = cell.x - 1, right = cell.x + 1;
  if (staccato_wrapX) {
    if (left < 0) left = grid.x - 2;
    if (right > grid.x - 1) right = 1;
  } else {
    left = max(left, 0);
    right = min(right, grid.x - 1);
  }
  int up = max(cell.y - 1, 0), down = min(cell.y + 1, grid.y - 1);
  vec3 du = viewAt(ivec2(right, cell.y)) - viewAt(ivec2(left, cell.y));
  vec3 dv = viewAt(ivec2(cell.x, down)) - viewAt(ivec2(cell.x, up));

  vec3 base = normalize(normalMatrix * normal);
  vec3 n = cross(du, dv);
  n = dot(n, n) > 1e-8 ? normalize(n) : base;
  if (dot(n, base) < 0.0) n = -n;

  staccato_viewPosition = p;
  staccato_viewNormal = n;
  gl_Position = (clip.w <= 1e-3 || any(isnan(clip))) ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
}
`;

  const user = userFragment(fragmentSource);
  const fragment = `#version 300 es
${COMMON}${fragmentPrelude(translate(fragmentSource, 'fragment'))}
#line 1
${user.body}
#line ${WRAPPER_LINE}
uniform float staccato_tint;
uniform float staccato_glow;
in vec3 staccato_viewPosition;
in vec3 staccato_viewNormal;
layout(location = 1) out vec4 staccato_bloom;
${ENVIRONMENT}
void main() {
  staccato_user_main();
  vec3 tint = clamp(${user.out}.rgb, 0.0, 1.0);

  vec3 n = normalize(staccato_viewNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(-staccato_viewPosition);
  float facing = clamp(dot(n, v), 0.0, 1.0);
  // View space back to world: the view matrix's rotation is orthonormal.
  mat3 toWorld = transpose(mat3(viewMatrix));
  vec3 r = toWorld * reflect(-v, n);
  vec3 env = staccato_environment(r);

  // Thin-film iridescence, strongest at grazing angles, shifted by the music.
  float film = (1.0 - facing) * 2.2 + spectrum(0.15 + 0.7 * facing) * 0.6 + time * 0.03;
  vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (film + vec3(0.0, 0.33, 0.67)));
  float fresnel = 0.55 + 0.45 * pow(1.0 - facing, 3.0);

  vec3 metal = mix(vec3(0.92, 0.93, 1.0), iridescence, 0.55 * (1.0 - facing * 0.6));
  metal = mix(metal, metal * (0.35 + tint * 1.3), staccato_tint);
  vec3 color = env * metal * fresnel;
  // A little of the sky in the shadows, so dark sides aren't dead.
  color += staccato_sky(toWorld * n) * 0.08;

  ${user.out} = vec4(color, 1.0);
  // Only the hot highlights bloom.
  staccato_bloom = vec4(max(color - 0.85, 0.0) * staccato_glow * 2.0, 1.0);
}
`;
  return { vertex, fragment };
}

// ——— background ———

export const BACKGROUND_SHADERS = {
  vertex: `#version 300 es
precision highp float;
out vec2 staccato_ndc;
void main() {
  // One oversized triangle covers the screen.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  staccato_ndc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}
`,
  fragment: `#version 300 es
${COMMON}
${ENVIRONMENT}
uniform mat4 staccato_inverseViewProjection;
in vec2 staccato_ndc;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 staccato_bloom;
void main() {
  vec4 near = staccato_inverseViewProjection * vec4(staccato_ndc, -1.0, 1.0);
  vec4 far = staccato_inverseViewProjection * vec4(staccato_ndc, 1.0, 1.0);
  vec3 d = normalize(far.xyz / far.w - near.xyz / near.w);
  // The backdrop is the sky without its lights: soft, so the chrome carries the sparkle.
  vec3 c = staccato_sky(d);
  c += staccato_skyHorizon * 0.25 * exp(-abs(d.y) * 12.0);
  color = vec4(c, 1.0);
  staccato_bloom = vec4(0.0);
}
`,
};
