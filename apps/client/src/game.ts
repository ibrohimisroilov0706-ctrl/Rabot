// apps/client/src/game.ts
// Phaser o'yini: ikki sahna (world, city). DOM UI ularni shu modul orqali boshqaradi.

import Phaser from 'phaser';
import { CityScene } from './scenes/CityScene.js';
import { WorldScene } from './scenes/WorldScene.js';

let game: Phaser.Game | null = null;
let ready: Promise<{ world: WorldScene; city: CityScene }> | null = null;

export function startGame(parent: string) {
  if (ready) return ready;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0b1f38',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 2 },
    scene: [],
  });
  ready = new Promise(resolve => {
    game!.events.once('ready', () => {
      game!.scene.add('world', WorldScene, true);
      game!.scene.add('city', CityScene, false);
      resolve({ world: game!.scene.getScene('world') as WorldScene, city: game!.scene.getScene('city') as CityScene });
    });
  });
  return ready;
}

export async function showScene(key: 'world' | 'city') {
  await ready;
  if (!game) return;
  const other = key === 'world' ? 'city' : 'world';
  if (game.scene.isActive(other)) game.scene.sleep(other);
  game.scene.run(key);
}

export function hideScenes() {
  if (!game) return;
  for (const k of ['world', 'city']) if (game.scene.isActive(k)) game.scene.sleep(k);
}

export const scenes = () => ready;
