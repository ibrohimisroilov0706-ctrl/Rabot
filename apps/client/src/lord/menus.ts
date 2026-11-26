// apps/client/src/lord/menus.ts
// Lord rejimi oynalari: aholi punkti, to'qnashuv, jang, otryad, yerlar, diplomatiya, xabarlar, duel, sozlamalar.

import { terrainAt, weatherAt, type Culture, type Terrain } from '@qirolliklar/game-rules';
import { unitFrame } from '../art/soldiers.js';
import { fmt, h, modal, toast } from '../dom.js';
import { haptic } from '../telegram.js';
import type { BattleSetup, SideSetup } from './battle.js';
import { openLordBattle } from './battleView.js';
import { CULTURE_LIST, FACTIONS, KING_TITLE, mercCost, troop, upgradeCost, xpNeed, type FacId } from './data.js';
import { decode, dropPending, duelSetup, encode, mySide, newChallenge, takePending } from './duel.js';
import { G, SAVE_KEY, battleSize, save } from './game.js';
import {
  addTroops, applyLosses, applyPlayerBattle, atWar, buyFood, count, d2, dayOf, declareWar, fiefIncome, healthy, hireMerc, joinFaction, leaveFaction,
  levelXp, maxParty, partyById, peaceCost, player, playerCaptured, playerFac, power, proposePeace, raidVillage, recruitVillage, sellPrisoners,
  speedOf, step, upgradable, upgrade, weeklyIncome, weeklyWages, type Party, type Sett, type Stack, type World,
} from './world.js';

const w = () => G.w;
const ownerName = (s: Sett) => (s.owner === 'player' ? w().player.name : s.owner ? partyById(w(), s.owner)?.name ?? '—' : '—');
const KIND: Record<Sett['kind'], string> = { town: 'Shahar', castle: "Qal'a", village: 'Qishloq' };
const CU_NAME: Record<Culture, string> = { temuriy: 'Temuriylar', rus: 'Ruslar', ingliz: 'Inglizlar', usmonli: 'Usmonlilar', mogul: "Mo'g'ullar" };

function unitIcon(id: string, size = 38) {
  const t = troop(id); const src = unitFrame(t.cu, t.art, 'idle', 0, 0);
  const cv = h('canvas', { class: 'u-ico', width: size * 2, height: size * 2 }) as HTMLCanvasElement;
  cv.style.width = `${size}px`; cv.style.height = `${size}px`;
  cv.getContext('2d')!.drawImage(src, 0, 0, size * 2, size * 2);
  return cv;
}
const stars = (n: number) => '★'.repeat(n);
function troopSummary(st: Stack[]) {
  const g = { inf: 0, arch: 0, cav: 0 };
  for (const s of st) { const c = troop(s.id).cls; const k = c === 'arch' ? 'arch' : c === 'cav' || c === 'harch' || c === 'eleph' ? 'cav' : 'inf'; g[k] += s.n - s.w; }
  return `🛡 ${g.inf}  🏹 ${g.arch}  🐎 ${g.cav}`;
}
const btn = (label: string, onClick: () => void, cls = '') => h('button', { class: `btn ${cls}`, onClick }, label);
const menu = (...items: (HTMLElement | null | false)[]) => h('div', { class: 'menu-list' }, ...items.filter(Boolean) as HTMLElement[]);
function closeModal() { const r = document.getElementById('modal')!; r.classList.add('hidden'); r.replaceChildren(); }
function safe(fn: () => void) { return () => { try { fn(); haptic('light'); } catch (e) { toast((e as Error).message, 'err'); } G.hud(); save(); }; }

// ---------------------------------------------------------------- jang
function battleTerrain(x: number, y: number): Terrain { const t = terrainAt(Math.floor(x), Math.floor(y)); return t === 'daryo' ? 'tekislik' : t; }
function playerSide(): SideSetup {
  const pl = player(w());
  return { name: w().player.name, cu: w().player.cu, color: '#f0c040', ai: false, hero: { name: w().player.name, level: w().player.level }, stacks: pl.troops.filter(s => s.n - s.w > 0).map(s => ({ id: s.id, n: s.n - s.w })) };
}
const stacksOf = (st: Stack[]) => st.filter(s => s.n - s.w > 0).map(s => ({ id: s.id, n: s.n - s.w }));

