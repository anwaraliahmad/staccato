import { plane, sphere, wireframe, type Geometry, type ShapeKind } from './geometry';
import { BINS, HISTORY } from './glsl';
import { invert, multiply, normalMatrix, translateRotateX, type Mat4, type Vec3 } from './math';
import { BACKGROUND_SHADERS, EDGE_TEXTURE_WIDTH, captureLayout, captureShaders, lineShaders, surfaceShaders, type CaptureLayout } from './passes';
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

/** How a shape is drawn. */
export type Style = 'wire' | 'chrome' | 'both';
export const STYLES: Style[] = ['wire', 'chrome', 'both'];

type RGB = [number, number, number];

/** Everything about the look that isn't a shader: the studio and the lens. */
export interface Look {
  skyTop: RGB;
  skyHorizon: RGB;
  skyBottom: RGB;
  /** Softbox and ring light. */
  lightA: RGB;
  /** Low counter-light. */
  lightB: RGB;
  /** Additive wires glow on dark paper; on light paper they'd wash out. */
  additive: boolean;
  glow: number;
  bloom: number;
  aberration: number;
  vignette: number;
  grain: number;
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

  look: Look = LOOKS['16'];
  pixelRatio = 1;

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

    const shared: Record<string, UniformValue> = {
      ...uniforms,
      viewMatrix: view,
      projectionMatrix: projection,
      cameraPosition: new Float32Array(eye),
      spectrumTex: this.spectrumTex,
      historyTex: this.historyTex,
      historyHead: (this.historyRow + 0.5) / HISTORY,
      staccato_inverseProjection: this.inverseProjection,
      staccato_inverseViewProjection: this.inverseViewProjection,
      staccato_skyTop: new Float32Array(look.skyTop),
      staccato_skyHorizon: new Float32Array(look.skyHorizon),
      staccato_skyBottom: new Float32Array(look.skyBottom),
      staccato_lightA: new Float32Array(look.lightA),
      staccato_lightB: new Float32Array(look.lightB),
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

    // 2. Backdrop.
    this.post.begin();
    gl.bindVertexArray(this.empty);
    this.background!.use();
    this.background!.set(shared);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 3. Chrome.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    for (const mesh of visible) {
      if (!mesh.pipeline || mesh.style === 'wire') continue;
      const p = mesh.pipeline.surface;
      p.use();
      p.set(shared);
      p.set(meshUniforms(mesh));
      p.set({ ...this.captureUniforms(mesh), staccato_wrapX: mesh.def.kind === 'sphere', staccato_tint: 0.35 });
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.triangleCount, gl.UNSIGNED_INT, 0);
    }

    // 4. Wires: depth-tested against the chrome, not against each other.
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    if (look.additive) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.empty);
    for (const mesh of visible) {
      if (!mesh.pipeline || mesh.style === 'chrome') continue;
      const p = mesh.pipeline.lines;
      p.use();
      p.set(shared);
      p.set(meshUniforms(mesh));
      p.set({
        ...this.captureUniforms(mesh),
        staccato_edges: mesh.edgeTexture,
        staccato_lineWidth: mesh.def.lineWidth * this.pixelRatio * (mesh.style === 'both' ? 0.6 : 1),
        // Over chrome the wire is a fine engraving, not a coat of paint.
        // Additive wires stack up where they overlap; give them less each.
        staccato_lineAlpha: (mesh.style === 'both' ? 0.14 : 1) * (look.additive ? 0.45 : 1),
      });
      gl.drawArrays(gl.TRIANGLES, 0, mesh.edgeCount * 6);
    }

    // Shaders that couldn't take the enhanced path still draw, thinly.
    this.post.colorOnly(true);
    this.drawBasic(visible.filter((m) => m.basic), shared, meshUniforms);
    this.post.colorOnly(false);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    const onset = typeof uniforms['onset'] === 'number' ? uniforms['onset'] : 0;
    this.post.finish({
      bloomStrength: look.bloom,
      aberration: look.aberration * (1 + onset * 2.5),
      vignette: look.vignette,
      grain: look.grain,
    });
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
        style: 'wire',
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

// The studios. '16 keeps the original lavender (0xC0C0FF at half alpha over
// #bbbbbb); chrome reflects it, so the whole scene stays in that key.
export const LOOKS = {
  '16': {
    skyTop: [0.56, 0.58, 0.9],
    skyHorizon: [0.9, 0.89, 0.97],
    skyBottom: [0.47, 0.44, 0.62],
    lightA: [1.0, 0.98, 1.0],
    lightB: [1.0, 0.72, 0.86],
    additive: false,
    glow: 0.55,
    bloom: 0.7,
    aberration: 0.004,
    vignette: 0.35,
    grain: 0.018,
  },
  '17': {
    skyTop: [0.82, 0.86, 0.95],
    skyHorizon: [1.0, 1.0, 1.0],
    skyBottom: [0.72, 0.73, 0.78],
    lightA: [1.0, 1.0, 1.0],
    lightB: [0.75, 0.9, 1.0],
    additive: false,
    glow: 0.4,
    bloom: 0.5,
    aberration: 0.003,
    vignette: 0.2,
    grain: 0.012,
  },
  night: {
    skyTop: [0.02, 0.02, 0.06],
    skyHorizon: [0.2, 0.08, 0.32],
    skyBottom: [0.0, 0.0, 0.015],
    lightA: [0.75, 0.95, 1.0],
    lightB: [1.0, 0.25, 0.75],
    additive: true,
    glow: 0.5,
    bloom: 0.9,
    aberration: 0.005,
    vignette: 0.55,
    grain: 0.025,
  },
} satisfies Record<string, Look>;
export type LookName = keyof typeof LOOKS;
