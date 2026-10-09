// Staccato — WebGL music visualizer using shaders and FFT audio data.
// Copyright (c) 2016–2026 Anwar Ali-Ahmad. MIT License.

import { AudioEngine, type SourceKind } from './audio/engine';
import type { Scale } from './audio/spectrum';
import { CameraRig } from './camera';
import { generate, randomSeed, seedFromId } from './generate/generator';
import type { CompileError } from './gl/glsl';
import { ShaderCompileError } from './gl/program';
import { LOOKS, NoWebGL2Error, Renderer, STYLES, type LookName, type ShapeDef, type Style } from './gl/renderer';
import { Recorder, download } from './recorder';
import { BUILTIN, type ShaderSource } from './shaders';
import { Editor } from './ui/editor';

// The November 2016 scene: a heart between a wave and an abyss.
// Now the heart is liquid chrome under a fine wire, and the planes glow.
const SHAPES: (ShapeDef & { shader: string; style: Style })[] = [
  { name: 'sphere', kind: 'sphere', size: 300, segments: [128, 128], position: [0, 0, 0], rotX: 0, lineWidth: 0.9, shader: 'heart', style: 'both' },
  { name: 'ceiling', kind: 'plane', size: 3000, segments: [32, 32], position: [0, 1200, 0], rotX: Math.PI / 2, lineWidth: 1.6, shader: 'wave', style: 'wire' },
  { name: 'floor', kind: 'plane', size: 3000, segments: [32, 32], position: [0, -1200, 0], rotX: Math.PI / 2, lineWidth: 1.6, shader: 'abyss', style: 'wire' },
];

const PAPERS = LOOKS;
type Paper = LookName;
const cssColor = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;

const HISTORY_RATE = 60; // spectrum history rows per second, independent of frame rate
const EDITS_KEY = 'staccato:edits';

interface Entry extends ShaderSource {
  original: { vertex: string; fragment: string };
  generated: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Staccato {
  readonly renderer: Renderer;
  readonly camera: CameraRig;
  readonly audio: AudioEngine;
  readonly library = new Map<string, Entry>();
  readonly assignment = new Map<string, string>();
  selected = 'sphere';
  paper: Paper = '16';
  time = 0;

  private readonly canvas = $<HTMLCanvasElement>('stage');
  private readonly recorder = new Recorder();
  private readonly editor: Editor;
  private last = performance.now();
  private historyClock = 0;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.renderer = new Renderer(this.canvas, SHAPES);
    this.camera = new CameraRig(this.canvas);
    this.audio = new AudioEngine({
      onSourceChange: (kind) => this.onSourceChange(kind),
      onBlocked: () => this.status('tap anywhere to start the sound', { attention: true, sticky: true }),
      onError: (message) => this.status(message, { sticky: false }),
    });
    this.editor = new Editor({
      apply: (vertex, fragment) => this.applyEdit(vertex, fragment),
      revert: () => this.revertEdit(),
      closed: () => this.canvas.focus(),
    });

    for (const source of BUILTIN) this.addToLibrary(source, false);
    this.restoreEdits();
    for (const shape of SHAPES) {
      this.assignment.set(shape.name, shape.shader);
      this.renderer.setStyle(shape.name, shape.style);
    }
    this.readHash();
    for (const [shape, id] of this.assignment) {
      if (!this.assign(shape, id)) this.assign(shape, SHAPES.find((s) => s.name === shape)!.shader);
    }

    this.bindUi();
    this.renderLists();
    window.addEventListener('staccato:shaders', (e) => this.hotReload((e as CustomEvent<ShaderSource[]>).detail));
    this.status('drop a song here, or try the demo', { sticky: true });
  }

