// Sodda 3D value-noise va fBm. Planeta sirtini tikuvsiz (seam'siz) yaratish uchun
// 2D emas, sfera yuzasidagi 3D nuqtalar ustida ishlaydi.
export function createNoise(seed = 1) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }

  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => perm[perm[perm[x & 255] + (y & 255)] + (z & 255)] / 255;

  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);

    const a = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u);
    const b = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
    const c = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u);
    const d = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);

    return lerp(lerp(a, b, v), lerp(c, d, v), w);
  }

  function fbm(x, y, z, octaves = 5) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  return { noise3, fbm };
}
