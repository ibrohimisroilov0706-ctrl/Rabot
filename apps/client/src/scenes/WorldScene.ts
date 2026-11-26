// apps/client/src/scenes/WorldScene.ts
// Umumiy dunyo xaritasi: terren teksturasi, shaharlar (millat uslubidagi saroy), yo'ldagi qo'shinlar.
// Boshqaruv: surish (pan), ikki barmoq bilan zoom, g'ildirak, shaharga bosish.

import Phaser from 'phaser';
import { MAP_SIZE, type Culture } from '@qirolliklar/game-rules';
import { drawBuilding } from '../art/buildings.js';
import { TILE, drawWorld } from '../art/terrain.js';
import { CULTURE_COLOR } from '../i18n.js';

export interface WorldCity { id: string; name: string; x: number; y: number; kingdom_id: string; kingdom_name: string; culture: Culture; palace: number; shielded: boolean; population: number; ruler_name: string }
export interface WorldArmy { id: string; owner_kingdom_id: string; serving_kingdom_id: string | null; culture: Culture; status: string; mission: string; from_x: number; from_y: number; to_x: number; to_y: number; depart_at: string; arrive_at: string }

const hex = (s: string) => parseInt(s.slice(1), 16);

export class WorldScene extends Phaser.Scene {
  onSelect: (c: WorldCity | null) => void = () => {};
  private cities: WorldCity[] = [];
  private armies: WorldArmy[] = [];
  private myKingdom = '';
  private layer!: Phaser.GameObjects.Container;
  private armyG!: Phaser.GameObjects.Graphics;
  private selG!: Phaser.GameObjects.Graphics;
  private selected: string | null = null;
  private dragging = false;
  private pinchDist = 0;
  private pendingCenter: { x: number; y: number } | null = null;

  constructor() { super('world'); }

  create() {
    if (!this.textures.exists('world-map')) this.textures.addCanvas('world-map', drawWorld(document.createElement('canvas')));
    for (const c of ['rus', 'ingliz', 'usmonli', 'temuriy', 'mogul'] as Culture[]) {
      if (!this.textures.exists(`city-${c}`)) this.textures.addCanvas(`city-${c}`, drawBuilding(document.createElement('canvas'), c, 'saroy', 5));
    }
    this.add.image(0, 0, 'world-map').setOrigin(0, 0);
    this.layer = this.add.container(0, 0);
    this.armyG = this.add.graphics();
    this.selG = this.add.graphics();
    const S = MAP_SIZE * TILE;
    const cam = this.cameras.main;
    cam.setBounds(-200, -200, S + 400, S + 400);
    cam.setZoom(1.4);
    cam.setBackgroundColor('#0b1f38');
    this.input.addPointer(1);

    this.input.on('pointerdown', () => { this.dragging = false; this.pinchDist = 0; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinchDist > 0) cam.setZoom(Phaser.Math.Clamp(cam.zoom * (d / this.pinchDist), 0.35, 3));
        this.pinchDist = d; this.dragging = true; return;
      }
      if (!p.isDown) return;
      const dx = p.x - p.prevPosition.x, dy = p.y - p.prevPosition.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragging = true;
      cam.scrollX -= dx / cam.zoom; cam.scrollY -= dy / cam.zoom;
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.35, 3)));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragging) return;
      const hit = this.cities.find(c => Phaser.Math.Distance.Between(p.worldX, p.worldY, c.x * TILE + TILE / 2, c.y * TILE + TILE / 2) < 22);
      this.selected = hit?.id ?? null;
      this.drawSelection();
      this.onSelect(hit ?? null);
    });
    this.redraw();
    if (this.pendingCenter) { this.centerOn(this.pendingCenter.x, this.pendingCenter.y); this.pendingCenter = null; }
  }

  centerOn(x: number, y: number) {
    if (!this.cameras?.main) { this.pendingCenter = { x, y }; return; }
    this.cameras.main.centerOn(x * TILE + TILE / 2, y * TILE + TILE / 2);
  }

  setData(cities: WorldCity[], armies: WorldArmy[], myKingdom: string) {
    this.cities = cities; this.armies = armies; this.myKingdom = myKingdom;
    if (this.layer) this.redraw();
  }

  private redraw() {
    this.layer.removeAll(true);
    for (const c of this.cities) {
      const px = c.x * TILE + TILE / 2, py = c.y * TILE + TILE / 2;
      const mine = c.kingdom_id === this.myKingdom;
      const ring = this.add.graphics();
      ring.fillStyle(hex(CULTURE_COLOR[c.culture]), 0.35).fillCircle(px, py, 15);
      if (mine) ring.lineStyle(2, 0xd4a537, 1).strokeCircle(px, py, 17);
      if (c.shielded) ring.lineStyle(2, 0x9ad0ff, 0.9).strokeCircle(px, py, 20);
      const img = this.add.image(px, py + 10, `city-${c.culture}`).setOrigin(0.5, 1).setScale(0.18 + Math.min(10, c.palace) * 0.012);
      const label = this.add.text(px, py + 12, c.name, {
        fontFamily: 'system-ui, sans-serif', fontSize: '9px', color: mine ? '#ffe39a' : '#ffffff', stroke: '#0b1f38', strokeThickness: 3,
      }).setOrigin(0.5, 0).setResolution(2);
      this.layer.add([ring, img, label]);
    }
    this.drawSelection();
  }

  private drawSelection() {
    this.selG.clear();
    const c = this.cities.find(x => x.id === this.selected);
    if (!c) return;
    this.selG.lineStyle(2, 0xffffff, 1).strokeCircle(c.x * TILE + TILE / 2, c.y * TILE + TILE / 2, 24);
  }

  update() {
    const g = this.armyG; g.clear();
    const now = Date.now();
    for (const a of this.armies) {
      const t0 = Date.parse(a.depart_at), t1 = Date.parse(a.arrive_at);
      const k = Phaser.Math.Clamp((now - t0) / Math.max(1, t1 - t0), 0, 1);
      const fx = a.from_x * TILE + TILE / 2, fy = a.from_y * TILE + TILE / 2, tx = a.to_x * TILE + TILE / 2, ty = a.to_y * TILE + TILE / 2;
      const x = fx + (tx - fx) * k, y = fy + (ty - fy) * k;
      const mine = a.owner_kingdom_id === this.myKingdom || a.serving_kingdom_id === this.myKingdom;
      const hostile = a.mission === 'attack';
      g.lineStyle(1, hostile ? 0xc0392b : 0xffffff, 0.45).lineBetween(x, y, tx, ty);
      g.fillStyle(hex(CULTURE_COLOR[a.culture]), 1).fillCircle(x, y, 5);
      g.lineStyle(2, mine ? 0xd4a537 : hostile ? 0xc0392b : 0xffffff, 1).strokeCircle(x, y, 6);
    }
  }
}
