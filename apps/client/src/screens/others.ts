// apps/client/src/screens/others.ts
// Diplomatiya, savdo, qirolliklar, xabarlar, tarix va sozlamalar ekranlari.

import { OFFLINE, api, setToken } from '../api.js';
import { fmt, h, modal, mount, numberInput, toast } from '../dom.js';
import { CULTURE_COLOR, CULTURE_NAME, RES, TERRAIN_NAME, TREATY_NAME, UNIT_ICON, WEATHER_NAME } from '../i18n.js';
import { me, refresh, type Me } from '../store.js';
import { diplomacyModal } from './map.js';
import { openBattle } from '../battle/viewer.js';

const when = (s: string) => new Date(s).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const loading = (root: HTMLElement) => mount(root, h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Yuklanmoqda…')));

export async function renderDiplomacy(root: HTMLElement, m: Me) {
  loading(root);
  const d = await api('GET', '/api/diplomacy');
  const me = m.kingdom!.id;
  const row = (t: any) => {
    const incoming = t.to_kingdom_id === me;
    const other = incoming ? t.from_name : t.to_name;
    const btns: HTMLElement[] = [];
    if (t.state === 'taklif' && incoming) {
      btns.push(h('button', { class: 'btn small gold', onClick: async () => { try { await api('POST', `/api/diplomacy/${t.id}/accept`); toast('Qabul qilindi', 'ok'); void renderDiplomacy(root, m); } catch (e) { toast((e as Error).message, 'err'); } } }, 'Qabul'),
        h('button', { class: 'btn small', onClick: async () => { await api('POST', `/api/diplomacy/${t.id}/reject`).catch(e => toast(e.message, 'err')); void renderDiplomacy(root, m); } }, 'Rad'));
    }
    if (t.state === 'faol' && !['tinchlik', 'urush'].includes(t.type)) {
      btns.push(h('button', { class: 'btn small red', onClick: () => modal('Shartnomani buzish', h('p', {}, 'Ishonch keskin tushadi, ittifoq buzilsa 7 kun “Xoin” tamg‘asi.'), [{ label: 'Buzish', kind: 'red', onClick: async () => { await api('POST', `/api/diplomacy/${t.id}/break`); void renderDiplomacy(root, m); } }]) }, 'Buzish'));
    }
    return h('div', { class: 'svc' }, h('div', {}, h('b', {}, `${TREATY_NAME[t.type] ?? t.type} · ${other}`), h('span', { class: `chip ${t.state}` }, t.state)),
      h('small', { class: 'muted' }, t.ends_at ? `tugaydi ${when(t.ends_at)}` : `${t.duration_hours} soat`), h('div', { class: 'actions' }, ...btns));
  };
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Diplomatiya'),
    h('section', { class: 'card' }, h('h3', {}, 'Shartnomalar'), ...(d.treaties.length ? d.treaties.map(row) : [h('p', { class: 'muted' }, 'Hozircha shartnoma yo‘q. “Qirolliklar” bo‘limidan taklif yuboring.')])),
    h('section', { class: 'card' }, h('h3', {}, 'Ishonch'), ...(d.trust.length ? d.trust.map((t: any) => h('div', { class: 'qrow' }, h('span', {}, t.name), h('div', { class: 'trust' }, h('i', { style: `width:${Math.abs(t.value) / 2}%;${t.value < 0 ? 'right:50%;background:#c0392b' : 'left:50%'}` })), h('small', {}, String(t.value)))) : [h('p', { class: 'muted' }, 'Hali munosabat yo‘q')]))));
}

