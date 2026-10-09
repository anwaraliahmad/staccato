import { GEOMETRIES, build, wireframe, type Geometry, type GeometryName } from './geometry';
import { BINS, HISTORY } from './glsl';
import { Hud, type HudInfo } from './hud';
import { compose, invert, multiply, type Mat4, type Vec3 } from './math';
import { BACKGROUND_SHADERS, EDGE_TEXTURE_WIDTH, captureLayout, captureShaders, lineShaders, surfaceShaders, type CaptureLayout } from './passes';
import { Post } from './post';
import { Program, type UniformValue } from './program';

/** How an object is drawn: its wires, a surface, or both. */
export type Style = 'wire' | 'chrome' | 'chromewire' | 'glass' | 'glasswire' | 'paint' | 'paintwire';
export const STYLES: Style[] = ['wire', 'chrome', 'chromewire', 'glass', 'glasswire', 'paint', 'paintwire'];
const hasWire = (s: Style) => s === 'wire' || s.endsWith('wire');
type Material = 'chrome' | 'glass' | 'paint';
const materialOf = (s: Style): Material | null =>
  s.startsWith('chrome') ? 'chrome' : s.startsWith('glass') ? 'glass' : s.startsWith('paint') ? 'paint' : null;
const MATERIAL_ID: Record<Material, number> = { chrome: 0, glass: 1, paint: 2 };

/** One thing in a scene: a shape, where it is, how many copies, and how it's drawn. */
export interface ObjectDef {
  name: string;
  geometry: GeometryName;
  position?: Vec3;
  /** Euler angles in radians. */
  rotation?: Vec3;
  scale?: number;
  /** A transform per copy. Omitted: one copy. */
  instances?: Mat4[];
  shader: string;
  style: Style;
  /** Wire thickness in CSS pixels. */
  lineWidth?: number;
  /** How much the shader's colour tints chrome and glass (0–1, default 0.35). */
  tint?: number;
}

type RGB = [number, number, number];

/** Everything that isn't an object: the world, the materials, the lens. */
export interface World {
  // The world.
  skyTop: RGB;
  skyHorizon: RGB;
  skyBottom: RGB;
  sunDirection: RGB;
  sunColor: RGB;
  sunSize: number;
  haze: number;
  fog: number;
  /** Water to the horizon (0–1), its height, colour, and roughness. */
  ocean: number;
  oceanY: number;
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
}

interface ShaderPair {
  vertex: string;
  fragment: string;
}

/** The anti-aliased, chrome-capable path for one shader. */
interface Pipeline {
  layout: CaptureLayout;
  capture: Program;
  lines: Program;
  surface: Program;
}

/** GPU buffers for one geometry, shared by every object using it. */
interface Shape {
  geometry: Geometry;
  vao: WebGLVertexArrayObject;
  /** Same attributes, with the wire index buffer bound instead of triangles. */
  wireVao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  vertexCount: number;
  triangleCount: number;
  wireCount: number;
  edgeTexture: WebGLTexture;
  edgeCount: number;
}

interface Item {
  def: ObjectDef;
  geometry: GeometryName;
  shape: Shape;
  objectMatrix: Mat4;
  instanceTexture: WebGLTexture;
  instanceCount: number;
  source: ShaderPair | null;
  pipeline: Pipeline | null;
  /** The plain gl.LINES path: no float targets, or a shader the capture can't carry. */
  basic: Program | null;
  capture: { fbo: WebGLFramebuffer; textures: WebGLTexture[]; key: string } | null;
  visible: boolean;
  style: Style;
}

export class NoWebGL2Error extends Error {}

const IDENTITY = compose([0, 0, 0]);

