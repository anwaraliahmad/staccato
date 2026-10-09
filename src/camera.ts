// The camera, built from the three ways it moved over the years:
//   - Nov 2016 (3313768): drifts toward the mouse, always looking at the heart;
//   - Nov 2016 (499fe81): an automatic sin/cos path around the scene;
//   - Mar 2023: drag to orbit (OrbitControls), wheel to zoom.
// Hands off for a few seconds and the automatic path takes over again.

import { lookAt, perspective, type Mat4, type Vec3 } from './gl/math';

const IDLE_SECONDS = 6;
const FOV = 90; // the 2016 field of view
const MIN_DISTANCE = 350;
const MAX_DISTANCE = 4000;

export class CameraRig {
  readonly view: Mat4 = new Float32Array(16);
  readonly projection: Mat4 = new Float32Array(16);
  eye: Vec3 = [0, 0, 1000];

  private azimuth = 0;
  private elevation = 0;
  private distance = 1000;
  private targetDistance = 1000;
  private mouse = { x: 0, y: 0 };
  private parallax = { x: 0, y: 0 };
  private idle = IDLE_SECONDS; // start on the automatic path
  private pathTime = 0;
  private dragging: { id: number; x: number; y: number } | null = null;
  private readonly pinch = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private readonly reducedMotion: MediaQueryList;

  constructor(private readonly element: HTMLElement) {
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    element.addEventListener('pointerdown', (e) => this.onDown(e));
    element.addEventListener('pointermove', (e) => this.onMove(e));
    element.addEventListener('pointerup', (e) => this.onUp(e));
    element.addEventListener('pointercancel', (e) => this.onUp(e));
    element.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(Math.exp(e.deltaY * 0.001));
    }, { passive: false });
  }

  /** Pointer position, -0.5..0.5, as the shaders' `mouse` uniform. */
  get pointer(): Float32Array {
    return new Float32Array([this.mouse.x, -this.mouse.y]);
  }

  update(delta: number, aspect: number): void {
    const still = this.reducedMotion.matches;
    this.idle += delta;

    if (this.idle > IDLE_SECONDS && !still) {
      // 499fe81's path, slowed down: a lazy orbit that bobs above and below.
      this.pathTime += delta * 0.15;
      this.azimuth += delta * 0.12;
      this.elevation += (0.35 * Math.sin(this.pathTime * 2) - this.elevation) * Math.min(1, delta);
    }

    // 3313768: ease toward the pointer (there it was `(mouse*2000 - pos) * delta*3`).
    const k = Math.min(1, delta * 3);
    const reach = still ? 0 : this.dragging ? 0 : 1;
    this.parallax.x += (this.mouse.x * reach - this.parallax.x) * k;
    this.parallax.y += (this.mouse.y * reach - this.parallax.y) * k;

    this.distance += (this.targetDistance - this.distance) * Math.min(1, delta * 4);

    const az = this.azimuth + this.parallax.x * 1.4;
    const el = clamp(this.elevation + this.parallax.y * 1.0, -1.45, 1.45);
    this.eye = [
      this.distance * Math.cos(el) * Math.sin(az),
      this.distance * Math.sin(el),
      this.distance * Math.cos(el) * Math.cos(az),
    ];
    lookAt(this.eye, [0, 0, 0], [0, 1, 0], this.view);
    perspective(FOV, aspect, 1, 12000, this.projection);
  }

  /** Nudge the camera from the keyboard. */
  orbit(dAzimuth: number, dElevation: number): void {
    this.idle = 0;
    this.azimuth += dAzimuth;
    this.elevation = clamp(this.elevation + dElevation, -1.45, 1.45);
  }

  zoom(factor: number): void {
    this.idle = 0;
    this.targetDistance = clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  private onDown(e: PointerEvent): void {
    this.idle = 0;
    if (e.pointerType === 'touch') {
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size === 2) {
        this.dragging = null;
        this.pinchDistance = this.currentPinchDistance();
        return;
      }
    }
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.element.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX / innerWidth - 0.5;
      this.mouse.y = e.clientY / innerHeight - 0.5;
    }
    if (this.pinch.has(e.pointerId)) {
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size === 2) {
        const d = this.currentPinchDistance();
        if (this.pinchDistance > 0 && d > 0) this.zoom(this.pinchDistance / d);
        this.pinchDistance = d;
        return;
      }
    }
    if (this.dragging?.id === e.pointerId) {
      this.idle = 0;
      const dx = e.clientX - this.dragging.x;
      const dy = e.clientY - this.dragging.y;
      this.dragging.x = e.clientX;
      this.dragging.y = e.clientY;
      this.orbit(-dx * 0.005, dy * 0.005);
    }
  }

  private onUp(e: PointerEvent): void {
    this.pinch.delete(e.pointerId);
    if (this.dragging?.id === e.pointerId) this.dragging = null;
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pinch.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
