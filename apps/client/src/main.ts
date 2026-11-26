// apps/client/src/main.ts
// Ilova: kirish (Telegram initData yoki dev), yuqorida resurslar, pastda navigatsiya, ekranlar, realtime.

import './styles.css';
import { OFFLINE, api, getToken, setToken, wsUrl } from './api.js';
import { $, h, mount, startCountdowns, toast, fmt } from './dom.js';
import { showScene, hideScenes, scenes, startGame } from './game.js';
import { RES } from './i18n.js';
import { buildingModal, newBuildingModal, renderCitySheet } from './screens/city.js';
import { renderArmy } from './screens/army.js';
import { renderCityCard } from './screens/map.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderPalace } from './screens/palace.js';
import { renderDiplomacy, renderHistory, renderKingdoms, renderMessages, renderSettings, renderTrade } from './screens/others.js';
import { renderDuel } from './screens/duel.js';
import { liveResource, me, refresh, subscribe, type Me } from './store.js';
import { haptic, inTelegram, initTelegram, setBack, tg } from './telegram.js';

type Screen = 'map' | 'city' | 'army' | 'palace' | 'more' | 'diplomacy' | 'trade' | 'kingdoms' | 'messages' | 'history' | 'settings' | 'duel';
let screen: Screen = 'city';
const NAV: { key: Screen; icon: string; label: string }[] = [
  { key: 'map', icon: '🗺', label: 'Xarita' }, { key: 'city', icon: '🏙', label: 'Shahar' }, { key: 'army', icon: '⚔', label: 'Armiya' },
  { key: 'palace', icon: '👑', label: 'Saroy' }, { key: 'more', icon: '☰', label: 'Yana' },
];
const MORE: { key: Screen; icon: string; label: string }[] = OFFLINE ? [
  { key: 'duel', icon: '⚔', label: 'Jang kodi' }, { key: 'trade', icon: '⚖', label: 'Savdo' }, { key: 'kingdoms', icon: '🏰', label: 'Raqiblar' },
  { key: 'messages', icon: '✉', label: 'Xabarlar' }, { key: 'history', icon: '📖', label: 'Tarix' }, { key: 'settings', icon: '⚙', label: 'Sozlamalar' },
] : [
  { key: 'diplomacy', icon: '📜', label: 'Diplomatiya' }, { key: 'trade', icon: '⚖', label: 'Savdo' }, { key: 'kingdoms', icon: '🏰', label: 'Qirolliklar' },
  { key: 'messages', icon: '✉', label: 'Xabarlar' }, { key: 'history', icon: '📖', label: 'Tarix' }, { key: 'settings', icon: '⚙', label: 'Sozlamalar' },
];

async function initOffline() {
  const eng = await import('./offline/engine.js');
  const cloud = await import('./offline/cloud.js');
  let raw: string | null = null;
  try { raw = localStorage.getItem('qrl_offline_v1'); } catch { /* */ }
  if (!raw && inTelegram) raw = await cloud.cloudLoad().catch(() => null);
  eng.loadState(raw);
  eng.onSaved(st => cloud.cloudSave(JSON.stringify(st)));
  window.addEventListener('qrl-notify', e => { toast((e as CustomEvent).detail.title); haptic('medium'); });
}

async function login() {
  if (OFFLINE) return initOffline();
  if (getToken()) return;
  if (inTelegram) { const r = await api('POST', '/api/auth/telegram', { initData: tg!.initData }); setToken(r.token); return; }
  const cfg = await api('GET', '/api/config');
  if (!cfg.devAuth) throw new Error('Iltimos, o‘yinni Telegram orqali oching');
  let id = Number(localStorage.getItem('qrl_dev_id'));
  if (!id) { id = 100000 + Math.floor(Math.random() * 900000); localStorage.setItem('qrl_dev_id', String(id)); }
  const r = await api('POST', '/api/auth/dev', { telegramId: id, name: `Dev ${id}` });
  setToken(r.token);
}

function renderTopbar() {
  if (!me?.city) { mount($('#topbar')); return; }
  mount($('#topbar'), ...(Object.keys(RES) as (keyof typeof RES)[]).map(k => {
    const ph = me!.city.perHour[k] ?? 0;
    return h('div', { class: 'res', title: `${RES[k].name}: ${ph >= 0 ? '+' : ''}${ph}/soat, sig‘im ${fmt(me!.city.caps[k] ?? 0)}` },
      h('span', { class: 'ri' }, RES[k].icon), h('b', { 'data-res': k }, fmt(liveResource(k))), h('small', { class: ph < 0 ? 'neg' : '' }, `${ph >= 0 ? '+' : ''}${fmt(ph)}`));
  }));
}

function renderNav() {
  const unread = me?.unread ?? 0;
  mount($('#nav'), ...NAV.map(n => h('button', { class: `nav-btn${screen === n.key || (n.key === 'more' && MORE.some(x => x.key === screen)) ? ' active' : ''}`, onClick: () => go(n.key) },
    h('span', {}, n.icon), h('small', {}, n.label), n.key === 'more' && unread ? h('i', { class: 'badge' }, String(unread)) : null)));
}