  start(): void {
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      this.frame(now);
    };
    requestAnimationFrame(frame);
  }

  // ——— shaders ———

  /** Put a shader from the library on a shape. Returns false if it doesn't compile. */
  assign(shape: string, id: string): boolean {
    let entry = this.library.get(id);
    if (!entry) {
      const seed = seedFromId(id);
      if (seed === null) return false;
      entry = this.addToLibrary(generate(seed), true);
    }
    try {
      this.renderer.setShader(shape, entry);
    } catch (e) {
      console.error(`[staccato] ${id} on ${shape}:\n${(e as Error).message}`);
      this.status(`${id} didn't compile — see the console`);
      return false;
    }
    this.assignment.set(shape, id);
    this.writeHash();
    this.renderLists();
    if (this.editor.isOpen && shape === this.selected) this.openEditor();
    return true;
  }

  /** Generate a new shader (2017's "+") and put it on the selected shape. */
  generate(seed = randomSeed()): string {
    const source = generate(seed);
    this.addToLibrary(source, true);
    this.assign(this.selected, source.id);
    this.status(`${source.id} — seed 0x${seed.toString(16)}`);
    return source.id;
  }

  select(shape: string): void {
    if (!this.assignment.has(shape)) return;
    this.selected = shape;
    this.renderLists();
    if (this.editor.isOpen) this.openEditor();
  }

  // ——— loop ———

  private frame(now: number): void {
    const delta = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += delta;

    const dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    this.renderer.pixelRatio = dpr;
    this.renderer.resize(width, height);
    this.camera.update(delta, width / height);

    const f = this.audio.analyse(now / 1000);
    this.renderer.uploadSpectrum(f.spectrumDb);
    this.historyClock += delta;
    for (let i = 0; i < 4 && this.historyClock >= 1 / HISTORY_RATE; i++) {
      this.renderer.pushHistory(f.spectrum);
      this.historyClock -= 1 / HISTORY_RATE;
    }
    this.historyClock %= 1 / HISTORY_RATE;

    this.renderer.render(this.camera.view, this.camera.projection, this.camera.eye, {
      time: this.time,
      minDecibels: this.audio.minDb,
      maxDecibels: this.audio.maxDb,
      mDb: this.audio.minDb,
      od: f.od,
      level: f.level,
      onset: f.onset,
      bass: f.bass,
      mid: f.mid,
      treble: f.treble,
      resolution: new Float32Array([width, height]),
      mouse: this.camera.pointer,
    });
  }

  // ——— editor ———

  private openEditor(): void {
    const id = this.assignment.get(this.selected)!;
    const entry = this.library.get(id)!;
    this.editor.open(this.editorTitle(), entry.vertex, entry.fragment);
  }

  private editorTitle(): string {
    const id = this.assignment.get(this.selected)!;
    const entry = this.library.get(id)!;
    return `${this.selected} · ${id}${isEdited(entry) ? ' (edited)' : ''} — ${entry.note}`;
  }

  private applyEdit(vertex: string, fragment: string): CompileError[] {
    const id = this.assignment.get(this.selected)!;
    const entry = this.library.get(id)!;
    try {
      this.renderer.setShader(this.selected, { vertex, fragment });
    } catch (e) {
      if (e instanceof ShaderCompileError) return e.errors;
      return [{ stage: 'fragment', line: 0, message: String(e) }];
    }
    entry.vertex = vertex;
    entry.fragment = fragment;
    // Every other shape wearing this shader picks up the edit too.
    for (const [shape, other] of this.assignment) {
      if (other === id && shape !== this.selected) this.renderer.setShader(shape, entry);
    }
    this.saveEdits();
    this.editor.setTitle(this.editorTitle());
    this.renderLists();
    return [];
  }

  private revertEdit(): void {
    const id = this.assignment.get(this.selected)!;
    const entry = this.library.get(id)!;
    entry.vertex = entry.original.vertex;
    entry.fragment = entry.original.fragment;
    this.saveEdits();
    for (const [shape, other] of this.assignment) if (other === id) this.assign(shape, id);
    this.openEditor();
  }

  private hotReload(sources: ShaderSource[]): void {
    for (const source of sources) {
      const entry = this.library.get(source.id);
      if (!entry) {
        this.addToLibrary(source, false);
        continue;
      }
      const wasEdited = isEdited(entry);
      entry.original = { vertex: source.vertex, fragment: source.fragment };
      if (!wasEdited) Object.assign(entry, { vertex: source.vertex, fragment: source.fragment, note: source.note });
      for (const [shape, id] of this.assignment) if (id === source.id) this.assign(shape, id);
    }
    this.renderLists();
  }

  private addToLibrary(source: ShaderSource, generated: boolean): Entry {
    const existing = this.library.get(source.id);
    if (existing) return existing;
    const entry: Entry = {
      ...source,
      note: source.note || 'generated',
      original: { vertex: source.vertex, fragment: source.fragment },
      generated,
    };
    this.library.set(source.id, entry);
    return entry;
  }

  private saveEdits(): void {
    const edits: Record<string, { vertex: string; fragment: string }> = {};
    for (const [id, entry] of this.library) {
      if (isEdited(entry)) edits[id] = { vertex: entry.vertex, fragment: entry.fragment };
    }
    try {
      localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
    } catch {
      // Storage unavailable (private mode, quota): edits live for this session only.
    }
  }

  private restoreEdits(): void {
    let edits: Record<string, { vertex: string; fragment: string }> = {};
    try {
      edits = JSON.parse(localStorage.getItem(EDITS_KEY) ?? '{}') as typeof edits;
    } catch {
      return;
    }
    for (const [id, edit] of Object.entries(edits)) {
      let entry = this.library.get(id);
      const seed = seedFromId(id);
      if (!entry && seed !== null) entry = this.addToLibrary(generate(seed), true);
      if (entry && typeof edit.vertex === 'string' && typeof edit.fragment === 'string') {
        entry.vertex = edit.vertex;
        entry.fragment = edit.fragment;
      }
    }
  }

  // ——— state in the URL: share a scene by sharing the link ———

  private readHash(): void {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const shape of SHAPES) {
      const id = params.get(shape.name);
      if (id) this.assignment.set(shape.name, id);
    }
    for (const shape of SHAPES) {
      const style = params.get(`${shape.name}Style`);
      if (style && (STYLES as string[]).includes(style)) this.renderer.setStyle(shape.name, style as Style);
    }
    const paper = params.get('paper');
    if (paper && paper in PAPERS) this.setPaper(paper as Paper);
    const scale = params.get('scale');
    if (scale === 'linear' || scale === 'log') this.audio.scale = scale;
  }

  private writeHash(): void {
    const params = new URLSearchParams();
    for (const [shape, id] of this.assignment) params.set(shape, id);
    for (const shape of SHAPES) {
      const style = this.renderer.style(shape.name);
      if (style !== shape.style) params.set(`${shape.name}Style`, style);
    }
    if (this.paper !== '16') params.set('paper', this.paper);
    if (this.audio.scale !== 'log') params.set('scale', this.audio.scale);
    history.replaceState(null, '', `#${params}`);
  }

  // ——— view ———

  setPaper(paper: Paper): void {
    this.paper = paper;
    this.renderer.look = PAPERS[paper];
    document.documentElement.style.setProperty('--paper', cssColor(PAPERS[paper].skyHorizon));
    this.writeHash();
  }

  setScale(scale: Scale): void {
    this.audio.scale = scale;
    this.writeHash();
    this.status(scale === 'log' ? 'log scale: every octave gets equal room' : 'linear scale: as in 2016');
  }

  private renderLists(): void {
    const shapes = $<HTMLElement>('shapes').querySelector('ul')!;
    shapes.replaceChildren(
      ...SHAPES.map((shape) => {
        const li = document.createElement('li');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.setAttribute('aria-current', String(shape.name === this.selected));
        pick.innerHTML = `${shape.name}<span class="meta"></span>`;
        pick.querySelector('.meta')!.textContent = this.assignment.get(shape.name) ?? '';
        pick.addEventListener('click', () => this.select(shape.name));
        const visible = this.renderer.isVisible(shape.name);
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = 'visibility';
        eye.textContent = visible ? '•' : '◦';
        eye.title = visible ? `hide ${shape.name}` : `show ${shape.name}`;
        eye.setAttribute('aria-pressed', String(!visible));
        eye.addEventListener('click', () => this.toggleVisible(shape.name));
        const style = document.createElement('button');
        style.type = 'button';
        style.className = 'visibility';
        const current = this.renderer.style(shape.name);
        style.textContent = current === 'wire' ? '#' : current === 'chrome' ? '●' : '◍';
        style.title = `${current} — click for ${STYLES[(STYLES.indexOf(current) + 1) % STYLES.length]} (C)`;
        style.addEventListener('click', () => this.cycleStyle(shape.name));
        li.append(pick, style, eye);
        return li;
      }),
    );

    const current = this.assignment.get(this.selected);
    const shaders = $<HTMLElement>('shaders').querySelector('ul')!;
    shaders.replaceChildren(
      ...[...this.library.values()].map((entry, i) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.title = entry.note;
        button.setAttribute('aria-pressed', String(entry.id === current));
        if (isEdited(entry)) button.classList.add('edited');
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = i < 9 ? String(i + 1) : '';
        button.append(key, entry.id);
        button.addEventListener('click', () => this.assign(this.selected, entry.id));
        li.append(button);
        return li;
      }),
    );
  }

  cycleStyle(shape = this.selected): void {
    if (!this.renderer.enhanced) {
      this.status('chrome needs float render targets, which this device lacks');
      return;
    }
    const next = STYLES[(STYLES.indexOf(this.renderer.style(shape)) + 1) % STYLES.length]!;
    this.renderer.setStyle(shape, next);
    this.writeHash();
    this.renderLists();
    this.status(`${shape}: ${next}`);
  }

  private toggleVisible(shape: string): void {
    this.renderer.setVisible(shape, !this.renderer.isVisible(shape));
    this.renderLists();
  }

  private onSourceChange(kind: SourceKind): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-source]')) {
      button.setAttribute('aria-pressed', String(button.dataset['source'] === kind));
    }
    this.status(this.nowPlaying(), { sticky: true });
  }

  private nowPlaying(): string {
    const { kind, label } = this.audio;
    if (kind === 'none') return '';
    return kind === 'file' ? `♪ ${label}` : kind === 'demo' ? `♪ ${label} (demo)` : `listening: ${label}`;
  }

  status(text: string, { attention = false, sticky = false } = {}): void {
    const el = $<HTMLElement>('status');
    el.textContent = text;
    el.classList.toggle('attention', attention);
    clearTimeout(this.statusTimer);
    if (!sticky && text) {
      this.statusTimer = setTimeout(() => {
        el.textContent = this.nowPlaying();
        el.classList.remove('attention');
      }, 3500);
    }
  }

  private async toggleRecording(): Promise<void> {
    if (!Recorder.supported) {
      this.status('Recording is not supported in this browser');
      return;
    }
    if (this.recorder.recording) {
      document.body.classList.remove('recording');
      const file = await this.recorder.stop();
      if (file) download(file);
      this.status('saved recording');
    } else {
      this.recorder.start(this.canvas, this.audio.recordingStream());
      document.body.classList.add('recording');
      this.status('recording — press R to stop', { sticky: true });
    }
  }

  // ——— input ———

  private bindUi(): void {
    const unlock = () => {
      const wasBlocked = $<HTMLElement>('status').classList.contains('attention');
      void this.audio.unlock().then(() => {
        if (wasBlocked && !this.audio.paused) this.onSourceChange(this.audio.kind);
      });
    };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });

    const fileInput = $<HTMLInputElement>('file-input');
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.audio.playFile(file);
      fileInput.value = '';
    });

    const sources: Record<string, () => void> = {
      file: () => fileInput.click(),
      mic: () => void this.audio.useMic(),
      tab: () => void this.audio.useTab(),
      demo: () => void (this.audio.kind === 'demo' ? this.audio.stop() : this.audio.useDemo()),
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-source]')) {
      button.addEventListener('click', () => sources[button.dataset['source']!]?.());
    }

    $('add-shader').addEventListener('click', () => this.generate());
    const help = $<HTMLDialogElement>('help');
    $('help-button').addEventListener('click', () => help.showModal());

    // Drag + drop a song — anywhere on the page, as in 2016.
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (depth++ === 0) document.body.classList.add('hover');
    });
    window.addEventListener('dragleave', () => {
      if (--depth <= 0) {
        depth = 0;
        document.body.classList.remove('hover');
      }
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      document.body.classList.remove('hover');
      const file = e.dataTransfer?.files[0];
      if (file) void this.audio.playFile(file);
    });

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.metaKey || e.ctrlKey || e.altKey || target.closest('textarea, input, dialog')) return;
    const shapeNames = SHAPES.map((s) => s.name);
    const ids = [...this.library.keys()];
    const actions: Record<string, () => void> = {
      ' ': () => void this.audio.togglePause(),
      o: () => $<HTMLInputElement>('file-input').click(),
      m: () => void this.audio.useMic(),
      t: () => void this.audio.useTab(),
      d: () => void (this.audio.kind === 'demo' ? this.audio.stop() : this.audio.useDemo()),
      s: () => this.select(shapeNames[(shapeNames.indexOf(this.selected) + 1) % shapeNames.length]!),
      g: () => this.generate(),
      '+': () => this.generate(),
      e: () => (this.editor.isOpen ? this.editor.close() : this.openEditor()),
      v: () => this.toggleVisible(this.selected),
      c: () => this.cycleStyle(),
      b: () => {
        const papers = Object.keys(PAPERS) as Paper[];
        this.setPaper(papers[(papers.indexOf(this.paper) + 1) % papers.length]!);
      },
      l: () => this.setScale(this.audio.scale === 'log' ? 'linear' : 'log'),
      r: () => void this.toggleRecording(),
      h: () => document.body.classList.toggle('clean'),
      f: () => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),
      '?': () => $<HTMLDialogElement>('help').showModal(),
      arrowleft: () => this.camera.orbit(-0.15, 0),
      arrowright: () => this.camera.orbit(0.15, 0),
      arrowup: () => this.camera.orbit(0, 0.1),
      arrowdown: () => this.camera.orbit(0, -0.1),
      '-': () => this.camera.zoom(1.15),
      '=': () => this.camera.zoom(1 / 1.15),
      escape: () => document.body.classList.remove('clean'),
    };
    const key = e.key.toLowerCase();
    if (/^[1-9]$/.test(key)) {
      const id = ids[Number(key) - 1];
      if (id) this.assign(this.selected, id);
      e.preventDefault();
      return;
    }
    const action = actions[key];
    if (action) {
      e.preventDefault();
      action();
    }
  }
}

function isEdited(entry: Entry): boolean {
  return entry.vertex !== entry.original.vertex || entry.fragment !== entry.original.fragment;
}

function boot(): void {
  let app: Staccato;
  try {
    app = new Staccato();
  } catch (e) {
    const message = e instanceof NoWebGL2Error
      ? 'Staccato needs WebGL2, which this browser or device doesn’t provide.'
      : `Staccato failed to start: ${(e as Error).message}`;
    const p = document.createElement('p');
    p.className = 'fallback';
    p.textContent = message;
    document.body.append(p);
    throw e;
  }
  // Staccato is an easily modifiable object (README, 2016) — poke at it from devtools.
  (window as unknown as { staccato: Staccato }).staccato = app;
  app.start();
}

boot();

