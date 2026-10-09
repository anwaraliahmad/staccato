import { plane, sphere, wireframe, type Geometry, type ShapeKind } from './geometry';
import { BINS, HISTORY } from './glsl';
import { invert, multiply, normalMatrix, translateRotateX, type Mat4, type Vec3 } from './math';
import { BACKGROUND_SHADERS, EDGE_TEXTURE_WIDTH, captureLayout, captureShaders, lineShaders, surfaceShaders, type CaptureLayout } from './passes';
import { Hud, type HudInfo } from './hud';
import { Post } from './post';
import { Program, type UniformValue } from './program';

export interface ShapeDef {
  name: string;
  kind: ShapeKind;
  /** Sphere radius, or plane width. */
  size: number;
  segments: [number, number];
  position: Vec3;
  rotX: number;
  /** Wire thickness in CSS pixels. */
  lineWidth: number;
}

/** How a shape is drawn: its wires, a surface, or both. */
export type Style = 'wire' | 'chrome' | 'chromewire' | 'glass' | 'glasswire';
export const STYLES: Style[] = ['wire', 'chrome', 'chromewire', 'glass', 'glasswire'];
const hasWire = (s: Style) => s === 'wire' || s.endsWith('wire');
const surfaceOf = (s: Style) => (s.startsWith('chrome') ? 'chrome' : s.startsWith('glass') ? 'glass' : null);

type RGB = [number, number, number];

/** Everything about a look that isn't a shader: the world, the materials, the lens. */
export interface Look {
  // The world.
  skyTop: RGB;
  skyHorizon: RGB;
  skyBottom: RGB;
  sunDirection: RGB;
  sunColor: RGB;
  sunSize: number;
  haze: number;
  fog: number;
  /** Water to the horizon (0–1), its colour, and how rough it is. */
  ocean: number;
  water: RGB;
  waves: number;
  /** Softboxes and ring light for chrome to catch. */
  studio: number;
  lightA: RGB;
  lightB: RGB;
  // Materials.
  wireColor: RGB;
  /** 0: wires keep their shader's colours. 1: one ink. */
  wireTint: number;
  lineScale: number;
  wireAlpha: number;
  /** Additive wires glow on dark worlds; on light ones they'd wash out. */
  additive: boolean;
  metal: RGB;
  iridescence: number;
  glassTint: RGB;
  frost: number;
  glow: number;
  // The lens and the grade.
  bloom: number;
  aberration: number;
  vignette: number;
  grain: number;
  dream: number;
  halation: number;
  halationTint: RGB;
  saturation: number;
  contrast: number;
  lift: RGB;
  duotone: number;
  shadowTint: RGB;
  highlightTint: RGB;
  hud: number;
  /** Default style for each shape when the look is chosen. */
  styles: Record<string, Style>;
}

interface ShaderPair {
  vertex: string;
  fragment: string;
}

/** The anti-aliased, chrome-capable path for one shader on one mesh. */
interface Pipeline {
  layout: CaptureLayout;
  capture: Program;
  lines: Program;
  surface: Program;
}

interface Mesh {
  def: ShapeDef;
  vao: WebGLVertexArrayObject;
  /** Same attributes, with the wire index buffer bound instead of triangles. */
  wireVao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  vertexCount: number;
  triangleCount: number;
  wireCount: number;
  edgeTexture: WebGLTexture;
  edgeCount: number;
  grid: Int32Array;
  model: Mat4;
  source: ShaderPair | null;
  pipeline: Pipeline | null;
  /** The plain gl.LINES path: no float targets, or a shader the capture can't carry. */
  basic: Program | null;
  capture: { fbo: WebGLFramebuffer; textures: WebGLTexture[] } | null;
  visible: boolean;
  style: Style;
}

export class NoWebGL2Error extends Error {}