async function loadWorld() {
  const { world } = (await scenes())!;
  const w = await api('GET', '/api/world');
  world.setData(w.cities, w.armies, me?.kingdom?.id ?? '');
}

async function go(s: Screen) {
  screen = s; haptic('light'); renderNav();
  const panel = $('#panel'), sheet = $('#sheet');
  sheet.classList.add('hidden');
  setBack(s === 'map' || s === 'city' ? null : () => go('city'));
  if (!me?.kingdom) return;
  if (s === 'map' || s === 'city') {
    panel.classList.add('hidden');
    await showScene(s === 'map' ? 'world' : 'city');
    if (s === 'map') { await loadWorld(); }
    else { sheet.classList.remove('hidden'); renderCitySheet(sheet, me); }
    return;
  }
  hideScenes();
  panel.classList.remove('hidden');
  const m = me as Me;
  try {
    if (s === 'army') renderArmy(panel, m);
    else if (s === 'palace') renderPalace(panel, m);
    else if (s === 'more') mount(panel, h('div', { class: 'page' }, h('h2', {}, 'Bo‘limlar'), h('div', { class: 'more-grid' }, ...MORE.map(x => h('button', { class: 'more-btn', onClick: () => go(x.key) }, h('span', {}, x.icon), x.label, x.key === 'messages' && m.unread ? h('i', { class: 'badge' }, String(m.unread)) : null)))));
    else if (s === 'diplomacy') await renderDiplomacy(panel, m);
    else if (s === 'trade') await renderTrade(panel, m);
    else if (s === 'kingdoms') await renderKingdoms(panel, m, async (x, y) => { await go('map'); (await scenes())!.world.centerOn(x, y); });
    else if (s === 'messages') { await renderMessages(panel); await refresh(); }
    else if (s === 'history') await renderHistory(panel, m);
    else if (s === 'settings') renderSettings(panel, m);
    else if (s === 'duel') renderDuel(panel, m);
  } catch (e) { toast((e as Error).message, 'err'); }
}

function connectRealtime() {
  if (OFFLINE) return; // oflaynda xabarlar lokal hodisa orqali keladi
  let delay = 1000;
  const open = () => {
    const ws = new WebSocket(wsUrl());
    ws.onopen = () => { delay = 1000; };
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data) as { type: string; data?: { title?: string } };
      if (m.type === 'notification') { toast(m.data?.title ?? 'Yangi xabar'); haptic('medium'); void refresh(); }
      else if (m.type === 'world_changed') { if (screen === 'map') void loadWorld(); }
      else if (m.type !== 'hello') void refresh();
    };
    ws.onclose = () => { setTimeout(open, delay); delay = Math.min(30_000, delay * 2); };
  };
  open();
}

let lastKingdom: string | null = null;
function onState(m: Me) {
  renderTopbar(); renderNav();
  if (!m.kingdom) {
    hideScenes(); $('#sheet').classList.add('hidden');
    const panel = $('#panel'); panel.classList.remove('hidden'); renderOnboarding(panel); return;
  }
  void scenes()!.then(s => {
    s.city.setCity(m.kingdom!.culture, m.city.buildings, m.city.slots, m.queue.map(q => q.building_id));
    if (lastKingdom !== m.kingdom!.id) { s.world.centerOn(m.city.x, m.city.y); }
  });
  if (lastKingdom !== m.kingdom.id) { lastKingdom = m.kingdom.id; void go('city'); return; }
  if (screen === 'city') renderCitySheet($('#sheet'), m);
  else if (screen === 'army') renderArmy($('#panel'), m);
  else if (screen === 'palace') renderPalace($('#panel'), m);
}

async function boot() {
  initTelegram();
  mount($('#panel'), h('div', { class: 'splash' }, h('h1', {}, 'QIROLLIKLAR'), h('p', {}, 'Yuklanmoqda…')));
  $('#panel').classList.remove('hidden');
  try {
    await login();
  } catch (e) {
    mount($('#panel'), h('div', { class: 'splash' }, h('h1', {}, 'QIROLLIKLAR'), h('p', {}, (e as Error).message))); return;
  }
  const s = await startGame('phaser');
  s.city.onBuilding = b => buildingModal(b);
  s.city.onEmpty = () => newBuildingModal();
  s.world.onSelect = c => { const sh = $('#sheet'); void renderCityCard(sh, c); };
  subscribe(onState);
  try { await refresh(); } catch (e) { toast((e as Error).message, 'err'); if (!getToken()) { await login(); await refresh(); } }
  connectRealtime();
  startCountdowns(() => void refresh());
  setInterval(() => document.querySelectorAll<HTMLElement>('[data-res]').forEach(el => { el.textContent = fmt(liveResource(el.dataset.res!)); }), 1000);
  setInterval(() => void refresh().catch(() => {}), 60_000);
}

void boot();