async function fight(enemy: { party?: Party; sett?: Sett }) {
  const W = w(); const pl = player(W);
  if (healthy(pl.troops) === 0) { toast("Sog' askaringiz yo'q!", 'err'); }
  const e = enemy.party, s = enemy.sett;
  const name = e ? e.name : `${s!.name} garnizoni`;
  const cu = e ? e.cu : s!.cu;
  const setup: BattleSetup = {
    seed: `${W.seed}:${W.t.toFixed(2)}:${name}`, terrain: battleTerrain(pl.x, pl.y), weather: weatherAt(Math.floor(pl.x), Math.floor(pl.y), W.t * 3_600_000),
    siege: !!s, size: battleSize(),
    sides: [playerSide(), { name, cu, color: e && e.kind === 'bandit' ? '#555' : FACTIONS[(e ? e.fac : s!.fac)].color, ai: true, stacks: stacksOf(e ? e.troops : s!.garrison), hero: e && e.kind === 'lord' ? { name: e.name, level: e.king ? 12 : 7 } : undefined }],
  };
  closeModal(); G.battle = true;
  const r = await openLordBattle(setup, { interactive: true, title: s ? `🏰 ${s.name} qamali` : `⚔ ${name}` });
  G.battle = false;
  const win = r.winner === 0;
  const lines = applyPlayerBattle(W, enemy, { win, lost0: r.lost[0], lost1: r.lost[1], heroKills: r.heroKills, retreated: r.retreated });
  if (!win && (!r.retreated || healthy(pl.troops) === 0)) lines.push(playerCaptured(W));
  else if (!win && e) { e.goal = null; e.modeT = 3; pl.x += (pl.x - e.x) * 0.8 + 0.6; pl.y += 0.4; }
  save(); G.hud();
  modal(win ? '🏆 G‘alaba' : '💀 Mag‘lubiyat', h('div', {}, ...lines.map(l => h('p', {}, l)), win && W.player.prisoners.length ? h('p', { class: 'muted' }, `Asirlar: ${count(W.player.prisoners)} (shaharda sotish mumkin)`) : null),
    [{ label: 'Davom etish', kind: 'gold', onClick: () => {} }, ...(win && enemy.sett ? [{ label: '🛡 Garnizon', onClick: () => { setTimeout(() => garrisonScreen(enemy.sett!), 50); } }] : [])]);
}

// ---------------------------------------------------------------- to'qnashuv
export function openEncounter(p: Party, forced: boolean) {
  const W = w(); const pl = player(W);
  const hostileNow = atWar(W, playerFac(W), p.kind === 'bandit' ? 'bandit' : p.fac);
  const myP = power(pl.troops), theirP = power(p.troops);
  const body = h('div', {},
    h('p', {}, p.kind === 'bandit' ? '☠ Qaroqchilar' : `${FACTIONS[p.fac].name}${p.king ? ' hukmdori' : ' lordi'}`),
    h('div', { class: 'enc-vs' },
      h('div', {}, h('b', {}, W.player.name), h('div', {}, troopSummary(pl.troops)), h('div', { class: 'muted' }, `Kuch: ${Math.round(myP)}`)),
      h('div', { class: 'vs' }, '⚔'),
      h('div', {}, h('b', {}, p.name), h('div', {}, troopSummary(p.troops)), h('div', { class: 'muted' }, `Kuch: ${Math.round(theirP)}`))),
    h('p', { class: 'muted' }, forced ? 'Ular sizga hujum qildi!' : hostileNow ? 'Dushman.' : 'Tinch munosabatda.'));
  const actions: { label: string; kind?: string; onClick: () => void }[] = [];
  if (hostileNow) {
    actions.push({ label: '⚔ Jang', kind: 'red', onClick: () => { setTimeout(() => void fight({ party: p }), 30); } });
    if (forced) {
      if (p.kind === 'bandit') actions.push({ label: `💰 To'lov (${Math.round(pl.gold * 0.25)})`, onClick: () => { pl.gold -= Math.round(pl.gold * 0.25); p.goal = null; p.modeT = 6; toast("To'lov berdingiz, ular ketdi"); save(); G.hud(); } });
      actions.push({ label: '🏃 Qochish', onClick: () => {
        const chance = Math.min(0.85, Math.max(0.15, speedOf(W, pl) / speedOf(W, p) * 0.5));
        if (Math.random() < chance) { p.goal = null; p.modeT = 2.5; pl.x += (pl.x - p.x) * 2 + 0.5; pl.y += (pl.y - p.y) * 2; toast('Qochib qutuldingiz!', 'ok'); }
        else { toast('Qochib bo‘lmadi — jang!', 'err'); setTimeout(() => void fight({ party: p }), 400); }
      } });
    } else actions.push({ label: 'Ortga', onClick: () => {} });
  } else {
    actions.push({ label: '💬 Gaplashish', onClick: () => {
      const rel = W.rel[p.fac] ?? 0;
      const say = rel < -10 ? 'Yo‘limdan qoching, xoin!' : W.player.renown > 40 ? `Sizning shon-shuhratingiz ${FACTIONS[p.fac].short} orasida ham ma’lum, ${W.player.name}.` : 'Salom, sayyoh. Yo‘llar xavfli, ehtiyot bo‘ling.';
      setTimeout(() => modal(p.name, h('p', {}, `“${say}”`), [{ label: 'Xayr', onClick: () => {} }]), 30);
    } });
    if (!W.player.liege && p.kind === 'lord') actions.push({ label: '⚔ Hujum (urush!)', kind: 'red', onClick: () => { declareWar(W, 'player', p.fac); W.rel[p.fac] = (W.rel[p.fac] ?? 0) - 25; setTimeout(() => void fight({ party: p }), 30); } });
    actions.push({ label: 'Ortga', onClick: () => {} });
  }
  modal(p.name, body, actions);
}

