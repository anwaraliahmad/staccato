// Utilities for shaderwork
// Copyright (c) 2017-2018 Anwar Ali-Ahmad
// Licensed under MIT

export default class ShaderUtil {
  public static genVertexShader(): string {
    let shader = "";
    // Basic uniforms
    shader += "uniform float time;\n"
              + "uniform float frequency[512];\n";
    // Basic helper function(s)
    shader += "float radius() {\n"
              + "return sqrt(position.x*position.x + position.y*position.y);\n"
              + "}\n";
    // Magic sauce for music visualization
    shader += "float getFreqData(float n) {\n" +
              " return abs(frequency[int(n)]);\n" +
              "}\n";
    shader += "void main() { \n";

    let disp = "(";
    function _dFunct(n) {
      if (n > 0) {
        return `radius()*time/180.`;
      } else {
        --n;
      }
      for (let i = 0; i < n + 1; i++) {
        const ff = Math.floor(Math.random() * 3) + 1;
        let t;
        switch (ff) {
            case 0: t = "getFreqData";
                    break;
            case 1: t = "cos";
                    break;
            case 2: t = "log";
                    break;
            case 3: t = "sin";
                    break;
        }
        return `${(Math.random() * 12.0 * (1 / (n + 1)))}*${t}(${_dFunct(n)})`;
      }
    }

    let ed = "";
    for (let p = 0; p < Math.floor(Math.random() * 1) + 2; p++) {
      const type = Math.floor(Math.random() * 4);
      let f;
      switch (type) {
        case 0: f = "sin"; break;
        case 1: f = "cos"; break;
        case 2: f = "log"; break;
        case 3: f = "getFreqData"; break;

      }
      if (p > 0) {
        ed = "+";
      }
      const dd = _dFunct(5);
      disp += ed + (Math.random() * 100.0) + "*" + f + "(" + dd + ")";
      /*if (f === "getFreqData") {
        disp = `* ${disp}`;
      }*/
    }
    disp += ")";
    shader += "gl_Position =  projectionMatrix * modelViewMatrix * vec4(position + normal*" + disp + ", 1.0 );\n";
    shader += "}";
    return shader;
   
  }

  
  private static _genFragFunction(count: number): string {
    // No more functions to generate
    if (count <= 1)  {
      return "time/180.";
    }
    count--;
    let shaderFunct: string; // The string holding shader function
    for (let i: number = 0; i <= count; i++) {
      // Randomly select next shader function type
      const ff: number = Math.floor(Math.random() * 3);
      let functType: string;
      switch (ff) {
          case 0: functType = "cos";
                  break;
          case 1: functType = "log";
                  break;
          case 2: functType = "sin";
                  break;
      }
      // Random number to scale fragment return intensity
      const randomScale: number =  Math.random() * 12.0
      // Shader string for function call (recursively generate more functions
      const subShaderFunct: string = this._genFragFunction(count);
      const functTypeCall: string = `${functType}(${subShaderFunct})`;
      // Damping scale of function
      const dampingScale: number = (randomScale * (1 / (count + 1)));
      // Final shader string
      shaderFunct =  `${dampingScale}*${functTypeCall}`; 
    }

    // Return the shader function
    return shaderFunct;
  }

  public static genFragmentShader(): string {
    const shaderOrder = 2;

    let shader: string = "";
    shader += "uniform float time;\n";
    shader += "void main() { \n";
    const shaderFunct: string = this._genFragFunction(shaderOrder);
    shader += `gl_FragColor = vec4(.1*sin(${shaderFunct}), 0.1*cos(${shaderFunct}), 0.1, 1.0);\n`;
    shader += "}";
    return shader;
  }
}
