import * as THREE from 'three';
import { createNoise } from './noise.js';
import { REGIONS, latLonToVector3 } from './regions.js';

const SEA = 0.53; // dengiz sathi (0..1)

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const C = {
  deep: hex(0x04213d),
  mid: hex(0x0a5a7a),
  shallow: hex(0x2bb3b1),
  sand: hex(0xe0c48a),
  desert: hex(0xd69a54),
  grass: hex(0x7fae52),
  forest: hex(0x2d6a45),
  tundra: hex(0x9aa58a),
  rock: hex(0x8a7d72),
  snow: hex(0xf3f7fb),
  ice: hex(0xdcecf5)
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  return { canvas, ctx, img, data: img.data };
}

// Sfera ustidagi (x,y) piksel uchun yo'nalish vektori (Three.js SphereGeometry bilan mos).
function precomputeColumns(width) {
  const cosT = new Float32Array(width);
  const sinT = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const theta = ((x + 0.5) / width) * Math.PI * 2;
    cosT[x] = Math.cos(theta);
    sinT[x] = Math.sin(theta);
  }
  return { cosT, sinT };
}

// Rang, balandlik va yaltiroqlik xaritalari
async function generateMaps(width, height, onProgress) {
  const { fbm } = createNoise(2024);
  const color = makeCanvas(width, height);
  const bump = makeCanvas(width, height);
  const spec = makeCanvas(width, height);
  const { cosT, sinT } = precomputeColumns(width);
  const dirs = REGIONS.map((r) => latLonToVector3(r.lat, r.lon, 1));

  const rowsPerChunk = 24;
  for (let y0 = 0; y0 < height; y0 += rowsPerChunk) {
    const yEnd = Math.min(height, y0 + rowsPerChunk);

    for (let y = y0; y < yEnd; y++) {
      const phi = ((y + 0.5) / height) * Math.PI;
      const sinP = Math.sin(phi);
      const dy = Math.cos(phi);

      for (let x = 0; x < width; x++) {
        const dx = -sinP * cosT[x];
        const dz = sinP * sinT[x];

        // Hududlar ta'siri
        let boost = 0, wet = 0, warm = 0;
        for (let i = 0; i < dirs.length; i++) {
          const r = REGIONS[i];
          const d = dirs[i];
          const dd = 1 - (dx * d.x + dy * d.y + dz * d.z);
          const s2 = r.spread * r.spread;
          boost += r.boost * Math.exp(-dd / s2);
          const wb = Math.exp(-dd / (s2 * 2.5));
          wet += r.wet * wb;
          warm += r.warm * wb;
        }

        const base = fbm(dx * 1.7 + 3.1, dy * 1.7 + 1.3, dz * 1.7 + 7.7, 6);
        const detail = fbm(dx * 9 + 11, dy * 9 + 5, dz * 9 + 2, 3);
        const hgt = base + boost + (detail - 0.5) * 0.08;

        let rgb;
        let specV = 0;

        const polar = Math.abs(dy) + (detail - 0.5) * 0.15 > 0.93;

        if (hgt < SEA) {
          const dep = clamp01((SEA - hgt) / 0.22);
          rgb = dep < 0.35 ? mixC(C.shallow, C.mid, dep / 0.35) : mixC(C.mid, C.deep, (dep - 0.35) / 0.65);
          specV = 1;
          if (polar) {
            rgb = mixC(rgb, C.ice, 0.85);
            specV = 0.25;
          }
        } else {
          const e = clamp01((hgt - SEA) / 0.55);
          const m = fbm(dx * 2.4 + 9, dy * 2.4 + 4, dz * 2.4 + 2, 4) + wet;
          const t = 1 - 0.8 * Math.pow(Math.abs(dy), 1.6) + warm - e * 0.45;

          let land = mixC(C.desert, C.grass, smooth(0.38, 0.55, m));
          land = mixC(land, C.forest, smooth(0.55, 0.72, m));
          land = mixC(land, C.tundra, smooth(0.45, 0.2, t));
          land = mixC(C.sand, land, smooth(0.0, 0.05, e));
          land = mixC(land, C.rock, smooth(0.5, 0.8, e));
          land = mixC(land, C.snow, Math.max(smooth(0.78, 0.98, e), smooth(0.25, 0.05, t) * 0.92));
          rgb = land;
        }

        // Mayda ranglar o'zgarishi
        const shade = 0.92 + 0.16 * detail;
        const gray = clamp01((Math.max(hgt, SEA) - SEA) / 0.5);

        const k = (y * width + x) * 4;
        color.data[k] = Math.min(255, rgb[0] * shade);
        color.data[k + 1] = Math.min(255, rgb[1] * shade);
        color.data[k + 2] = Math.min(255, rgb[2] * shade);
        color.data[k + 3] = 255;

        const g = gray * 255;
        bump.data[k] = bump.data[k + 1] = bump.data[k + 2] = g;
        bump.data[k + 3] = 255;

        const sv = specV * 255;
        spec.data[k] = spec.data[k + 1] = spec.data[k + 2] = sv;
        spec.data[k + 3] = 255;
      }
    }

    onProgress(yEnd / height);
    await nextFrame();
  }

  color.ctx.putImageData(color.img, 0, 0);
  bump.ctx.putImageData(bump.img, 0, 0);
  spec.ctx.putImageData(spec.img, 0, 0);
  return { color: color.canvas, bump: bump.canvas, spec: spec.canvas };
}

