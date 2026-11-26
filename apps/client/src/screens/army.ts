// apps/client/src/screens/army.ts
// Armiya: garnizon, yollash, yo'ldagi qo'shinlar, xizmatdagi qo'shinlar, generallar.

import { BASE_UNITS, CULTURES, SPECIAL_UNITS, unitDef, type Culture } from '@qirolliklar/game-rules';
import { api } from '../api.js';
import { dur, fmt, h, mount, numberInput, toast } from '../dom.js';
import { UNIT_ICON } from '../i18n.js';
import { refresh, type Me } from '../store.js';
import { haptic } from '../telegram.js';
import { costLine } from './city.js';

const REQ: Record<string, string> = { piyoda: 'kazarma', kamonchi: 'kazarma', nayzachi: 'kazarma', otliq: 'otxona', ogir_otliq: 'otxona', qamal: 'ustaxona' };

function unitCostFor(key: string, c: Culture, n: number) {
  const u = unitDef(key); const mult = 1 + (CULTURES[c].bonuses.unitCost[u.cls] ?? 0);
  return Object.fromEntries(Object.entries(u.cost).map(([k, v]) => [k, Math.ceil(v * mult * n)]));
}

const unitsLine = (u: Record<string, number>) => Object.entries(u).map(([k, n]) => `${UNIT_ICON[k] ?? '•'}${fmt(n)}`).join('  ') || '—';

export function renderArmy(root: HTMLElement, m: Me) {
  const cu = m.kingdom!.culture;
  const garrison = m.armies.find((a: any) => a.kind === 'garrison');
  const field = m.armies.filter((a: any) => a.kind === 'field');
  const keys = [...Object.keys(BASE_UNITS), ...SPECIAL_UNITS.filter(u => u.culture === cu).map(u => u.key)];
  let count = 10;
  const recruitCards = keys.map(k => {
    const u = unitDef(k);
    const special = !!u.culture;
    const req = k === 'jangovar_fil' ? 'kazarma' : REQ[u.cls]!;
    const L = m.city.buildings.find(b => b.key === req)?.level ?? 0;
    const need = special ? 3 : u.cls === 'ogir_otliq' ? 2 : 1;
    const locked = L < need;
    const cost = h('div', {}, costLine(unitCostFor(k, cu, 1), m.city.resources));
    return h('div', { class: `unit-card${special ? ' special' : ''}${locked ? ' locked' : ''}` },
      h('div', { class: 'uc-head' }, h('b', {}, `${UNIT_ICON[k] ?? ''} ${u.name}`), special ? h('span', { class: 'chip gold' }, 'maxsus') : null),
      h('small', {}, `⚔ ${u.attack} 🛡 ${u.defense}${u.siege ? ` 🧱 ${u.siege}` : ''} · 🏃 ${u.speed} · 🌾${u.foodPerHour} 🪙${u.goldPerHour}/s`),
      u.special ? h('small', { class: 'muted' }, u.special) : null,
      cost,
      locked ? h('small', { class: 'warn' }, `${req} ${need}-daraja kerak`) : h('button', {
        class: 'btn small', onClick: async () => {
          try { const r = await api('POST', '/api/army/recruit', { unitKey: k, count }); haptic('success'); toast(`${count} ta ${u.name} yollanmoqda (${dur(Date.parse(r.readyAt) - Date.now())})`, 'ok'); await refresh(); }
          catch (e) { haptic('error'); toast((e as Error).message, 'err'); }
        },
      }, 'Yollash'));
  });

  const statusTxt = (a: any) => a.status === 'marching' ? (a.mission === 'attack' ? '⚔ hujumga ketmoqda' : '➡ yo‘lda') : a.status === 'returning' ? '↩ qaytmoqda' : a.status === 'stationed' ? '⛺ joylashgan' : '🏠 uyda';
  mount(root, h('div', { class: 'page' },
    h('h2', {}, 'Armiya'),
    h('section', { class: 'card' }, h('h3', {}, 'Garnizon (poytaxt)'), h('p', { class: 'units' }, unitsLine(garrison?.units ?? {})), h('small', { class: 'muted' }, `Tajriba: ${garrison?.xp ?? 0}`)),
    m.recruits.length ? h('section', { class: 'card' }, h('h3', {}, 'Yollanmoqda'), ...m.recruits.map(r => h('div', { class: 'qrow' }, h('span', {}, `${UNIT_ICON[r.unit_key] ?? ''} ${r.count} × ${unitDef(r.unit_key).name}`), h('span', { class: 'timer', 'data-until': Date.parse(r.due_at) }, '')))) : null,
    field.length ? h('section', { class: 'card' }, h('h3', {}, 'Dala qo‘shinlari'), ...field.map((a: any) => h('div', { class: 'army-row' },
      h('div', {}, h('b', {}, a.owner_kingdom_id === m.kingdom!.id ? (a.serving_name ? `Xizmatda: ${a.serving_name}` : 'O‘z qo‘shiningiz') : `${a.owner_name} (sizga xizmat qilmoqda)`), h('small', {}, ` ${statusTxt(a)}`)),
      h('div', { class: 'units' }, unitsLine(a.units)),
      a.arrive_at ? h('small', { class: 'timer', 'data-until': Date.parse(a.arrive_at) }, '') : null))) : null,
    h('section', { class: 'card' }, h('h3', {}, 'Yollash'), h('label', { class: 'inline' }, 'Soni: ', numberInput(count, 1, 500, v => { count = v; })), h('div', { class: 'unit-grid' }, ...recruitCards)),
    h('section', { class: 'card' }, h('h3', {}, 'Generallar'), ...m.commanders.map(g => h('div', { class: 'qrow' }, h('span', {}, `🎖 ${g.name}`), h('small', {}, `mahorat ${g.skill} · obro‘ ${g.prestige} · ${g.wins}G/${g.losses}M`)))),
    h('p', { class: 'muted small' }, 'Hujum qilish uchun xaritada dushman shahrini tanlang.')));
}
