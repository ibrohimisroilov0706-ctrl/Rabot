// apps/client/src/screens/city.ts
// Shahar: Phaser sahnasi + pastki varaq (aholi, baxt, navbat, soliq). Binoga bosilsa - yaxshilash oynasi.

import { BUILDINGS, CULTURES, buildTimeSec, costAt, type BuildingKey } from '@qirolliklar/game-rules';
import { api } from '../api.js';
import { buildingIcon } from '../art/buildings.js';
import { dur, fmt, h, modal, mount, toast } from '../dom.js';
import { BUILDING_INFO, RES, TIER_NAME, buildingName } from '../i18n.js';
import { me, refresh, type Me } from '../store.js';
import { haptic } from '../telegram.js';

export const costLine = (cost: Record<string, number>, have?: Record<string, number>) => h('div', { class: 'cost' },
  ...Object.entries(cost).map(([k, v]) => h('span', { class: have && (have[k] ?? 0) < v ? 'short' : '' }, `${RES[k as keyof typeof RES].icon} ${fmt(v)}`)));

function realMs(gameSec: number) { return (gameSec * 1000) / (me?.gameSpeed ?? 1); }

export function buildingModal(b: { id: string; key: BuildingKey; level: number }) {
  if (!me?.kingdom) return;
  const cu = me.kingdom.culture;
  const palace = me.city.buildings.find(x => x.key === 'saroy')?.level ?? 1;
  const next = b.level + 1;
  const body = h('div', { class: 'bmodal' },
    buildingIcon(cu, b.key, b.level, 120),
    h('p', {}, BUILDING_INFO[b.key]),
    h('p', {}, h('b', {}, `Daraja: ${b.level} / 10`)));
  const actions: { label: string; kind?: string; onClick: () => Promise<void> }[] = [];
  if (b.level > 0 && next <= 10) {
    const cost = costAt(b.key, next) as Record<string, number>;
    body.append(h('h4', {}, `${next}-darajaga ko‘tarish`), costLine(cost, me.city.resources),
      h('p', { class: 'muted' }, `Vaqt: ${dur(realMs(buildTimeSec(b.key, next, palace, cu)))}`));
    if (b.key !== 'saroy' && next > palace) body.append(h('p', { class: 'warn' }, `Avval saroyni ${next}-darajaga ko‘taring`));
    actions.push({ label: 'Yaxshilash', kind: 'gold', onClick: async () => { await api('POST', '/api/city/build', { buildingId: b.id }); haptic('success'); toast('Qurilish boshlandi', 'ok'); await refresh(); } });
  }
  modal(`${buildingName(b.key, cu)}`, body, actions);
}

export function newBuildingModal() {
  if (!me?.kingdom) return;
  const cu = me.kingdom.culture;
  const existing = new Set(me.city.buildings.map(b => b.key));
  const list = (Object.keys(BUILDINGS) as BuildingKey[]).filter(k => BUILDINGS[k].repeatable || !existing.has(k));
  let close = () => {};
  const body = h('div', { class: 'build-list' }, ...list.map(k => {
    const cost = costAt(k, 1) as Record<string, number>;
    return h('button', {
      class: 'build-item', onClick: async () => {
        try { await api('POST', '/api/city/build', { key: k }); haptic('success'); toast(`${buildingName(k, cu)}: qurilish boshlandi`, 'ok'); close(); await refresh(); }
        catch (e) { haptic('error'); toast((e as Error).message, 'err'); }
      },
    }, buildingIcon(cu, k, 1, 56), h('div', {}, h('b', {}, buildingName(k, cu)), h('small', {}, BUILDING_INFO[k]), costLine(cost, me!.city.resources)));
  }));
  close = modal('Yangi bino', body);
}

export function renderCitySheet(root: HTMLElement, m: Me) {
  const c = m.city;
  const tax = h('input', { type: 'range', min: 0, max: 40, step: 1, value: c.taxPct }) as HTMLInputElement;
  const taxLbl = h('span', {}, `${c.taxPct}%`);
  tax.addEventListener('input', () => { taxLbl.textContent = `${tax.value}%`; });
  tax.addEventListener('change', async () => {
    try { await api('POST', '/api/city/tax', { taxPct: Number(tax.value) }); await refresh(); } catch (e) { toast((e as Error).message, 'err'); }
  });
  const queue = m.queue.length
    ? m.queue.map(q => h('div', { class: 'qrow' }, h('span', {}, `⚒ ${buildingName(q.key, m.kingdom!.culture)} → ${q.target_level}`),
      h('span', { class: 'timer', 'data-until': Date.parse(q.finishes_at) }, ''),
      h('button', { class: 'link', onClick: async () => { await api('POST', '/api/city/cancel', { queueId: q.id }).catch(e => toast(e.message, 'err')); await refresh(); } }, 'bekor')))
    : [h('div', { class: 'muted' }, 'Qurilish navbati bo‘sh. Bo‘sh joyga (+) yoki binoga bosing.')];
  const happyIcon = c.happiness >= 60 ? '😊' : c.happiness >= 30 ? '😐' : '😠';
  mount(root,
    h('div', { class: 'sheet-head' }, h('b', {}, c.name), h('span', { class: 'chip' }, TIER_NAME[c.tier] ?? c.tier), h('span', { class: 'chip' }, `${CULTURES[m.kingdom!.culture].name}`)),
    h('div', { class: 'stats' },
      h('div', {}, h('small', {}, 'Aholi'), h('b', {}, `${fmt(c.population)} / ${fmt(c.populationCap)}`)),
      h('div', {}, h('small', {}, 'Baxt'), h('b', {}, `${happyIcon} ${c.happiness}`)),
      h('div', {}, h('small', {}, 'Ishchilar'), h('b', {}, `${Math.round(c.workerFactor * 100)}%`)),
      h('div', {}, h('small', {}, 'Devor HP'), h('b', {}, fmt(c.wallHp)))),
    h('div', { class: 'tax' }, h('span', {}, 'Soliq'), tax, taxLbl),
    h('div', { class: 'queue' }, ...queue),
    h('div', { class: 'muted small' }, `Qo‘shin xarajati: 🌾 ${c.upkeep.food}/s, 🪙 ${c.upkeep.gold}/s · Joylar ${c.buildings.length}/${c.slots}`));
}
