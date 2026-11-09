import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { REGIONS } from './regions.js';
import { createPlanet, createStars } from './planet.js';
import { createMarkers } from './markers.js';
import { createGameplay } from './gameplay.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const loader = $('loader');
const bar = $('bar');
const loaderText = $('loaderText');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  loaderText.textContent = "Brauzeringiz WebGL'ni qo'llab-quvvatlamaydi.";
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

/* ---------- Yorug'lik ---------- */
const sun = new THREE.DirectionalLight(0xfff1dd, 2.3);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x6f8fd0, 0x1a1030, 0.55));

/* ---------- Kamera va boshqaruv ---------- */
const MIN_DIST = 1.5;
const HOME_DIR = new THREE.Vector3(0.0, 0.35, 1.0).normalize();

function homeDistance() {
  const aspect = camera.aspect;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = 1.45 / (tanHalf * Math.min(aspect, 1));
  return Math.max(4.4, fit);
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.zoomSpeed = 0.8;
controls.autoRotateSpeed = 0.5;
controls.minDistance = MIN_DIST;

let autoOn = !reduceMotion;
let idleTimer = null;
controls.autoRotate = autoOn;

/* ---------- Resize ---------- */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  controls.maxDistance = homeDistance() * 1.5;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();
camera.position.copy(HOME_DIR).multiplyScalar(homeDistance());

/* ---------- Fon ---------- */
scene.add(createStars());

/* ---------- Uchish animatsiyasi (hududga) ---------- */
let fly = null;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function flyTo(target, dist) {
  fly = {
    fromDir: camera.position.clone().normalize(),
    toDir: target.clone().normalize(),
    fromDist: camera.position.length(),
    toDist: THREE.MathUtils.clamp(dist, MIN_DIST, controls.maxDistance),
    t: 0,
    dur: reduceMotion ? 0.01 : 1.3
  };
  controls.autoRotate = false;
}

const qFull = new THREE.Quaternion();
const qStep = new THREE.Quaternion();
const qId = new THREE.Quaternion();

function updateFly(dt) {
  if (!fly) return;
  fly.t = Math.min(1, fly.t + dt / fly.dur);
  const k = easeInOut(fly.t);
  qFull.setFromUnitVectors(fly.fromDir, fly.toDir);
  qStep.copy(qId).slerp(qFull, k);
  const dir = fly.fromDir.clone().applyQuaternion(qStep);
  const dist = THREE.MathUtils.lerp(fly.fromDist, fly.toDist, k);
  camera.position.copy(dir.multiplyScalar(dist));
  if (fly.t >= 1) fly = null;
}

/* ---------- Panel va ro'yxat ---------- */
const panel = $('panel');
const hint = $('hint');
const chipsEl = $('chips');
let markers = null;
let planetMesh = null;
let gameplay = null;
let activeId = null;

const chipButtons = new Map();

REGIONS.forEach((r) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = r.name;
  b.addEventListener('click', () => {
    if (gameplay && gameplay.mode === 'life') {
      const phi = THREE.MathUtils.degToRad(90 - r.lat);
      const theta = THREE.MathUtils.degToRad(r.lon + 180);
      const point = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      );
      gameplay.handleSurfaceClick(point);
    } else {
      openRegion(r.id);
    }
  });
  chipsEl.appendChild(b);
  chipButtons.set(r.id, b);
});

function openRegion(id) {
  const region = REGIONS.find((r) => r.id === id);
  if (!region || !markers) return;

  activeId = id;

  if (gameplay) {
    gameplay.selectLatLon(region.lat, region.lon, region.name);
  }

  $('pKind').textContent = region.kind;
  $('pName').textContent = region.name;
  $('pDesc').textContent = region.desc;

  const facts = $('pFacts');
  facts.innerHTML = '';

  region.facts.forEach(([k, v]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    row.append(dt, dd);
    facts.appendChild(row);
  });

  panel.classList.add('open');
  markers.setActive(id);

  chipButtons.forEach((btn, key) => {
    btn.classList.toggle('active', key === id);
  });

  markers.items.forEach((it) => {
    it.label.classList.toggle('active', it.region.id === id);
  });

  hint.classList.add('hide');

  const item = markers.items.find((it) => it.region.id === id);
  const isNarrow = window.innerWidth < 700;
  flyTo(item.pos, isNarrow ? 3.1 : 2.7);
}

function closeRegion() {
  activeId = null;
  panel.classList.remove('open');

  if (markers) markers.setActive(null);

  chipButtons.forEach((btn) => btn.classList.remove('active'));

  if (markers) {
    markers.items.forEach((it) => it.label.classList.remove('active'));
  }

  scheduleAutoRotate(1500);
}

$('panelClose').addEventListener('click', closeRegion);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (!gameplay || gameplay.mode !== 'life')) {
    closeRegion();
  }
});

/* ---------- Tugmalar ---------- */
const btnAuto = $('btnAuto');

btnAuto.setAttribute('aria-pressed', String(autoOn));

btnAuto.addEventListener('click', () => {
  autoOn = !autoOn;
  btnAuto.setAttribute('aria-pressed', String(autoOn));
  clearTimeout(idleTimer);
  controls.autoRotate = autoOn && !activeId && controls.enabled;
});