// ---------------------------------------------------------------- aholi punkti
export function openSettlement(s: Sett) {
  const W = w(); const pl = player(W); const pf = playerFac(W);
  const hostileS = atWar(W, pf, s.fac);
  const mine = s.owner === 'player';
  const info = h('div', { class: 'set-info' },
    h('div', {}, `${KIND[s.kind]} · ${FACTIONS[s.fac].name}`),
    h('div', { class: 'muted' }, `Egasi: ${ownerName(s)} · Farovonlik ${Math.round(s.prosper * 100)}%`),
    s.kind !== 'village' ? h('div', {}, `Garnizon: ${count(s.garrison)} askar (${troopSummary(s.garrison)})`) : h('div', {}, s.looted > W.t ? '🔥 Yaqinda talangan' : `Ko'ngillilar: ${s.vol}`),
    s.siegeBy ? h('div', { class: 'neg' }, `⚔ Qamalda: ${partyById(W, s.siegeBy)?.name ?? ''}`) : null,
    mine ? h('div', { class: 'pos' }, `Sizning yeringiz · haftalik soliq ~${fiefIncome(W, s)} tanga`) : null);
  const items: (HTMLElement | null)[] = [];
  const again = () => setTimeout(() => openSettlement(s), 20);
  if (hostileS) {
    if (s.kind === 'village') items.push(s.looted > W.t ? null : btn(`🔥 Talash`, safe(() => { const g = raidVillage(W, s); toast(`+${g} tanga, +25 oziq`, 'ok'); closeModal(); }), 'red'));
    else items.push(btn(`⚔ Qamal hujumi (${count(s.garrison)} himoyachi)`, () => {
      if (healthy(pl.troops) < 8) { toast("Qamal uchun kamida 8 sog' askar kerak", 'err'); return; }
      void fight({ sett: s });
    }, 'red'));
  } else {
    if (s.kind === 'village') {
      items.push(btn(`🧑‍🌾 Ko'ngillilar yollash (${s.vol} ta · 12 tanga)`, safe(() => { const n = recruitVillage(W, s, s.vol); toast(`${n} ${troop(`${s.cu}_t1`).name} qo'shildi`, 'ok'); again(); })));
      items.push(btn('🌾 Oziq sotib olish (20 = 55 tanga)', safe(() => { buyFood(W, 20, 2.75); toast('+20 oziq', 'ok'); again(); })));
      if (!W.player.liege && !mine && s.looted <= W.t) items.push(btn('🔥 Talash (urush e’lon qilinadi)', safe(() => { const g = raidVillage(W, s); toast(`+${g} tanga`, 'ok'); closeModal(); }), 'red'));
    } else {
      if (s.kind === 'town') {
        items.push(btn('🌾 Bozor: oziq (30 = 60 tanga)', safe(() => { buyFood(W, 30, 2); toast('+30 oziq', 'ok'); again(); })));
        if (s.merc && s.merc.n > 0) items.push(btn(`🍺 Taverna: ${s.merc.n} × ${troop(s.merc.id).name} (${mercCost(troop(s.merc.id).tier) * s.merc.n})`, safe(() => { const p = hireMerc(W, s); toast(`Yollandi: -${p} tanga`, 'ok'); again(); })));
        else items.push(h('div', { class: 'muted' }, '🍺 Tavernada yollanma askar yo‘q (har hafta yangilanadi)'));
        if (W.player.prisoners.length) items.push(btn(`⛓ Asirlarni sotish (${count(W.player.prisoners)})`, safe(() => { const g = sellPrisoners(W); toast(`+${g} tanga`, 'ok'); again(); })));
      }
      if (s.fac !== 'player' && s.fac !== 'bandit' && !mine) {
        const f = s.fac;
        if (W.player.liege === f) items.push(btn(`🚪 ${FACTIONS[f].name} xizmatini tark etish`, safe(() => { leaveFaction(W); closeModal(); }), 'red'));
        else if (!W.player.liege) items.push(btn(`👑 ${KING_TITLE[f as Culture]}ga vassal bo'lish`, safe(() => { joinFaction(W, f); toast(`Endi siz ${FACTIONS[f].name} vassalisiz`, 'ok'); again(); })));
      }
      items.push(btn('💤 Dam olish (1 kun)', () => { closeModal(); rest(24); }));
      if (mine) items.push(btn('🛡 Garnizon', () => { setTimeout(() => garrisonScreen(s), 20); }));
    }
  }
  modal(`${s.kind === 'town' ? '🏯' : s.kind === 'castle' ? '🏰' : '🏡'} ${s.name}`, h('div', {}, info, menu(...items)), [{ label: 'Chiqish', onClick: () => {} }]);
}