export async function renderTrade(root: HTMLElement, m: Me) {
  loading(root);
  const d = await api('GET', '/api/market');
  const rows = Object.entries(d.prices as Record<string, number>).map(([r, p]) => {
    let amount = 100;
    const go = (side: 'buy' | 'sell') => async () => {
      try { const x = await api('POST', '/api/market/trade', { resource: r, side, amount }); toast(`${side === 'buy' ? 'Sotib olindi' : 'Sotildi'}: ${amount} × ${x.unitPrice.toFixed(2)} (yig‘im ${x.fee})`, 'ok'); await refresh(); void renderTrade(root, m); }
      catch (e) { toast((e as Error).message, 'err'); }
    };
    return h('div', { class: 'trade-row' }, h('span', {}, `${RES[r as keyof typeof RES].icon} ${RES[r as keyof typeof RES].name}`), h('b', {}, `${p.toFixed(2)} 🪙`),
      numberInput(amount, 1, 5000, v => { amount = v; }), h('button', { class: 'btn small gold', onClick: go('buy') }, 'Olish'), h('button', { class: 'btn small', onClick: go('sell') }, 'Sotish'));
  });
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Savdo'),
    h('section', { class: 'card' }, h('h3', {}, `Mintaqa bozori (${CULTURE_NAME[m.kingdom!.culture]})`), h('p', { class: 'muted small' }, 'Narx talabga qarab o‘zgaradi. Yig‘im 5% (savdo shartnomasi bilan 2%).'), ...rows),
    h('section', { class: 'card' }, h('h3', {}, 'Oxirgi bitimlar'), ...(d.history.length ? d.history.map((t: any) => h('div', { class: 'qrow' }, h('span', {}, `${t.side === 'buy' ? '⬇' : '⬆'} ${RES[t.resource as keyof typeof RES].icon} ${t.amount}`), h('small', {}, `${Number(t.unit_price).toFixed(2)} · ${when(t.created_at)}`))) : [h('p', { class: 'muted' }, 'Bitimlar yo‘q')]))));
}

export async function renderKingdoms(root: HTMLElement, m: Me, onShow: (x: number, y: number) => void) {
  const q = h('input', { placeholder: 'Qidirish…' }) as HTMLInputElement;
  const list = h('div', {});
  const load = async () => {
    const ks = await api('GET', `/api/kingdoms?q=${encodeURIComponent(q.value)}`);
    mount(list, ...ks.map((k: any, i: number) => h('div', { class: 'k-row', style: `--cc:${CULTURE_COLOR[k.culture as keyof typeof CULTURE_COLOR]}` },
      h('span', { class: 'rank' }, String(i + 1)), h('div', {}, h('b', {}, k.name), h('small', {}, ` ${CULTURE_NAME[k.culture as keyof typeof CULTURE_NAME]} · ${k.ruler_name} · aholi ${fmt(k.population)} · saroy ${k.palace}`)),
      h('div', { class: 'actions' }, h('button', { class: 'btn small', onClick: () => onShow(k.x, k.y) }, '🗺'), k.id !== m.kingdom!.id ? h('button', { class: 'btn small', onClick: () => diplomacyModal(k.id, k.name) }, '📜') : null))));
  };
  q.addEventListener('change', () => void load());
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Qirolliklar'), q, list));
  await load();
}

export async function renderMessages(root: HTMLElement) {
  loading(root);
  const ns = await api('GET', '/api/notifications');
  await api('POST', '/api/notifications/read').catch(() => {});
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Xabarlar'), ...(ns.length ? ns.map((n: any) => h('div', { class: `msg${n.read_at ? '' : ' unread'}` },
    h('div', {}, h('b', {}, n.title), h('small', { class: 'muted' }, ` ${when(n.created_at)}`)), n.body ? h('p', {}, n.body) : null)) : [h('p', { class: 'muted' }, 'Xabar yo‘q')])));
}

export async function renderHistory(root: HTMLElement, m: Me) {
  loading(root);
  const bs = await api('GET', '/api/battles');
  const me = m.kingdom!.id;
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Jang tarixi'), ...(bs.length ? bs.map((b: any) => {
    const iAttacked = b.attacker_kingdom_id === me;
    const won = (b.winner === 'attacker') === iAttacked;
    const side = (s: string) => (b.records ?? []).filter((r: any) => r.side === s).map((r: any) => `${UNIT_ICON[r.unit] ?? ''}${r.before}→${r.before - r.lost}`).join(' ');
    return h('details', { class: `battle ${won ? 'won' : 'lost'}` },
      h('summary', {}, h('b', {}, `${won ? '🏆' : '💀'} ${b.attacker_name} → ${b.city_name ?? b.defender_name}`), h('small', { class: 'muted' }, ` ${when(b.occurred_at)}`)),
      h('button', { class: 'btn small gold', onClick: () => openBattle(b, { mySide: iAttacked ? 'attacker' : 'defender' }) }, '▶ Jangni ko‘rish'),
      h('p', { class: 'small' }, `Nisbat ${Number(b.ratio).toFixed(2)} · ${TERRAIN_NAME[b.terrain] ?? b.terrain} · ${WEATHER_NAME[b.weather] ?? b.weather} · devor ${b.wall_hp_before}→${b.wall_hp_after}`),
      h('p', { class: 'small' }, `Hujumchi: ${side('attacker') || '—'}`), h('p', { class: 'small' }, `Himoyachi: ${side('defender') || '—'}`),
      Object.keys(b.loot ?? {}).length ? h('p', { class: 'small' }, `O‘lja: ${Object.entries(b.loot).map(([k, v]) => `${RES[k as keyof typeof RES]?.icon ?? k}${fmt(v as number)}`).join(' ')}`) : null);
  }) : [h('p', { class: 'muted' }, 'Hali jang bo‘lmagan')])));
}

