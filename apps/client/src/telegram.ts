// apps/client/src/telegram.ts
// Telegram Mini Apps SDK (telegram-web-app.js) ustidan yupqa qatlam. Telegramdan tashqarida ham ishlaydi (dev rejim).

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string } };
  ready(): void; expand(): void;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  HapticFeedback?: { impactOccurred(s: 'light' | 'medium' | 'heavy'): void; notificationOccurred(t: 'error' | 'success' | 'warning'): void };
  BackButton?: { show(): void; hide(): void; onClick(f: () => void): void; offClick(f: () => void): void };
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
}

export const tg: TgWebApp | null = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
export const inTelegram = !!tg?.initData;

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
  tg.setHeaderColor?.('#0f2a4a');
  tg.setBackgroundColor?.('#0b1f38');
}

export const haptic = (kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
  const h = tg?.HapticFeedback;
  if (!h) return;
  if (kind === 'success' || kind === 'error') h.notificationOccurred(kind); else h.impactOccurred(kind);
};

let backHandler: (() => void) | null = null;
export function setBack(fn: (() => void) | null) {
  const bb = tg?.BackButton;
  if (!bb) return;
  if (backHandler) bb.offClick(backHandler);
  backHandler = fn;
  if (fn) { bb.onClick(fn); bb.show(); } else bb.hide();
}
