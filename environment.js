import * as THREE from 'three';

// RABOT 0.3 — streamed vegetation system

const CHUNK_SIZE = 2;
const CHUNK_RADIUS = 2;

// 2° li 16 200 ta hududning taxminan 25% quruqlik
// deb hisoblangan boshlang'ich zichlik.
const TREES_PER_CHUNK = 25;
const PLANTS_PER_CHUNK = 250;

const TREE_CAPACITY = 625;
const PLANT_CAPACITY = 6250;

function hash(a, b) {
  let x = Math.imul(a + 374761393, 668265263);
  x ^= Math.imul(b + 1274126177, 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return (x ^ (x >>> 16)) >>> 0;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toVector(lat, lon) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

export function createEnvironment(scene, landCanvas) {
  const ctx = landCanvas.getContext('2d');
  const pixels = ctx.getImageData(
    0, 0, landCanvas.width, landCanvas.height
  ).data;

  const W = landCanvas.width;
  const H = landCanvas.height;

  function isLand(lat, lon) {
    const u = ((lon + 180) / 360 + 1) % 1;
    const v = THREE.MathUtils.clamp((90 - lat) / 180, 0, 0.99999);

    const x = Math.floor(u * W);
    const y = Math.floor(v * H);

    return pixels[(y * W + x) * 4] > 5;
  }

  // Daraxt
  const trunkGeo = new THREE.CylinderGeometry(
    0.0015, 0.0022, 0.022, 5
  );
  trunkGeo.translate(0, 0.011, 0);

  const crownGeo = new THREE.ConeGeometry(
    0.012, 0.041, 6
  );
  crownGeo.translate(0, 0.039, 0);

  // Kichik o'simlik
  const plantGeo = new THREE.ConeGeometry(
    0.0032, 0.012, 4
  );
  plantGeo.translate(0, 0.006, 0);

  const trunkMat = new THREE.MeshLambertMaterial({
    color: 0x76502e
  });

  const crownMat = new THREE.MeshLambertMaterial({
    color: 0x2f7842
  });

  const plantMat = new THREE.MeshLambertMaterial({
    color: 0x75a947
  });

  const trunks = new THREE.InstancedMesh(
    trunkGeo, trunkMat, TREE_CAPACITY
  );

  const crowns = new THREE.InstancedMesh(
    crownGeo, crownMat, TREE_CAPACITY
  );

  const plants = new THREE.InstancedMesh(
    plantGeo, plantMat, PLANT_CAPACITY
  );

  scene.add(trunks, crowns, plants);

  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);

  let lastKey = '';
  let treeCount = 0;
  let plantCount = 0;

  function putTree(index, lat, lon, scale, rand) {
    const normal = toVector(lat, lon);

    dummy.position.copy(normal);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.rotateY(rand() * Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    trunks.setMatrixAt(index, dummy.matrix);
    crowns.setMatrixAt(index, dummy.matrix);
  }

  function putPlant(index, lat, lon, scale, rand) {
    const normal = toVector(lat, lon);

    dummy.position.copy(normal);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.rotateY(rand() * Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();

    plants.setMatrixAt(index, dummy.matrix);
  }

  function rebuild(direction) {
    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))
    );

    const lon =
      THREE.MathUtils.radToDeg(
        Math.atan2(direction.z, -direction.x)
      ) - 180;

    const centerX = Math.floor((lon + 180) / CHUNK_SIZE);
    const centerY = Math.floor((90 - lat) / CHUNK_SIZE);

    let ti = 0;
    let pi = 0;

    for (let oy = -CHUNK_RADIUS; oy <= CHUNK_RADIUS; oy++) {
      const cy = centerY + oy;

      if (cy < 0 || cy >= 90) continue;

      for (let ox = -CHUNK_RADIUS; ox <= CHUNK_RADIUS; ox++) {
        const cx = (
          (centerX + ox + 180) % 180 + 180
        ) % 180;

        const rand = random(hash(cx, cy));

        const north = 90 - cy * CHUNK_SIZE;
        const west = cx * CHUNK_SIZE - 180;

        let made = 0;
        let attempts = 0;

        while (
          made < TREES_PER_CHUNK &&
          attempts < TREES_PER_CHUNK * 20
        ) {
          attempts++;

          const pLat = north - rand() * CHUNK_SIZE;
          const pLon = west + rand() * CHUNK_SIZE;

          if (!isLand(pLat, pLon)) continue;

          putTree(
            ti,
            pLat,
            pLon,
            0.75 + rand() * 0.55,
            rand
          );

          ti++;
          made++;
        }

        made = 0;
        attempts = 0;

        while (
          made < PLANTS_PER_CHUNK &&
          attempts < PLANTS_PER_CHUNK * 12
        ) {
          attempts++;

          const pLat = north - rand() * CHUNK_SIZE;
          const pLon = west + rand() * CHUNK_SIZE;

          if (!isLand(pLat, pLon)) continue;

          putPlant(
            pi,
            pLat,
            pLon,
            0.65 + rand() * 0.8,
            rand
          );

          pi++;
          made++;
        }
      }
    }

    trunks.count = ti;
    crowns.count = ti;
    plants.count = pi;

    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    plants.instanceMatrix.needsUpdate = true;

    treeCount = ti;
    plantCount = pi;

    trunks.computeBoundingSphere();
    crowns.computeBoundingSphere();
    plants.computeBoundingSphere();

    lastKey = `${centerX}:${centerY}`;
  }

  function update(direction, active) {
    if (!active || !direction) {
      trunks.visible = false;
      crowns.visible = false;
      plants.visible = false;
      return;
    }

    trunks.visible = true;
    crowns.visible = true;
    plants.visible = true;

    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))
    );

    const lon =
      THREE.MathUtils.radToDeg(
        Math.atan2(direction.z, -direction.x)
      ) - 180;

    const key =
      `${Math.floor((lon + 180) / CHUNK_SIZE)}:` +
      `${Math.floor((90 - lat) / CHUNK_SIZE)}`;

    if (key !== lastKey) rebuild(direction);
  }

  return {
    update,

    get loadedTrees() {
      return treeCount;
    },

    get loadedPlants() {
      return plantCount;
    }
  };
}
