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
  COMMON, INSTANCE_GLSL, VERTEX_PRELUDE, WRAPPER_LINE, fragmentOutput, fragmentPrelude, renameMain, translate, vertexVaryings,
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
  staccato_setupInstance(gl_InstanceID);
  staccato_user_main();
${slots.slice(1).map((i) => `  _c${i} = vec4(0.0);`).join('\n')}
  _c0 = gl_Position;
${pack}
  // Copies stack downward in the capture: copy i owns rows [i·rows, (i+1)·rows).
  ivec2 cell = ivec2(gl_VertexID % staccato_grid.x, gl_VertexID / staccato_grid.x + gl_InstanceID * staccato_grid.y);
  ivec2 size = ivec2(staccato_grid.x, staccato_grid.y * int(staccato_instanceCount));
  gl_Position = vec4((vec2(cell) + 0.5) / vec2(size) * 2.0 - 1.0, 0.0, 1.0);
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

// The world every look is a memory of: a sky with a sun and a horizon haze,
// optionally water below it, optionally a studio's softboxes and ring light.
// The backdrop, the chrome and the glass all see this same function, which is
// what makes reflective things look like they belong in the scene.
export const ENVIRONMENT = /* glsl */ `
uniform vec3 staccato_skyTop;
uniform vec3 staccato_skyHorizon;
uniform vec3 staccato_skyBottom;
uniform vec3 staccato_sunDirection;
uniform vec3 staccato_sunColor;
uniform float staccato_sunSize;   // angular radius, radians
uniform float staccato_haze;
uniform vec3 staccato_water;
uniform float staccato_ocean;     // 0: no water, 1: water to the horizon
uniform float staccato_studio;    // softbox strength
uniform vec3 staccato_lightA;
uniform vec3 staccato_lightB;

vec3 staccato_sky(vec3 d) {
  float y = clamp(d.y, -1.0, 1.0);
  vec3 c = y > 0.0
    ? mix(staccato_skyHorizon, staccato_skyTop, pow(y, 0.35))
    : mix(staccato_skyHorizon, staccato_skyBottom, pow(-y, 0.4));
  float s = max(dot(d, staccato_sunDirection), 0.0);
  // Glow around the sun, then the disc itself, well into HDR so it blooms.
  c += staccato_sunColor * (pow(s, 5.0) * 0.18 + pow(s, 64.0) * 0.55);
  float r = staccato_sunSize;
  c += staccato_sunColor * 5.0 * smoothstep(cos(r * 1.6), cos(r), s);
  // Haze hugging the horizon.
  return mix(c, staccato_skyHorizon + staccato_sunColor * pow(s, 3.0) * 0.25, staccato_haze * exp(-abs(y) * 22.0));
}

vec3 staccato_environment(vec3 d) {
  vec3 c = staccato_sky(d);
  if (d.y < 0.0 && staccato_ocean > 0.0) {
    // Water as a reflection sees it: the mirrored sky over deep colour.
    float f = 0.02 + 0.98 * pow(1.0 + d.y, 5.0);
    c = mix(c, mix(staccato_water, staccato_sky(vec3(d.x, -d.y, d.z)), f), staccato_ocean);
  }
  float y = d.y;
  float az = atan(d.z, d.x);
  // Softbox strips.
  float strips = smoothstep(0.93, 0.975, cos(az * 3.0 + time * 0.07))
    * smoothstep(0.05, 0.25, y) * smoothstep(0.85, 0.55, y);
  c += strips * staccato_lightA * (1.4 + bass * 2.5) * staccato_studio;
  // A low counter-light against the strips.
  float low = smoothstep(0.985, 0.999, cos(az - 2.2 - time * 0.03)) * smoothstep(-0.05, -0.2, y) * smoothstep(-0.6, -0.3, y);
  c += low * staccato_lightB * (1.0 + treble * 3.0) * staccato_studio;
  // Ring light overhead; flares on note attacks.
  c += smoothstep(0.03, 0.0, abs(y - 0.93)) * staccato_lightA * (0.8 + onset * 2.0) * staccato_studio;
  return c;
}
`;

