// The industrial overlay: structure lines, a reticle, a ruler, and real data —
// the selected shape's live GLSL, the analyser's parameters, labels for the
// band meters (which the composite draws, since they move every frame).
// Drawn with Canvas 2D into a texture so recordings include it; redrawn only
// when what it shows changes.

export interface HudInfo {
  look: string;
  shape: string;
  shader: string;
  source: string;
  sampleRate: number;
  fftSize: number;
}

export class Hud {
  readonly texture: WebGLTexture;
  private readonly canvas = document.createElement('canvas');
  private key = '';

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  update(width: number, height: number, pixelRatio: number, info: HudInfo): void {
    const key = `${width}x${height}@${pixelRatio}|${info.look}|${info.shape}|${info.shader}|${info.source.length}|${info.sampleRate}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(width, height, pixelRatio, info);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  private draw(w: number, h: number, px: number, info: HudInfo): void {
    const c = this.canvas;
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = g.fillStyle = '#fff';
    g.lineWidth = px;
    const crisp = (v: number) => Math.round(v) + 0.5;
    const line = (x0: number, y0: number, x1: number, y1: number, alpha: number) => {
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(crisp(x0), crisp(y0));
      g.lineTo(crisp(x1), crisp(y1));
      g.stroke();
    };

    // Structure: a few long lines, like the mullions of a glass wall.
    const cols = [0.25, 0.75].map((f) => f * w);
    const rows = [0.32, 0.82].map((f) => f * h);
    for (const x of cols) line(x, 0, x, h, 0.3);
    for (const y of rows) line(0, y, w, y, 0.3);

    // Translucent panels.
    g.globalAlpha = 0.1;
    g.fillRect(cols[0]! + 18 * px, rows[0]! - 70 * px, w * 0.22, 38 * px);
    g.globalAlpha = 0.06;
    g.fillRect(0, rows[1]!, w, 22 * px);

    // Ruler along the lower rule.
    for (let x = 0, i = 0; x < w; x += 8 * px, i++) line(x, rows[1]!, x, rows[1]! - (i % 8 === 0 ? 9 : 4) * px, 0.35);

    // Reticle around the heart.
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
    g.globalAlpha = 0.28;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.18;
    g.beginPath();
    g.arc(cx, cy, r * 1.04, -0.5, 0.9);
    g.stroke();
    const gap = 10 * px, arm = 22 * px;
    line(cx - gap - arm, cy, cx - gap, cy, 0.5);
    line(cx + gap, cy, cx + gap + arm, cy, 0.5);
    line(cx, cy - gap - arm, cx, cy - gap, 0.5);
    line(cx, cy + gap, cx, cy + gap + arm, 0.5);

    // A faint globe — the sphere's own grid, flattened onto the glass.
    const gx = w * 0.82, gy = h * 0.6, gr = h * 0.42;
    g.globalAlpha = 0.12;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.ellipse(gx, gy, gr * Math.cos((i / 6) * (Math.PI / 2)), gr, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(gx, gy - gr * Math.sin((i / 6) * (Math.PI / 2)) * 0.98, gr * Math.cos((i / 6) * (Math.PI / 2)), gr * 0.12, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // The live source, set like a code layer.
    const mono = `${10 * px}px ui-monospace, Menlo, Consolas, monospace`;
    g.font = mono;
    g.globalAlpha = 0.42;
    const lines = info.source.replace(/\t/g, '  ').split('\n').slice(0, Math.floor((h * 0.55) / (13 * px)));
    lines.forEach((text, i) => g.fillText(text.slice(0, 80), 24 * px, 96 * px + i * 13 * px));

    // Specification block.
    g.globalAlpha = 0.75;
    g.font = `${11 * px}px ui-monospace, Menlo, Consolas, monospace`;
    const spec = [
      `STACCATO / ${info.look.toUpperCase()}`,
      `${info.shape.toUpperCase()} : ${info.shader.toUpperCase()}`,
      `FFT ${info.fftSize} · ${Math.round(info.sampleRate / 100) / 10} KHZ · 512 BINS`,
      '2016 — 2026',
    ];
    spec.forEach((text, i) => g.fillText(text, 24 * px, rows[1]! + 40 * px + i * 15 * px));

    // Meter labels, beside the dots the composite draws.
    g.globalAlpha = 0.6;
    g.font = `${9 * px}px ui-monospace, Menlo, Consolas, monospace`;
    g.textAlign = 'right';
    ['BASS', 'MID', 'TREBLE', 'LEVEL', 'ONSET'].forEach((label, i) => {
      g.fillText(label, w - 54 * px, h - (46 + (4 - i) * 18) * px + 3 * px);
    });
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }
}
