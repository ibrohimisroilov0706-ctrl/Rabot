// apps/client/src/lord/app.ts
// Lord rejimi ilovasi: yuklash/saqlash, yuqori panel, pastki menyu, xarita sikli va hodisalar.

import type { Culture } from '@qirolliklar/game-rules';
import { cloudClear, cloudLoad } from '../offline/cloud.js';
import { $, fmt, h, mount, toast } from '../dom.js';
import { haptic, inTelegram } from '../telegram.js';
import { G, SAVE_KEY, save } from './game.js';
import { MapView } from './mapView.js';
import { diploScreen, fiefScreen, helpScreen, moreScreen, onboarding, openEncounter, openSettlement, partyScreen } from './menus.js';
import { count, dayOf, HOURS_PER_SEC, maxParty, newWorld, partyById, player, setById, step, type World } from './world.js';

let waitBtn: HTMLButtonElement;

export const hasLordSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };

export async function startLord(open?: 'army' | 'empire') {
  document.body.classList.add('lord');
  $('#panel').classList.add('hidden'); $('#sheet').classList.add('hidden');
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { /* */ }
  if (!raw && inTelegram) raw = await cloudLoad('lrd').catch(() => null);
  let w: World | null = null;
  try { const o = raw ? JSON.parse(raw) : null; if (o && o.v === 2) w = o; } catch { /* */ }
  if (w) { run(w); if (open === 'army') setTimeout(partyScreen, 300); if (open === 'empire') setTimeout(fiefScreen, 300); }
  else onboarding((name: string, cu: Culture) => { const nw = newWorld(name, cu); run(nw); setTimeout(helpScreen, 400); });
}

function run(w: World) {
  G.w = w;
  (window as unknown as { __lord?: typeof G }).__lord = G;
  const stage = $('#stage');
  stage.querySelectorAll('.lord-map').forEach(e => e.remove());
  const map = new MapView(stage);
  G.map = map;
  const pl = player(w); map.centerOn(pl.x, pl.y);
  map.onTap = t => {
    const p = player(G.w);
    if (t.kind === 'set') { const s = setById(G.w, t.id)!; p.goal = { kind: 'set', id: s.id }; }
    else if (t.kind === 'party') p.goal = { kind: 'party', id: t.id };
    else p.goal = { kind: 'pt', x: t.x, y: t.y };
    G.w.waiting = false; haptic('light'); G.hud();
  };
  buildHud(); buildNav(); G.hud = updateHud; updateHud();
  save();

  let last = performance.now(), hudT = 0, saveT = 0, lastLog = w.log[0]?.t ?? 0;
  const loop = (now: number) => {
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    const W = G.w; const me = player(W);
    const busy = G.battle || !$('#modal').classList.contains('hidden') || !!document.querySelector('.lord-onb');
    if (!busy && (me.goal || W.waiting)) {
      const ev = step(W, real * HOURS_PER_SEC * W.speed);
      for (const e of ev) {
        if (e.k === 'enter') { const s = setById(W, e.id); if (s) openSettlement(s); }
        else if (e.k === 'meet') { const p = partyById(W, e.id); if (p) openEncounter(p, false); }
        else if (e.k === 'attacked') { const p = partyById(W, e.id); if (p) { W.waiting = false; me.goal = null; haptic('heavy'); openEncounter(p, true); } }
        else if (e.k === 'news') toast(e.text, e.important ? 'err' : 'info');
      }
      // muhim dunyo yangiliklari
      for (const l of W.log) { if (l.t <= lastLog) break; if (/^(⚔|🕊|🏰)/.test(l.text)) toast(l.text, 'info'); }
      lastLog = W.log[0]?.t ?? lastLog;
      saveT += real; if (saveT > 8) { saveT = 0; save(); }
    }
    map.render(W, now);
    hudT += real; if (hudT > 0.25) { hudT = 0; updateHud(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}

function buildHud() {
  mount($('#topbar'), h('div', { class: 'lord-hud' },
    h('span', { 'data-h': 'gold' }), h('span', { 'data-h': 'food' }), h('span', { 'data-h': 'army' }), h('span', { 'data-h': 'ren' }), h('span', { 'data-h': 'day' })));
}
function updateHud() {
  const w = G.w; if (!w) return; const p = player(w);
  const set = (k: string, v: string) => { const el = document.querySelector(`[data-h="${k}"]`); if (el) el.textContent = v; };
  set('gold', `💰 ${fmt(p.gold)}`); set('food', `🌾 ${w.player.food}`);
  set('army', `⚔ ${count(p.troops)}/${maxParty(w)}`); set('ren', `⭐ ${w.player.renown}`);
  const hr = Math.floor(w.t % 24);
  set('day', `📅 ${dayOf(w)}-kun ${hr.toString().padStart(2, '0')}:00`);
  if (waitBtn) { waitBtn.classList.toggle('on', w.waiting); waitBtn.querySelector('b')!.textContent = w.waiting ? 'To‘xtash' : 'Kutish'; }
}

function buildNav() {
  const item = (icon: string, label: string, fn: () => void) => h('button', { class: 'nav-btn', onClick: () => { haptic('light'); fn(); } }, h('span', {}, icon), h('b', {}, label));
  waitBtn = item('⏳', 'Kutish', () => { G.w.waiting = !G.w.waiting; if (G.w.waiting) player(G.w).goal = null; updateHud(); }) as HTMLButtonElement;
  mount($('#nav'),
    waitBtn,
    item('🛡', 'Otryad', partyScreen),
    item('🏰', 'Yerlar', fiefScreen),
    item('📜', 'Diplomatiya', diploScreen),
    item('☰', 'Yana', () => moreScreen(() => { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } cloudClear('lrd'); setTimeout(() => location.reload(), 300); })));
}
