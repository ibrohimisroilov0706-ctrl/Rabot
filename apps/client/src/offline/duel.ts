// apps/client/src/offline/duel.ts
// "Jang kodi": serversiz do'stlar bilan urush.
//  1) A chaqiruv kodi yaratadi (qo'shin surati)  ->  Telegram orqali B ga yuboradi
//  2) B kodni kiritib, o'z garnizonidan qo'shin bilan hujum qiladi -> B da yo'qotishlar qo'llanadi, natija kodi chiqadi
//  3) B natija kodini A ga yuboradi -> A jangni AYNAN qayta hisoblaydi (deterministik) va o'z yo'qotishlarini qo'llaydi.
// Kod: "QRL1." + base64url(JSON) + "." + nazorat summasi. Bir kod bir marta ishlatiladi.

import { hashSeed, resolveBattle, veterancyFromXp, xpGain, type BattleArmy, type BattleInput, type Culture } from '@qirolliklar/game-rules';
import { LocalError, internals, state } from './engine.js';

interface Snapshot { units: Record<string, number>; xp: number; smithy: number; gskill: number }
interface Challenge { t: 'c'; id: string; from: { pid: string; name: string; culture: Culture; ruler: string }; snap: Snapshot; at: number }
interface Result { t: 'r'; cid: string; to: string; from: { pid: string; name: string; culture: Culture }; att: BattleArmy; at: number }

const b64e = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const sum = (u: Record<string, number>) => Object.values(u).reduce((a, b) => a + b, 0);

export function encode(o: object): string {
  const body = b64e(JSON.stringify(o));
  return `QRL1.${body}.${hashSeed(body).toString(36)}`;
}
export function decode<T>(code: string): T {
  const m = /QRL1\.([A-Za-z0-9_-]+)\.([0-9a-z]+)/.exec(code.replace(/\s+/g, ''));
  if (!m) throw new LocalError(400, 'bad_code', 'Kod noto‘g‘ri. To‘liq nusxalanganini tekshiring');
  if (hashSeed(m[1]!).toString(36) !== m[2]) throw new LocalError(400, 'bad_code', 'Kod buzilgan (nazorat summasi mos emas)');
  try { return JSON.parse(b64d(m[1]!)) as T; } catch { throw new LocalError(400, 'bad_code', 'Kodni o‘qib bo‘lmadi'); }
}

function defender(c: Challenge): BattleArmy {
  return { armyId: `duel-def-${c.id}`, culture: c.from.culture, generalSkill: c.snap.gskill, loyalty: 60, fed: true, smithyLevel: c.snap.smithy,
    stacks: Object.entries(c.snap.units).filter(([, n]) => n > 0).map(([unitKey, count]) => ({ unitKey, count, veterancy: veterancyFromXp(c.snap.xp) })) };
}
function input(c: Challenge, att: BattleArmy): BattleInput {
  return { battleId: `duel:${c.id}:${att.armyId}`, terrain: 'tekislik', weather: 'ochiq', attackers: [att], defenders: [defender(c)] };
}
function pickUnits(want: Record<string, number>) {
  const S = state();
  const units = Object.fromEntries(Object.entries(want ?? {}).filter(([, n]) => n > 0).map(([k, n]) => [k, Math.floor(n)]));
  if (sum(units) <= 0) throw new LocalError(400, 'no_units', 'Kamida bitta askar tanlang');
  for (const [k, n] of Object.entries(units)) if ((S.garrison[k] ?? 0) < n) throw new LocalError(409, 'not_enough_units', `${k}: garnizonda ${S.garrison[k] ?? 0} ta bor`);
  return units;
}
function record(c: Challenge, att: BattleArmy, r: ReturnType<typeof resolveBattle>, iAmAttacker: boolean, otherName: string) {
  const S = state(); const me = S.kingdom!;
  const myId = iAmAttacker ? att.armyId : `duel-def-${c.id}`;
  S.battles.unshift({
    id: `duel-${c.id}-${att.armyId}`, occurred_at: internals.iso(Date.now()), winner: r.winner, ratio: Number.isFinite(r.ratio) ? Math.min(r.ratio, 999) : 999,
    terrain: 'tekislik', weather: 'ochiq', loot: {}, wall_hp_before: 0, wall_hp_after: 0,
    attacker_kingdom_id: iAmAttacker ? me.id : 'friend', attacker_name: iAmAttacker ? me.name : otherName,
    defender_kingdom_id: iAmAttacker ? 'friend' : me.id, defender_name: iAmAttacker ? otherName : me.name, city_name: `${iAmAttacker ? otherName : me.name} (duel)`,
    attacker_culture: att.culture, defender_culture: c.from.culture,
    records: r.losses.map(l => ({ side: l.armyId === att.armyId ? 'attacker' : 'defender', unit: l.unitKey, before: l.before, lost: l.lost, kingdom: l.armyId === myId ? me.id : 'friend' })),
  });
}

