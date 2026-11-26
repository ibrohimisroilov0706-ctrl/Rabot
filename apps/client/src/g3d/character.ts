// apps/client/src/g3d/character.ts
// Protsedural 3D jangchi: suyak ierarxiyasi (son, tizza, yelka, tirsak...) + har sivilizatsiya kiyimi.
// Animatsiya kodda: yurish/yugurish sikli, zarba (3 xil), qalqon bilan to'sish, chayqalish, yiqilish.

import { CIVS, type Civ, type CivKey } from './civs.js';
import type { Mesh, Renderer } from './engine/gl.js';
import { compose, mat4, mul, type Mat4 } from './engine/math.js';
import { Geo, at } from './engine/mesh.js';

type Part = 'pelvis' | 'skirt' | 'torso' | 'head' | 'uarm' | 'farmR' | 'farmL' | 'thigh' | 'shin' | 'sword' | 'shield' | 'cape';
type PartMeshes = Record<Part, Mesh>;
const caches = new WeakMap<Renderer, Map<string, PartMeshes>>();

function buildParts(r: Renderer, civ: Civ, hero: boolean): PartMeshes {
  const L = civ.look; const g = () => new Geo();
  // chanoq (pastki tana)
  const pelvis = g().box(0, -0.06, 0, 0.34, 0.2, 0.22, L.pants).box(0, 0.05, 0, 0.36, 0.06, 0.24, L.trim);
  // etak / to'n
  const skirt = g();
  if (L.skirt) { skirt.cyl(0, -0.42, 0, 0.27, 0.2, 0.44, 8, L.tunic, undefined, false); skirt.cyl(0, -0.44, 0, 0.28, 0.27, 0.05, 8, L.trim, undefined, false); }
  else skirt.cyl(0, -0.2, 0, 0.22, 0.2, 0.22, 8, L.tunic, undefined, false);
  // tana
  const torso = g().box(0, 0.27, 0, 0.42, 0.52, 0.26, L.tunic).box(0, 0.02, 0, 0.44, 0.07, 0.28, L.trim);
  if (civ.key === 'english') { torso.box(0, 0.3, 0.135, 0.07, 0.42, 0.01, L.trim).box(0, 0.38, 0.135, 0.3, 0.07, 0.01, L.trim); }
  else if (civ.key === 'chinese' || civ.key === 'russian') { for (let i = 0; i < 4; i++) torso.box(0, 0.12 + i * 0.1, 0.132, 0.4, 0.03, 0.01, L.metal); }
  else torso.box(0, 0.3, 0.132, 0.05, 0.46, 0.01, L.trim);
  torso.box(0.24, 0.47, 0, 0.12, 0.1, 0.24, L.metal).box(-0.24, 0.47, 0, 0.12, 0.1, 0.24, L.metal); // yelkalar
  // bosh + dubulg'a
  const head = g().box(0, 0.04, 0, 0.1, 0.08, 0.1, L.skin).sphere(0, 0.17, 0, 0.13, 8, L.skin, undefined, 1.1);
  head.box(0, 0.12, 0.12, 0.04, 0.05, 0.04, L.skin); // burun
  head.box(-0.045, 0.19, 0.118, 0.025, 0.02, 0.01, '#222').box(0.045, 0.19, 0.118, 0.025, 0.02, 0.01, '#222');
  if (civ.key !== 'english' && civ.key !== 'chinese') head.box(0, 0.08, 0.1, 0.16, 0.08, 0.06, civ.key === 'mughal' ? '#2a1a10' : '#3b2a1a'); // soqol
  switch (L.helmet) {
    case 'turbanSpike': head.cyl(0, 0.2, 0, 0.15, 0.16, 0.1, 10, L.cloth).cyl(0, 0.28, 0, 0.13, 0.02, 0.22, 10, L.metal).cyl(0, 0.48, 0, 0.012, 0.0, 0.08, 4, L.trim); break;
    case 'turban': head.sphere(0, 0.27, 0, 0.17, 10, L.cloth, undefined, 0.7).box(0, 0.4, 0.06, 0.03, 0.12, 0.03, '#f4efe3').sphere(0, 0.3, 0.15, 0.03, 6, '#d4a537'); break;
    case 'chinese': head.sphere(0, 0.24, 0, 0.155, 10, L.metal, undefined, 0.85, 0, 0.55).cyl(0, 0.36, 0, 0.03, 0.01, 0.08, 6, L.trim).cyl(0, 0.42, 0, 0.06, 0.0, 0.1, 6, L.cloth).box(0, 0.16, -0.12, 0.26, 0.14, 0.04, L.metal); break;
    case 'bork': head.cyl(0, 0.24, 0, 0.15, 0.14, 0.08, 10, L.trim).cyl(0, 0.3, 0, 0.13, 0.1, 0.36, 10, L.cloth).box(0, 0.5, -0.12, 0.12, 0.08, 0.2, L.cloth); break;
    case 'kettle': head.cyl(0, 0.24, 0, 0.27, 0.15, 0.04, 12, L.metal).sphere(0, 0.25, 0, 0.15, 10, L.metal, undefined, 0.9, 0, 0.5); break;
    case 'spire': head.sphere(0, 0.25, 0, 0.15, 10, L.metal, undefined, 1, 0, 0.5).cyl(0, 0.33, 0, 0.1, 0.0, 0.24, 8, L.metal).cyl(0, 0.22, 0, 0.16, 0.16, 0.05, 10, L.trim).box(0, 0.12, -0.11, 0.24, 0.16, 0.03, '#8e969e'); break;
  }
  if (hero) head.cyl(0, 0.55, 0, 0.0, 0.04, 0.0, 3, L.trim);
  // qo'llar (yelka bo'g'imidan pastga)
  const uarm = g().box(0, -0.14, 0, 0.12, 0.3, 0.12, L.tunic).box(0, -0.02, 0, 0.14, 0.08, 0.14, L.metal);
  const farm = (withSword: boolean) => {
    const f = g().box(0, -0.13, 0, 0.1, 0.27, 0.1, L.skin).box(0, -0.07, 0, 0.115, 0.13, 0.115, L.metal).box(0, -0.29, 0, 0.09, 0.08, 0.09, '#5a3a22');
    return f;
  };
  const farmR = farm(true), farmL = farm(false);
  // oyoqlar
  const thigh = g().box(0, -0.22, 0, 0.15, 0.44, 0.16, L.pants);
  const shin = g().box(0, -0.18, 0, 0.13, 0.36, 0.14, L.pants).box(0, -0.32, 0.02, 0.14, 0.14, 0.2, L.boots).box(0, -0.42, 0.05, 0.14, 0.06, 0.26, L.boots);
  // qilich: dasta kaft markazida, tig' +Z bo'ylab
  const curved = civ.key === 'timurid' || civ.key === 'mughal' || civ.key === 'ottoman';
  const sword = g().box(0, 0, -0.03, 0.04, 0.04, 0.16, '#3b2a1a').box(0, 0, 0.06, 0.2, 0.03, 0.035, '#c9a227');
  for (let i = 0; i < 5; i++) { const z0 = 0.08 + i * 0.16; const bend = curved ? (i * i) * 0.008 : 0; sword.box(0, bend, z0 + 0.08, 0.012, 0.055 - i * 0.004, 0.17, '#dfe5ea'); }
  // qalqon: kaftdan tashqariga (-X), old tomoni +Z
  const shield = g();
  if (L.shieldKind === 'round') { const m = at(0.06, 0, 0.05, 0, Math.PI / 2, 0); shield.cyl(0, -0.03, 0, 0.32, 0.3, 0.05, 14, L.shield, m).cyl(0, 0.02, 0, 0.07, 0.04, 0.05, 8, L.shieldTrim, m).cyl(0, -0.035, 0, 0.33, 0.33, 0.02, 14, L.shieldTrim, m, false); }
  else if (L.shieldKind === 'rect') { shield.box(0.06, -0.05, 0.05, 0.46, 0.7, 0.05, L.shield).box(0.06, -0.05, 0.08, 0.5, 0.05, 0.01, L.shieldTrim).box(0.06, 0.28, 0.08, 0.48, 0.04, 0.01, L.shieldTrim).box(0.06, -0.38, 0.08, 0.48, 0.04, 0.01, L.shieldTrim); }
  else {
    const T = (y: number, w: number) => [y, w] as const; const rows = [T(0.32, 0.46), T(0.1, 0.48), T(-0.15, 0.36), T(-0.4, 0.14), T(-0.55, 0)];
    for (let i = 0; i < rows.length - 1; i++) { const [y0, w0] = rows[i]!, [y1, w1] = rows[i + 1]!; shield.quad(mat4(), [0.06 - w0 / 2, y0, 0.05], [0.06 + w0 / 2, y0, 0.05], [0.06 + w1 / 2, y1, 0.05], [0.06 - w1 / 2, y1, 0.05], hexToRGB(L.shield)); shield.quad(mat4(), [0.06 - w1 / 2, y1, 0.02], [0.06 + w1 / 2, y1, 0.02], [0.06 + w0 / 2, y0, 0.02], [0.06 - w0 / 2, y0, 0.02], hexToRGB(L.shield)); }
    if (civ.key === 'english') shield.box(0.06, 0.05, 0.06, 0.07, 0.6, 0.01, L.shieldTrim).box(0.06, 0.15, 0.06, 0.4, 0.07, 0.01, L.shieldTrim);
    else shield.box(0.06, 0.0, 0.06, 0.06, 0.5, 0.01, L.shieldTrim);
  }
  const cape = g();
  if (hero) cape.plane([[-0.22, 0, -0.14], [0.22, 0, -0.14], [0.3, -0.95, -0.3], [-0.3, -0.95, -0.3]], L.cloth === '#f4efe3' ? L.trim : L.cloth);
  const u = (x: Geo) => r.upload(x);
  return { pelvis: u(pelvis), skirt: u(skirt), torso: u(torso), head: u(head), uarm: u(uarm), farmR: u(farmR), farmL: u(farmL), thigh: u(thigh), shin: u(shin), sword: u(sword), shield: u(shield), cape: u(cape) };
}
function hexToRGB(c: string): [number, number, number] { const n = parseInt(c.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

export function partsFor(r: Renderer, civ: CivKey, hero = false): PartMeshes {
  let cache = caches.get(r); if (!cache) { cache = new Map(); caches.set(r, cache); }
  const k = `${civ}|${hero}`; let p = cache.get(k);
  if (!p) { p = buildParts(r, CIVS[civ], hero); cache.set(k, p); }
  return p;
}

/** Animatsiya holati (combat.ts dagi Fighter'dan olinadi) */
export interface PoseIn {
  x: number; y: number; z: number; yaw: number;
  speed: number; // m/s
  phase: number; // yurish fazasi
  state: 'idle' | 'windup' | 'strike' | 'recover' | 'block' | 'stagger' | 'dead';
  stateT: number; stateDur: number; attack: number; deadT: number;
}

const M = () => mat4();
const tmp = { root: M(), hips: M(), torso: M(), head: M(), shR: M(), elR: M(), handR: M(), shL: M(), elL: M(), handL: M(), hipR: M(), knR: M(), hipL: M(), knL: M(), local: M() };
const smooth = (k: number) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };

export function drawCharacter(r: Renderer, P: PartMeshes, p: PoseIn, flash = 0, scale = 1) {
  const T = tmp; const L = T.local;
  // --- burchaklar
  const run = Math.min(1, p.speed / 5);
  const walkAmp = Math.min(1, p.speed / 2) * (0.55 + run * 0.35);
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  let hipsY = 0.95 + Math.abs(c) * 0.05 * walkAmp, torsoPitch = 0.05 + run * 0.18, torsoYaw = 0, torsoRoll = 0;
  let thR = -s * 0.7 * walkAmp, thL = s * 0.7 * walkAmp, knR = Math.max(0, s) * 1.1 * walkAmp + 0.05, knL = Math.max(0, -s) * 1.1 * walkAmp + 0.05;
  // qurolli qo'l: qo'riqlash holati
  let shRp = -0.55 + s * 0.15 * walkAmp, shRr = -0.15, shRy = 0, elR = -0.9, hdRp = 0.35, hdRr = 0;
  let shLp = -0.4 - s * 0.2 * walkAmp, shLr = 0.2, shLy = -0.35, elL = -1.0, hdLy = 0;
  const k = p.stateDur > 0 ? p.stateT / p.stateDur : 0;
  const breath = Math.sin(p.phase * 0.3 + p.x) * 0.02;
  if (p.speed < 0.2) { torsoPitch += breath; }
  if (p.state === 'windup' || p.state === 'strike' || p.state === 'recover') {
    // 0: o'ngdan chapga, 1: chapdan o'ngga, 2: tepadan
    const a = p.attack % 3;
    const wind = p.state === 'windup' ? smooth(k) : p.state === 'strike' ? 1 - smooth(k) : 0;
    const follow = p.state === 'strike' ? smooth(k) : p.state === 'recover' ? 1 - smooth(k) : 0;
    if (a === 2) { shRp = -0.6 - wind * 2.2 + follow * 0.6; elR = -0.4 - wind * 0.9; hdRp = 0.3 - wind * 0.4 + follow * 0.6; torsoPitch += -wind * 0.15 + follow * 0.35; }
    else {
      const dir = a === 0 ? 1 : -1;
      shRp = -1.35 - wind * 0.35; shRy = dir * (wind * 1.3 - follow * 1.3); shRr = -0.3 - wind * 0.5 * dir;
      elR = -0.35 - wind * 0.8; hdRr = dir * (wind * 0.6 - follow * 0.5); hdRp = 0.1;
      torsoYaw = dir * (wind * 0.55 - follow * 0.7);
    }
    thR = -0.25; thL = 0.25; knR = 0.3; knL = 0.15;
  } else if (p.state === 'block') {
    const b = Math.min(1, p.stateT / 0.12);
    shLp = -0.4 - b * 1.05; shLy = -0.35 - b * 0.3; elL = -1.0 + b * 0.55; shLr = 0.25;
    shRp = -0.9; elR = -1.2; shRr = -0.35; torsoPitch += 0.08; hipsY -= 0.04;
  } else if (p.state === 'stagger') {
    const b = Math.sin(Math.min(1, k) * Math.PI);
    torsoPitch -= b * 0.45; shRp = -0.2; shLp = -0.1; elR = -0.3; elL = -0.3; thR = -0.3 * b; knR = 0.4 * b;
  }
  // --- ildiz (o'lim: orqaga yiqilish)
  let rootPitch = 0, rootY = p.y;
  if (p.state === 'dead') { const d = smooth(p.deadT / 0.7); rootPitch = -d * 1.45; rootY = p.y + d * 0.12; shRp = -2.6 * d; shLp = -2.4 * d; elR = -0.2; elL = -0.2; thR = -0.3 * d; thL = -0.1 * d; knR = 0.2; knL = 0.5 * d; }
  compose(T.root, p.x, rootY, p.z, p.yaw, rootPitch, 0, scale);
  mul(T.hips, T.root, compose(L, 0, hipsY, 0, 0, 0, 0));
  r.draw(P.pelvis, T.hips, flash ? { flash } : undefined);
  r.draw(P.skirt, T.hips, flash ? { flash } : undefined);
  mul(T.torso, T.hips, compose(L, 0, 0.06, 0, torsoYaw, torsoPitch, torsoRoll));
  r.draw(P.torso, T.torso, flash ? { flash } : undefined);
  if (P.cape.count) r.draw(P.cape, mul(M(), T.torso, compose(L, 0, 0.5, 0, 0, -0.1 - Math.min(0.6, p.speed * 0.1), 0)));
  mul(T.head, T.torso, compose(L, 0, 0.53, 0, -torsoYaw * 0.6, -torsoPitch * 0.5, 0));
  r.draw(P.head, T.head, flash ? { flash } : undefined);
  // o'ng qo'l (qilich)
  mul(T.shR, T.torso, compose(L, -0.27, 0.45, 0, shRy, shRp, shRr));
  r.draw(P.uarm, T.shR);
  mul(T.elR, T.shR, compose(L, 0, -0.28, 0, 0, elR, 0));
  r.draw(P.farmR, T.elR);
  mul(T.handR, T.elR, compose(L, 0, -0.3, 0, 0, hdRp, hdRr));
  r.draw(P.sword, T.handR);
  // chap qo'l (qalqon)
  mul(T.shL, T.torso, compose(L, 0.27, 0.45, 0, shLy, shLp, shLr));
  r.draw(P.uarm, T.shL);
  mul(T.elL, T.shL, compose(L, 0, -0.28, 0, 0, elL, 0));
  r.draw(P.farmL, T.elL);
  mul(T.handL, T.elL, compose(L, 0, -0.3, 0, hdLy + 0.25, 1.35, 0));
  r.draw(P.shield, T.handL);
  // oyoqlar
  for (const [side, th, kn] of [[1, thR, knR], [-1, thL, knL]] as const) {
    const hip = side > 0 ? T.hipR : T.hipL, knee = side > 0 ? T.knR : T.knL;
    mul(hip, T.hips, compose(L, 0.1 * side, -0.08, 0, 0, th, 0));
    r.draw(P.thigh, hip, flash ? { flash } : undefined);
    mul(knee, hip, compose(L, 0, -0.44, 0, 0, kn, 0));
    r.draw(P.shin, knee, flash ? { flash } : undefined);
  }
}

/** Qilich uchi va qalqon markazi (dunyo koordinatalari) - hozircha effektlar uchun */
export function swordTip(): [number, number, number] { const m = tmp.handR; return [m[12]! + m[8]! * 0.85, m[13]! + m[9]! * 0.85, m[14]! + m[10]! * 0.85]; }
export type { Mat4 };
