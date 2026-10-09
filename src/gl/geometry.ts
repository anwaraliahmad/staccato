// Mesh generation. The layouts deliberately mirror three.js' SphereGeometry and
// PlaneGeometry (vertex order, uv convention, triangulation) because the 2016
// shaders were written against them — `position`, `normal` and `uv` mean
// exactly what they meant back then, and the wireframe keeps its diagonals.

//
// Every mesh is a grid of (cols × rows) vertices, indexed row by row, so the
// chrome and glass passes can find each vertex's neighbours to rebuild smooth
// normals after a shader has displaced it. Closed directions repeat their seam
// row or column (as three.js does), and say so with wrapX/wrapY.

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
  cols: number;
  rows: number;
  wrapX: boolean;
  wrapY: boolean;
  /** Distance of the farthest vertex from the origin. */
  radius: number;
}

type Raw = Omit<Geometry, 'cols' | 'rows' | 'wrapX' | 'wrapY' | 'radius'>;

function finish(raw: Raw, cols: number, rows: number, wrapX: boolean, wrapY: boolean): Geometry {
  let radius = 0;
  for (let i = 0; i < raw.positions.length; i += 3) {
    radius = Math.max(radius, Math.hypot(raw.positions[i]!, raw.positions[i + 1]!, raw.positions[i + 2]!));
  }
  return { ...raw, cols, rows, wrapX, wrapY, radius };
}

export function sphere(radius: number, widthSegments: number, heightSegments: number): Geometry {
  return finish(sphereRaw(radius, widthSegments, heightSegments), widthSegments + 1, heightSegments + 1, true, false);
}