/**
 * Owns the WebGL2 context. Everything GPU-side can be rebuilt from the shape
 * definitions and shader sources, which is how context loss is survived.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  /** False on devices that can't render to float textures: thin lines, no post. */
  readonly enhanced: boolean;
  private meshes = new Map<string, Mesh>();
  private spectrumTex!: WebGLTexture;
  private historyTex!: WebGLTexture;
  private historyRow = 0;
  private post: Post | null = null;
  private background: Program | null = null;
  private empty!: WebGLVertexArrayObject;
  private lost = false;
  private readonly modelView = new Float32Array(16);
  private readonly normal = new Float32Array(9);
  private readonly inverseProjection = new Float32Array(16);
  private readonly viewProjection = new Float32Array(16);
  private readonly inverseViewProjection = new Float32Array(16);

  look: Look = LOOKS.origin;
  pixelRatio = 1;
  /** What the HUD shows; set by the app. */
  hudInfo: HudInfo = { look: '', shape: '', shader: '', source: '', sampleRate: 48000, fftSize: 2048 };
  private hud!: Hud;

  constructor(readonly canvas: HTMLCanvasElement, private readonly defs: ShapeDef[]) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, // we resolve our own multisampled target
      alpha: false,
      depth: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new NoWebGL2Error('WebGL2 is not available');
    this.gl = gl;
    this.enhanced = Post.supported(gl);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      const saved = new Map([...this.meshes].map(([name, m]) => [name, { source: m.source, visible: m.visible, style: m.style }]));
      this.meshes.clear();
      if (this.enhanced) gl.getExtension('EXT_color_buffer_float');
      this.init();
      for (const [name, s] of saved) {
        const mesh = this.meshes.get(name)!;
        mesh.visible = s.visible;
        mesh.style = s.style;
        if (s.source) this.setShader(name, s.source);
      }
      this.lost = false;
    });

    this.init();
  }

  get shapes(): string[] {
    return [...this.meshes.keys()];
  }

  isVisible(name: string): boolean {
    return this.meshes.get(name)?.visible ?? false;
  }

  setVisible(name: string, visible: boolean): void {
    const mesh = this.meshes.get(name);
    if (mesh) mesh.visible = visible;
  }

  style(name: string): Style {
    return this.meshes.get(name)?.style ?? 'wire';
  }

  setStyle(name: string, style: Style): void {
    const mesh = this.meshes.get(name);
    if (mesh) mesh.style = style;
  }

  /** Compile and assign. Throws ShaderCompileError and leaves the old shader in place. */
  setShader(name: string, source: ShaderPair): void {
    const mesh = this.meshes.get(name);
    if (!mesh || this.lost) return;
    const gl = this.gl;
    const layout = this.enhanced ? captureLayout(source.vertex) : null;

    let pipeline: Pipeline | null = null;
    let basic: Program | null = null;
    if (layout) {
      const capture = captureShaders(source.vertex, layout);
      const lines = lineShaders(source.fragment, layout);
      const surface = surfaceShaders(source.fragment, layout);
      const programs: Program[] = [];
      try {
        programs.push(Program.link(gl, capture.vertex, capture.fragment));
        programs.push(Program.link(gl, lines.vertex, lines.fragment));
        programs.push(Program.link(gl, surface.vertex, surface.fragment));
      } catch (e) {
        for (const p of programs) p.dispose();
        throw e;
      }
      pipeline = { layout, capture: programs[0]!, lines: programs[1]!, surface: programs[2]! };
    } else {
      basic = Program.compile(gl, source.vertex, source.fragment);
    }

    this.disposeShader(mesh);
    mesh.pipeline = pipeline;
    mesh.basic = basic;
    mesh.source = { vertex: source.vertex, fragment: source.fragment };
    if (pipeline) this.allocateCapture(mesh, pipeline.layout.slots);
  }

  uploadSpectrum(db: Float32Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.spectrumTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BINS, 1, gl.RED, gl.FLOAT, db);
  }

  /** Append one row (normalized 0..1) to the history ring. */
  pushHistory(row: Float32Array): void {
    const gl = this.gl;
    this.historyRow = (this.historyRow + 1) % HISTORY;
    gl.bindTexture(gl.TEXTURE_2D, this.historyTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.historyRow, BINS, 1, gl.RED, gl.FLOAT, row);
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.post?.resize(width, height);
  }

  render(view: Mat4, projection: Mat4, eye: Vec3, uniforms: Record<string, UniformValue>): void {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return;
    const { width, height } = this.canvas;
    const look = this.look;

    invert(projection, this.inverseProjection);
    multiply(projection, view, this.viewProjection);
    invert(this.viewProjection, this.inverseViewProjection);

    const v3 = (c: readonly number[]) => new Float32Array(c);
    const shared: Record<string, UniformValue> = {
      ...uniforms,
      viewMatrix: view,
      projectionMatrix: projection,
      cameraPosition: v3(eye),
      spectrumTex: this.spectrumTex,
      historyTex: this.historyTex,
      historyHead: (this.historyRow + 0.5) / HISTORY,
      staccato_inverseProjection: this.inverseProjection,
      staccato_viewProjection: this.viewProjection,
      staccato_inverseViewProjection: this.inverseViewProjection,
      staccato_skyTop: v3(look.skyTop),
      staccato_skyHorizon: v3(look.skyHorizon),
      staccato_skyBottom: v3(look.skyBottom),
      staccato_sunDirection: v3(normalize(look.sunDirection)),
      staccato_sunColor: v3(look.sunColor),
      staccato_sunSize: look.sunSize,
      staccato_haze: look.haze,
      staccato_fog: look.fog,
      staccato_ocean: look.ocean,
      staccato_oceanY: OCEAN_Y,
      staccato_water: v3(look.water),
      staccato_waves: look.waves,
      staccato_studio: look.studio,
      staccato_lightA: v3(look.lightA),
      staccato_lightB: v3(look.lightB),
      staccato_wireColor: v3(look.wireColor),
      staccato_wireTint: look.wireTint,
      staccato_metal: v3(look.metal),
      staccato_iridescence: look.iridescence,
      staccato_glassTint: v3(look.glassTint),
      staccato_frost: look.frost,
      staccato_glow: look.glow,
    };
    const meshUniforms = (mesh: Mesh): Record<string, UniformValue> => {
      multiply(view, mesh.model, this.modelView);
      normalMatrix(this.modelView, this.normal);
      return {
        modelMatrix: mesh.model,
        modelViewMatrix: this.modelView,
        normalMatrix: this.normal,
        size: mesh.def.kind === 'sphere' ? mesh.def.size : mesh.def.size / 2,
      };
    };
    const visible = [...this.meshes.values()].filter((m) => m.visible && (m.pipeline || m.basic));

    if (!this.post) {
      // Basic path: straight to the canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(...look.skyHorizon, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawBasic(visible, shared, meshUniforms);
      return;
    }

    // 1. Run every shape's vertex shader into its capture textures.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    for (const mesh of visible) {
      if (!mesh.pipeline || !mesh.capture) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, mesh.capture.fbo);
      gl.viewport(0, 0, mesh.grid[0]!, mesh.grid[1]!);
      const p = mesh.pipeline.capture;
      p.use();
      p.set(shared);
      p.set(meshUniforms(mesh));
      p.set({ staccato_grid: mesh.grid });
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.POINTS, 0, mesh.vertexCount);
    }

    // 2. The world: sky, and the ocean, which writes depth so ridges can sink into it.
    this.post.begin();
    gl.bindVertexArray(this.empty);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    this.background!.use();
    this.background!.set(shared);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LEQUAL);

    const surfaces = (material: 'chrome' | 'glass', behind?: WebGLTexture) => {
      for (const mesh of visible) {
        if (!mesh.pipeline || surfaceOf(mesh.style) !== material) continue;
        const p = mesh.pipeline.surface;
        p.use();
        p.set(shared);
        p.set(meshUniforms(mesh));
        p.set({
          ...this.captureUniforms(mesh),
          staccato_wrapX: mesh.def.kind === 'sphere',
          staccato_tint: 0.35,
          staccato_glass: material === 'glass',
          ...(behind ? { staccato_behind: behind } : {}),
        });
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.triangleCount, gl.UNSIGNED_INT, 0);
      }
    };
    const wires = () => {
      gl.enable(gl.BLEND);
      if (look.additive) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.empty);
      for (const mesh of visible) {
        if (!mesh.pipeline || !hasWire(mesh.style)) continue;
        const over = mesh.style !== 'wire';
        const p = mesh.pipeline.lines;
        p.use();
        p.set(shared);
        p.set(meshUniforms(mesh));
        p.set({
          ...this.captureUniforms(mesh),
          staccato_edges: mesh.edgeTexture,
          staccato_lineWidth: mesh.def.lineWidth * look.lineScale * this.pixelRatio * (over ? 0.6 : 1),
          // Over a surface the wire is a fine engraving, not a coat of paint;
          // additive wires stack up where they overlap, so each gets less.
          staccato_lineAlpha: (over ? 0.14 : 1) * look.wireAlpha * (look.additive ? 0.45 : 1),
        });
        gl.drawArrays(gl.TRIANGLES, 0, mesh.edgeCount * 6);
      }
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    };

    // 3. Opaque chrome, then every wire.
    surfaces('chrome');
    wires();
    this.post.colorOnly(true);
    this.drawBasic(visible.filter((m) => m.basic), shared, meshUniforms);
    this.post.colorOnly(false);

    // 4. Glass refracts the frame so far. It marks the stencil where it lands;
    //    wires in front of the glass are then drawn again over just those pixels.
    if (visible.some((m) => m.pipeline && surfaceOf(m.style) === 'glass')) {
      const behind = this.post.snapshot();
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      surfaces('glass', behind);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      wires();
      gl.disable(gl.STENCIL_TEST);
    }

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const f = (k: string) => (typeof uniforms[k] === 'number' ? (uniforms[k] as number) : 0);
    this.hud.update(width, height, this.pixelRatio, this.hudInfo);
    this.post.finish({
      bloomStrength: look.bloom,
      aberration: look.aberration * (1 + f('onset') * 2.5),
      vignette: look.vignette,
      grain: look.grain,
      dream: look.dream,
      halation: look.halation,
      halationTint: v3(look.halationTint),
      saturation: look.saturation,
      contrast: look.contrast,
      lift: v3(look.lift),
      duotone: look.duotone,
      shadowTint: v3(look.shadowTint),
      highlightTint: v3(look.highlightTint),
      hudAmount: look.hud,
      meters: new Float32Array([f('bass'), f('mid'), f('treble'), f('level')]),
      onsetMeter: f('onset'),
      pixelRatio: this.pixelRatio,
    }, this.hud.texture);
    gl.bindVertexArray(null);
  }

  private drawBasic(meshes: Mesh[], shared: Record<string, UniformValue>, meshUniforms: (m: Mesh) => Record<string, UniformValue>): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const mesh of meshes) {
      if (!mesh.basic) continue;
      mesh.basic.use();
      mesh.basic.set(shared);
      mesh.basic.set(meshUniforms(mesh));
      gl.bindVertexArray(mesh.wireVao);
      gl.drawElements(gl.LINES, mesh.wireCount, gl.UNSIGNED_INT, 0);
    }
  }

  private captureUniforms(mesh: Mesh): Record<string, UniformValue> {
    const out: Record<string, UniformValue> = {};
    mesh.capture?.textures.forEach((t, i) => (out[`staccato_cap${i}`] = t));
    return out;
  }

  private init(): void {
    const gl = this.gl;
    this.spectrumTex = this.makeTexture(BINS, 1, gl.CLAMP_TO_EDGE, -100);
    this.historyTex = this.makeTexture(BINS, HISTORY, gl.REPEAT, 0);
    this.historyRow = 0;
    this.empty = gl.createVertexArray();
    if (this.enhanced) {
      this.post = new Post(gl);
      this.background = Program.link(gl, BACKGROUND_SHADERS.vertex, BACKGROUND_SHADERS.fragment);
      this.hud = new Hud(gl);
    }
    for (const def of this.defs) {
      const geometry = def.kind === 'sphere'
        ? sphere(def.size, def.segments[0], def.segments[1])
        : plane(def.size, def.size, def.segments[0], def.segments[1]);
      this.meshes.set(def.name, {
        def,
        ...this.upload(geometry),
        grid: new Int32Array([def.segments[0] + 1, def.segments[1] + 1]),
        model: translateRotateX(def.position, def.rotX),
        source: null,
        pipeline: null,
        basic: null,
        capture: null,
        visible: true,
        style: 'wire' as Style,
      });
    }
  }

  private upload(geometry: Geometry) {
    const gl = this.gl;
    const buffers: WebGLBuffer[] = [];
    const attribs = ([[geometry.positions, 3], [geometry.normals, 3], [geometry.uvs, 2]] as const).map(([data, size]) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      buffers.push(buffer);
      return { buffer, size };
    });
    const vertexArray = (indices: Uint32Array) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      attribs.forEach(({ buffer, size }, slot) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(slot);
        gl.vertexAttribPointer(slot, size, gl.FLOAT, false, 0, 0);
      });
      const index = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      buffers.push(index);
      gl.bindVertexArray(null);
      return vao;
    };
    const lines = wireframe(geometry.indices);
    const vao = vertexArray(geometry.indices);
    const wireVao = vertexArray(lines);

    // Edge list as a texture, for the line pass to look endpoints up by edge.
    const edgeCount = lines.length / 2;
    const rows = Math.ceil(edgeCount / EDGE_TEXTURE_WIDTH);
    const edgeData = new Uint32Array(EDGE_TEXTURE_WIDTH * rows * 2);
    edgeData.set(lines);
    const edgeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, edgeTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, EDGE_TEXTURE_WIDTH, rows, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, edgeData);
    setNearest(gl);

    return {
      vao,
      wireVao,
      buffers,
      vertexCount: geometry.positions.length / 3,
      triangleCount: geometry.indices.length,
      wireCount: lines.length,
      edgeTexture,
      edgeCount,
    };
  }

  private allocateCapture(mesh: Mesh, slots: number): void {
    const gl = this.gl;
    if (mesh.capture && mesh.capture.textures.length === slots) return;
    this.releaseCapture(mesh);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const textures: WebGLTexture[] = [];
    for (let i = 0; i < slots; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      // 32-bit: positions run into the thousands and half floats would shimmer.
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, mesh.grid[0]!, mesh.grid[1]!);
      setNearest(gl);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      textures.push(t);
    }
    gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    mesh.capture = { fbo, textures };
  }

  private releaseCapture(mesh: Mesh): void {
    if (!mesh.capture) return;
    this.gl.deleteFramebuffer(mesh.capture.fbo);
    for (const t of mesh.capture.textures) this.gl.deleteTexture(t);
    mesh.capture = null;
  }

  private disposeShader(mesh: Mesh): void {
    mesh.basic?.dispose();
    mesh.pipeline?.capture.dispose();
    mesh.pipeline?.lines.dispose();
    mesh.pipeline?.surface.dispose();
    mesh.basic = null;
    mesh.pipeline = null;
  }

  private makeTexture(width: number, height: number, wrapT: number, fill: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // R16F: filterable everywhere WebGL2 runs, plenty of precision for dB.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height, 0, gl.RED, gl.FLOAT, new Float32Array(width * height).fill(fill));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return tex;
  }
}

