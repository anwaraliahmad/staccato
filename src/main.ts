// Staccato — WebGL music visualizer using shaders and FFT audio data.
// Copyright (c) 2016–2026 Anwar Ali-Ahmad. MIT License.

import { AudioEngine, FFT_SIZE } from './audio/engine';
import type { Scale } from './audio/spectrum';
import { CameraRig } from './camera';
import { generate, randomSeed, seedFromId } from './generate/generator';
import { GEOMETRIES, type GeometryName } from './gl/geometry';
import type { CompileError } from './gl/glsl';
import { ShaderCompileError } from './gl/program';
import { NoWebGL2Error, Renderer, STYLES, type Style } from './gl/renderer';
import { Recorder, download } from './recorder';
import { SCENES, sceneById, type Scene } from './scenes';
import { BUILTIN, type ShaderSource } from './shaders';
import { Editor } from './ui/editor';

const HISTORY_RATE = 60; // spectrum history rows per second, independent of frame rate
const EDITS_KEY = 'staccato:edits';
const GEOMETRY_NAMES = Object.keys(GEOMETRIES) as GeometryName[];

const STYLE_GLYPH: Record<Style, string> = {
  wire: '#', chrome: '●', chromewire: '◍', glass: '○', glasswire: '◌', paint: '■', paintwire: '▣',
};

