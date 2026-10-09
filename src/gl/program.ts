import { assemble, parseInfoLog, type CompileError, type Stage } from './glsl';

export class ShaderCompileError extends Error {
  constructor(readonly errors: CompileError[]) {
    super(errors.map((e) => `${e.stage}${e.line ? `:${e.line}` : ''} ${e.message}`).join('\n'));
    this.name = 'ShaderCompileError';
  }
}

export type UniformValue = number | boolean | Float32Array | Int32Array | WebGLTexture;

interface UniformSlot {
  location: WebGLUniformLocation;
  type: number;
  /** Texture unit for samplers. */
  unit: number;
}

/** A linked vertex/fragment pair with its active uniforms resolved. */
export class Program {
  readonly uniforms = new Map<string, UniformSlot>();
  readonly attributes = new Map<string, number>();

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly handle: WebGLProgram,
  ) {
    let unit = 0;
    const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(handle, i);
      const location = info && gl.getUniformLocation(handle, info.name);
      if (!info || !location) continue;
      const isSampler = info.type === gl.SAMPLER_2D || info.type === gl.UNSIGNED_INT_SAMPLER_2D || info.type === gl.INT_SAMPLER_2D;
      this.uniforms.set(info.name.replace(/\[0\]$/, ''), { location, type: info.type, unit: isSampler ? unit++ : -1 });
    }
    const attribs = gl.getProgramParameter(handle, gl.ACTIVE_ATTRIBUTES) as number;
    for (let i = 0; i < attribs; i++) {
      const info = gl.getActiveAttrib(handle, i);
      if (info) this.attributes.set(info.name, gl.getAttribLocation(handle, info.name));
    }
  }

  /** Compile a user's shader pair as-is, throwing ShaderCompileError with source-relative line numbers. */
  static compile(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
    return Program.link(gl, assemble(vertex, 'vertex'), assemble(fragment, 'fragment'));
  }

  /** Compile and link complete sources (from assemble() or the pass generators). */
  static link(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
    const vs = compileStage(gl, gl.VERTEX_SHADER, vertex, 'vertex');
    const fs = compileStage(gl, gl.FRAGMENT_SHADER, fragment, 'fragment');
    const errors = [...vs.errors, ...fs.errors];
    if (errors.length) {
      gl.deleteShader(vs.shader);
      gl.deleteShader(fs.shader);
      throw new ShaderCompileError(errors);
    }
    const program = gl.createProgram();
    // Fixed attribute slots so every program shares one VAO per mesh.
    gl.bindAttribLocation(program, 0, 'position');
    gl.bindAttribLocation(program, 1, 'normal');
    gl.bindAttribLocation(program, 2, 'uv');
    gl.attachShader(program, vs.shader);
    gl.attachShader(program, fs.shader);
    gl.linkProgram(program);
    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'link failed';
      gl.deleteProgram(program);
      throw new ShaderCompileError([{ stage: 'fragment', line: 0, message: log.trim() }]);
    }
    return new Program(gl, program);
  }

  use(): void {
    this.gl.useProgram(this.handle);
  }

  /** Set any subset of uniforms; names the shader doesn't use are ignored. */
  set(values: Record<string, UniformValue>): void {
    const gl = this.gl;
    for (const name in values) {
      const slot = this.uniforms.get(name);
      if (!slot) continue;
      const v = values[name]!;
      switch (slot.type) {
        case gl.FLOAT:
          gl.uniform1f(slot.location, v as number);
          break;
        case gl.INT:
        case gl.BOOL:
          gl.uniform1i(slot.location, Number(v));
          break;
        case gl.INT_VEC2:
          gl.uniform2iv(slot.location, v as Int32Array);
          break;
        case gl.FLOAT_VEC2:
          gl.uniform2fv(slot.location, v as Float32Array);
          break;
        case gl.FLOAT_VEC3:
          gl.uniform3fv(slot.location, v as Float32Array);
          break;
        case gl.FLOAT_MAT3:
          gl.uniformMatrix3fv(slot.location, false, v as Float32Array);
          break;
        case gl.FLOAT_MAT4:
          gl.uniformMatrix4fv(slot.location, false, v as Float32Array);
          break;
        case gl.SAMPLER_2D:
        case gl.UNSIGNED_INT_SAMPLER_2D:
        case gl.INT_SAMPLER_2D:
          gl.activeTexture(gl.TEXTURE0 + slot.unit);
          gl.bindTexture(gl.TEXTURE_2D, v as WebGLTexture);
          gl.uniform1i(slot.location, slot.unit);
          break;
      }
    }
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle);
  }
}

function compileStage(gl: WebGL2RenderingContext, type: number, source: string, stage: Stage) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) as boolean;
  const errors = ok ? [] : parseInfoLog(gl.getShaderInfoLog(shader) ?? 'compile failed', stage);
  return { shader, errors: ok ? [] : errors.length ? errors : [{ stage, line: 0, message: 'compile failed' }] };
}