export function rest(hours: number) {
  const W = w(); const pl = player(W);
  for (let i = 0; i < hours; i++) {
    for (const s of pl.troops) s.w = Math.max(0, s.w - Math.ceil(s.w * 0.02));
    const ev = step(W, 1);
    const att = ev.find(e => e.k === 'attacked');
    if (att && att.k === 'attacked') { const p = partyById(W, att.id); if (p) { openEncounter(p, true); G.hud(); return; } }
  }
  toast('Dam oldingiz: yaradorlar tuzalmoqda', 'ok'); save(); G.hud();
}

// ---------------------------------------------------------------- garnizon
export function garrisonScreen(s: Sett) {
  const W = w(); const pl = player(W);
  const move = (from: Stack[], to: Stack[], id: string, n: number) => {
    const st = from.find(x => x.id === id); if (!st) return;
    const k = Math.min(n, st.n - st.w); if (k <= 0) return;
    if (to === pl.troops && count(pl.troops) + k > maxParty(W)) { toast("Otryad to'la", 'err'); return; }
    st.n -= k; if (st.n <= 0) from.splice(from.indexOf(st), 1);
    addTroops(to, id, k); save(); G.hud(); setTimeout(() => garrisonScreen(s), 10);
  };
  const row = (st: Stack, from: Stack[], to: Stack[], dir: string) => h('div', { class: 'tr-row' }, unitIcon(st.id, 30),
    h('div', { class: 'tr-name' }, troop(st.id).name, h('small', {}, ` ${st.n - st.w}`)),
    h('button', { class: 'btn small', onClick: () => move(from, to, st.id, 5) }, `${dir}5`),
    h('button', { class: 'btn small', onClick: () => move(from, to, st.id, 999) }, `${dir}hammasi`));
  modal(`🛡 ${s.name} garnizoni`, h('div', {},
    h('h4', {}, `Otryadingiz (${count(pl.troops)}/${maxParty(W)})`), ...pl.troops.map(st => row(st, pl.troops, s.garrison, '→ ')),
    h('h4', {}, `Garnizon (${count(s.garrison)})`), ...(s.garrison.length ? s.garrison.map(st => row(st, s.garrison, pl.troops, '← ')) : [h('p', { class: 'muted' }, "Bo'sh — dushman oson bosib oladi!")])),
  [{ label: 'Tayyor', onClick: () => {} }]);
}