/** 1) Chaqiruv kodi */
export function createChallenge(b: { units: Record<string, number> }) {
  internals.advance();
  const S = state(); const k = S.kingdom!;
  const units = pickUnits(b.units);
  const cmd = S.commanders[0];
  const snap: Snapshot = { units, xp: S.garrisonXp, smithy: internals.lvl('temirchilik'), gskill: cmd?.skill ?? 0 };
  const c: Challenge = { t: 'c', id: internals.uid('ch'), from: { pid: S.playerId, name: k.name, culture: k.culture, ruler: k.rulerName }, snap, at: Date.now() };
  S.challenges[c.id] = { ...snap, createdAt: c.at };
  internals.save();
  return { code: encode(c), id: c.id };
}

/** 2) Chaqiruvni qabul qilib hujum qilish */
export function acceptChallenge(b: { code: string; units: Record<string, number> }) {
  internals.advance();
  const S = state(); const k = S.kingdom!;
  const c = decode<Challenge>(b.code);
  if (c.t !== 'c') throw new LocalError(400, 'bad_code', 'Bu chaqiruv kodi emas (natija kodi bo‘lsa “Natijani kiritish” ni bosing)');
  if (c.from.pid === S.playerId) throw new LocalError(400, 'own_code', 'Bu o‘zingizning kodingiz. Uni do‘stingizga yuboring');
  const key = `acc:${c.id}`;
  if (S.usedCodes.includes(key)) throw new LocalError(409, 'used', 'Bu chaqiruvga allaqachon javob bergansiz');
  const units = pickUnits(b.units);
  const att = internals.myBattleArmy(`duel-att-${S.playerId}-${c.id}`, units, S.garrisonXp, S.commanders[0]?.id ?? null);
  const r = resolveBattle(input(c, att));
  const won = r.winner === 'attacker';
  for (const l of r.losses) if (l.armyId === att.armyId) S.garrison[l.unitKey] = Math.max(0, (S.garrison[l.unitKey] ?? 0) - l.lost);
  S.garrisonXp += xpGain(won);
  const enemyLost = r.losses.filter(l => l.armyId !== att.armyId).reduce((s, l) => s + l.lost, 0);
  const myLost = r.losses.filter(l => l.armyId === att.armyId).reduce((s, l) => s + l.lost, 0);
  const reward = won ? 3 * enemyLost : 0;
  if (reward) internals.credit({ gold: reward });
  record(c, att, r, true, c.from.name);
  S.usedCodes.push(key);
  internals.notify('jang', won ? `Duelda g‘alaba: ${c.from.name}` : `Duelda mag‘lubiyat: ${c.from.name}`, `Siz ${myLost}, raqib ${enemyLost} askar yo‘qotdi${reward ? `, mukofot ${reward} oltin` : ''}. Natija kodini ${c.from.name} ga yuboring.`);
  internals.save();
  const res: Result = { t: 'r', cid: c.id, to: c.from.pid, from: { pid: S.playerId, name: k.name, culture: k.culture }, att, at: Date.now() };
  return { winner: r.winner, won, ratio: r.ratio, myLost, enemyLost, reward, resultCode: encode(res), enemy: c.from, battle: S.battles[0] };
}

/** 3) Natija kodini qo'llash (chaqiruv egasi) */
export function applyResult(b: { code: string }) {
  internals.advance();
  const S = state();
  const res = decode<Result>(b.code);
  if (res.t !== 'r') throw new LocalError(400, 'bad_code', 'Bu natija kodi emas');
  if (res.to !== S.playerId) throw new LocalError(400, 'not_yours', 'Bu natija boshqa o‘yinchining chaqiruviga tegishli');
  const snap = S.challenges[res.cid];
  if (!snap) throw new LocalError(404, 'no_challenge', 'Bunday chaqiruv topilmadi');
  const key = `res:${res.cid}:${res.from.pid}`;
  if (S.usedCodes.includes(key)) throw new LocalError(409, 'used', 'Bu natija allaqachon qo‘llangan');
  const k = S.kingdom!;
  const c: Challenge = { t: 'c', id: res.cid, from: { pid: S.playerId, name: k.name, culture: k.culture, ruler: k.rulerName },
    snap: { units: snap.units, xp: snap.xp, smithy: snap.smithy, gskill: snap.gskill }, at: snap.createdAt };
  const r = resolveBattle(input(c, res.att)); // xuddi o'sha kirish -> xuddi o'sha natija
  const defId = `duel-def-${c.id}`;
  let myLost = 0;
  for (const l of r.losses) if (l.armyId === defId) { const lost = Math.min(l.lost, S.garrison[l.unitKey] ?? 0); S.garrison[l.unitKey] = (S.garrison[l.unitKey] ?? 0) - lost; myLost += lost; }
  const iWon = r.winner === 'defender';
  S.garrisonXp += xpGain(iWon);
  const enemyLost = r.losses.filter(l => l.armyId !== defId).reduce((s, l) => s + l.lost, 0);
  const reward = iWon ? 3 * enemyLost : 0;
  if (reward) internals.credit({ gold: reward });
  record(c, res.att, r, false, res.from.name);
  S.usedCodes.push(key);
  internals.notify('jang', iWon ? `${res.from.name} hujumini qaytardingiz!` : `${res.from.name} duelda g‘olib chiqdi`, `Siz ${myLost}, raqib ${enemyLost} askar yo‘qotdi${reward ? `, mukofot ${reward} oltin` : ''}.`);
  internals.save();
  return { winner: r.winner, won: iWon, ratio: r.ratio, myLost, enemyLost, reward, enemy: res.from, battle: S.battles[0] };
}