// Bulutlar (oq rang + alfa kanali)
async function generateClouds(width, height, onProgress) {
  const { fbm } = createNoise(77);
  const cl = makeCanvas(width, height);
  const { cosT, sinT } = precomputeColumns(width);

  const rowsPerChunk = 32;
  for (let y0 = 0; y0 < height; y0 += rowsPerChunk) {
    const yEnd = Math.min(height, y0 + rowsPerChunk);
    for (let y = y0; y < yEnd; y++) {
      const phi = ((y + 0.5) / height) * Math.PI;
      const sinP = Math.sin(phi);
      const dy = Math.cos(phi);
      for (let x = 0; x < width; x++) {
        const dx = -sinP * cosT[x];
        const dz = sinP * sinT[x];
        const n = fbm(dx * 2.6 + 20, dy * 2.6 + 8, dz * 2.6 + 3, 5);
        const a = smooth(0.52, 0.7, n);
        const k = (y * width + x) * 4;
        cl.data[k] = cl.data[k + 1] = cl.data[k + 2] = 255;
        cl.data[k + 3] = a * 235;
      }
    }
    onProgress(yEnd / height);
    await nextFrame();
  }
  cl.ctx.putImageData(cl.img, 0, 0);
  return cl.canvas;
}

function atmosphereMaterials() {
  const vertex = `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;

  // Tashqi yorug'lik (planeta chetidan tashqariga so'nadi)
  const outer = new THREE.ShaderMaterial({
    uniforms: { glow: { value: new THREE.Color(0x4aa8ff) } },
    vertexShader: vertex,
    fragmentShader: `
      uniform vec3 glow;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float d = clamp(-dot(vNormal, vView), 0.0, 1.0);
        float f = pow(d, 2.0) * 2.2;
        gl_FragColor = vec4(glow * f, 1.0);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });

  // Ichki chekka nuri
  const rim = new THREE.ShaderMaterial({
    uniforms: { glow: { value: new THREE.Color(0x7fd4ff) } },
    vertexShader: vertex,
    fragmentShader: `
      uniform vec3 glow;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 3.2);
        gl_FragColor = vec4(glow * f * 1.1, 1.0);
      }`,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });

  return { outer, rim };
}

export async function createPlanet(onProgress = () => {}) {
  const small = window.matchMedia('(max-width: 700px)').matches;
  const W = small ? 1024 : 2048;

  const maps = await generateMaps(W, W / 2, (p) => onProgress(p * 0.85));
  const cloudCanvas = await generateClouds(1024, 512, (p) => onProgress(0.85 + p * 0.15));

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  const group = new THREE.Group();

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 64),
    new THREE.MeshPhongMaterial({
      map: tex(maps.color, true),
      bumpMap: tex(maps.bump, false),
      bumpScale: 3,
      specularMap: tex(maps.spec, false),
      specular: new THREE.Color(0x4a6a88),
      shininess: 28
    })
  );
  group.add(planet);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 96, 48),
    new THREE.MeshLambertMaterial({
      map: tex(cloudCanvas, true),
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    })
  );
  group.add(clouds);

  const { outer, rim } = atmosphereMaterials();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 48), rim));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.24, 96, 48), outer));

 return {
  group,
  planet,
  clouds,
  landMask: maps.bump
};
}

export function createStars(count = 2600) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const tint = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 40;
    const s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(a);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(a);

    tint.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.65 + Math.random() * 0.3);
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // Dumaloq nuqta teksturasi
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);

  const mat = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false,
    map: new THREE.CanvasTexture(c),
    vertexColors: true,
    transparent: true,
    depthWrite: false
  });

  return new THREE.Points(geo, mat);
}
