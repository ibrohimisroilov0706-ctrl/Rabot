// apps/client/src/dom.ts
// Kichik DOM yordamchilari: framework yo'q, shuning uchun Telegram WebView'da tez yuklanadi.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function mount(target: HTMLElement, ...nodes: Child[]) {
  target.replaceChildren(...nodes.filter((n): n is Node | string => n !== null && n !== undefined && n !== false).map(n => (typeof n === 'number' ? String(n) : n)));
}

export function toast(text: string, kind: 'info' | 'ok' | 'err' = 'info', action?: { label: string; onClick: () => void }) {
  const el = h('div', { class: `toast ${kind}` }, text,
    action ? h('button', { class: 't-act', onClick: () => { el.remove(); action.onClick(); } }, action.label) : null);
  $('#toasts').append(el);
  const life = action ? 6500 : 3200;
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 500);
}

export function modal(title: string, body: Node, actions: { label: string; kind?: string; onClick: () => void | Promise<void> }[] = []) {
  const root = $('#modal');
  const close = () => { root.classList.add('hidden'); root.replaceChildren(); };
  const box = h('div', { class: 'modal-box' },
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Yopish', onClick: close }, '✕')),
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-actions' }, ...actions.map(a => h('button', {
      class: `btn ${a.kind ?? ''}`, onClick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
        try { await a.onClick(); close(); } catch (err) { toast((err as Error).message, 'err'); } finally { b.disabled = false; }
      },
    }, a.label))));
  root.replaceChildren(h('div', { class: 'modal-bg', onClick: close }), box);
  root.classList.remove('hidden');
  return close;
}

export const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'k';
  return Math.floor(n).toLocaleString('uz-UZ').replace(/,/g, ' ');
};

export function dur(ms: number): string {
  if (ms <= 0) return 'tayyor';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d) return `${d}k ${hh}s`;
  if (hh) return `${hh}s ${mm}d`;
  if (mm) return `${mm}d ${ss}s`;
  return `${ss}s`;
}

/** data-until atributli elementlarni har soniyada yangilaydi */
export function startCountdowns(onDone: () => void) {
  setInterval(() => {
    let done = false;
    document.querySelectorAll<HTMLElement>('[data-until]').forEach(el => {
      const left = Number(el.dataset.until) - Date.now();
      el.textContent = dur(left);
      if (left <= 0 && !el.dataset.fired) { el.dataset.fired = '1'; done = true; }
    });
    if (done) setTimeout(onDone, 1500);
  }, 1000);
}

export function numberInput(value: number, min: number, max: number, onChange?: (v: number) => void) {
  const inp = h('input', { type: 'number', inputmode: 'numeric', min, max, value, class: 'num' }) as HTMLInputElement;
  inp.addEventListener('input', () => onChange?.(Math.max(min, Math.min(max, Math.floor(Number(inp.value) || 0)))));
  return inp;
}
