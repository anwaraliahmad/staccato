// Just enough column-major 4x4 matrix math for a camera and a few meshes.
// Layout matches what gl.uniformMatrix4fv expects (no transpose).

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

export function identity(out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  // Copy first so `out` may alias `a` or `b`.
  const a0 = Array.from(a);
  const b0 = Array.from(b);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a0[k * 4 + row]! * b0[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function perspective(fovYDeg: number, aspect: number, near: number, far: number, out: Mat4 = new Float32Array(16)): Mat4 {
  const f = 1 / Math.tan((fovYDeg * Math.PI) / 360);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3, out: Mat4 = new Float32Array(16)): Mat4 {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;

  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;

  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
  return out;
}

/** Translation followed by a rotation about X — all the transforms the scene needs. */
export function translateRotateX(pos: Vec3, rotX: number, out: Mat4 = new Float32Array(16)): Mat4 {
  const c = Math.cos(rotX), s = Math.sin(rotX);
  identity(out);
  out[5] = c; out[6] = s;
  out[9] = -s; out[10] = c;
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2];
  return out;
}

/** Upper-left 3x3 of a matrix — the normal matrix for rigid transforms. */
export function normalMatrix(m: Mat4, out: Float32Array = new Float32Array(9)): Float32Array {
  out[0] = m[0]!; out[1] = m[1]!; out[2] = m[2]!;
  out[3] = m[4]!; out[4] = m[5]!; out[5] = m[6]!;
  out[6] = m[8]!; out[7] = m[9]!; out[8] = m[10]!;
  return out;
}

/** General 4x4 inverse (cofactor expansion). Returns identity for a singular matrix. */
export function invert(m: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as unknown as number[] as [
    number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number,
  ];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return identity(out);
  const d = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return out;
}

/** Translation · rotation (Euler, applied X then Y then Z) · uniform scale. */
export function compose(position: Vec3, rotation: Vec3 = [0, 0, 0], scale = 1, out: Mat4 = new Float32Array(16)): Mat4 {
  const [x, y, z] = rotation;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // R = Rz · Ry · Rx, column-major.
  out[0] = cz * cy * scale;
  out[1] = sz * cy * scale;
  out[2] = -sy * scale;
  out[3] = 0;
  out[4] = (cz * sy * sx - sz * cx) * scale;
  out[5] = (sz * sy * sx + cz * cx) * scale;
  out[6] = cy * sx * scale;
  out[7] = 0;
  out[8] = (cz * sy * cx + sz * sx) * scale;
  out[9] = (sz * sy * cx - cz * sx) * scale;
  out[10] = cy * cx * scale;
  out[11] = 0;
  out[12] = position[0];
  out[13] = position[1];
  out[14] = position[2];
  out[15] = 1;
  return out;
}