$('btnReset').addEventListener('click', () => {
  if (gameplay && gameplay.mode === 'life') {
    $('rabot-global').click();
  }

  closeRegion();
  flyTo(HOME_DIR, homeDistance());
});

function scheduleAutoRotate(delay = 3500) {
  clearTimeout(idleTimer);

  if (!autoOn || activeId || !controls.enabled) return;

  idleTimer = setTimeout(() => {
    if (!fly && !activeId && controls.enabled) {
      controls.autoRotate = true;
    }
  }, delay);
}

controls.addEventListener('start', () => {
  fly = null;
  controls.autoRotate = false;
  clearTimeout(idleTimer);
  hint.classList.add('hide');
});

controls.addEventListener('end', () => scheduleAutoRotate());

/* ---------- Bosish (tap/click) bilan tanlash ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

let downInfo = null;
let pointerCount = 0;
let multiTouch = false;

canvas.addEventListener('pointerdown', (e) => {
  pointerCount++;

  if (pointerCount > 1) multiTouch = true;

  downInfo = {
    x: e.clientX,
    y: e.clientY,
    t: performance.now()
  };
});

canvas.addEventListener('pointerup', (e) => {
  pointerCount = Math.max(0, pointerCount - 1);

  const info = downInfo;
  const wasMulti = multiTouch;

  if (pointerCount === 0) {
    multiTouch = false;
    downInfo = null;
  }

  if (!info || wasMulti) return;

  const moved = Math.hypot(e.clientX - info.x, e.clientY - info.y);

  if (moved > 6 || performance.now() - info.t > 600) return;

  pick(e.clientX, e.clientY);
});

canvas.addEventListener('pointercancel', () => {
  pointerCount = 0;
  multiTouch = false;
  downInfo = null;
});

function pick(x, y) {
  if (!markers || !planetMesh) return;

  const rect = canvas.getBoundingClientRect();

  ndc.set(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(ndc, camera);

  const hits = raycaster.intersectObjects(
    [planetMesh, ...markers.hitMeshes],
    false
  );

  if (!hits.length) return;

  if (hits[0].object.userData.regionId) {
    if (gameplay && gameplay.mode === 'life') {
      gameplay.handleSurfaceClick(hits[0].point);
    } else {
      openRegion(hits[0].object.userData.regionId);
    }
  } else if (hits[0].object === planetMesh && gameplay) {
    gameplay.handleSurfaceClick(hits[0].point);
  }
}

/* ---------- Belgilar (HTML yorliqlar) ---------- */
const labelsEl = $('labels');
const tmp = new THREE.Vector3();

function buildLabels() {
  markers.items.forEach((it) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'label';
    el.textContent = it.region.name;

    el.addEventListener('click', () => {
      if (gameplay && gameplay.mode === 'life') {
        const phi = THREE.MathUtils.degToRad(90 - it.region.lat);
        const theta = THREE.MathUtils.degToRad(it.region.lon + 180);

        const point = new THREE.Vector3(
          -Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta)
        );

        gameplay.handleSurfaceClick(point);
      } else {
        openRegion(it.region.id);
      }
    });

    labelsEl.appendChild(el);
    it.label = el;
  });
}

function updateLabels() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  markers.items.forEach((it) => {
    const facing = it.pos.dot(camera.position) - 1;
    const el = it.label;

    if (facing < 0.06) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      return;
    }

    tmp.copy(it.pos).project(camera);

    const x = (tmp.x * 0.5 + 0.5) * w;
    const y = (-tmp.y * 0.5 + 0.5) * h;

    el.style.transform =
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 14px)`;

    el.style.opacity = String(Math.min(1, facing * 5));
    el.style.pointerEvents = facing > 0.2 ? 'auto' : 'none';
  });
}

/* ---------- Ishga tushirish ---------- */
const clock = new THREE.Clock();
const yAxis = new THREE.Vector3(0, 1, 0);
let clouds = null;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (controls.enabled) updateFly(dt);

  const d = camera.position.length();
  const k = THREE.MathUtils.clamp(
    (d - MIN_DIST) / (homeDistance() - MIN_DIST),
    0,
    1
  );

  controls.rotateSpeed = THREE.MathUtils.lerp(0.25, 0.7, k);

  if (controls.enabled) controls.update();

  if (gameplay) gameplay.update(dt);

  sun.position
    .copy(camera.position)
    .normalize()
    .applyAxisAngle(yAxis, 0.7)
    .multiplyScalar(10);

  sun.position.y += 3;

  if (clouds && !reduceMotion) {
    clouds.rotation.y += dt * 0.012;
  }

  if (markers) {
    markers.update(t);
    updateLabels();
  }

  renderer.render(scene, camera);
}

async function start() {
  const planet = await createPlanet((p) => {
    bar.style.width = `${Math.round(p * 100)}%`;
  });

  scene.add(planet.group);

  planetMesh = planet.planet;
  clouds = planet.clouds;

  markers = createMarkers(scene);
  buildLabels();

  gameplay = createGameplay({
    scene,
    camera,
    renderer,
    controls
  });

  bar.style.width = '100%';
  loader.classList.add('done');

  animate();
}

start().catch((err) => {
  console.error(err);
  loaderText.textContent = "Xatolik yuz berdi. Sahifani yangilang.";
});

