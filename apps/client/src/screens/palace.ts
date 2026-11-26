// apps/client/src/screens/palace.ts
// Saroy: hukmdor, merosxo'rlar, mehmonlar, agentlar va suiqasd, xizmat shartnomalari (sadoqat bilan).

import { OFFLINE, api } from '../api.js';
import { buildingIcon } from '../art/buildings.js';
import { h, modal, mount, numberInput, toast } from '../dom.js';
import { STATUS_NAME, UNIT_ICON } from '../i18n.js';
import { refresh, type Me } from '../store.js';
import { haptic } from '../telegram.js';

const until = (s: string | null) => s && Date.parse(s) > Date.now() ? h('span', { class: 'timer', 'data-until': Date.parse(s) }, '') : null;

function assassinModal(m: Me, target: any) {
  const agents = m.intrigue.agents.filter((a: any) => a.state === 'tayyor');
  if (!agents.length) { toast('Tayyor agent yo‘q. Elchixona quring va agent yollang.', 'err'); return; }
  const sel = h('select', {}, ...agents.map((a: any) => h('option', { value: a.id }, `${a.name} (mahorat ${a.skill})`))) as HTMLSelectElement;
  let prep = 500;
  modal(`Suiqasd: ${target.ruler_name}`, h('div', {},
    h('p', {}, `${target.name} hukmdori hozir ${target.host_name} saroyida mehmon (${target.city_name}).`),
    h('label', {}, 'Agent', sel),
    h('label', {}, 'Tayyorgarlik oltini (1000 = to‘liq)', numberInput(prep, 0, 5000, v => { prep = v; })),
    h('p', { class: 'warn' }, 'Muvaffaqiyatsiz suiqasd fosh bo‘lishi mumkin: ishonch -60, agent asirga tushadi.')), [{
    label: 'Buyruq berish', kind: 'red', onClick: async () => {
      const r = await api('POST', '/api/intrigue/assassinate', { targetKingdomId: target.id, agentId: sel.value, prepGold: prep });
      haptic(r.success ? 'success' : 'error');
      toast(r.success ? 'Suiqasd muvaffaqiyatli' : r.exposed ? 'Muvaffaqiyatsiz va fosh bo‘ldi!' : 'Muvaffaqiyatsiz, sir saqlandi', r.success ? 'ok' : 'err');
      await refresh();
    },
  }]);
}

