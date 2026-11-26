// apps/client/src/g3d/menu.ts
// Bosh menyu va sivilizatsiya tanlash ekrani (3D aylanuvchi askar ko'rinishi bilan).
// Tayyor bo'lmagan bo'limlar aniq belgilangan va bosilmaydi (TODO.md ga qarang).

import { h, toast } from '../dom.js';
import { haptic, setBack } from '../telegram.js';
import { drawCharacter, partsFor } from './character.js';
import { CIVS, CIV_LIST, type Civ, type CivKey } from './civs.js';
import { Renderer } from './engine/gl.js';
import { envAt } from './scene.js';
import { loadProfile, saveProfile } from './settings.js';
import { startBattle3D } from './game3d.js';

export interface MenuHooks { worldMap: () => void; empire: () => void; army: () => void; hasWorld: () => boolean }

export function drawFlag(cv: HTMLCanvasElement, civ: Civ) {
  const c = cv.getContext('2d')!; const W = cv.width, H = cv.height; const F = civ.flag;
  c.fillStyle = F.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = F.fg; c.strokeStyle = F.fg; const cx = W / 2, cy = H / 2, s = Math.min(W, H);
  switch (F.emblem) {
    case 'cross': c.fillRect(cx - s * 0.07, 0, s * 0.14, H); c.fillRect(0, cy - s * 0.07, W, s * 0.14); break;
    case 'rings': c.lineWidth = s * 0.06; for (const [dx, dy] of [[-0.16, -0.1], [0.16, -0.1], [0, 0.17]]) { c.beginPath(); c.arc(cx + dx! * s, cy + dy! * s, s * 0.11, 0, Math.PI * 2); c.stroke(); } break;
    case 'crescent': c.beginPath(); c.arc(cx - s * 0.05, cy, s * 0.24, 0, Math.PI * 2); c.fill(); c.fillStyle = F.bg; c.beginPath(); c.arc(cx + s * 0.03, cy, s * 0.2, 0, Math.PI * 2); c.fill(); c.fillStyle = F.fg; c.beginPath(); c.arc(cx + s * 0.22, cy, s * 0.06, 0, Math.PI * 2); c.fill(); break;
    case 'sun': c.beginPath(); c.arc(cx, cy, s * 0.15, 0, Math.PI * 2); c.fill(); c.lineWidth = s * 0.04; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2); c.lineTo(cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3); c.stroke(); } break;
    case 'star': c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.12 : s * 0.3; c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.fill(); break;
    default: c.lineWidth = s * 0.1; c.strokeRect(s * 0.08, s * 0.08, W - s * 0.16, H - s * 0.16); c.beginPath(); c.arc(cx, cy, s * 0.14, 0, Math.PI * 2); c.fill();
  }
}

export function showMainMenu(hooks: MenuHooks) {
  document.querySelectorAll('.mm').forEach(e => e.remove());
  const prof = loadProfile();
  const item = (icon: string, label: string, fn: (() => void) | null, note?: string) =>
    h('button', { class: `mm-btn ${fn ? '' : 'soon'}`, disabled: !fn, onClick: () => { if (fn) { haptic('light'); fn(); } } }, h('span', {}, icon), h('b', {}, label), note ? h('small', {}, note) : null);
  const needWorld = (fn: () => void) => () => { if (!hooks.hasWorld()) { toast('Avval “Dunyo xaritasi”da o‘yin boshlang', 'info'); return; } close(); fn(); };
  const close = () => { root.remove(); setBack(null); };
  const root = h('div', { class: 'mm' },
    h('div', { class: 'mm-head' }, h('h1', {}, 'QIROLLIKLAR'), h('p', {}, 'Tarixiy imperiyalar')),
    h('div', { class: 'mm-list' },
      item('⚔', 'O‘YNASH', () => { close(); civSelect(hooks); }, '3D jang'),
      item('🗺', 'DUNYO XARITASI', () => { close(); hooks.worldMap(); }),
      item('👑', 'IMPERIYA', needWorld(hooks.empire)),
      item('🏙', 'SHAHAR', null, '3-bosqich'),
      item('🛡', 'ARMIYA', needWorld(hooks.army)),
      item('🤝', 'MULTIPLEYER', null, '5-bosqich'),
      item('🎒', 'INVENTAR', null, '2-bosqich'),
      item('⚙', 'SOZLAMALAR', () => settingsPanel())),
    h('div', { class: 'mm-foot' }, `Statistika: ${prof.kills} o‘ldirilgan · ${prof.wins} g‘alaba · ${prof.losses} mag‘lubiyat`));
  document.body.append(root);
}

