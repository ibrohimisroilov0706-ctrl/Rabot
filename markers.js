import * as THREE from 'three';
import { REGIONS, latLonToVector3 } from './regions.js';

const AMBER = 0xffb454;
const WHITE = 0xffffff;

// Planeta ustidagi hudud belgilari (nuqta + puls halqasi + ko'rinmas bosish zonasi)
export function createMarkers(parent) {
  const items = [];
  const hitMeshes = [];

  const dotGeo = new THREE.SphereGeometry(0.014, 16, 16);
  const ringGeo = new THREE.RingGeometry(0.02, 0.026, 48);
  const hitGeo = new THREE.SphereGeometry(0.055, 8, 8);

  REGIONS.forEach((region, i) => {
    const pos = latLonToVector3(region.lat, region.lon, 1.0);

    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().multiplyScalar(2)); // +Z tashqariga qaraydi

    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: AMBER }));
    dot.position.z = 0.004;

    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.z = 0.002;

    const pulse = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    pulse.position.z = 0.002;

    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.regionId = region.id;

    g.add(dot, ring, pulse, hit);
    parent.add(g);
    hitMeshes.push(hit);

    items.push({ region, pos, group: g, dot, ring, pulse, phase: i * 0.37, label: null });
  });

  let activeId = null;

  function update(time) {
    items.forEach((it) => {
      const active = it.region.id === activeId;
      const p = (time * 0.7 + it.phase) % 1;
      const s = 1 + p * 2.2;
      it.pulse.scale.set(s, s, 1);
      it.pulse.material.opacity = (1 - p) * 0.55;
      const k = active ? 1.5 : 1;
      it.dot.scale.setScalar(k);
      it.ring.scale.setScalar(k);
    });
  }

  function setActive(id) {
    activeId = id;
    items.forEach((it) => {
      const on = it.region.id === id;
      const c = on ? WHITE : AMBER;
      it.dot.material.color.setHex(c);
      it.ring.material.color.setHex(c);
      it.pulse.material.color.setHex(c);
    });
  }

  return { items, hitMeshes, update, setActive };
}