interface Entry extends ShaderSource {
  original: { vertex: string; fragment: string };
  generated: boolean;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cssColor = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(' ')})`;

export class Staccato {
  readonly renderer: Renderer;
  readonly camera: CameraRig;
  readonly audio: AudioEngine;
  readonly library = new Map<string, Entry>();
  /** Object name → shader id, for the current scene. */
  readonly assignment = new Map<string, string>();
  scene: Scene = SCENES[0]!;
  selected = '';
  time = 0;

  private readonly canvas = $<HTMLCanvasElement>('stage');
  private readonly recorder = new Recorder();
  private readonly editor: Editor;
  private last = performance.now();
  private historyClock = 0;
  private statusTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.renderer = new Renderer(this.canvas);
    this.camera = new CameraRig(this.canvas);
    this.audio = new AudioEngine({
      onSourceChange: () => this.onSourceChange(),
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

    const params = new URLSearchParams(location.hash.slice(1));
    this.load(sceneById(params.get('scene') ?? '') ?? SCENES[0]!, params);

    this.bindUi();
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

  // ——— scenes ———

  /** Switch scenes. The music carries on. */
  setScene(id: string): void {
    const scene = sceneById(id);
    if (scene) this.load(scene, new URLSearchParams());
  }

  /** Set up a scene, then apply any overrides from the URL. */
  private load(scene: Scene, params: URLSearchParams): void {
    this.scene = scene;
    this.renderer.world = scene.world;
    this.renderer.setObjects(scene.objects);
    this.camera.frame(scene.shot);
    document.documentElement.style.setProperty('--paper', cssColor(scene.world.skyHorizon));
    this.assignment.clear();
    for (const obj of scene.objects) {
      const geometry = params.get(`${obj.name}.shape`);
      if (geometry && geometry in GEOMETRIES) this.renderer.setGeometry(obj.name, geometry as GeometryName);
      const style = params.get(`${obj.name}.style`);
      if (style && (STYLES as string[]).includes(style)) this.renderer.setStyle(obj.name, style as Style);
      const shader = params.get(obj.name);
      if (!shader || !this.assign(obj.name, shader, false)) this.assign(obj.name, obj.shader, false);
    }
    this.selected = scene.objects[0]!.name;
    if (params.get('scale') === 'linear') this.audio.scale = 'linear';
    this.writeHash();
    this.renderLists();
    if (this.editor.isOpen) this.openEditor();
  }

  // ——— objects ———

  /** Put a shader from the library on an object. Returns false if it doesn't compile. */
  assign(object: string, id: string, update = true): boolean {
    let entry = this.library.get(id);
    if (!entry) {
      const seed = seedFromId(id);
      if (seed === null) return false;
      entry = this.addToLibrary(generate(seed), true);
    }
    try {
      this.renderer.setShader(object, entry);
    } catch (e) {
      console.error(`[staccato] ${id} on ${object}:\n${(e as Error).message}`);
      this.status(`${id} didn't compile — see the console`);
      return false;
    }
    this.assignment.set(object, id);
    if (update) {
      this.writeHash();
      this.renderLists();
      if (this.editor.isOpen && object === this.selected) this.openEditor();
    }
    return true;
  }

  /** Swap an object's shape, keeping its shader. */
  setGeometry(object: string, geometry: GeometryName): void {
    this.renderer.setGeometry(object, geometry);
    this.writeHash();
    this.renderLists();
  }

  /** Generate a new shader (2017's "+") and put it on the selected object. */
  generate(seed = randomSeed()): string {
    const source = generate(seed);
    this.addToLibrary(source, true);
    this.assign(this.selected, source.id);
    this.status(`${source.id} — seed 0x${seed.toString(16)}`);
    return source.id;
  }

  select(object: string): void {
    if (!this.assignment.has(object)) return;
    this.selected = object;
    this.renderLists();
    if (this.editor.isOpen) this.openEditor();
  }

  cycleStyle(object = this.selected): void {
    if (!this.renderer.enhanced) {
      this.status('chrome and glass need float render targets, which this device lacks');
      return;
    }
    const next = STYLES[(STYLES.indexOf(this.renderer.style(object)) + 1) % STYLES.length]!;
    this.renderer.setStyle(object, next);
    this.writeHash();
    this.renderLists();
    this.status(`${object}: ${next}`);
  }

  private cycleGeometry(): void {
    const current = this.renderer.geometryOf(this.selected);
    if (!current) return;
    this.setGeometry(this.selected, GEOMETRY_NAMES[(GEOMETRY_NAMES.indexOf(current) + 1) % GEOMETRY_NAMES.length]!);
  }

  private toggleVisible(object: string): void {
    this.renderer.setVisible(object, !this.renderer.isVisible(object));
    this.renderLists();
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
    // Every other object wearing this shader picks up the edit too.
    for (const [object, other] of this.assignment) {
      if (other === id && object !== this.selected) this.renderer.setShader(object, entry);
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
    for (const [object, other] of this.assignment) if (other === id) this.assign(object, id);
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
      for (const [object, id] of this.assignment) if (id === source.id) this.assign(object, id);
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

  // ——— the URL describes the scene and what you changed in it ———

  private writeHash(): void {
    const params = new URLSearchParams();
    params.set('scene', this.scene.id);
    for (const obj of this.scene.objects) {
      const shader = this.assignment.get(obj.name);
      if (shader && shader !== obj.shader) params.set(obj.name, shader);
      const geometry = this.renderer.geometryOf(obj.name);
      if (geometry && geometry !== obj.geometry) params.set(`${obj.name}.shape`, geometry);
      const style = this.renderer.style(obj.name);
      if (style !== obj.style) params.set(`${obj.name}.style`, style);
    }
    if (this.audio.scale !== 'log') params.set('scale', this.audio.scale);
    history.replaceState(null, '', `#${params}`);
  }

  // ——— view ———

  setScale(scale: Scale): void {
    this.audio.scale = scale;
    this.writeHash();
    this.status(scale === 'log' ? 'log scale: every octave gets equal room' : 'linear scale: as in 2016');
  }

  private renderLists(): void {
    const shaderId = this.assignment.get(this.selected) ?? '';
    const entry = this.library.get(shaderId);
    this.renderer.hudInfo = {
      look: this.scene.id,
      shape: this.selected,
      shader: shaderId,
      source: entry ? `${entry.vertex}\n${entry.fragment}` : '',
      sampleRate: this.audio.ctx.sampleRate,
      fftSize: FFT_SIZE,
    };

    // Scenes, in the bar.
    const scenes = $<HTMLElement>('scenes');
    scenes.replaceChildren(
      ...SCENES.map((s) => {
        const b = button(s.id === '16' ? "'16" : s.id, () => this.setScene(s.id));
        b.title = s.mood;
        b.setAttribute('aria-pressed', String(s.id === this.scene.id));
        return b;
      }),
    );

    // Objects, then the shapes the selected one can become.
    const objects = $<HTMLElement>('shapes').querySelector('ul.objects')!;
    objects.replaceChildren(
      ...this.scene.objects.map((obj) => {
        const li = document.createElement('li');
        const pick = button(obj.name, () => this.select(obj.name));
        pick.setAttribute('aria-current', String(obj.name === this.selected));
        const meta = document.createElement('span');
        meta.className = 'meta';
        meta.textContent = this.renderer.geometryOf(obj.name) ?? '';
        pick.append(meta);
        const current = this.renderer.style(obj.name);
        const style = button(STYLE_GLYPH[current], () => this.cycleStyle(obj.name));
        style.className = 'visibility';
        style.title = `${current} — click for ${STYLES[(STYLES.indexOf(current) + 1) % STYLES.length]} (C)`;
        const visible = this.renderer.isVisible(obj.name);
        const eye = button(visible ? '•' : '◦', () => this.toggleVisible(obj.name));
        eye.className = 'visibility';
        eye.title = visible ? `hide ${obj.name}` : `show ${obj.name}`;
        eye.setAttribute('aria-pressed', String(!visible));
        li.append(pick, style, eye);
        return li;
      }),
    );

    const shapes = $<HTMLElement>('shapes').querySelector('ul.geometries')!;
    const geometry = this.renderer.geometryOf(this.selected);
    shapes.replaceChildren(
      ...GEOMETRY_NAMES.map((name) => {
        const li = document.createElement('li');
        const b = button(name, () => this.setGeometry(this.selected, name));
        b.setAttribute('aria-pressed', String(name === geometry));
        li.append(b);
        return li;
      }),
    );

    const shaders = $<HTMLElement>('shaders').querySelector('ul')!;
    shaders.replaceChildren(
      ...[...this.library.values()].map((e, i) => {
        const li = document.createElement('li');
        const b = button('', () => this.assign(this.selected, e.id));
        b.title = e.note;
        b.setAttribute('aria-pressed', String(e.id === shaderId));
        if (isEdited(e)) b.classList.add('edited');
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = i < 9 ? String(i + 1) : '';
        b.append(key, e.id);
        li.append(b);
        return li;
      }),
    );
  }

  private nowPlaying(): string {
    const { kind, label } = this.audio;
    if (kind === 'none') return '';
    return kind === 'file' ? `♪ ${label}` : kind === 'demo' ? `♪ ${label} (demo)` : `listening: ${label}`;
  }

  private onSourceChange(): void {
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-source]')) {
      b.setAttribute('aria-pressed', String(b.dataset['source'] === this.audio.kind));
    }
    this.status(this.nowPlaying(), { sticky: true });
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
        if (wasBlocked && !this.audio.paused) this.onSourceChange();
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
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-source]')) {
      b.addEventListener('click', () => sources[b.dataset['source']!]?.());
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
    const names = this.scene.objects.map((o) => o.name);
    const ids = [...this.library.keys()];
    const step = <T>(list: T[], current: T, by: number) => list[(list.indexOf(current) + by + list.length) % list.length]!;
    const actions: Record<string, () => void> = {
      ' ': () => void this.audio.togglePause(),
      o: () => $<HTMLInputElement>('file-input').click(),
      m: () => void this.audio.useMic(),
      t: () => void this.audio.useTab(),
      d: () => void (this.audio.kind === 'demo' ? this.audio.stop() : this.audio.useDemo()),
      b: () => this.setScene(step(SCENES, this.scene, 1).id),
      s: () => this.select(step(names, this.selected, 1)),
      x: () => this.cycleGeometry(),
      g: () => this.generate(),
      '+': () => this.generate(),
      e: () => (this.editor.isOpen ? this.editor.close() : this.openEditor()),
      c: () => this.cycleStyle(),
      v: () => this.toggleVisible(this.selected),
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

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
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