function setNearest(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** Height of the water, just under the floor. */
const OCEAN_Y = -1450;

function normalize(v: RGB): RGB {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// The looks. One world, remembered differently.
const BASE: Look = {
  skyTop: [0.14, 0.3, 0.5],
  skyHorizon: [0.8, 0.76, 0.64],
  skyBottom: [0.02, 0.04, 0.07],
  sunDirection: [-0.55, 0.05, -0.83],
  sunColor: [1, 0.84, 0.56],
  sunSize: 0.03,
  haze: 0.35,
  fog: 0.00022,
  ocean: 1,
  water: [0.01, 0.025, 0.045],
  waves: 1,
  studio: 0,
  lightA: [1, 1, 1],
  lightB: [1, 0.75, 0.85],
  wireColor: [0.96, 0.97, 1],
  wireTint: 1,
  lineScale: 0.6,
  wireAlpha: 0.6,
  additive: false,
  metal: [0.92, 0.94, 1],
  iridescence: 0.25,
  glassTint: [0.92, 0.97, 1],
  frost: 1.2,
  glow: 0.35,
  bloom: 0.6,
  aberration: 0.002,
  vignette: 0.3,
  grain: 0.02,
  dream: 0.22,
  halation: 0.06,
  halationTint: [1, 0.85, 0.7],
  saturation: 1,
  contrast: 1.08,
  lift: [0.005, 0.01, 0.02],
  duotone: 0,
  shadowTint: [0, 0, 0],
  highlightTint: [1, 1, 1],
  hud: 0,
  styles: { sphere: 'glass', ceiling: 'wire', floor: 'wire' },
};

export type LookName = 'origin' | 'pavilion' | 'metal' | '16' | 'night';

export const LOOKS: Record<LookName, Look> = {
  // The picture Staccato started as: white wires over the sea at dusk,
  // and the heart a glass bubble — the one new thing in an old memory.
  origin: BASE,

  // Glass architecture on a still morning: open blue, frosted panes,
  // a mirror pool, pale steel. Y2K, remembered through a window.
  pavilion: {
    ...BASE,
    skyTop: [0.3, 0.52, 0.76],
    skyHorizon: [0.82, 0.9, 0.94],
    skyBottom: [0.12, 0.28, 0.36],
    sunDirection: [0.45, 0.35, -0.8],
    sunColor: [0.7, 0.72, 0.68],
    sunSize: 0.04,
    haze: 0.4,
    fog: 0.00014,
    water: [0.03, 0.15, 0.2],
    waves: 0.25,
    studio: 0.45,
    lightA: [0.9, 1, 1],
    lightB: [0.7, 0.95, 0.9],
    wireColor: [0.74, 0.86, 0.92],
    wireTint: 0.9,
    lineScale: 0.7,
    wireAlpha: 0.65,
    metal: [0.8, 0.92, 0.95],
    iridescence: 0.18,
    glassTint: [0.84, 0.97, 0.97],
    frost: 1.3,
    glow: 0.3,
    bloom: 0.5,
    dream: 0.3,
    halation: 0.08,
    halationTint: [0.75, 0.95, 1],
    saturation: 0.95,
    contrast: 1.05,
    lift: [0.02, 0.04, 0.05],
    duotone: 0.15,
    shadowTint: [0.06, 0.2, 0.26],
    highlightTint: [0.92, 1, 1],
    hud: 0.35,
    styles: { sphere: 'glasswire', ceiling: 'wire', floor: 'wire' },
  },

  // Cold steel: a spiked chrome heart in a blue studio, read out like an instrument.
  metal: {
    ...BASE,
    skyTop: [0.18, 0.28, 0.45],
    skyHorizon: [0.76, 0.84, 0.93],
    skyBottom: [0.04, 0.07, 0.13],
    sunDirection: [0.5, 0.6, 0.6],
    sunColor: [0.85, 0.92, 1],
    sunSize: 0.015,
    haze: 0.3,
    fog: 0.00012,
    ocean: 0,
    studio: 1,
    lightA: [0.9, 0.95, 1],
    lightB: [0.6, 0.75, 1],
    wireColor: [0.82, 0.9, 1],
    wireTint: 0.85,
    lineScale: 0.8,
    wireAlpha: 0.8,
    metal: [0.72, 0.82, 0.98],
    iridescence: 0.06,
    glow: 0.5,
    bloom: 0.7,
    aberration: 0.003,
    vignette: 0.45,
    grain: 0.05,
    dream: 0.2,
    halation: 0.08,
    halationTint: [0.7, 0.85, 1],
    contrast: 1.15,
    lift: [0.02, 0.04, 0.08],
    duotone: 0.85,
    shadowTint: [0.02, 0.05, 0.12],
    highlightTint: [0.86, 0.93, 1],
    hud: 0.6,
    styles: { sphere: 'chrome', ceiling: 'wire', floor: 'wire' },
  },

  // 2016: the lavender (0xC0C0FF at half alpha over #bbbbbb) and the
  // shaders' own hot colours, now with a chrome heart.
  '16': {
    ...BASE,
    skyTop: [0.56, 0.58, 0.9],
    skyHorizon: [0.9, 0.89, 0.97],
    skyBottom: [0.47, 0.44, 0.62],
    sunDirection: [0.2, 0.8, 0.4],
    sunColor: [0.4, 0.38, 0.45],
    sunSize: 0.1,
    haze: 0.2,
    fog: 0.00005,
    ocean: 0,
    studio: 1,
    lightA: [1, 0.98, 1],
    lightB: [1, 0.72, 0.86],
    wireTint: 0,
    lineScale: 1,
    wireAlpha: 1,
    metal: [0.92, 0.93, 1],
    iridescence: 0.55,
    glow: 0.55,
    bloom: 0.7,
    aberration: 0.004,
    vignette: 0.35,
    grain: 0.018,
    dream: 0,
    halation: 0,
    lift: [0, 0, 0],
    contrast: 1,
    styles: { sphere: 'chromewire', ceiling: 'wire', floor: 'wire' },
  },

  // Black chrome over black water, neon horizon.
  night: {
    ...BASE,
    skyTop: [0.02, 0.02, 0.06],
    skyHorizon: [0.2, 0.08, 0.32],
    skyBottom: [0, 0, 0.015],
    sunDirection: [0.1, 0.02, -1],
    sunColor: [0.9, 0.3, 0.8],
    sunSize: 0.05,
    haze: 0.4,
    fog: 0.0001,
    ocean: 1,
    water: [0, 0, 0.01],
    waves: 0.6,
    studio: 1,
    lightA: [0.75, 0.95, 1],
    lightB: [1, 0.25, 0.75],
    wireTint: 0,
    lineScale: 1,
    wireAlpha: 0.5,
    additive: true,
    metal: [0.92, 0.93, 1],
    iridescence: 0.55,
    glow: 0.4,
    bloom: 0.8,
    aberration: 0.005,
    vignette: 0.55,
    grain: 0.025,
    dream: 0.15,
    halation: 0.1,
    halationTint: [1, 0.4, 0.9],
    lift: [0, 0, 0],
    hud: 0.15,
    styles: { sphere: 'chromewire', ceiling: 'wire', floor: 'wire' },
  },
};