function sphereRaw(radius: number, widthSegments: number, heightSegments: number): Raw {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const grid: number[][] = [];
  let index = 0;

  for (let iy = 0; iy <= heightSegments; iy++) {
    const row: number[] = [];
    const v = iy / heightSegments;
    // Pole uv offset, as three.js does it.
    const uOffset = iy === 0 ? 0.5 / widthSegments : iy === heightSegments ? -0.5 / widthSegments : 0;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      const x = -radius * Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const y = radius * Math.cos(v * Math.PI);
      const z = radius * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      positions.push(x, y, z);
      const len = Math.hypot(x, y, z) || 1;
      normals.push(x / len, y / len, z / len);
      uvs.push(u + uOffset, 1 - v);
      row.push(index++);
    }
    grid.push(row);
  }

  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = grid[iy]![ix + 1]!;
      const b = grid[iy]![ix]!;
      const c = grid[iy + 1]![ix]!;
      const d = grid[iy + 1]![ix + 1]!;
      if (iy !== 0) indices.push(a, b, d);
      if (iy !== heightSegments - 1) indices.push(b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** A plane in XY facing +Z. The scene rotates it about X to lie flat. */
export function plane(width: number, height: number, widthSegments: number, heightSegments: number): Geometry {
  return finish(planeRaw(width, height, widthSegments, heightSegments), widthSegments + 1, heightSegments + 1, false, false);
}

function planeRaw(width: number, height: number, widthSegments: number, heightSegments: number): Raw {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const gridX1 = widthSegments + 1;

  for (let iy = 0; iy <= heightSegments; iy++) {
    const y = (iy * height) / heightSegments - height / 2;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const x = (ix * width) / widthSegments - width / 2;
      positions.push(x, -y, 0);
      normals.push(0, 0, 1);
      uvs.push(ix / widthSegments, 1 - iy / heightSegments);
    }
  }

  for (let iy = 0; iy < heightSegments; iy++) {
    for (let ix = 0; ix < widthSegments; ix++) {
      const a = ix + gridX1 * iy;
      const b = ix + gridX1 * (iy + 1);
      const c = ix + 1 + gridX1 * (iy + 1);
      const d = ix + 1 + gridX1 * iy;
      indices.push(a, b, d, b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Unique edges of a triangle list, as line-segment indices for gl.LINES. */
export function wireframe(triangles: Uint32Array): Uint32Array {
  const seen = new Set<number>();
  const lines: number[] = [];
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // Vertex counts stay far below 2^26, so this key is exact in a double.
    const key = lo * 67_108_864 + hi;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(lo, hi);
  };
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const a = triangles[i]!, b = triangles[i + 1]!, c = triangles[i + 2]!;
    add(a, b);
    add(b, c);
    add(c, a);
  }
  return new Uint32Array(lines);
}

// ——— parametric surfaces ———

type Vec = [number, number, number];
type Surface = (u: number, v: number) => Vec;

/**
 * Sample f(u, v) over [0,1]² on a grid. Normals come from central differences,
 * oriented away from the origin (all these shapes are star-shaped around it).
 */
export function parametric(f: Surface, segU: number, segV: number, wrapU: boolean, wrapV: boolean): Geometry {
  const cols = segU + 1, rows = segV + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const e = 1e-4;
  for (let j = 0; j < rows; j++) {
    const v = j / segV;
    for (let i = 0; i < cols; i++) {
      const u = i / segU;
      const p = f(u, v);
      const k = j * cols + i;
      positions.set(p, k * 3);
      uvs.set([u, 1 - v], k * 2);
      const du = sub(f(u + e, v), f(u - e, v));
      const dv = sub(f(u, v + e), f(u, v - e));
      let n = cross(du, dv);
      let len = Math.hypot(...n);
      if (len < 1e-12) {
        // A pole: no tangent plane, so point straight out.
        n = p;
        len = Math.hypot(...n) || 1;
      }
      if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) len = -len;
      normals.set([n[0] / len, n[1] / len, n[2] / len], k * 3);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * cols + i, b = (j + 1) * cols + i, c = b + 1, d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  return finish({ positions, normals, uvs, indices: new Uint32Array(indices) }, cols, rows, wrapU, wrapV);
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const spow = (x: number, e: number) => Math.sign(x) * Math.abs(x) ** e;

export function torus(radius: number, tube: number, segU: number, segV: number): Geometry {
  return parametric((u, v) => {
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const r = radius + tube * Math.cos(b);
    return [r * Math.cos(a), tube * Math.sin(b), r * Math.sin(a)];
  }, segU, segV, true, true);
}

/** A tube around a (p, q) torus knot. */
export function knot(radius: number, tube: number, p: number, q: number, segU: number, segV: number): Geometry {
  const curve = (t: number): Vec => {
    const a = t * Math.PI * 2;
    const r = radius * (2 + Math.cos(q * a)) / 3;
    return [r * Math.cos(p * a), radius * Math.sin(q * a) / 3, r * Math.sin(p * a)];
  };
  return parametric((u, v) => {
    const c = curve(u);
    const t = sub(curve(u + 1e-3), curve(u - 1e-3));
    const tl = Math.hypot(...t);
    const T: Vec = [t[0] / tl, t[1] / tl, t[2] / tl];
    // Frame from the tangent and the direction to the knot's centre line.
    let B = cross(T, [c[0], 0, c[2]]);
    const bl = Math.hypot(...B) || 1;
    B = [B[0] / bl, B[1] / bl, B[2] / bl];
    const N = cross(B, T);
    const b = v * Math.PI * 2;
    const cs = Math.cos(b) * tube, sn = Math.sin(b) * tube;
    return [c[0] + N[0] * cs + B[0] * sn, c[1] + N[1] * cs + B[1] * sn, c[2] + N[2] * cs + B[2] * sn];
  }, segU, segV, true, true);
}

/**
 * Superellipsoid: one formula for a sphere (1, 1), a rounded box (small),
 * a pillow, a pill, or a spiked star (above 2). e1 shapes the profile,
 * e2 the cross-section.
 */
export function superellipsoid(size: Vec, e1: number, e2: number, segU: number, segV: number): Geometry {
  return parametric((u, v) => {
    const phi = u * Math.PI * 2 - Math.PI;
    const theta = v * Math.PI - Math.PI / 2;
    const ct = spow(Math.cos(theta), e1);
    return [size[0] * ct * spow(Math.cos(phi), e2), -size[1] * spow(Math.sin(theta), e1), size[2] * ct * spow(Math.sin(phi), e2)];
  }, segU, segV, true, false);
}

// ——— the library: shapes you can put anywhere ———

export type GeometrySpec =
  | { kind: 'sphere'; radius: number; segments: [number, number] }
  | { kind: 'plane'; size: number; segments: [number, number] }
  | { kind: 'torus'; radius: number; tube: number; segments: [number, number] }
  | { kind: 'knot'; radius: number; tube: number; p: number; q: number; segments: [number, number] }
  | { kind: 'super'; size: Vec; e1: number; e2: number; segments: [number, number] };

export function build(spec: GeometrySpec): Geometry {
  const [a, b] = spec.segments;
  switch (spec.kind) {
    case 'sphere': return sphere(spec.radius, a, b);
    case 'plane': return plane(spec.size, spec.size, a, b);
    case 'torus': return torus(spec.radius, spec.tube, a, b);
    case 'knot': return knot(spec.radius, spec.tube, spec.p, spec.q, a, b);
    case 'super': return superellipsoid(spec.size, spec.e1, spec.e2, a, b);
  }
}

/** Named shapes. Every object in every scene is one of these, and any can be swapped for any other. */
export const GEOMETRIES = {
  sphere: { kind: 'sphere', radius: 300, segments: [128, 128] },
  plane: { kind: 'plane', size: 3000, segments: [32, 32] },
  terrain: { kind: 'plane', size: 7000, segments: [160, 160] },
  torus: { kind: 'torus', radius: 300, tube: 90, segments: [128, 40] },
  ring: { kind: 'torus', radius: 300, tube: 5, segments: [192, 8] },
  knot: { kind: 'knot', radius: 300, tube: 34, p: 2, q: 3, segments: [320, 24] },
  star: { kind: 'super', size: [300, 300, 300], e1: 2.7, e2: 2.7, segments: [128, 128] },
  shard: { kind: 'super', size: [300, 300, 300], e1: 3.2, e2: 3.2, segments: [40, 40] },
  cube: { kind: 'super', size: [220, 220, 220], e1: 0.18, e2: 0.18, segments: [64, 64] },
  pill: { kind: 'super', size: [110, 210, 110], e1: 0.55, e2: 1, segments: [48, 48] },
  column: { kind: 'super', size: [42, 520, 42], e1: 0.12, e2: 1, segments: [24, 48] },
  slab: { kind: 'super', size: [640, 9, 64], e1: 0.15, e2: 0.12, segments: [32, 16] },
  lattice: { kind: 'plane', size: 3000, segments: [12, 12] },
} satisfies Record<string, GeometrySpec>;
export type GeometryName = keyof typeof GEOMETRIES;
