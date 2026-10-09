// The scenes. Each is a composition — a world, objects placed in it, a way of
// being seen — built around one feeling. Every one should hold still and be
// worth looking at in silence; with music, each object answers in its own way.
// Any object's shape or shader can be swapped while the music plays.

import type { Shot } from './camera';
import { compose, type Mat4 } from './gl/math';
import type { ObjectDef, World } from './gl/renderer';

export interface Scene {
  id: string;
  /** The feeling it's built around, shown as the scene's description. */
  mood: string;
  world: World;
  shot: Shot;
  objects: ObjectDef[];
}

const FLAT = Math.PI / 2; // planes are made standing up; this lays them down

// ——— placing copies ———

/** Copies along a line from `a` to `b`. */
function row(count: number, a: [number, number, number], b: [number, number, number], scale = 1): Mat4[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0;
    return compose([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], [0, 0, 0], scale);
  });
}

/** Copies scattered in a box, the same way every time. */
function scatter(count: number, seed: number, min: [number, number, number], max: [number, number, number], scale: [number, number]): Mat4[] {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: count }, () =>
    compose(
      [min[0] + (max[0] - min[0]) * r(), min[1] + (max[1] - min[1]) * r(), min[2] + (max[2] - min[2]) * r()],
      [r() * 6.28, r() * 6.28, r() * 6.28],
      scale[0] + (scale[1] - scale[0]) * r(),
    ));
}

// ——— worlds ———

const DUSK: World = {
  skyTop: [0.14, 0.3, 0.5],
  skyHorizon: [0.8, 0.76, 0.64],
  skyBottom: [0.02, 0.04, 0.07],
  sunDirection: [-0.55, 0.05, -0.83],
  sunColor: [1, 0.84, 0.56],
  sunSize: 0.03,
  haze: 0.35,
  fog: 0.00022,
  ocean: 1,
  oceanY: -1450,
  water: [0.01, 0.025, 0.045],
  waves: 1,
  studio: 0,
  lightA: [1, 1, 1],
  lightB: [1, 0.75, 0.85],
  wireColor: [0.96, 0.97, 1],
  wireTint: 1,
  lineScale: 0.6,
  wireAlpha: 0.6,
  additive: false,
  metal: [0.92, 0.94, 1],
  iridescence: 0.25,
  glassTint: [0.92, 0.97, 1],
  frost: 1.2,
  glow: 0.35,
  bloom: 0.6,
  aberration: 0.002,
  vignette: 0.3,
  grain: 0.02,
  dream: 0.22,
  halation: 0.06,
  halationTint: [1, 0.85, 0.7],
  saturation: 1,
  contrast: 1.08,
  lift: [0.005, 0.01, 0.02],
  duotone: 0,
  shadowTint: [0, 0, 0],
  highlightTint: [1, 1, 1],
  hud: 0,
};

const MORNING: World = {
  ...DUSK,
  skyTop: [0.3, 0.52, 0.76],
  skyHorizon: [0.82, 0.9, 0.94],
  skyBottom: [0.12, 0.28, 0.36],
  sunDirection: [0.45, 0.35, -0.8],
  sunColor: [0.38, 0.4, 0.4],
  sunSize: 0.04,
  haze: 0.4,
  fog: 0.00011,
  oceanY: -330,
  water: [0.04, 0.17, 0.22],
  waves: 0.12,
  studio: 0.5,
  lightA: [0.9, 1, 1],
  lightB: [0.7, 0.95, 0.9],
  wireColor: [0.86, 0.95, 1],
  wireTint: 0.85,
  lineScale: 0.8,
  wireAlpha: 0.7,
  metal: [0.82, 0.93, 0.96],
  iridescence: 0.2,
  glassTint: [0.86, 0.98, 0.98],
  frost: 1.1,
  glow: 0.3,
  bloom: 0.5,
  dream: 0.28,
  halation: 0.08,
  halationTint: [0.75, 0.95, 1],
  saturation: 1,
  contrast: 1.04,
  lift: [0.02, 0.035, 0.045],
  duotone: 0.1,
  shadowTint: [0.06, 0.2, 0.26],
  highlightTint: [0.92, 1, 1],
};