/**
 * Owns the WebGL2 context. Everything GPU-side can be rebuilt from object
 * definitions and shader sources, which is how context loss is survived.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  /** False on devices that can't render to float textures: thin lines, no post. */
  readonly enhanced: boolean;
  private items = new Map<string, Item>();
  private shapes = new Map<GeometryName, Shape>();
  private spectrumTex!: WebGLTexture;
  private historyTex!: WebGLTexture;
  private historyRow = 0;
  private post: Post | null = null;
  private background: Program | null = null;
  private hud: Hud | null = null;
  private empty!: WebGLVertexArrayObject;
  private lost = false;
  private readonly inverseProjection = new Float32Array(16);
  private readonly viewProjection = new Float32Array(16);
  private readonly inverseViewProjection = new Float32Array(16);

  world!: World;
  pixelRatio = 1;
  /** What the HUD shows; set by the app. */
  hudInfo: HudInfo = { look: '', shape: '', shader: '', source: '', sampleRate: 48000, fftSize: 2048 };

  constructor(readonly canvas: HTMLCanvasElement) {
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
      const saved = [...this.items.values()].map((it) => ({ def: it.def, geometry: it.geometry, source: it.source, visible: it.visible, style: it.style }));
      this.items.clear();
      this.shapes.clear();
      if (this.enhanced) gl.getExtension('EXT_color_buffer_float');
      this.init();
      this.lost = false;
      this.setObjects(saved.map((s) => s.def));
      for (const s of saved) {
        this.setGeometry(s.def.name, s.geometry);
        this.setStyle(s.def.name, s.style);
        this.setVisible(s.def.name, s.visible);
        if (s.source) this.setShader(s.def.name, s.source);
      }
    });

    this.init();
  }

  get objects(): string[] {
    return [...this.items.keys()];
  }

  /** Replace the scene's objects. Shaders are assigned separately. */
  setObjects(defs: ObjectDef[]): void {
    for (const item of this.items.values()) this.disposeItem(item);
    this.items.clear();
    for (const def of defs) {
      const shape = this.shape(def.geometry);
      const count = def.instances?.length ?? 1;
      this.items.set(def.name, {
        def,
        geometry: def.geometry,
        shape,
        objectMatrix: compose(def.position ?? [0, 0, 0], def.rotation, def.scale ?? 1),
        instanceTexture: this.instanceTexture(def.instances ?? [IDENTITY]),
        instanceCount: count,
        source: null,
        pipeline: null,
        basic: null,
        capture: null,
        visible: true,
        style: def.style,
      });
    }
  }

  geometryOf(name: string): GeometryName | undefined {
    return this.items.get(name)?.geometry;
  }

  /**
   * Swap an object's shape. The new one is scaled to the old one's footprint,
   * so a knot dropped onto the colonnade comes out pillar-sized.
   */
  setGeometry(name: string, geometry: GeometryName): void {
    const item = this.items.get(name);
    if (!item || item.geometry === geometry) return;
    const original = this.shape(item.def.geometry).geometry.radius;
    item.shape = this.shape(geometry);
    item.geometry = geometry;
    const fit = original / item.shape.geometry.radius;
    item.objectMatrix = compose(item.def.position ?? [0, 0, 0], item.def.rotation, (item.def.scale ?? 1) * fit);
    if (item.pipeline) this.allocateCapture(item, item.pipeline.layout.slots);
  }

  isVisible(name: string): boolean {
    return this.items.get(name)?.visible ?? false;
  }

  setVisible(name: string, visible: boolean): void {
    const item = this.items.get(name);
    if (item) item.visible = visible;
  }

  style(name: string): Style {
    return this.items.get(name)?.style ?? 'wire';
  }

  setStyle(name: string, style: Style): void {
    const item = this.items.get(name);
    if (item) item.style = style;
  }

  /** Compile and assign. Throws ShaderCompileError and leaves the old shader in place. */
  setShader(name: string, source: ShaderPair): void {
    const item = this.items.get(name);
    if (!item || this.lost) return;
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

    this.disposeShader(item);
    item.pipeline = pipeline;
    item.basic = basic;
    item.source = { vertex: source.vertex, fragment: source.fragment };
    if (pipeline) this.allocateCapture(item, pipeline.layout.slots);
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
    const w = this.world;

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
      staccato_skyTop: v3(w.skyTop),
      staccato_skyHorizon: v3(w.skyHorizon),
      staccato_skyBottom: v3(w.skyBottom),
      staccato_sunDirection: v3(normalize(w.sunDirection)),
      staccato_sunColor: v3(w.sunColor),
      staccato_sunSize: w.sunSize,
      staccato_haze: w.haze,
      staccato_fog: w.fog,
      staccato_ocean: w.ocean,
      staccato_oceanY: w.oceanY,
      staccato_water: v3(w.water),
      staccato_waves: w.waves,
      staccato_studio: w.studio,
      staccato_lightA: v3(w.lightA),
      staccato_lightB: v3(w.lightB),
      staccato_wireColor: v3(w.wireColor),
      staccato_wireTint: w.wireTint,
      staccato_metal: v3(w.metal),
      staccato_iridescence: w.iridescence,
      staccato_glassTint: v3(w.glassTint),
      staccato_frost: w.frost,
      staccato_glow: w.glow,
    };
    const itemUniforms = (item: Item): Record<string, UniformValue> => ({
      staccato_objectMatrix: item.objectMatrix,
      staccato_instances: item.instanceTexture,
      staccato_instanceCount: item.instanceCount,
      size: item.shape.geometry.radius,
    });
    const visible = [...this.items.values()].filter((it) => it.visible && (it.pipeline || it.basic));

    if (!this.post) {
      // Basic path: straight to the canvas.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(...w.skyHorizon, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawBasic(visible, shared, itemUniforms);
      return;
    }

    // 1. Run every object's vertex shader into its capture textures.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    for (const item of visible) {
      if (!item.pipeline || !item.capture) continue;
      const g = item.shape.geometry;
      gl.bindFramebuffer(gl.FRAMEBUFFER, item.capture.fbo);
      gl.viewport(0, 0, g.cols, g.rows * item.instanceCount);
      const p = item.pipeline.capture;
      p.use();
      p.set(shared);
      p.set(itemUniforms(item));
      p.set({ staccato_grid: new Int32Array([g.cols, g.rows]) });
      gl.bindVertexArray(item.shape.vao);
      gl.drawArraysInstanced(gl.POINTS, 0, item.shape.vertexCount, item.instanceCount);
    }

    // 2. The world: sky, and the ocean, which writes depth so things can stand in it.
    this.post.begin();
    gl.bindVertexArray(this.empty);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.ALWAYS);
    gl.depthMask(true);
    this.background!.use();
    this.background!.set(shared);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LEQUAL);

    const surfaces = (materials: Material[], behind?: WebGLTexture) => {
      for (const item of visible) {
        const material = materialOf(item.style);
        if (!item.pipeline || !material || !materials.includes(material)) continue;
        const g = item.shape.geometry;
        const p = item.pipeline.surface;
        p.use();
        p.set(shared);
        p.set(itemUniforms(item));
        p.set({
          ...this.captureUniforms(item),
          staccato_grid: new Int32Array([g.cols, g.rows]),
          staccato_wrap: new Int32Array([Number(g.wrapX), Number(g.wrapY)]),
          staccato_tint: item.def.tint ?? 0.35,
          staccato_material: MATERIAL_ID[material],
          ...(behind ? { staccato_behind: behind } : {}),
        });
        gl.bindVertexArray(item.shape.vao);
        gl.drawElementsInstanced(gl.TRIANGLES, item.shape.triangleCount, gl.UNSIGNED_INT, 0, item.instanceCount);
      }
    };
    const wires = () => {
      gl.enable(gl.BLEND);
      if (w.additive) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.bindVertexArray(this.empty);
      for (const item of visible) {
        if (!item.pipeline || !hasWire(item.style)) continue;
        const over = item.style !== 'wire';
        const p = item.pipeline.lines;
        p.use();
        p.set(shared);
        p.set(itemUniforms(item));
        p.set({
          ...this.captureUniforms(item),
          staccato_edges: item.shape.edgeTexture,
          staccato_rows: item.shape.geometry.rows,
          staccato_lineWidth: (item.def.lineWidth ?? 1.2) * w.lineScale * this.pixelRatio * (over ? 0.6 : 1),
          // Over a surface the wire is a fine engraving, not a coat of paint;
          // additive wires stack up where they overlap, so each gets less.
          staccato_lineAlpha: (over ? 0.16 : 1) * w.wireAlpha * (w.additive ? 0.45 : 1),
        });
        gl.drawArraysInstanced(gl.TRIANGLES, 0, item.shape.edgeCount * 6, item.instanceCount);
      }
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    };

    // 3. Opaque surfaces, then every wire.
    surfaces(['chrome', 'paint']);
    wires();
    this.post.colorOnly(true);
    this.drawBasic(visible.filter((it) => it.basic), shared, itemUniforms);
    this.post.colorOnly(false);

    // 4. Glass refracts the frame so far. It marks the stencil where it lands;
    //    wires in front of the glass are then drawn again over just those pixels.
    if (visible.some((it) => it.pipeline && materialOf(it.style) === 'glass')) {
      const behind = this.post.snapshot();
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      surfaces(['glass'], behind);
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      wires();
      gl.disable(gl.STENCIL_TEST);
    }

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const f = (k: string) => (typeof uniforms[k] === 'number' ? (uniforms[k] as number) : 0);
    if (w.hud > 0) this.hud!.update(width, height, this.pixelRatio, this.hudInfo);
    this.post.finish({
      bloomStrength: w.bloom,
      aberration: w.aberration * (1 + f('onset') * 2.5),
      vignette: w.vignette,
      grain: w.grain,
      dream: w.dream,
      halation: w.halation,
      halationTint: v3(w.halationTint),
      saturation: w.saturation,
      contrast: w.contrast,
      lift: v3(w.lift),
      duotone: w.duotone,
      shadowTint: v3(w.shadowTint),
      highlightTint: v3(w.highlightTint),
      hudAmount: w.hud,
      meters: new Float32Array([f('bass'), f('mid'), f('treble'), f('level')]),
      onsetMeter: f('onset'),
      pixelRatio: this.pixelRatio,
    }, this.hud!.texture);
    gl.bindVertexArray(null);
  }

  private drawBasic(items: Item[], shared: Record<string, UniformValue>, itemUniforms: (it: Item) => Record<string, UniformValue>): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const item of items) {
      if (!item.basic) continue;
      item.basic.use();
      item.basic.set(shared);
      item.basic.set(itemUniforms(item));
      gl.bindVertexArray(item.shape.wireVao);
      gl.drawElementsInstanced(gl.LINES, item.shape.wireCount, gl.UNSIGNED_INT, 0, item.instanceCount);
    }
  }

  private captureUniforms(item: Item): Record<string, UniformValue> {
    const out: Record<string, UniformValue> = {};
    item.capture?.textures.forEach((t, i) => (out[`staccato_cap${i}`] = t));
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
  }

  /** GPU buffers for a named geometry, built on first use. */
  private shape(name: GeometryName): Shape {
    let shape = this.shapes.get(name);
    if (!shape) {
      shape = this.upload(build(GEOMETRIES[name]));
      this.shapes.set(name, shape);
    }
    return shape;
  }

  private upload(geometry: Geometry): Shape {
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
      geometry,
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

  private instanceTexture(matrices: Mat4[]): WebGLTexture {
    const gl = this.gl;
    const data = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => data.set(m, i * 16));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Four texels per row = the four columns of one copy's matrix.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, matrices.length, 0, gl.RGBA, gl.FLOAT, data);
    setNearest(gl);
    return tex;
  }

  private allocateCapture(item: Item, slots: number): void {
    const gl = this.gl;
    const g = item.shape.geometry;
    const width = g.cols, height = g.rows * item.instanceCount;
    const key = `${width}x${height}x${slots}`;
    if (item.capture?.key === key) return;
    this.releaseCapture(item);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const textures: WebGLTexture[] = [];
    for (let i = 0; i < slots; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      // 32-bit: positions run into the thousands and half floats would shimmer.
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
      setNearest(gl);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      textures.push(t);
    }
    gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    item.capture = { fbo, textures, key };
  }

  private releaseCapture(item: Item): void {
    if (!item.capture) return;
    this.gl.deleteFramebuffer(item.capture.fbo);
    for (const t of item.capture.textures) this.gl.deleteTexture(t);
    item.capture = null;
  }

  private disposeShader(item: Item): void {
    item.basic?.dispose();
    item.pipeline?.capture.dispose();
    item.pipeline?.lines.dispose();
    item.pipeline?.surface.dispose();
    item.basic = null;
    item.pipeline = null;
  }

  private disposeItem(item: Item): void {
    this.disposeShader(item);
    this.releaseCapture(item);
    this.gl.deleteTexture(item.instanceTexture);
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

function normalize(v: RGB): RGB {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
