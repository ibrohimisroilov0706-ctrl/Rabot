// apps/client/src/screens/duel.ts
// "Jang kodi" ekrani (oflayn rejim): chaqiruv yaratish, qabul qilish, natijani kiritish.

import { api } from '../api.js';
import { h, mount, toast } from '../dom.js';
import { refresh, type Me } from '../store.js';
import { haptic, tg } from '../telegram.js';
import { unitPicker } from './map.js';
import { openBattle } from '../battle/viewer.js';

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast('Nusxalandi', 'ok'); }
  catch { toast('Nusxalab bo‘lmadi, matnni qo‘lda belgilang', 'err'); }
}
function share(text: string) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`;
  const t = tg as unknown as { openTelegramLink?: (u: string) => void } | null;
  if (t?.openTelegramLink) t.openTelegramLink(url); else window.open(url, '_blank');
}
const codeBox = (code: string, title: string, msg: string) => h('div', { class: 'codebox' },
  h('b', {}, title), h('textarea', { readonly: true, rows: 4 }, code),
  h('div', { class: 'actions' },
    h('button', { class: 'btn small gold', onClick: () => share(`${msg}\n\n${code}`) }, '📤 Telegramda yuborish'),
    h('button', { class: 'btn small', onClick: () => void copy(code) }, '📋 Nusxalash')));

export function renderDuel(root: HTMLElement, m: Me) {
  const garrison = m.armies.find((a: any) => a.kind === 'garrison')?.units ?? {};
  const out = h('div', {});

  // 1) Chaqiruv
  const pick1 = unitPicker(garrison, 0);
  const challenge = h('section', { class: 'card' }, h('h3', {}, '1. Chaqiruv yuborish'),
    h('p', { class: 'muted small' }, 'Qo‘shiningizdan surat olinadi va kodga aylanadi. Do‘stingiz shu qo‘shinga hujum qiladi. Askarlar garnizonda qoladi.'),
    pick1.el,
    h('button', { class: 'btn gold', onClick: async () => {
      try {
        const r = await api('POST', '/api/duel/challenge', { units: pick1.chosen });
        haptic('success');
        mount(out, codeBox(r.code, 'Chaqiruv kodingiz', `⚔️ ${m.kingdom!.name} sizni jangga chaqiradi! QIROLLIKLAR o‘yinida “Jang kodi” → “Chaqiruvni qabul qilish” ga shu kodni qo‘ying:`));
      } catch (e) { toast((e as Error).message, 'err'); }
    } }, 'Kod yaratish'));

  // 2) Qabul qilish
  const inCode = h('textarea', { rows: 3, placeholder: 'QRL1.… kodini shu yerga qo‘ying' }) as HTMLTextAreaElement;
  const pick2 = unitPicker(garrison, 0);
  const accept = h('section', { class: 'card' }, h('h3', {}, '2. Chaqiruvni qabul qilish'),
    inCode, h('p', { class: 'muted small' }, 'Hujumga yuboriladigan askarlar:'), pick2.el,
    h('button', { class: 'btn red', onClick: async () => {
      try {
        const r = await api('POST', '/api/duel/accept', { code: inCode.value, units: pick2.chosen });
        haptic(r.won ? 'success' : 'error');
        toast(r.won ? `G‘alaba! Mukofot ${r.reward} oltin` : 'Mag‘lubiyat', r.won ? 'ok' : 'err');
        await refresh();
        if (r.battle) openBattle(r.battle, { mySide: 'attacker' });
        mount(out, h('div', { class: 'card' }, h('p', {}, `${r.won ? '🏆 G‘alaba' : '💀 Mag‘lubiyat'} — ${r.enemy.name}. Siz ${r.myLost}, raqib ${r.enemyLost} askar yo‘qotdi.`)),
          codeBox(r.resultCode, 'Natija kodi (raqibga yuboring)', `QIROLLIKLAR duel natijasi. “Jang kodi” → “Natijani kiritish” ga qo‘ying:`));
      } catch (e) { toast((e as Error).message, 'err'); }
    } }, '⚔ Hujum qilish'));

  // 3) Natija
  const resCode = h('textarea', { rows: 3, placeholder: 'Do‘stingiz qaytargan natija kodi' }) as HTMLTextAreaElement;
  const result = h('section', { class: 'card' }, h('h3', {}, '3. Natijani kiritish'),
    h('p', { class: 'muted small' }, 'Jang telefoningizda aynan qayta hisoblanadi, natijani soxtalashtirib bo‘lmaydi.'), resCode,
    h('button', { class: 'btn', onClick: async () => {
      try {
        const r = await api('POST', '/api/duel/result', { code: resCode.value });
        haptic(r.won ? 'success' : 'error');
        toast(r.won ? `Hujum qaytarildi! +${r.reward} oltin` : `${r.enemy.name} yutdi`, r.won ? 'ok' : 'err');
        await refresh();
        if (r.battle) openBattle(r.battle, { mySide: 'defender' });
        mount(out, h('div', { class: 'card' }, h('p', {}, `${r.won ? '🛡 Himoya muvaffaqiyatli' : '💀 Mag‘lubiyat'} — ${r.enemy.name}. Siz ${r.myLost}, raqib ${r.enemyLost} askar yo‘qotdi.`)));
      } catch (e) { toast((e as Error).message, 'err'); }
    } }, 'Natijani qo‘llash'));

  mount(root, h('div', { class: 'page' }, h('h2', {}, 'Jang kodi'),
    h('p', { class: 'muted' }, 'Do‘stlaringiz bilan serversiz urushing: kod yarating → Telegramda yuboring → u hujum qiladi → natija kodini sizga qaytaradi.'),
    out, challenge, accept, result));
}