const STEEL: World = {
  ...DUSK,
  skyTop: [0.16, 0.25, 0.42],
  skyHorizon: [0.7, 0.79, 0.9],
  skyBottom: [0.03, 0.05, 0.1],
  sunDirection: [0.5, 0.6, 0.6],
  sunColor: [0.85, 0.92, 1],
  sunSize: 0.015,
  haze: 0.3,
  fog: 0.00016,
  ocean: 0,
  studio: 1,
  lightA: [0.9, 0.95, 1],
  lightB: [0.6, 0.75, 1],
  wireColor: [0.78, 0.87, 1],
  wireTint: 0.9,
  lineScale: 0.7,
  wireAlpha: 0.5,
  metal: [0.74, 0.83, 0.98],
  iridescence: 0.06,
  glow: 0.5,
  bloom: 0.7,
  aberration: 0.003,
  vignette: 0.5,
  grain: 0.045,
  dream: 0.18,
  halation: 0.08,
  halationTint: [0.7, 0.85, 1],
  contrast: 1.12,
  lift: [0.02, 0.035, 0.07],
  duotone: 0.8,
  shadowTint: [0.02, 0.05, 0.12],
  highlightTint: [0.86, 0.93, 1],
  hud: 0.45,
};

// Black water, black sky: the dark the bathymetric colours were made for.
const ABYSSAL: World = {
  ...DUSK,
  skyTop: [0.005, 0.008, 0.02],
  skyHorizon: [0.02, 0.025, 0.06],
  skyBottom: [0, 0, 0.005],
  sunDirection: [0, 1, 0],
  sunColor: [0.05, 0.05, 0.1],
  sunSize: 0.01,
  haze: 0.2,
  fog: 0.00028,
  ocean: 0,
  wireTint: 0,
  lineScale: 1.25,
  wireAlpha: 1,
  additive: true,
  glow: 0.55,
  bloom: 1,
  aberration: 0.002,
  vignette: 0.55,
  grain: 0.02,
  dream: 0.25,
  halation: 0.05,
  halationTint: [0.5, 0.4, 1],
  contrast: 1.05,
  lift: [0, 0, 0],
};

const LAVENDER: World = {
  ...DUSK,
  skyTop: [0.56, 0.58, 0.9],
  skyHorizon: [0.9, 0.89, 0.97],
  skyBottom: [0.47, 0.44, 0.62],
  sunDirection: [0.2, 0.8, 0.4],
  sunColor: [0.4, 0.38, 0.45],
  sunSize: 0.1,
  haze: 0.2,
  fog: 0.00005,
  ocean: 0,
  studio: 1,
  lightA: [1, 0.98, 1],
  lightB: [1, 0.72, 0.86],
  wireTint: 0,
  lineScale: 1,
  wireAlpha: 1,
  metal: [0.92, 0.93, 1],
  iridescence: 0.55,
  glow: 0.55,
  bloom: 0.7,
  aberration: 0.004,
  vignette: 0.35,
  grain: 0.018,
  dream: 0,
  halation: 0,
  lift: [0, 0, 0],
  contrast: 1,
};

const NEON: World = {
  ...DUSK,
  skyTop: [0.02, 0.02, 0.06],
  skyHorizon: [0.2, 0.08, 0.32],
  skyBottom: [0, 0, 0.015],
  sunDirection: [0.1, 0.02, -1],
  sunColor: [0.9, 0.3, 0.8],
  sunSize: 0.05,
  haze: 0.4,
  fog: 0.0001,
  water: [0, 0, 0.01],
  waves: 0.6,
  studio: 1,
  lightA: [0.75, 0.95, 1],
  lightB: [1, 0.25, 0.75],
  wireTint: 0,
  lineScale: 1,
  wireAlpha: 0.5,
  additive: true,
  metal: [0.92, 0.93, 1],
  iridescence: 0.55,
  glow: 0.4,
  bloom: 0.8,
  aberration: 0.005,
  vignette: 0.55,
  grain: 0.025,
  dream: 0.15,
  halation: 0.1,
  halationTint: [1, 0.4, 0.9],
  lift: [0, 0, 0],
};

// ——— the 2016 triptych ———

const TRIPTYCH = (heart: ObjectDef['style'], planeScale = 1): ObjectDef[] => [
  { name: 'heart', geometry: 'sphere', shader: 'heart', style: heart, lineWidth: 0.9, tint: 0.2 },
  { name: 'wave', geometry: 'plane', position: [0, 1200, 0], rotation: [FLAT, 0, 0], scale: planeScale, shader: 'wave', style: 'wire', lineWidth: 1.6 },
  { name: 'abyss', geometry: 'plane', position: [0, -1200, 0], rotation: [FLAT, 0, 0], shader: 'abyss', style: 'wire', lineWidth: 1.6 },
];

