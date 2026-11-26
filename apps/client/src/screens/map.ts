// apps/client/src/screens/map.ts
// Xaritada tanlangan shahar uchun pastki varaq: hujum, mehmon bo'lish, xizmat taklifi, diplomatiya.

import { terrainAt, unitDef } from '@qirolliklar/game-rules';
import { api } from '../api.js';
import { fmt, h, modal, mount, numberInput, toast } from '../dom.js';
import { CULTURE_NAME, STATUS_NAME, TERRAIN_NAME, TREATY_NAME, UNIT_ICON } from '../i18n.js';
import type { WorldCity } from '../scenes/WorldScene.js';
import { me, refresh } from '../store.js';
import { haptic } from '../telegram.js';

const garrisonUnits = (): Record<string, number> => me?.armies.find((a: any) => a.kind === 'garrison')?.units ?? {};

export function unitPicker(max: Record<string, number>, init = 0) {
  const chosen: Record<string, number> = {};
  const rows = Object.entries(max).filter(([, n]) => n > 0).map(([k, n]) => {
    chosen[k] = Math.min(n, init);
    return h('div', { class: 'unit-pick' },
      h('span', {}, `${UNIT_ICON[k] ?? '•'} ${unitDef(k).name}`), h('small', { class: 'muted' }, `/${n}`),
      numberInput(chosen[k]!, 0, n, v => { chosen[k] = v; }));
  });
  return { el: h('div', { class: 'unit-picker' }, ...(rows.length ? rows : [h('p', { class: 'muted' }, 'Garnizonda askar yo‘q')])), chosen };
}

function attackModal(c: WorldCity) {
  const servingMine = (me?.armies ?? []).filter((a: any) => a.serving_kingdom_id === me?.kingdom?.id && a.status === 'stationed');
  const pick = unitPicker(garrisonUnits(), 0);
  const cmd = h('select', {}, h('option', { value: '' }, 'Generalsiz'), ...(me?.commanders ?? []).map(g => h('option', { value: g.id }, `${g.name} (mahorat ${g.skill})`))) as HTMLSelectElement;
  const body = h('div', {}, h('p', {}, `Nishon: ${c.name} (${c.kingdom_name}), terren: ${TERRAIN_NAME[terrainAt(c.x, c.y)]}`), h('h4', {}, 'O‘z garnizoningizdan'), pick.el, h('label', {}, 'General', cmd));
  const actions = [{
    label: 'Hujum!', kind: 'red', onClick: async () => {
      const units = Object.fromEntries(Object.entries(pick.chosen).filter(([, n]) => n > 0));
      const r = await api('POST', '/api/army/march', { targetCityId: c.id, units, ...(cmd.value ? { commanderId: cmd.value } : {}) });
      haptic('heavy'); toast(`Qo‘shin yo‘lga chiqdi. Yetib borish: ${new Date(r.arriveAt).toLocaleTimeString()}`, 'ok'); await refresh();
    },
  }];
  if (servingMine.length) {
    body.append(h('h4', {}, 'Xizmatdagi qo‘shinlar (shartnoma bo‘yicha)'), ...servingMine.map((a: any) => h('button', {
      class: 'btn', onClick: async () => {
        try { await api('POST', '/api/army/march', { targetCityId: c.id, armyId: a.id }); toast('Buyruq berildi', 'ok'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); }
      },
    }, `${a.owner_name}: ${Object.entries(a.units).map(([k, n]) => `${UNIT_ICON[k] ?? ''}${n}`).join(' ')}`)));
  }
  modal('Hujum', body, actions);
}

