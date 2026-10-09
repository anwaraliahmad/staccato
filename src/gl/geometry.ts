// Mesh generation. The layouts deliberately mirror three.js' SphereGeometry and
// PlaneGeometry (vertex order, uv convention, triangulation) because the 2016
// shaders were written against them — `position`, `normal` and `uv` mean
// exactly what they meant back then, and the wireframe keeps its diagonals.

export interface Geometry {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
}

export type ShapeKind = 'sphere' | 'plane';

export function sphere(radius: number, widthSegments: number, heightSegments: number): Geometry {
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