export const SCENES: Scene[] = [
  {
    id: 'origin',
    mood: 'Nostalgia. The picture Staccato began as: white wires over the sea at dusk, and the heart a glass bubble — the one new thing in an old memory.',
    world: DUSK,
    shot: { distance: 1000, elevation: 0, swing: 0.3, speed: 0.06, target: [0, 0, 0], fov: 90, parallax: 0.9 },
    objects: TRIPTYCH('glass', 2),
  },
  {
    id: 'pavilion',
    mood: 'Daydream. A glass colonnade standing in a mirror pool; the canopy tilts with the music like an equalizer you could stand under, and capsules from 1999 drift between the columns.',
    world: MORNING,
    shot: { distance: 1700, elevation: 0.1, swing: 0.12, speed: 0.04, target: [0, 120, -700], fov: 75, parallax: 0.5 },
    objects: [
      {
        name: 'columns', geometry: 'column', shader: 'column', style: 'glass', tint: 0.25, lineWidth: 0.8,
        instances: [...row(7, [-700, 190, -3600], [-700, 190, 600]), ...row(7, [700, 190, -3600], [700, 190, 600])],
      },
      {
        name: 'canopy', geometry: 'slab', shader: 'louver', style: 'glass', tint: 0.5, lineWidth: 0.8,
        instances: row(18, [0, 760, -3700], [0, 760, 700], 1.15),
      },
      {
        name: 'capsules', geometry: 'pill', shader: 'drift', style: 'glass', tint: 1, lineWidth: 0.8,
        instances: scatter(6, 7, [-420, -60, -2200], [420, 380, 300], [0.55, 0.85]),
      },
      { name: 'heart', geometry: 'sphere', position: [0, 160, -900], scale: 0.42, shader: 'heart', style: 'glass', tint: 0.1, lineWidth: 0.8 },
    ],
  },
  {
    id: 'chromecore',
    mood: 'Tension. A spiked chrome star singing inside gyroscope rings, debris turning in the dark, a 2016 ripple floor below. Cold, precise, alive.',
    world: STEEL,
    shot: { distance: 1350, elevation: 0.16, swing: 0.2, speed: 0.07, target: [0, 0, 0], fov: 70, parallax: 0.7 },
    objects: [
      { name: 'core', geometry: 'star', shader: 'core', style: 'chrome', tint: 0.4, lineWidth: 0.7 },
      {
        name: 'rings', geometry: 'ring', shader: 'orbit', style: 'chrome', tint: 0.3, lineWidth: 0.7,
        instances: [1.5, 1.72, 1.96, 2.22].map((s, i) => compose([0, 0, 0], [0.3 * i, 0, 0.5 * i], s)),
      },
      {
        name: 'debris', geometry: 'shard', shader: 'core', style: 'chrome', tint: 0.4, lineWidth: 0.6,
        instances: scatter(16, 3, [-2600, -500, -2600], [2600, 900, 2600], [0.06, 0.16]),
      },
      { name: 'floor', geometry: 'plane', position: [0, -900, 0], rotation: [FLAT, 0, 0], scale: 2.5, shader: 'wave', style: 'wire', lineWidth: 1.1 },
    ],
  },
  {
    id: 'deep',
    mood: 'Awe. A bathymetric map of an ocean floor in the dark: trenches in navy, ridges in violet and gold. The song crosses it as swells.',
    world: ABYSSAL,
    shot: { distance: 3400, elevation: 0.62, swing: 0.1, speed: 0.025, target: [0, -400, 0], fov: 60, parallax: 0.4 },
    objects: [
      { name: 'seafloor', geometry: 'terrain', position: [0, -600, 0], rotation: [FLAT, 0, 0], shader: 'seafloor', style: 'wire', lineWidth: 1.0 },
    ],
  },
  {
    id: '16',
    mood: 'Where it started, November 2016: a heart between a wave and an abyss, on lavender.',
    world: LAVENDER,
    shot: { distance: 1000, elevation: 0, swing: 0.35, speed: 0.12, target: [0, 0, 0], fov: 90, parallax: 1.4 },
    objects: TRIPTYCH('wire'),
  },
  {
    id: 'night',
    mood: 'Black chrome over black water, neon horizon.',
    world: NEON,
    shot: { distance: 1000, elevation: 0.05, swing: 0.25, speed: 0.08, target: [0, 0, 0], fov: 85, parallax: 1 },
    objects: TRIPTYCH('chromewire', 2),
  },
];

export const sceneById = (id: string): Scene | undefined => SCENES.find((s) => s.id === id);
