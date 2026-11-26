// apps/client/src/screens/onboarding.ts
// Birinchi kirish: qirollik nomi, poytaxt nomi, millat tanlash (har birining kuchi va zaifligi bilan).

import { CULTURES, type Culture } from '@qirolliklar/game-rules';
import { api } from '../api.js';
import { buildingIcon } from '../art/buildings.js';
import { h, mount, toast } from '../dom.js';
import { CULTURE_BLURB, CULTURE_COLOR, CULTURE_NAME } from '../i18n.js';
import { refresh } from '../store.js';
import { haptic } from '../telegram.js';

export function renderOnboarding(root: HTMLElement) {
  let culture: Culture = 'temuriy';
  const name = h('input', { placeholder: 'Masalan: Turon', maxlength: 32 }) as HTMLInputElement;
  const city = h('input', { placeholder: 'Masalan: Samarqand', maxlength: 40 }) as HTMLInputElement;
  const ruler = h('input', { placeholder: 'Ixtiyoriy', maxlength: 30 }) as HTMLInputElement;
  const cards = h('div', { class: 'culture-grid' });

  const draw = () => mount(cards, ...(Object.keys(CULTURES) as Culture[]).map(c => {
    const d = CULTURES[c];
    return h('button', {
      class: `culture-card${c === culture ? ' active' : ''}`, style: `--cc:${CULTURE_COLOR[c]}`,
      onClick: () => { culture = c; haptic('light'); draw(); },
    },
      buildingIcon(c, 'saroy', 5, 72),
      h('div', { class: 'cc-body' },
        h('b', {}, CULTURE_NAME[c]),
        h('small', {}, CULTURE_BLURB[c]),
        h('ul', {}, ...d.ledger.map(l => h('li', { class: l.points > 0 ? 'plus' : 'minus' }, l.text)))));
  }));
  draw();

  const submit = h('button', {
    class: 'btn gold wide', onClick: async (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
      try {
        await api('POST', '/api/kingdom', { name: name.value.trim(), cityName: city.value.trim(), culture, ...(ruler.value.trim() ? { rulerName: ruler.value.trim() } : {}) });
        haptic('success'); toast('Qirolligingiz tashkil topdi!', 'ok');
        await refresh();
      } catch (err) { haptic('error'); toast((err as Error).message, 'err'); } finally { b.disabled = false; }
    },
  }, 'Taxtga o‘tirish');

  mount(root, h('div', { class: 'onboarding' },
    h('div', { class: 'hero' }, h('h1', {}, 'QIROLLIKLAR'), h('p', {}, 'Imperiyalar Taqdiri')),
    h('label', {}, 'Qirollik nomi', name),
    h('label', {}, 'Poytaxt nomi', city),
    h('label', {}, 'Hukmdor ismi', ruler),
    h('h3', {}, 'Millatingizni tanlang'),
    cards,
    submit));
}
