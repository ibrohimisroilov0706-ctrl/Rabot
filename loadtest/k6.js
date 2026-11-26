// loadtest/k6.js — 16-hujjat: masshtablash. Faqat STAGING serverda (DEV_AUTH=true) ishlating, productionda emas!
// Ishga tushirish: k6 run -e BASE=https://staging.example.com -e VUS=1000 loadtest/k6.js
// Bosqichlar: 1 000 -> 5 000 -> 10 000 virtual o'yinchi. Maqsad: p95 < 300 ms, xato < 0.5%, engine lag < 2 s (/metrics).
import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:8080';
const TARGET = Number(__ENV.VUS || 1000);
export const options = {
  scenarios: {
    players: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: Math.round(TARGET * 0.1) },
        { duration: '5m', target: TARGET },
        { duration: '10m', target: TARGET },
        { duration: '2m', target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.005'], http_req_duration: ['p(95)<300'] },
};
const CULTURES = ['rus', 'ingliz', 'usmonli', 'temuriy', 'mogul'];
const json = { headers: { 'content-type': 'application/json' } };

export function setup() { return {}; }

export default function () {
  const id = 10_000_000 + __VU * 1000 + (__ITER % 1000);
  const login = http.post(`${BASE}/api/auth/dev`, JSON.stringify({ telegramId: 10_000_000 + __VU, name: `vu${__VU}` }), json);
  check(login, { 'login 200': r => r.status === 200 });
  const token = login.json('token');
  const H = { headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } };
  const me = http.get(`${BASE}/api/me`, H);
  if (me.json('kingdom') === null) {
    http.post(`${BASE}/api/kingdom`, JSON.stringify({ name: `K${__VU}x${id % 997}`, culture: CULTURES[__VU % 5], cityName: `Shahar ${__VU}` }), H);
  }
  // Odatiy sessiya: 3-10 daqiqa, har 5-15 soniyada bir harakat
  ws.connect(`${BASE.replace('http', 'ws')}/ws?token=${token}`, {}, socket => {
    socket.setTimeout(() => socket.close(), 30_000);
  });
  for (let i = 0; i < 6; i++) {
    const r = http.get(`${BASE}/api/me`, H);
    check(r, { 'me 200': x => x.status === 200 });
    if (i % 3 === 0) http.get(`${BASE}/api/world?x0=0&y0=0&x1=63&y1=63`, H);
    if (i === 2) http.post(`${BASE}/api/army/recruit`, JSON.stringify({ unitKey: 'piyoda', count: 1 }), H);
    sleep(5 + Math.random() * 10);
  }
}
