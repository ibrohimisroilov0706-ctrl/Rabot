// apps/server/src/services/names.ts
// Millat an'anasidan yasalgan fantastik ismlar (tarixiy shaxslar nomi ishlatilmaydi, 03 Millatlar tabi).

import { rng, type Culture } from '@qirolliklar/game-rules';

const NAMES: Record<Culture, { m: string[]; f: string[] }> = {
  rus: { m: ['Svetomir', 'Yaropolk', 'Dobrogost', 'Vseslav', 'Ratibor', 'Miroslav', 'Bogumil', 'Radim'], f: ['Lada', 'Zlata', 'Mirava', 'Dobrava', 'Snezhana', 'Vesna'] },
  ingliz: { m: ['Aldwin', 'Edric', 'Osric', 'Wilmot', 'Godfrey', 'Alaric', 'Bertram', 'Cedric'], f: ['Elswyth', 'Maud', 'Rowena', 'Edith', 'Isolde', 'Avelina'] },
  usmonli: { m: ['Kayalp', 'Tolunay', 'Batuhan', 'Erdem', 'Oguzhan', 'Alpay', 'Korkut', 'Tugrul'], f: ['Gulbahar', 'Nilufer', 'Aydan', 'Sevilay', 'Ayla', 'Melek'] },
  temuriy: { m: ['Bahodir', 'Jahongir', 'Ulugbek', 'Sherzod', 'Iskandar', 'Davron', 'Farhod', 'Jasur'], f: ['Gulnora', 'Mohinur', 'Dilorom', 'Shahzoda', 'Nodira', 'Zarnigor'] },
  mogul: { m: ['Batbayar', 'Temuge', 'Ochirbat', 'Sukhbaatar', 'Ganzorig', 'Altangerel', 'Bayarsaikhan', 'Erdene'], f: ['Altantsetseg', 'Solongo', 'Narantuya', 'Oyuun', 'Saran', 'Enkhjin'] },
};

export function pickName(culture: Culture, seed: string, female = false): string {
  const list = female ? NAMES[culture].f : NAMES[culture].m;
  return list[Math.floor(rng(seed)() * list.length)]!;
}
