// apps/client/src/scenes/CityScene.ts
// Shahar: izometrik maydon, 30 ta bino joyi. Har bino millat uslubida protsedurali chiziladi (art/buildings.ts).

import Phaser from 'phaser';
import type { BuildingKey, Culture } from '@qirolliklar/game-rules';
import { PALETTE, TEX_H, TEX_W, drawBuilding } from '../art/buildings.js';

export interface CityBuilding { id: string; key: BuildingKey; level: number; slot: number }

const TW = 120, TH = 60; // izometrik katak
const COLS = 6;
const hex = (s: string) => parseInt(s.slice(1), 16);

/** Joy raqami -> izometrik koordinata (saroy o'rtada bo'lishi uchun spiral emas, oddiy panjara) */
export function slotPos(slot: number): { x: number; y: number } {
  const col = slot % COLS, row = Math.floor(slot / COLS);
  return { x: (col - row) * (TW / 2), y: (col + row) * (TH / 2) };
}

export class CityScene extends Phaser.Scene {
  onBuilding: (b: CityBuilding) => void = () => {};
  onEmpty: (slot: number) => void = () => {};
  private culture: Culture = 'temuriy';
  private buildings: CityBuilding[] = [];
  private slots = 12;
  private queue = new Set<string>();
  private root!: Phaser.GameObjects.Container;
  private dragging = false;

  constructor() { super('city'); }

  create() {
    this.root = this.add.container(0, 0);
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0b1f38');
    // Boshlang'ich binolar 0-7 joylarda (yuqori qator): ularni ko'rinadigan qismga, pastki varaq ustiga joylaymiz
    // Boshlang'ich binolar (0-11 joylar) ~ x: -60..300, y: -100..210 (saroy tepasi bilan). Ular ekranga sig'sin va
    // pastki varaq (ekranning ~30%) ustida tursin: markazni 116px yuqoriga suramiz.
    const fit = Math.min(1.3, Math.max(0.8, this.scale.width / 400));
    cam.setZoom(fit);
    cam.centerOn(120, 55 + 116 / fit);
    this.input.on('pointerdown', () => { this.dragging = false; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const dx = p.x - p.prevPosition.x, dy = p.y - p.prevPosition.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.dragging = true;
      cam.scrollX -= dx / cam.zoom; cam.scrollY -= dy / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.4, 2)));
    this.redraw();
  }

  setCity(culture: Culture, buildings: CityBuilding[], slots: number, queueBuildingIds: string[]) {
    this.culture = culture; this.buildings = buildings; this.slots = slots; this.queue = new Set(queueBuildingIds);
    if (this.root) this.redraw();
  }

  private texKey(b: CityBuilding) { return `b-${this.culture}-${b.key}-${b.level}`; }

  private redraw() {
    this.root.removeAll(true);
    const p = PALETTE[this.culture];
    // maydon (girih chegarali)
    const g = this.add.graphics();
    for (let s = 0; s < 30; s++) {
      const { x, y } = slotPos(s);
      const open = s < this.slots;
      g.fillStyle(open ? hex(p.ground) : 0x2a3b52, open ? 1 : 0.6);
      g.beginPath(); g.moveTo(x, y - TH / 2); g.lineTo(x + TW / 2, y); g.lineTo(x, y + TH / 2); g.lineTo(x - TW / 2, y); g.closePath(); g.fillPath();
      g.lineStyle(1, open ? hex(p.tile) : 0x1b2a3d, 0.5); g.strokePath();
    }
    this.root.add(g);
    // binolar: orqadagidan oldingiga (y bo'yicha saralash)
    const bySlot = new Map(this.buildings.map(b => [b.slot, b]));
    const order = [...Array(30).keys()].sort((a, b) => slotPos(a).y - slotPos(b).y);
    for (const s of order) {
      const { x, y } = slotPos(s);
      const b = bySlot.get(s);
      if (b) {
        const key = this.texKey(b);
        if (!this.textures.exists(key)) this.textures.addCanvas(key, drawBuilding(document.createElement('canvas'), this.culture, b.key, b.level));
        const img = this.add.image(x, y + TH / 2 + 4, key).setOrigin(0.5, (TEX_H - 24) / TEX_H).setScale(TW / TEX_W * 0.95);
        img.setInteractive({ useHandCursor: true, pixelPerfect: false });
        img.on('pointerup', () => { if (!this.dragging) this.onBuilding(b); });
        this.root.add(img);
        const lvl = this.add.text(x + 30, y - 12, String(b.level || '…'), { fontFamily: 'system-ui', fontSize: '13px', color: '#fff', backgroundColor: '#1e3f8c', padding: { x: 4, y: 1 } }).setOrigin(0.5);
        this.root.add(lvl);
        if (this.queue.has(b.id)) {
          const hammer = this.add.text(x - 30, y - 12, '⚒', { fontSize: '16px', color: '#ffd166' }).setOrigin(0.5);
          this.tweens.add({ targets: hammer, angle: { from: -20, to: 20 }, duration: 400, yoyo: true, repeat: -1 });
          this.root.add(hammer);
        }
      } else if (s < this.slots) {
        const plus = this.add.text(x, y, '+', { fontFamily: 'system-ui', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.55);
        const zone = this.add.zone(x, y, TW * 0.7, TH * 0.7).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => { if (!this.dragging) this.onEmpty(s); });
        this.root.add([plus, zone]);
      }
    }
  }
}