export function renderPalace(root: HTMLElement, m: Me) {
  const k = m.kingdom!;
  const away = k.kingCityId !== k.capitalCityId;
  const services = m.services;
  const svcRow = (s: any) => {
    const iAmHost = s.host_kingdom_id === k.id;
    const btns: HTMLElement[] = [];
    if (s.state === 'taklif' && iAmHost) {
      btns.push(h('button', { class: 'btn small gold', onClick: async () => { try { await api('POST', `/api/service/${s.id}/accept`); toast('Qabul qilindi', 'ok'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); } } }, 'Qabul'),
        h('button', { class: 'btn small', onClick: async () => { await api('POST', `/api/service/${s.id}/reject`).catch(e => toast(e.message, 'err')); await refresh(); } }, 'Rad'));
    }
    if (s.state === 'faol') {
      if (iAmHost) btns.push(h('button', { class: 'btn small gold', onClick: async () => { try { const r = await api('POST', `/api/service/${s.id}/generosity`); toast(`Saxiylik: -${r.cost} oltin, +20 sadoqat`, 'ok'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); } } }, 'Saxiylik'));
      btns.push(h('button', { class: 'btn small', onClick: async () => { try { await api('POST', `/api/service/${s.id}/leave`); toast('Shartnoma yopildi', 'ok'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); } } }, iAmHost ? 'Bo‘shatish' : 'Chiqish'));
    }
    return h('div', { class: 'svc' },
      h('div', {}, h('b', {}, iAmHost ? `${s.owner_name} → sizga` : `Siz → ${s.host_name}`), h('span', { class: 'chip' }, STATUS_NAME[s.status]), h('span', { class: `chip ${s.state}` }, s.state)),
      h('small', {}, `${Object.entries(s.units ?? {}).map(([u, n]) => `${UNIT_ICON[u] ?? ''}${n}`).join(' ')} · ${s.pay_per_hour} oltin/s · buyruq ${s.command_level} · G/M ${s.wins}/${s.losses} (jami ${s.total_wins}/${s.total_losses})`),
      s.state === 'faol' ? h('small', {}, ' · tugaydi: ', until(s.ends_at)) : null,
      s.closed_reason ? h('small', { class: 'muted' }, ` · ${s.closed_reason}`) : null,
      h('div', { class: 'actions' }, ...btns));
  };

  mount(root, h('div', { class: 'page palace' },
    h('div', { class: 'palace-hero' }, buildingIcon(k.culture, 'saroy', m.city.buildings.find(b => b.key === 'saroy')?.level ?? 1, 140),
      h('div', {}, h('h2', {}, k.rulerName), h('p', {}, `${k.name} · ${k.generation}-avlod hukmdori`),
        h('p', { class: 'small' }, `Obro‘ ${k.reputation} · Zodagonlar sadoqati ${k.nobleLoyalty}`),
        k.regentUntil ? h('p', { class: 'warn' }, 'Regentlik: ', until(k.regentUntil)) : null,
        k.shieldUntil && Date.parse(k.shieldUntil) > Date.now() ? h('p', { class: 'small' }, '🛡 Himoya qalqoni: ', until(k.shieldUntil)) : null,
        k.traitorUntil && Date.parse(k.traitorUntil) > Date.now() ? h('p', { class: 'warn' }, '“Xoin” tamg‘asi: ', until(k.traitorUntil)) : null,
        away ? h('p', { class: 'warn' }, 'Qirolingiz mehmonda! Mehmon qirolga suiqasd qilish mumkin. ',
          h('button', { class: 'btn small', onClick: async () => { await api('POST', '/api/king/home'); toast('Qirol saroyiga qaytdi', 'ok'); await refresh(); } }, 'Uyga qaytish')) : null)),
    h('section', { class: 'card' }, h('h3', {}, 'Merosxo‘rlar'),
      ...(m.intrigue.heirs.length ? m.intrigue.heirs.map((x: any) => h('div', { class: 'qrow' }, h('span', {}, `${x.order_rank}. ${x.name}`), h('small', {}, `${x.age} yosh${x.age < 16 ? ' (voyaga yetmagan)' : ''}`))) : [h('p', { class: 'warn' }, 'Merosxo‘r yo‘q: qirol o‘lsa taxt inqirozi!')])),
    OFFLINE ? h('section', { class: 'card' }, h('h3', {}, 'Oflayn rejim'), h('p', { class: 'muted' }, 'Xizmat shartnomalari, mehmonlik va suiqasd onlayn (server) rejimida ishlaydi. Hozir bekliklarga hujum qiling va do‘stlar bilan “Jang kodi” orqali urushing.')) : null,
    OFFLINE ? null : h('section', { class: 'card' }, h('h3', {}, 'Xizmat shartnomalari'), ...(services.length ? services.map(svcRow) : [h('p', { class: 'muted' }, 'Hozircha yo‘q. Xaritada boshqa qirolni tanlab, xizmatga kirishingiz mumkin.')])),
    OFFLINE ? null : h('section', { class: 'card' }, h('h3', {}, 'Saroyingizdagi mehmonlar'),
      ...(m.intrigue.guests.length ? m.intrigue.guests.map((g: any) => h('p', {}, `👑 ${g.ruler_name} (${g.name})`)) : [h('p', { class: 'muted' }, 'Mehmon yo‘q')]),
      h('p', { class: 'muted small' }, 'Saroy egasiga o‘z saroyida suiqasd qilib bo‘lmaydi.')),
    OFFLINE ? null : h('section', { class: 'card' }, h('h3', {}, 'Agentlar'),
      ...m.intrigue.agents.map((a: any) => h('div', { class: 'qrow' }, h('span', {}, `🕵 ${a.name}`), h('small', {}, `mahorat ${a.skill} · ${a.state}`))),
      h('button', { class: 'btn small', onClick: async () => { try { await api('POST', '/api/intrigue/agents'); toast('Agent yollandi (400 oltin)', 'ok'); await refresh(); } catch (e) { toast((e as Error).message, 'err'); } } }, '+ Agent yollash (400 🪙)')),
    OFFLINE ? null : h('section', { class: 'card' }, h('h3', {}, 'Mehmonlikdagi qirollar'),
      ...(m.intrigue.visitingKings.length ? m.intrigue.visitingKings.map((v: any) => h('div', { class: 'qrow' }, h('span', {}, `👑 ${v.ruler_name} (${v.name}) → ${v.host_name}`), h('button', { class: 'btn small red', onClick: () => assassinModal(m, v) }, 'Suiqasd'))) : [h('p', { class: 'muted' }, 'Hozir hech kim mehmonlikda emas')]))));
}