// ---------------------------------------------------------------- otryad
export function partyScreen() {
  const W = w(); const pl = player(W); const P = W.player;
  const foodDays = Math.floor(P.food / Math.max(1, Math.ceil(count(pl.troops) / 9)));
  const head = h('div', { class: 'hero-card' },
    h('div', { class: 'hc-ico' }, unitIcon(`${P.cu}_cav4`, 64)),
    h('div', {}, h('h3', {}, `👑 ${P.name}`), h('div', {}, `Daraja ${P.level} · tajriba ${P.xp}/${levelXp(P.level)}`),
      h('div', {}, `⭐ Obro' ${P.renown} · G'alaba ${P.wins} · Mag'lubiyat ${P.losses}`),
      h('div', { class: 'muted' }, `${P.liege ? `${FACTIONS[P.liege].name} vassali` : 'Mustaqil'} · ${CU_NAME[P.cu]}`)));
  const econ = h('div', { class: 'econ' },
    h('div', {}, `⚔ Otryad: ${count(pl.troops)}/${maxParty(W)} (yarador ${pl.troops.reduce((a, s) => a + s.w, 0)})`),
    h('div', {}, `💰 Haftalik: soliq +${weeklyIncome(W, 'player')} / maosh −${weeklyWages(W)}`),
    h('div', {}, `🌾 Oziq: ${P.food} (~${foodDays} kunga)`));
  const rows = pl.troops.map(st => {
    const t = troop(st.id); const up = upgradable(st);
    const need = xpNeed(t.tier);
    return h('div', { class: 'tr-card' },
      h('div', { class: 'tr-row' }, unitIcon(st.id, 40),
        h('div', { class: 'tr-name' }, h('b', {}, t.name), h('small', { class: 'stars' }, ` ${stars(t.tier)}`), h('div', { class: 'muted' }, `${st.n} ta${st.w ? ` (${st.w} yarador)` : ''} · maosh ${t.wage}`)),
        t.up.length ? h('div', { class: 'xpbar' }, h('i', { style: `width:${Math.min(100, Math.round((st.xp % need) / need * 100))}%` })) : null),
      up > 0 ? h('div', { class: 'tr-up' }, h('span', {}, `${up} ta oshirishga tayyor:`), ...t.up.map(u => h('button', { class: 'btn small gold', onClick: safe(() => { const n = upgrade(W, st.id, u, up); toast(`${n} ta → ${troop(u).name}`, 'ok'); setTimeout(partyScreen, 10); }) }, `↑ ${troop(u).name} (${upgradeCost(t.tier)}/ta)`))) : null);
  });
  const pris = P.prisoners.length ? h('div', {}, h('h4', {}, `⛓ Asirlar (${count(P.prisoners)})`), h('div', { class: 'muted' }, P.prisoners.map(s => `${troop(s.id).name} ×${s.n}`).join(', ')),
    h('button', { class: 'btn small', onClick: safe(() => { P.prisoners = []; toast("Asirlar ozod qilindi"); setTimeout(partyScreen, 10); }) }, 'Ozod qilish')) : null;
  modal('🛡 Otryad', h('div', {}, head, econ, ...rows, pris, h('p', { class: 'muted' }, "Askarlar jangda tajriba oladi. Yetarli tajriba + tanga bilan ularni kuchliroq turga oshiring.")), [{ label: 'Yopish', onClick: () => {} }]);
}

// ---------------------------------------------------------------- yerlar
export function fiefScreen() {
  const W = w(); const mine = W.sets.filter(s => s.owner === 'player');
  const body = mine.length ? h('div', {}, ...mine.map(s => h('div', { class: 'tr-row fief' },
    h('div', { class: 'tr-name' }, h('b', {}, `${s.kind === 'town' ? '🏯' : s.kind === 'castle' ? '🏰' : '🏡'} ${s.name}`),
      h('div', { class: 'muted' }, `Soliq ~${fiefIncome(W, s)}/hafta${s.kind !== 'village' ? ` · garnizon ${count(s.garrison)}` : ''}${s.siegeBy ? ' · ⚔ QAMALDA' : ''}${s.looted > W.t ? ' · 🔥 talangan' : ''}`)),
    h('button', { class: 'btn small', onClick: () => { closeModal(); G.map?.centerOn(s.x, s.y); if (G.map) G.map.follow = false; } }, 'Xaritada'))))
    : h('div', {}, h('p', {}, "Sizda hali yer yo'q."), h('p', { class: 'muted' }, "Qal'a yoki shaharni qamal qilib oling. Vassal bo'lsangiz — hukmdoringiz bilan urushayotgan dushman qal'alarini oling, ular sizga qoladi."));
  modal('🏰 Yerlarim', body, [{ label: 'Yopish', onClick: () => {} }]);
}

