import * as THREE from 'three';

/*
 * Represents data for a single shader (vert/frag, DOM)
 */
class Shader {
  public static DEFAULT_UNIFORMS: {} = {
    "time": 0.0
  };

  id: string;
  element: Element;
  uniforms: {[key: string]: any};
  vertex: Element;
  fragment: Element;

  constructor(tagName: string = "div", id: string = "n/a") {
    this.id = id;
    this.element = document.createElement(tagName);
    this.vertex = document.createElement("script");
    this.fragment = document.createElement("script");
    this.uniforms = Object.assign({}, Shader.DEFAULT_UNIFORMS);
  }

  setShaderHTML(id: string, innerHTML: string, isVertex: boolean = true) {
    const shaderRef: Element = (isVertex) ? this.vertex : this.fragment;
    try {
      shaderRef.id = id;
      shaderRef.innerHTML = innerHTML;
    } catch (e) {
      console.error(`Setting ${isVertex ? 'vertex' : 'frag'} shader script content failed`, e);
    }    
  }
}

// Container for additional shaders
class Shaders extends Array<Shader> {
  readonly DOM_ID = 'shaders';
  element: Element = document.getElementById(this.DOM_ID);

  constructor(){
    super();
  }

  add(ele) {
    this.element.appendChild(ele);
    this.push(ele);
  }
}

export { Shader, Shaders }