function serviceModal(c: WorldCity) {
  const pick = unitPicker(garrisonUnits(), 0);
  const status = h('select', {}, ...Object.entries(STATUS_NAME).map(([k, v]) => h('option', { value: k }, v))) as HTMLSelectElement;
  let pay = 10, hours = 72, level = 1, tribute = 10;
  const body = h('div', {},
    h('p', { class: 'muted' }, 'Qo‘shin egaligi sizda qoladi. Shartnoma faqat buyruq huquqini beradi.'),
    h('label', {}, 'Maqom', status), pick.el,
    h('label', {}, 'Maosh (oltin/soat, yollanma)', numberInput(pay, 0, 100000, v => { pay = v; })),
    h('label', {}, 'Muddat (soat)', numberInput(hours, 1, 720, v => { hours = v; })),
    h('label', {}, 'Buyruq darajasi (0 mudofaa, 1 hujum, 2 to‘liq)', numberInput(level, 0, 2, v => { level = v; })),
    h('label', {}, 'O‘lpon % (vassal, 5-30)', numberInput(tribute, 5, 30, v => { tribute = v; })));
  modal(`${c.kingdom_name} xizmatiga kirish`, body, [{
    label: 'Taklif yuborish', kind: 'gold', onClick: async () => {
      const units = Object.fromEntries(Object.entries(pick.chosen).filter(([, n]) => n > 0));
      await api('POST', '/api/service/offer', { hostKingdomId: c.kingdom_id, status: status.value, units, payPerHour: pay, hours, commandLevel: level, tributePct: status.value === 'vassal' ? tribute : 0 });
      toast('Taklif yuborildi', 'ok'); await refresh();
    },
  }]);
}

export function diplomacyModal(kingdomId: string, kingdomName: string) {
  const type = h('select', {}, ...Object.entries(TREATY_NAME).map(([k, v]) => h('option', { value: k }, v))) as HTMLSelectElement;
  let hours = 168;
  modal(`${kingdomName}: diplomatiya`, h('div', {},
    h('label', {}, 'Shartnoma turi', type),
    h('label', {}, 'Muddat (soat). Ittifoq/savdo 168+, tinchlik 72+, nikoh 2160', numberInput(hours, 1, 2160, v => { hours = v; })),
    h('p', { class: 'muted' }, 'Urush e’loni 12 soatdan keyin kuchga kiradi. Tinchlikni buzib bo‘lmaydi.')), [{
    label: 'Yuborish', kind: 'gold', onClick: async () => {
      await api('POST', '/api/diplomacy/propose', { toKingdomId: kingdomId, type: type.value, hours: type.value === 'nikoh' ? 2160 : hours });
      toast('Yuborildi', 'ok');
    },
  }]);
}

export async function renderCityCard(root: HTMLElement, c: WorldCity | null) {
  if (!c) { root.classList.add('hidden'); return; }
  root.classList.remove('hidden');
  const mine = c.kingdom_id === me?.kingdom?.id;
  mount(root, h('div', { class: 'sheet-head' }, h('b', {}, c.name), h('span', { class: 'chip' }, CULTURE_NAME[c.culture]), c.shielded ? h('span', { class: 'chip blue' }, '🛡 qalqon') : null),
    h('p', {}, `${c.kingdom_name} · hukmdor ${c.ruler_name} · aholi ${fmt(c.population)} · saroy ${c.palace}`), h('p', { class: 'muted small' }, `(${c.x}, ${c.y}) · ${TERRAIN_NAME[terrainAt(c.x, c.y)]}`),
    mine ? h('p', { class: 'muted' }, 'Bu sizning poytaxtingiz.') : h('div', { class: 'actions' },
      h('button', { class: 'btn red', onClick: () => attackModal(c) }, '⚔ Hujum'),
      h('button', { class: 'btn', onClick: async () => { try { await api('POST', '/api/king/visit', { cityId: c.id }); toast('Qirolingiz mehmonga ketdi. Ehtiyot bo‘ling: mehmon qirolga suiqasd qilish mumkin!', 'info'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); } } }, '🏰 Mehmon bo‘lish'),
      h('button', { class: 'btn', onClick: () => serviceModal(c) }, '🤝 Xizmatga kirish'),
      h('button', { class: 'btn', onClick: () => diplomacyModal(c.kingdom_id, c.kingdom_name) }, '📜 Diplomatiya')));
  if (!mine) {
    try { const k = await api('GET', `/api/kingdoms/${c.kingdom_id}`); if (k.trust !== null) root.querySelector('.muted.small')?.append(` · ishonch ${k.trust}`); } catch { /* */ }
  }
}