// ---------------------------------------------------------------- diplomatiya
export function diploScreen() {
  const W = w(); const pf = playerFac(W);
  const facs: FacId[] = [...CULTURE_LIST, ...(W.sets.some(s => s.fac === 'player') ? ['player' as FacId] : [])];
  const rows = facs.map(f => {
    const sets = W.sets.filter(s => s.fac === f);
    const lords = W.parties.filter(p => p.kind === 'lord' && p.fac === f && !p.down);
    const wars = facs.filter(o => o !== f && atWar(W, f, o)).map(o => FACTIONS[o].short);
    const vsMe = f !== pf && atWar(W, pf, f);
    return h('div', { class: 'dip-row' },
      h('div', { class: 'dip-flag', style: `background:${FACTIONS[f].color}` }),
      h('div', { class: 'tr-name' }, h('b', {}, FACTIONS[f].name, f === pf ? ' (siz)' : ''),
        h('div', { class: 'muted' }, `🏯 ${sets.filter(s => s.kind === 'town').length} · 🏰 ${sets.filter(s => s.kind === 'castle').length} · 🏡 ${sets.filter(s => s.kind === 'village').length} · lordlar ${lords.length}`),
        h('div', { class: wars.length ? 'neg' : 'muted' }, wars.length ? `⚔ Urushda: ${wars.join(', ')}` : '🕊 Tinch')),
      vsMe && !W.player.liege ? h('button', { class: 'btn small', onClick: safe(() => { proposePeace(W, f); toast('Sulh tuzildi', 'ok'); setTimeout(diploScreen, 10); }) }, `🕊 Sulh (${peaceCost(W)})`) : null);
  });
  const status = W.player.liege ? `Siz ${FACTIONS[W.player.liege].name} vassalisiz: uning urushlari — sizning urushlaringiz.` : 'Siz mustaqilsiz. Biror hukmdorga vassal bo‘lish uchun uning shahriga kiring (obro‘ 25+).';
  modal('📜 Diplomatiya', h('div', {}, h('p', { class: 'muted' }, status), ...rows), [{ label: 'Yopish', onClick: () => {} }]);
}

// ---------------------------------------------------------------- xabarlar
export function logScreen() {
  const W = w();
  modal('📰 Xabarlar', h('div', { class: 'log' }, ...W.log.slice(0, 60).map(l => h('div', { class: 'log-row' }, h('small', {}, `${Math.floor(l.t / 24) + 1}-kun`), ' ', l.text))), [{ label: 'Yopish', onClick: () => {} }]);
}

// ---------------------------------------------------------------- duel
export function duelScreen() {
  const W = w();
  const out = h('textarea', { class: 'codebox', rows: 4, readonly: true, placeholder: 'Bu yerda kod paydo bo‘ladi' }) as HTMLTextAreaElement;
  const inp = h('textarea', { class: 'codebox', rows: 4, placeholder: 'Do‘stingiz yuborgan kodni shu yerga qo‘ying' }) as HTMLTextAreaElement;
  const copy = async (t: string) => { out.value = t; try { await navigator.clipboard.writeText(t); toast('Kod nusxalandi — do‘stingizga yuboring', 'ok'); } catch { out.select(); toast('Kodni belgilab nusxa oling', 'info'); } };
  const body = h('div', {},
    h('p', { class: 'muted' }, "Internetsiz do'stona jang: qo'shiningiz kod bo'lib uzatiladi, jang ikkala telefonda bir xil o'tadi. Yo'qotishlar haqiqiy!"),
    h('ol', { class: 'muted small' }, h('li', {}, 'Siz “Chaqiruv” kodini yaratib do‘stingizga yuborasiz.'), h('li', {}, 'Do‘stingiz kodni kiritadi, jangni ko‘radi va sizga javob kodini yuboradi.'), h('li', {}, 'Siz javob kodini kiritasiz — jang sizda ham ko‘rsatiladi.')),
    btn('⚔ Chaqiruv kodi yaratish', safe(() => { void copy(newChallenge(W)); })), out,
    h('h4', {}, 'Kodni kiritish'), inp,
    btn('▶ Kodni qabul qilish', () => { void acceptCode(inp.value); }, 'gold'));
  modal('🤝 Do‘st bilan jang', body, [{ label: 'Yopish', onClick: () => {} }]);
}