export function renderSettings(root: HTMLElement, m: Me) {
  const offline = OFFLINE ? h('section', { class: 'card' }, h('h3', {}, 'Oflayn rejim'),
    h('p', { class: 'small' }, 'O‘yin tezligi (vaqt necha barobar tez o‘tadi):'),
    h('div', { class: 'actions' }, ...[1, 5, 10, 30, 60].map(v => h('button', {
      class: `btn small${m.gameSpeed === v ? ' gold' : ''}`, onClick: async () => { await api('POST', '/api/offline/speed', { speed: v }); toast(`Tezlik x${v}`, 'ok'); await refresh(); renderSettings(root, me ?? m); },
    }, `x${v}`))),
    h('p', { class: 'muted small' }, 'Progress telefoningizda va Telegram bulutida saqlanadi.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn small', onClick: async () => {
        const { exportState } = await import('../offline/engine.js');
        try { await navigator.clipboard.writeText(exportState()); toast('Zaxira nusxa nusxalandi', 'ok'); } catch { toast('Nusxalab bo‘lmadi', 'err'); }
      } }, '💾 Zaxira nusxa'),
      h('button', { class: 'btn small', onClick: () => {
        const ta = h('textarea', { rows: 5, placeholder: 'Zaxira nusxani qo‘ying' }) as HTMLTextAreaElement;
        modal('Zaxiradan tiklash', ta, [{ label: 'Tiklash', kind: 'gold', onClick: async () => {
          JSON.parse(ta.value);
          localStorage.setItem('qrl_offline_v1', ta.value); location.reload();
        } }]);
      } }, '♻ Tiklash'),
      h('button', { class: 'btn small red', onClick: () => modal('O‘yinni qaytadan boshlash', h('p', {}, 'Butun progress o‘chadi. Ishonchingiz komilmi?'), [{
        label: 'Ha, o‘chirish', kind: 'red', onClick: async () => { await api('POST', '/api/offline/reset'); location.reload(); },
      }]) }, '🗑 Qaytadan boshlash'))) : null;
  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Sozlamalar'),
    h('section', { class: 'card' }, h('p', {}, `Qirollik: ${m.kingdom?.name}`), h('p', {}, `Millat: ${m.kingdom ? CULTURE_NAME[m.kingdom.culture] : ''}`), h('p', {}, `O‘yin tezligi: x${m.gameSpeed}`), h('p', { class: 'muted small' }, `${OFFLINE ? 'Vaqt' : 'Server vaqti'}: ${when(m.serverTime)}`)),
    offline,
    h('section', { class: 'card' }, h('h3', {}, 'Qoidalar qisqacha'),
      h('ul', { class: 'small' },
        h('li', {}, 'Binolar saroy darajasidan baland bo‘lmaydi. Saroyni ko‘tarish uchun ombor kerak.'),
        h('li', {}, 'Nayzachi otliqni, otliq kamonchini, kamonchi piyodani, piyoda nayzachini yengadi.'),
        h('li', {}, 'Oziq tugasa aholi kamayadi va qo‘shin kuchi 30% ga tushadi.'),
        h('li', {}, OFFLINE ? 'Do‘stlar bilan “Jang kodi” orqali urushing: jang natijasi ikkala telefonda bir xil chiqadi.' : 'Qo‘shin egaligi hech qachon o‘zgarmaydi. Xizmat shartnomasi faqat buyruq huquqini beradi.'))),
    OFFLINE ? null : h('button', { class: 'btn', onClick: () => { setToken(null); location.reload(); } }, 'Chiqish (sessiyani tozalash)')));
}
