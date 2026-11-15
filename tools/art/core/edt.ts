/**
 * Exact Euclidean distance transform (Felzenszwalb and Huttenlocher). For every pixel set in
 * `inside` it returns how far the pixel's center is from the nearest edge of the shape, in pixels:
 * about 0.5 on the rim, growing inward. Pixels outside the shape get 0.
 */
export function distanceInside(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e12;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = inside[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  const pass = (len: number): void => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      for (;;) {
        const p = v[k]!;
        s = (f[q]! + q * q - (f[p]! + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]!) {
          k--;
          if (k < 0) {
            k = 0;
            break;
          }
        } else break;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      const p = v[k]!;
      d[q] = (q - p) * (q - p) + f[p]!;
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    pass(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    pass(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = inside[i] ? Math.max(0.5, Math.sqrt(grid[i]!) - 0.5) : 0;
  return out;
}