async function acceptCode(code: string) {
  const W = w(); const pl = player(W);
  let p; try { p = decode(code); } catch (e) { toast((e as Error).message, 'err'); return; }
  if (W.used.includes(p.id + p.k)) { toast('Bu kod allaqachon ishlatilgan', 'err'); return; }
  if (p.k === 'c') {
    const b = mySide(W); if (!b.troops.length) { toast("Sog' askar kerak", 'err'); return; }
    closeModal(); G.battle = true;
    const r = await openLordBattle(duelSetup(p.id, p.a, b), { interactive: false, title: `🤝 ${p.a.name} — ${b.name}`, mySide: 1 });
    G.battle = false;
    applyLosses(pl.troops, r.lost[1], 0.6, W);
    if (r.winner === 1) W.player.renown += 3;
    W.used.push(p.id + p.k); save(); G.hud();
    const reply = encode({ k: 'r', id: p.id, a: p.a, b });
    const ta = h('textarea', { class: 'codebox', rows: 5, readonly: true }, reply) as HTMLTextAreaElement;
    modal(r.winner === 1 ? '🏆 Yutdingiz!' : '💀 Yutqazdingiz', h('div', {}, h('p', {}, 'Endi bu javob kodini do‘stingizga yuboring — u ham jangni ko‘radi:'), ta),
      [{ label: '📋 Nusxalash', kind: 'gold', onClick: async () => { try { await navigator.clipboard.writeText(reply); toast('Nusxalandi', 'ok'); } catch { ta.select(); } } }]);
  } else {
    const a = takePending(W, p.id);
    if (!a) { toast('Bu javob sizning chaqiruvingizga tegishli emas', 'err'); return; }
    if (JSON.stringify(a) !== JSON.stringify(p.a)) { toast('Javob kodi mos kelmadi', 'err'); return; }
    closeModal(); G.battle = true;
    const r = await openLordBattle(duelSetup(p.id, a, p.b), { interactive: false, title: `🤝 ${a.name} — ${p.b.name}`, mySide: 0 });
    G.battle = false;
    applyLosses(pl.troops, r.lost[0], 0.6, W);
    if (r.winner === 0) W.player.renown += 3;
    W.used.push(p.id + p.k); dropPending(W, p.id); save(); G.hud();
    modal(r.winner === 0 ? '🏆 Yutdingiz!' : '💀 Yutqazdingiz', h('p', {}, `${p.b.name} bilan jang yakunlandi.`), [{ label: 'OK', onClick: () => {} }]);
  }
}

// ---------------------------------------------------------------- yana
export function moreScreen(onReset: () => void) {
  const W = w();
  const speeds = [1, 2, 4].map(v => h('button', { class: `btn small ${W.speed === v ? 'gold' : ''}`, onClick: () => { W.speed = v; save(); setTimeout(() => moreScreen(onReset), 10); } }, `x${v}`));
  const exp = h('textarea', { class: 'codebox', rows: 3, placeholder: 'Zaxira kodi (tiklash uchun shu yerga qo‘ying)' }) as HTMLTextAreaElement;
  const resetBtn = h('button', { class: 'btn small red', onClick: () => { if (resetBtn.dataset.armed) { onReset(); return; } resetBtn.dataset.armed = '1'; resetBtn.textContent = 'Yana bir bor bosing — hammasi o‘chadi'; } }, '🗑 Yangi o‘yin');
  modal('☰ Yana', h('div', {},
    menu(
      btn('📰 Xabarlar', () => setTimeout(logScreen, 10)),
      btn('🤝 Do‘st bilan jang (kod)', () => setTimeout(duelScreen, 10)),
      btn('❓ Qanday o‘ynash', () => setTimeout(helpScreen, 10)),
    ),
    h('h4', {}, 'Xaritada vaqt tezligi'), h('div', { class: 'row-btns' }, ...speeds),
    h('h4', {}, 'Saqlash'),
    h('p', { class: 'muted small' }, `O'yin avtomatik saqlanadi${(window as any).Telegram?.WebApp?.initData ? ' (Telegram bulutiga ham)' : ''}. Boshqa qurilmaga ko'chirish uchun zaxira kodidan foydalaning.`),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn small', onClick: async () => { const j = JSON.stringify(W); exp.value = j; try { await navigator.clipboard.writeText(j); toast('Zaxira nusxalandi', 'ok'); } catch { exp.select(); } } }, '📤 Zaxira olish'),
      h('button', { class: 'btn small', onClick: () => { const j = exp.value.trim(); if (!j) { toast('Avval zaxira kodini maydonga qo‘ying', 'info'); exp.focus(); return; } try { const o = JSON.parse(j); if (o.v !== 2) throw new Error(); localStorage.setItem(SAVE_KEY, j); location.reload(); } catch { toast('Zaxira noto‘g‘ri', 'err'); } } }, '📥 Tiklash')),
    exp,
    h('h4', {}, 'Xavfli'),
    resetBtn),
  [{ label: 'Yopish', onClick: () => {} }]);
}