// Distance fog toward the horizon colour: far wires dissolve into the air.
const FOG = /* glsl */ `
uniform float staccato_fog;
float staccato_fogAmount(float distance) {
  return 1.0 - exp(-distance * staccato_fog);
}
`;

// ——— lines ———

export function lineShaders(fragmentSource: string, layout: CaptureLayout): { vertex: string; fragment: string } {
  const vertex = `#version 300 es
${COMMON}
${captureSamplers(layout)}
uniform highp usampler2D staccato_edges;
uniform float staccato_lineWidth; // device pixels
uniform int staccato_rows;        // grid rows per copy
${unpackVaryings(layout)}
out float staccato_across;
out float staccato_halfWidth;
out float staccato_depth;

// Two triangles per edge: (endpoint, side) for each of the six corners.
const ivec2 CORNERS[6] = ivec2[6](ivec2(0, -1), ivec2(1, -1), ivec2(1, 1), ivec2(0, -1), ivec2(1, 1), ivec2(0, 1));

ivec2 cellOf(uint v, int width) {
  return ivec2(int(v) % width, int(v) / width + gl_InstanceID * staccato_rows);
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
  staccato_depth = 0.0;

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
  gl_Position.z -= 0.0004 * p.w; // sit just in front of a surface underneath
  staccato_across = float(corner.y) * reach;
  staccato_halfWidth = hw;
  staccato_depth = p.w; // clip w is distance along the view axis
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
in float staccato_depth;
uniform float staccato_lineAlpha;
uniform float staccato_glow;
uniform vec3 staccato_wireColor;
uniform float staccato_wireTint;
uniform vec3 staccato_skyHorizon;
layout(location = 1) out vec4 staccato_bloom;
${FOG}
void main() {
  staccato_user_main();
  // Analytic coverage: a pixel-wide ramp at the edge of the quad.
  float coverage = clamp(staccato_halfWidth + 0.5 - abs(staccato_across), 0.0, 1.0);
  vec4 c = ${user.out};
  // 2016 shaders happily output tan() and dB-sized values; keep them from blinding the bloom.
  c.rgb = clamp(c.rgb, 0.0, 1.25);
  // Some looks draw every wire in one ink, keeping only the shader's brightness.
  float ink = clamp(dot(c.rgb, vec3(0.3, 0.5, 0.2)) * 0.6 + 0.55, 0.0, 1.2);
  c.rgb = mix(c.rgb, staccato_wireColor * ink, staccato_wireTint);
  float fog = staccato_fogAmount(staccato_depth);
  c.rgb = mix(c.rgb, staccato_skyHorizon, fog * 0.6);
  float alpha = clamp(c.a, 0.0, 1.0) * coverage * staccato_lineAlpha * (1.0 - fog);
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
${INSTANCE_GLSL}
${captureSamplers(layout)}
in vec3 normal;
uniform mat4 staccato_inverseProjection;
uniform ivec2 staccato_grid;   // cols, rows per copy
uniform bvec2 staccato_wrap;   // closed in u / v: the last column/row repeats the first
${unpackVaryings(layout)}
out vec3 staccato_viewPosition;
out vec3 staccato_viewNormal;

int base;

vec3 viewAt(ivec2 cell) {
  vec4 v = staccato_inverseProjection * texelFetch(staccato_cap0, ivec2(cell.x, cell.y + base), 0);
  return v.xyz / v.w;
}

int neighbour(int i, int step, int count, bool wrap) {
  int j = i + step;
  if (wrap) {
    if (j < 0) return count - 2;
    if (j > count - 1) return 1;
    return j;
  }
  return clamp(j, 0, count - 1);
}

void main() {
  staccato_setupInstance(gl_InstanceID);
  ivec2 grid = staccato_grid;
  base = gl_InstanceID * grid.y;
  ivec2 local = ivec2(gl_VertexID % grid.x, gl_VertexID / grid.x);
  ivec2 cell = ivec2(local.x, local.y + base);
  staccato_unpack(cell);
  vec4 clip = texelFetch(staccato_cap0, cell, 0);
  vec3 p = viewAt(local);

  int left = neighbour(local.x, -1, grid.x, staccato_wrap.x), right = neighbour(local.x, 1, grid.x, staccato_wrap.x);
  int up = neighbour(local.y, -1, grid.y, staccato_wrap.y), down = neighbour(local.y, 1, grid.y, staccato_wrap.y);
  vec3 du = viewAt(ivec2(right, local.y)) - viewAt(ivec2(left, local.y));
  vec3 dv = viewAt(ivec2(local.x, down)) - viewAt(ivec2(local.x, up));

  vec3 n0 = normalize(normalMatrix * normal);
  vec3 n = cross(du, dv);
  n = dot(n, n) > 1e-8 ? normalize(n) : n0;
  if (dot(n, n0) < 0.0) n = -n;

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
uniform int staccato_material;       // 0 chrome, 1 glass, 2 paint
uniform sampler2D staccato_behind;   // the frame so far, mipmapped, for refraction
uniform float staccato_frost;        // blur of what's seen through glass (mip level)
uniform vec3 staccato_glassTint;
uniform vec3 staccato_metal;
uniform float staccato_iridescence;
in vec3 staccato_viewPosition;
in vec3 staccato_viewNormal;
layout(location = 1) out vec4 staccato_bloom;
${ENVIRONMENT}
${FOG}
void main() {
  staccato_user_main();
  vec3 tint = clamp(${user.out}.rgb, 0.0, 1.0);

  vec3 n = normalize(staccato_viewNormal);
  vec3 v = normalize(-staccato_viewPosition);
  // Inside faces of glass, and the far side of open surfaces, face the viewer too.
  if (dot(n, v) < 0.0) n = -n;
  float facing = clamp(dot(n, v), 0.0, 1.0);
  // View space back to world: the view matrix's rotation is orthonormal.
  mat3 toWorld = transpose(mat3(viewMatrix));
  vec3 r = toWorld * reflect(-v, n);
  vec3 env = staccato_environment(r);
  float sun = pow(max(dot(r, staccato_sunDirection), 0.0), 400.0);

  // Thin-film iridescence, strongest at grazing angles, shifted by the music.
  float film = (1.0 - facing) * 2.2 + spectrum(0.15 + 0.7 * facing) * 0.6 + time * 0.03;
  vec3 iridescence = 0.5 + 0.5 * cos(6.28318 * (film + vec3(0.0, 0.33, 0.67)));

  vec3 color;
  if (staccato_material == 2) {
    // Paint: the shader's own colour, lit softly by the sky and the sun.
    vec3 wn = toWorld * n;
    float light = 0.55 + 0.45 * max(dot(wn, staccato_sunDirection), 0.0);
    color = tint * light + staccato_sky(wn) * 0.06;
  } else if (staccato_material == 1) {
    // Refraction: look through the surface at the frame drawn so far, bent by
    // the normal, frosted by blur, split slightly by wavelength.
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 bend = n.xy * (0.035 + 0.05 * (1.0 - facing));
    vec3 behind = vec3(
      textureLod(staccato_behind, uv - bend * 0.92, staccato_frost).r,
      textureLod(staccato_behind, uv - bend, staccato_frost).g,
      textureLod(staccato_behind, uv - bend * 1.08, staccato_frost).b
    );
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 4.0);
    vec3 through = behind * staccato_glassTint * mix(vec3(1.0), 0.35 + tint * 1.1, staccato_tint);
    color = mix(through, env, fresnel);
    color += iridescence * pow(1.0 - facing, 3.0) * staccato_iridescence * 0.35;
    color += staccato_sunColor * sun * 6.0;
  } else {
    float fresnel = 0.55 + 0.45 * pow(1.0 - facing, 3.0);
    vec3 metal = mix(staccato_metal, iridescence, staccato_iridescence * (1.0 - facing * 0.6));
    metal = mix(metal, metal * (0.35 + tint * 1.3), staccato_tint);
    color = env * metal * fresnel;
    // A little of the sky in the shadows, so dark sides aren't dead.
    color += staccato_sky(toWorld * n) * 0.08;
    color += staccato_sunColor * sun * 4.0;
  }

  float fog = staccato_fogAmount(length(staccato_viewPosition));
  color = mix(color, staccato_skyHorizon, fog * 0.8);
  ${user.out} = vec4(color, 1.0);
  // Only the hot highlights bloom.
  staccato_bloom = vec4(max(color - 0.85, 0.0) * staccato_glow * 2.0, 1.0);
}
`;
  return { vertex, fragment };
}

