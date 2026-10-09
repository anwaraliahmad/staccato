// HDR scene target and the finishing passes.
//
// The scene renders into a multisampled float framebuffer with two attachments:
// color, and a glow buffer that only bright things write to. The glow goes
// through a dual-filter (Kawase) bloom; the composite adds it back, splits the
// channels a touch on note attacks, rolls off highlights, and dithers with
// grain so the gradients don't band.

import { Program } from './program';

const FULLSCREEN = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Dual filter downsample: centre plus four diagonal half-texel taps.
const DOWN = `#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 texel;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 c = texture(source, vUv).rgb * 4.0;
  c += texture(source, vUv + vec2(-1.0, -1.0) * texel).rgb;
  c += texture(source, vUv + vec2( 1.0, -1.0) * texel).rgb;
  c += texture(source, vUv + vec2(-1.0,  1.0) * texel).rgb;
  c += texture(source, vUv + vec2( 1.0,  1.0) * texel).rgb;
  color = vec4(c / 8.0, 1.0);
}
`;

const UP = `#version 300 es
precision highp float;
uniform sampler2D source;
uniform vec2 texel;
in vec2 vUv;
out vec4 color;
void main() {
  vec3 c = vec3(0.0);
  c += texture(source, vUv + vec2(-2.0, 0.0) * texel).rgb;
  c += texture(source, vUv + vec2( 2.0, 0.0) * texel).rgb;
  c += texture(source, vUv + vec2(0.0, -2.0) * texel).rgb;
  c += texture(source, vUv + vec2(0.0,  2.0) * texel).rgb;
  c += texture(source, vUv + vec2(-1.0, -1.0) * texel).rgb * 2.0;
  c += texture(source, vUv + vec2( 1.0, -1.0) * texel).rgb * 2.0;
  c += texture(source, vUv + vec2(-1.0,  1.0) * texel).rgb * 2.0;
  c += texture(source, vUv + vec2( 1.0,  1.0) * texel).rgb * 2.0;
  color = vec4(c / 12.0, 1.0);
}
`;

const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D scene;
uniform sampler2D bloom;
uniform float bloomStrength;
uniform float aberration;
uniform float vignette;
uniform float grain;
uniform float seed;
uniform vec2 resolution;
in vec2 vUv;
out vec4 color;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// Leave everything below 0.8 alone; roll off above it instead of clipping flat.
vec3 shoulder(vec3 c) {
  vec3 over = max(c - 0.8, 0.0);
  return min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
}

void main() {
  vec2 d = vUv - 0.5;
  vec2 shift = d * aberration;
  vec3 c = vec3(
    texture(scene, vUv - shift).r,
    texture(scene, vUv).g,
    texture(scene, vUv + shift).b
  );
  c += texture(bloom, vUv).rgb * bloomStrength;
  c = shoulder(c);
  c *= mix(1.0, smoothstep(0.95, 0.25, length(d * vec2(resolution.x / resolution.y, 1.0))), vignette);
  float n = hash(gl_FragCoord.xy + seed) + hash(gl_FragCoord.xy * 1.7 - seed) - 1.0;
  c += n * grain + n / 255.0;
  color = vec4(c, 1.0);
}
`;

export interface CompositeParams {
  bloomStrength: number;
  aberration: number;
  vignette: number;
  grain: number;
}

interface Target {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

const BLOOM_LEVELS = 6;

export class Post {
  private width = 0;
  private height = 0;
  private samples = 4;
  private msaa: WebGLFramebuffer | null = null;
  private renderbuffers: WebGLRenderbuffer[] = [];
  private resolved: Target[] = []; // [color, glow]
  private levels: Target[] = [];
  private readonly down: Program;
  private readonly up: Program;
  private readonly composite: Program;
  private readonly empty: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.down = Program.link(gl, FULLSCREEN, DOWN);
    this.up = Program.link(gl, FULLSCREEN, UP);
    this.composite = Program.link(gl, FULLSCREEN, COMPOSITE);
    this.empty = gl.createVertexArray();
    const supported = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array | null;
    this.samples = Math.min(4, supported?.[0] ?? 0);
  }

  /** Is everything this needs available? (Rendering to float targets.) */
  static supported(gl: WebGL2RenderingContext): boolean {
    return !!gl.getExtension('EXT_color_buffer_float');
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.release();
    this.width = width;
    this.height = height;
    const gl = this.gl;

    this.msaa = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa);
    const storage = (format: number, attachment: number) => {
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, format, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachment, gl.RENDERBUFFER, rb);
      this.renderbuffers.push(rb);
    };
    storage(gl.RGBA16F, gl.COLOR_ATTACHMENT0);
    storage(gl.RGBA16F, gl.COLOR_ATTACHMENT1);
    storage(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT);

    this.resolved = [this.target(width, height), this.target(width, height)];
    let w = width, h = height;
    for (let i = 0; i < BLOOM_LEVELS && w > 8 && h > 8; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.levels.push(this.target(w, h));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Bind the scene target and clear it. */
  begin(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaa);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
  }

  /** Write only the color attachment (for shaders without a glow output). */
  colorOnly(only: boolean): void {
    const gl = this.gl;
    gl.drawBuffers(only ? [gl.COLOR_ATTACHMENT0, gl.NONE] : [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  }

  /** Resolve, bloom and composite onto the canvas. */
  finish(params: CompositeParams): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.bindVertexArray(this.empty);

    // Resolve each attachment of the multisampled target.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaa);
    this.resolved.forEach((t, i) => {
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fbo);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    });

    // Bloom: down the chain, then back up adding each level onto the one above.
    gl.disable(gl.BLEND);
    this.down.use();
    let source = this.resolved[1]!;
    for (const level of this.levels) {
      this.draw(this.down, source, level);
      source = level;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.up.use();
    for (let i = this.levels.length - 1; i > 0; i--) this.draw(this.up, this.levels[i]!, this.levels[i - 1]!);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    this.composite.use();
    this.composite.set({
      scene: this.resolved[0]!.texture,
      bloom: (this.levels[0] ?? this.resolved[1]!).texture,
      resolution: new Float32Array([this.width, this.height]),
      seed: Math.random() * 100,
      ...params,
    });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private draw(program: Program, from: Target, to: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, to.width, to.height);
    program.set({ source: from.texture, texel: new Float32Array([0.5 / from.width, 0.5 / from.height]) });
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private target(width: number, height: number): Target {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { fbo, texture, width, height };
  }

  private release(): void {
    const gl = this.gl;
    if (this.msaa) gl.deleteFramebuffer(this.msaa);
    for (const rb of this.renderbuffers) gl.deleteRenderbuffer(rb);
    for (const t of [...this.resolved, ...this.levels]) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.texture);
    }
    this.msaa = null;
    this.renderbuffers = [];
    this.resolved = [];
    this.levels = [];
  }
}
