class Shader {
  public static DEFAULT_UNIFORMS: {} = {
    "time": 0.0
  };

  private uniforms: {[key: string]: any};
  private vertexShader: string;
  private fragmentShader: string;

  constructor() {
    this.vertexShader = "";
    this.fragmentShader = "";
    this.uniforms = Object.assign({}, Shader.DEFAULT_UNIFORMS);
  }
}