// ——— background: sky, and the ocean from the original concept ———

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
${FOG}
uniform mat4 staccato_inverseViewProjection;
uniform mat4 staccato_viewProjection;
uniform float staccato_oceanY;
uniform float staccato_waves;
in vec2 staccato_ndc;
layout(location = 0) out vec4 color;
layout(location = 1) out vec4 staccato_bloom;

// Slope of a sum of travelling waves. Each octave turns by the golden angle and
// fades out once its wavelength is smaller than a few pixels, so the far water
// goes calm instead of shimmering.
vec2 waveSlope(vec2 p, float footprint) {
  vec2 slope = vec2(0.0);
  float k = 0.0035;
  float a = 0.22 * staccato_waves * (1.0 + bass * 0.8);
  float angle = 0.4;
  for (int i = 0; i < 11; i++) {
    angle += 2.39996;
    vec2 dir = vec2(cos(angle), sin(angle));
    float wavelength = 6.28318 / k;
    float w = smoothstep(2.0, 8.0, wavelength / footprint);
    float phase = dot(dir, p) * k + time * sqrt(k * 9.8 * 60.0);
    slope += dir * a * cos(phase) * w;
    k *= 1.47;
    a *= 0.78;
  }
  return slope;
}

void main() {
  vec4 near = staccato_inverseViewProjection * vec4(staccato_ndc, -1.0, 1.0);
  vec4 far = staccato_inverseViewProjection * vec4(staccato_ndc, 1.0, 1.0);
  vec3 origin = near.xyz / near.w;
  vec3 d = normalize(far.xyz / far.w - origin);
  vec3 c = staccato_sky(d);
  gl_FragDepth = 1.0;

  float t = d.y < -1e-4 ? (staccato_oceanY - origin.y) / d.y : -1.0;
  if (staccato_ocean > 0.0 && t > 0.0) {
    vec3 p = origin + d * t;
    // World size of a pixel at this distance, for the wave filtering.
    float footprint = t * 2.0 / resolution.y;
    vec2 slope = waveSlope(p.xz, footprint);
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 r = reflect(d, n);
    r.y = abs(r.y);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
    vec3 water = staccato_water * (0.6 + 0.4 * max(n.y, 0.0));
    // The sky in the water is darker than the sky itself: deep water swallows light.
    vec3 sea = mix(water, staccato_sky(r) * 0.55, fresnel);
    // Glitter: the sun caught by individual facets.
    // Calm water gives one soft reflection; rough water scatters it into glitter.
    sea += staccato_sunColor * pow(max(dot(r, staccato_sunDirection), 0.0), 900.0) * (14.0 + level * 20.0) * min(1.0, staccato_waves * 1.5);
    float fog = staccato_fogAmount(t * 0.6);
    sea = mix(sea, staccato_sky(normalize(vec3(d.x, 0.0, d.z))), fog);
    c = mix(c, sea, staccato_ocean);

    vec4 clip = staccato_viewProjection * vec4(p, 1.0);
    gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  }
  color = vec4(c, 1.0);
  staccato_bloom = vec4(max(c - 1.0, 0.0) * 0.5, 0.0);
}
`,
};