function settingsPanel() {
  const prof = loadProfile(); const S = prof.settings;
  const save = () => { saveProfile(prof); toast('Saqlandi', 'ok'); };
  const seg = <T extends string>(vals: [T, string][], cur: T, set: (v: T) => void) => {
    const wrap = h('div', { class: 'seg' });
    for (const [v, l] of vals) wrap.append(h('button', { class: `btn small ${v === cur ? 'gold' : ''}`, onClick: () => { set(v); save(); box.remove(); settingsPanel(); } }, l));
    return wrap;
  };
  const box = h('div', { class: 'g3-panel settings' }, h('h2', {}, '⚙ Sozlamalar'),
    h('h4', {}, 'Grafika sifati'), seg([['low', 'Past (tez)'], ['mid', "O'rta"], ['high', 'Yuqori']], S.quality, v => { S.quality = v; }),
    h('h4', {}, 'Kamera sezgirligi'), seg([['0.6', 'Sekin'], ['1', "O'rta"], ['1.5', 'Tez']], String(S.sens) as '0.6' | '1' | '1.5', v => { S.sens = Number(v); }),
    h('h4', {}, 'Kamera vertikal'), seg([['n', 'Oddiy'], ['y', 'Teskari']], S.invertY ? 'y' : 'n', v => { S.invertY = v === 'y'; }),
    h('h4', {}, 'Kun va tun almashinuvi'), seg([['y', 'Yoqilgan'], ['n', "O'chiq"]], S.dayCycle ? 'y' : 'n', v => { S.dayCycle = v === 'y'; }),
    h('h4', {}, 'Boshqaruv maslahatlari'), seg([['y', "Ko'rsatish"], ['n', 'Yashirish']], S.showHints ? 'y' : 'n', v => { S.showHints = v === 'y'; }),
    h('button', { class: 'btn wide', onClick: () => box.remove() }, 'Yopish'));
  document.body.append(box);
}

export function civSelect(hooks: MenuHooks) {
  const prof = loadProfile();
  let sel: CivKey = prof.civ ?? 'timurid';
  let enemy: CivKey | 'random' = 'random';
  const preview = h('canvas', { class: 'cs-preview' }) as HTMLCanvasElement;
  const detail = h('div', { class: 'cs-detail' });
  const cards = CIV_LIST.map(k => {
    const fl = h('canvas', { width: 72, height: 48, class: 'cs-flag' }) as HTMLCanvasElement; drawFlag(fl, CIVS[k]);
    const b = h('button', { class: `cs-card ${k === sel ? 'on' : ''}`, onClick: () => { sel = k; cards.forEach(c => c.classList.remove('on')); b.classList.add('on'); fill(); haptic('light'); } }, fl, h('b', {}, CIVS[k].name), h('small', {}, CIVS[k].region));
    return b;
  });
  const enemySel = h('select', { class: 'inp', onChange: (e: Event) => { enemy = (e.target as HTMLSelectElement).value as CivKey | 'random'; } },
    h('option', { value: 'random' }, 'Tasodifiy'), ...CIV_LIST.map(k => h('option', { value: k }, CIVS[k].name)));
  const fill = () => {
    const c = CIVS[sel];
    detail.replaceChildren(h('h3', {}, c.name), h('div', { class: 'muted' }, c.region), h('p', {}, c.desc),
      h('ul', {}, ...c.advantages.map(a => h('li', {}, a))));
  };
  let running = true;
  const close = () => { running = false; root.remove(); setBack(null); };
  const root = h('div', { class: 'mm cs' },
    h('div', { class: 'cs-top' }, h('button', { class: 'btn small', onClick: () => { close(); showMainMenu(hooks); } }, '← Orqaga'), h('h2', {}, 'Sivilizatsiyani tanlang')),
    h('div', { class: 'cs-grid' }, ...cards),
    h('div', { class: 'cs-body' }, preview, detail),
    h('div', { class: 'cs-enemy' }, h('span', {}, 'Raqib:'), enemySel),
    h('button', { class: 'btn gold wide', onClick: () => {
      prof.civ = sel; saveProfile(prof); close();
      const en = enemy === 'random' ? undefined : enemy === sel ? CIV_LIST.find(k => k !== sel) : enemy;
      startBattle3D({ civ: sel, enemy: en, onExit: () => showMainMenu(hooks) });
    } }, '⚔ Jangga kirish'));
  setBack(() => { close(); showMainMenu(hooks); });
  document.body.append(root);
  fill();
  // 3D ko'rinish
  let r: Renderer | null = null;
  try { r = new Renderer(preview, 'mid'); } catch { preview.replaceWith(h('div', { class: 'muted' }, "3D ko'rinish uchun WebGL kerak")); }
  if (!r) return;
  const t0 = performance.now();
  const loop = (now: number) => {
    if (!running || !r) return;
    const t = (now - t0) / 1000;
    const env = envAt(0.42);
    env.fog = [0.07, 0.15, 0.27]; env.fogNear = 50; env.fogFar = 90;
    r.begin(env, [Math.sin(t * 0.5) * 3.2, 1.6, Math.cos(t * 0.5) * 3.2], [0, 1.05, 0], 0.75);
    const P = partsFor(r, sel, true);
    const cyc = t % 4;
    const state = cyc < 2.6 ? 'idle' : cyc < 3.06 ? 'windup' : cyc < 3.2 ? 'strike' : 'recover';
    const st = state === 'idle' ? cyc : state === 'windup' ? cyc - 2.6 : state === 'strike' ? cyc - 3.06 : cyc - 3.2;
    drawCharacter(r, P, { x: 0, y: 0, z: 0, yaw: 0, speed: 0, phase: t * 3, state, stateT: st, stateDur: state === 'windup' ? 0.46 : state === 'strike' ? 0.14 : 0.8, attack: Math.floor(t / 4) % 3, deadT: 0 });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
