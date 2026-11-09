import * as THREE from 'three';

// Kenglik/uzunlik (daraja) -> sfera ustidagi nuqta.
// Three.js SphereGeometry va tekis (equirectangular) tekstura bilan mos keladi.
export function latLonToVector3(lat, lon, radius = 1) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Hududlar. Keyinchalik shu ro'yxatni kengaytirasiz.
//  boost  — shu joyda quruqlik/tog' balandligi (kattaroq = baland)
//  spread — ta'sir doirasi (radian)
//  wet    — namlik (manfiy = cho'l, musbat = o'rmon)
//  warm   — harorat (manfiy = sovuq)
export const REGIONS = [
  {
    id: 'markaz',
    name: 'Rabot Markazi',
    kind: 'Markaziy vodiy',
    lat: 5, lon: 10,
    boost: 0.27, spread: 0.2, wet: 0.12, warm: 0,
    desc: "Planetaning yuragi. Karvon yo'llari shu yerda kesishadi, yarmarka kunlari vodiy tunda ham yorug' bo'ladi.",
    facts: [['Iqlim', 'Mo\'tadil'], ['Balandlik', '420 m'], ['Mashhur joy', 'Katta rabot']]
  },
  {
    id: 'cho',
    name: "Oltin Cho'l",
    kind: "Cho'l",
    lat: 22, lon: 70,
    boost: 0.26, spread: 0.22, wet: -0.4, warm: 0.2,
    desc: "Kunduzi oltindek yaltiraydigan qumli tekislik. Kechasi harorat tushadi va osmon yulduzlarga to'ladi.",
    facts: [['Iqlim', 'Quruq, issiq'], ['Balandlik', '310 m'], ['Mashhur joy', 'Sarob vohasi']]
  },
  {
    id: 'orman',
    name: "Zumrad O'rmoni",
    kind: "Tropik o'rmon",
    lat: -18, lon: -35,
    boost: 0.27, spread: 0.2, wet: 0.45, warm: 0.15,
    desc: "Zich va nam o'rmon. Daryolar uni son-sanoqsiz yashil yo'laklarga bo'lib yuboradi.",
    facts: [['Iqlim', 'Nam, iliq'], ['Balandlik', '180 m'], ['Mashhur joy', 'Ming ildiz']]
  },
  {
    id: 'muz',
    name: 'Muz Tojlari',
    kind: "Qutb tog'lari",
    lat: 62, lon: -60,
    boost: 0.36, spread: 0.2, wet: 0.05, warm: -0.35,
    desc: "Shimoliy qutb yaqinidagi qorli cho'qqilar. Quyosh bu yerda past yuradi va muzliklar ko'k tusda yonadi.",
    facts: [['Iqlim', 'Qahraton'], ['Balandlik', '4 900 m'], ['Mashhur joy', 'Oq dovon']]
  },
  {
    id: 'port',
    name: 'Sokin Port',
    kind: 'Dengiz porti',
    lat: -5, lon: 120,
    boost: 0.2, spread: 0.16, wet: 0.1, warm: 0.05,
    desc: "To'lqinlar tinch, kemalar ko'p. Dengiz yo'lidagi karvonlar uchun eng ishonchli panoh.",
    facts: [['Iqlim', 'Dengiz iqlimi'], ['Balandlik', '12 m'], ['Mashhur joy', 'Chiroq minorasi']]
  },
  {
    id: 'bulut',
    name: "Bulut Cho'qqisi",
    kind: "Baland tog'",
    lat: 38, lon: -110,
    boost: 0.4, spread: 0.18, wet: 0.0, warm: -0.05,
    desc: "Bulutlardan baland ko'tarilgan tog' tizmasi. Yo'l yo'lovchini aylanma pog'onalar bilan tepaga olib chiqadi.",
    facts: [['Iqlim', 'Sovuq, shamolli'], ['Balandlik', '6 200 m'], ['Mashhur joy', 'Osmon ko\'prigi']]
  },
  {
    id: 'kol',
    name: "Kumush Ko'llar",
    kind: "Ko'llar o'lkasi",
    lat: -42, lon: 40,
    boost: 0.23, spread: 0.2, wet: 0.3, warm: -0.05,
    desc: "Tinch ko'llar zanjiri. Suv shu qadar tiniqki, qirg'oqdagi daraxtlar ikki marta ko'rinadi.",
    facts: [['Iqlim', 'Salqin, nam'], ['Balandlik', '260 m'], ['Mashhur joy', 'Oyna ko\'li']]
  },
  {
    id: 'yaylov',
    name: 'Shamol Yaylovi',
    kind: 'Keng yaylov',
    lat: -30, lon: -130,
    boost: 0.25, spread: 0.22, wet: 0.0, warm: 0.05,
    desc: "Cheksiz yashil tekislik. Shamol o'tlarni to'lqin kabi yuritadi va chorvadorlar uni bir kunda kesib o'ta olmaydi.",
    facts: [['Iqlim', 'Shamolli'], ['Balandlik', '540 m'], ['Mashhur joy', 'Yolg\'iz tosh']]
  }
];