export function helpScreen() {
  modal('❓ Qanday o‘ynash', h('div', { class: 'help' },
    h('p', {}, '🗺 Xaritaga bosing — otryadingiz o‘sha yerga yuradi. Vaqt faqat yurganingizda (yoki ⏳ Kutish yoqilganda) o‘tadi.'),
    h('p', {}, '🏡 Qishloqlarga kirib ko‘ngillilarni yollang. 🏯 Shaharlarda oziq sotib oling, tavernada yollanma askar oling, asirlarni soting.'),
    h('p', {}, '☠ Qaroqchilarni yenging — askarlaringiz tajriba oladi. 🛡 Otryad oynasida ularni kuchliroq turga oshiring (piyoda → nayzachi/otliq …).'),
    h('p', {}, '⚔ Jangda: maydonga bosing — qahramoningiz o‘sha yerga boradi. Pastdagi tugmalar: guruhni tanlang (piyoda/kamonchi/otliq) va buyruq bering: Hujum, Turing, Oldinga, Orqaga. 🤖 Avto — qo‘shin o‘zi jang qiladi.'),
    h('p', {}, '👑 Obro‘ 25+ bo‘lsa, biror hukmdorning shahriga kirib vassal bo‘ling. Yoki mustaqil qolib, qal‘alarni o‘zingiz bosib oling va o‘z davlatingizni quring.'),
    h('p', {}, '🏰 Qal‘a/shaharni olgach garnizon qoldiring, aks holda dushman qaytarib oladi. Yerlaringiz har hafta soliq beradi; askarlar maosh oladi; oziq har kuni kamayadi.')),
  [{ label: 'Tushunarli', kind: 'gold', onClick: () => {} }]);
}

// ---------------------------------------------------------------- boshlash
export function onboarding(start: (name: string, cu: Culture) => void) {
  let cu: Culture = 'temuriy';
  const nameIn = h('input', { class: 'inp', maxlength: 20, placeholder: 'Ismingiz (masalan: Davron)' }) as HTMLInputElement;
  const DESC: Record<Culture, string> = {
    temuriy: 'Kuchli otliqlar, bahodirlar va jangovar fillar',
    rus: "Chidamli piyoda va o'rmon ovchilari",
    ingliz: 'Uzun kamonchilar va ritsarlar',
    usmonli: 'Yangicherilar va sipohiylar',
    mogul: 'Tezkor otliq kamonchilar',
  };
  const cards = CULTURE_LIST.map(c => {
    const el = h('button', { class: `cu-card ${c === cu ? 'on' : ''}`, onClick: () => { cu = c; cards.forEach(x => x.classList.remove('on')); el.classList.add('on'); } },
      unitIcon(`${c}_cav4`, 52), h('div', {}, h('b', {}, FACTIONS[c].name), h('div', { class: 'muted small' }, DESC[c])));
    return el;
  });
  const root = h('div', { class: 'lord-onb' },
    h('h1', {}, 'QIROLLIKLAR'), h('p', { class: 'muted' }, "Lord bo'ling: qo'shin to'plang, qal'alarni oling, o'z davlatingizni quring."),
    nameIn, h('h4', {}, 'Kelib chiqishingiz'), h('div', { class: 'cu-list' }, ...cards),
    h('button', { class: 'btn wide gold', onClick: () => { const n = nameIn.value.trim() || 'Davron'; root.remove(); start(n, cu); } }, '⚔ Yo‘lga chiqish'));
  document.body.append(root);
}

export { dayOf, fmt };
