// The built-in shaders. heart, wave and abyss are the November 2016 originals
// (commit 3313768, the build in the README screenshot), byte for byte — the
// compiler translates their GLSL ES 1.0 dialect at load time. See src/gl/glsl.ts.

import heartVert from './heart.vert?raw';
import heartFrag from './heart.frag?raw';
import waveVert from './wave.vert?raw';
import waveFrag from './wave.frag?raw';
import abyssVert from './abyss.vert?raw';
import abyssFrag from './abyss.frag?raw';
import echoVert from './echo.vert?raw';
import echoFrag from './echo.frag?raw';

export interface ShaderSource {
  id: string;
  vertex: string;
  fragment: string;
  /** One line on where it came from. */
  note: string;
}

export const BUILTIN: ShaderSource[] = [
  { id: 'heart', vertex: heartVert, fragment: heartFrag, note: 'A sphere that beats with the song. Distance from the axis picks the FFT bin. — 2016' },
  { id: 'wave', vertex: waveVert, fragment: waveFrag, note: 'Rings rolling outward with time. — 2016' },
  { id: 'abyss', vertex: abyssVert, fragment: abyssFrag, note: 'Simplex-noise ravine; radius() has a typo (x*x + x*x) that makes the straight ridges. Kept. — 2016' },
  { id: 'echo', vertex: echoVert, fragment: echoFrag, note: 'The wave, hearing at last: angle is pitch, distance is time. — 2026' },
];

// Edit a .vert/.frag during `npm run dev` and it recompiles in place,
// without reloading the page or interrupting the music.
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (next) window.dispatchEvent(new CustomEvent<ShaderSource[]>('staccato:shaders', { detail: next['BUILTIN'] as ShaderSource[] }));
  });
}
