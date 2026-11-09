import * as THREE from 'three';

// RABOT 0.2 gameplay foundation:
// global view, inspection and click-to-move life view.

export function createGameplay({ scene, camera, renderer, controls }) {
  const initialCamera = camera.position.clone();
  const initialFov = camera.fov;
  const initialNear = camera.near;
  const initialMinDistance = controls.minDistance;
  const initialMaxDistance = controls.maxDistance;

  const state = {
    mode: 'global',
    selected: new THREE.Vector3(0, 0, 1),
    player: null,
    playerDirection: null,
    destination: null,
    forward: new THREE.Vector3(0, 0, -1),
    moving: false,
    walkSpeed: 0.045,
    keys: new Set(),
    selectedName: 'Tanlangan hudud'
  };

  const style = document.createElement('style');

  style.textContent = `
    #rabot-game-ui {
      position: fixed;
      inset: 0;
      z-index: 5;
      pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
      color: #f4f7fb;
    }

    #rabot-game-top {
      position: absolute;
      left: 16px;
      top: 88px;
      display: flex;
      gap: 8px;
      pointer-events: auto;
      flex-wrap: wrap;
      max-width: calc(100vw - 32px);
    }

    .rabot-game-btn {
      border: 1px solid rgba(190,210,240,.22);
      border-radius: 12px;
      padding: 10px 14px;
      background: rgba(8,15,29,.84);
      color: #f4f7fb;
      font-weight: 650;
      font-size: 13px;
      backdrop-filter: blur(12px);
      cursor: pointer;
    }

    .rabot-game-btn.primary {
      background: #f2b45f;
      color: #211506;
      border-color: #f2b45f;
    }

    .rabot-game-btn:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    #rabot-game-card {
      position: absolute;
      left: 16px;
      bottom: 92px;
      width: min(340px, calc(100vw - 32px));
      padding: 16px;
      border: 1px solid rgba(190,210,240,.2);
      border-radius: 16px;
      background: rgba(8,15,29,.88);
      backdrop-filter: blur(14px);
      pointer-events: auto;
      display: none;
      box-shadow: 0 14px 50px rgba(0,0,0,.25);
    }

    #rabot-game-card.show {
      display: block;
    }

    #rabot-game-card h3 {
      font-size: 16px;
      margin: 0 0 6px;
    }

    #rabot-game-card p {
      font-size: 12px;
      line-height: 1.5;
      color: #b8c5d8;
      margin: 0 0 12px;
    }

    #rabot-game-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    #rabot-game-status {
      position: absolute;
      left: 50%;
      top: 16px;
      transform: translateX(-50%);
      max-width: calc(100vw - 32px);
      padding: 9px 13px;
      border: 1px solid rgba(190,210,240,.18);
      border-radius: 999px;
      background: rgba(8,15,29,.76);
      font-size: 12px;
      color: #dce7f6;
      text-align: center;
      backdrop-filter: blur(10px);
    }

    @media(max-width:700px) {
      #rabot-game-top {
        top: 76px;
        left: 10px;
        gap: 6px;
      }

      .rabot-game-btn {
        padding: 9px 11px;
        font-size: 12px;
      }

      #rabot-game-card {
        left: 10px;
        bottom: 88px;
        width: calc(100vw - 20px);
      }

      #rabot-game-status {
        top: 68px;
        font-size: 11px;
      }
    }
  `;

  document.head.appendChild(style);

  const ui = document.createElement('div');
  ui.id = 'rabot-game-ui';

  ui.innerHTML = `
    <div id="rabot-game-top">
      <button class="rabot-game-btn" id="rabot-global">
        🌍 Globus
      </button>

      <button class="rabot-game-btn" id="rabot-inspect">
        👁 Kuzatish
      </button>

      <button class="rabot-game-btn primary" id="rabot-enter">
        ▶ Hayotga kirish
      </button>
    </div>

    <div id="rabot-game-status">
      GLOBAL VIEW · Planetani erkin kuzating
    </div>

    <section id="rabot-game-card">
      <h3 id="rabot-selected-title">Hudud tanlandi</h3>

      <p id="rabot-selected-desc">
        Globusdagi istalgan joyni bosing.
        Bu joyni avatarsiz kuzatishingiz yoki shu hududdan
        o‘yinni boshlashingiz mumkin.
      </p>

      <div id="rabot-game-actions">
        <button class="rabot-game-btn" id="rabot-card-inspect">
          Hududni kuzatish
        </button>

        <button class="rabot-game-btn primary" id="rabot-card-enter">
          Shu yerda boshlash
        </button>
      </div>
    </section>
  `;

  document.body.appendChild(ui);

  const $ = (id) => document.getElementById(id);

  const status = $('rabot-game-status');
  const card = $('rabot-game-card');
  const selectedTitle = $('rabot-selected-title');
  const selectedDesc = $('rabot-selected-desc');

  function setStatus(message) {
    status.textContent = message;
  }

  function vectorToLatLon(vector) {
    const n = vector.clone().normalize();

    const lat = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(n.y, -1, 1))
    );

    let lon = THREE.MathUtils.radToDeg(
      Math.atan2(n.z, -n.x)
    ) - 180;

    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;

    return { lat, lon };
  }

  function updateSelectionCard(name) {
    const coords = vectorToLatLon(state.selected);

    selectedTitle.textContent = name || 'Tanlangan hudud';

    selectedDesc.textContent =
      'Koordinatalar: ' +
      coords.lat.toFixed(2) +
      '°, ' +
      coords.lon.toFixed(2) +
      '°. Bu hududni avatarsiz kuzatish yoki shu yerdan boshlash mumkin.';

    $('rabot-card-enter').textContent = state.player
      ? 'Shu manzilga yurish'
      : 'Shu yerda boshlash';

    card.classList.add('show');
  }

  function selectDirection(direction, name) {
    state.selected.copy(direction).normalize();
    state.selectedName = name || 'Tanlangan hudud';

    updateSelectionCard(state.selectedName);
  }

  function makeLimb(material, radius, length) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, length, 3, 7),
      material
    );

    mesh.castShadow = false;
    mesh.receiveShadow = false;

    return mesh;
  }

  /* ---------- Avatar yaratish ---------- */

  function createAvatar() {
    const avatar = new THREE.Group();

    const bodyMat = new THREE.MeshPhongMaterial({
      color: 0x3d9bd8,
      shininess: 24
    });

    const skinMat = new THREE.MeshPhongMaterial({
      color: 0xf0c49b
    });

    const pantsMat = new THREE.MeshPhongMaterial({
      color: 0x26364f
    });

    const shoeMat = new THREE.MeshPhongMaterial({
      color: 0x20232b
    });

    const torso = makeLimb(bodyMat, 0.0052, 0.012);
    torso.position.y = 0.022;
    avatar.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.0072, 14, 10),
      skinMat
    );

    head.position.y = 0.041;
    avatar.add(head);

    const leftArm = makeLimb(skinMat, 0.0025, 0.011);
    leftArm.position.set(-0.008, 0.023, 0);
    leftArm.rotation.z = -0.55;
    avatar.add(leftArm);

    const rightArm = makeLimb(skinMat, 0.0025, 0.011);
    rightArm.position.set(0.008, 0.023, 0);
    rightArm.rotation.z = 0.55;
    avatar.add(rightArm);

    const leftLeg = makeLimb(pantsMat, 0.003, 0.012);
    leftLeg.position.set(-0.0032, 0.008, 0);
    avatar.add(leftLeg);

    const rightLeg = makeLimb(pantsMat, 0.003, 0.012);
    rightLeg.position.set(0.0032, 0.008, 0);
    avatar.add(rightLeg);

    const leftShoe = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 8, 6),
      shoeMat
    );

    leftShoe.scale.set(1, 0.65, 1.45);
    leftShoe.position.set(-0.0032, 0.002, -0.0015);
    avatar.add(leftShoe);

    const rightShoe = leftShoe.clone();
    rightShoe.position.x = 0.0032;
    avatar.add(rightShoe);

    avatar.userData.limbs = {
      leftArm,
      rightArm,
      leftLeg,
      rightLeg
    };

    scene.add(avatar);

    return avatar;
  }

  /* ---------- Avatar yo'nalishi ---------- */

  function orientAvatar(direction, forward) {
    const up = direction.clone().normalize();

    const tangent = forward.clone().addScaledVector(
      up,
      -forward.dot(up)
    );

    if (tangent.lengthSq() < 1e-8) {
      tangent.set(0, 0, -1).addScaledVector(up, up.z);
    }

    tangent.normalize();

    const right = new THREE.Vector3()
      .crossVectors(tangent, up)
      .normalize();

    const back = tangent.clone().negate();

    const basis = new THREE.Matrix4().makeBasis(
      right,
      up,
      back
    );

    state.player.quaternion.setFromRotationMatrix(basis);
    state.forward.copy(tangent);
  }

  function setPlayerDirection(direction) {
    state.playerDirection.copy(direction).normalize();

    state.player.position
      .copy(state.playerDirection)
      .multiplyScalar(1.006);

    orientAvatar(state.playerDirection, state.forward);
  }

  /* ---------- Kamera ---------- */

  function updateCamera() {
    if (!state.player || state.mode !== 'life') return;

    const up = state.playerDirection.clone().normalize();
    const back = state.forward.clone().negate();

    camera.position
      .copy(up)
      .multiplyScalar(1.105)
      .addScaledVector(back, 0.055);

    camera.up.copy(up);

    const target = state.player.position.clone()
      .addScaledVector(up, 0.027);

    camera.lookAt(target);
  }

  /* ---------- Hayot rejimiga kirish ---------- */

  function enterLife() {
    if (!state.player) {
      state.player = createAvatar();

      state.playerDirection = state.selected.clone().normalize();

      const tangent = new THREE.Vector3(0, 0, -1);

      if (Math.abs(tangent.dot(state.playerDirection)) > 0.92) {
        tangent.set(1, 0, 0);
      }

      state.forward.copy(tangent)
        .addScaledVector(
          state.playerDirection,
          -tangent.dot(state.playerDirection)
        )
        .normalize();

      setPlayerDirection(state.playerDirection);
    } else {
      state.destination = state.selected.clone().normalize();
    }

    state.mode = 'life';
    state.player.visible = true;

    controls.enabled = false;
    controls.autoRotate = false;

    camera.near = 0.001;
    camera.fov = 58;
    camera.updateProjectionMatrix();

    card.classList.remove('show');

    setStatus(
      'LIFE VIEW · Yerga bosing — avatar tanlangan manzilga piyoda boradi'
    );

    $('rabot-enter').textContent = '● Hayot rejimi';
    $('rabot-inspect').textContent = '👁 Kuzatish';

    updateCamera();
  }

  /* ---------- Kuzatish rejimi ---------- */

  function inspectSelected() {
    state.mode = 'inspect';

    if (state.player) {
      state.player.visible = false;
    }

    controls.enabled = true;
    controls.autoRotate = false;
    controls.target.set(0, 0, 0);

    controls.minDistance = 1.025;

    camera.near = 0.001;

    camera.position
      .copy(state.selected)
      .multiplyScalar(1.42);

    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    controls.update();

    card.classList.remove('show');

    setStatus(
      'INSPECTION VIEW · Hududni avatarsiz tomosha qilyapsiz'
    );

    $('rabot-enter').textContent = '▶ Hayotga kirish';
  }

  /* ---------- Global ko'rinish ---------- */

  function globalView() {
    state.mode = 'global';
    state.destination = null;

    if (state.player) {
      state.player.visible = false;
    }

    controls.enabled = true;
    controls.target.set(0, 0, 0);

    controls.minDistance = initialMinDistance;
    controls.maxDistance = initialMaxDistance;

    camera.near = initialNear;
    camera.fov = initialFov;

    camera.position.copy(initialCamera);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    camera.updateProjectionMatrix();
    controls.update();

    setStatus('GLOBAL VIEW · Planetani erkin kuzating');

    $('rabot-enter').textContent = '▶ Hayotga kirish';
    $('rabot-inspect').textContent = '👁 Kuzatish';
  }

  /* ---------- Yerga bosish ---------- */

  function handleSurfaceClick(point) {
    const direction = point.clone().normalize();

    if (state.mode === 'life') {
      state.destination = direction;

      const coords = vectorToLatLon(direction);

      setStatus(
        'MANZIL BELGILANDI · ' +
        coords.lat.toFixed(2) +
        '°, ' +
        coords.lon.toFixed(2) +
        '° — avatar piyoda yo‘lga chiqdi'
      );

      return;
    }

    selectDirection(direction, 'Tanlangan hudud');
  }

  function selectLatLon(lat, lon, name) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);

    const direction = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );

    selectDirection(direction, name);
  }

  /* ---------- Klaviatura bilan yurish ---------- */

  function moveByKeys(dt) {
    const forwardAmount =
      (state.keys.has('w') || state.keys.has('arrowup') ? 1 : 0) -
      (state.keys.has('s') || state.keys.has('arrowdown') ? 1 : 0);

    const sideAmount =
      (state.keys.has('d') || state.keys.has('arrowright') ? 1 : 0) -
      (state.keys.has('a') || state.keys.has('arrowleft') ? 1 : 0);

    if (!forwardAmount && !sideAmount) return false;

    const up = state.playerDirection.clone().normalize();

    const forward = state.forward.clone()
      .addScaledVector(up, -state.forward.dot(up))
      .normalize();

    const right = new THREE.Vector3()
      .crossVectors(forward, up)
      .normalize();

    const direction = forward
      .multiplyScalar(forwardAmount)
      .addScaledVector(right, sideAmount)
      .normalize();

    if (direction.lengthSq() < 1e-8) return false;

    const step = state.walkSpeed * dt;

    state.playerDirection
      .copy(up)
      .multiplyScalar(Math.cos(step))
      .addScaledVector(direction, Math.sin(step))
      .normalize();

    state.destination = null;
    state.moving = true;

    orientAvatar(state.playerDirection, direction);

    return true;
  }

  /* ---------- Harakat yangilanishi ---------- */

  function update(dt) {
    if (state.mode !== 'life' || !state.player) return;

    const movedByKeys = moveByKeys(dt);

    if (!movedByKeys && state.destination) {
      const current = state.playerDirection.clone().normalize();
      const target = state.destination.clone().normalize();

      const dot = THREE.MathUtils.clamp(
        current.dot(target),
        -1,
        1
      );

      const angle = Math.acos(dot);

      if (angle < 0.001) {
        state.playerDirection.copy(target);
        state.destination = null;
        state.moving = false;
      } else {
        const tangent = target.clone()
          .addScaledVector(current, -dot)
          .normalize();

        const step = Math.min(
          angle,
          state.walkSpeed * dt
        );

        state.playerDirection
          .copy(current)
          .multiplyScalar(Math.cos(step))
          .addScaledVector(tangent, Math.sin(step))
          .normalize();

        orientAvatar(state.playerDirection, tangent);

        state.moving = true;

        if (step >= angle) {
          state.destination = null;
        }
      }
    }

    state.player.position
      .copy(state.playerDirection)
      .multiplyScalar(1.006);

    const limbs = state.player.userData.limbs;

    const swing = state.moving
      ? Math.sin(performance.now() * 0.012) * 0.48
      : 0;

    limbs.leftArm.rotation.x = swing;
    limbs.rightArm.rotation.x = -swing;
    limbs.leftLeg.rotation.x = -swing;
    limbs.rightLeg.rotation.x = swing;

    if (!state.destination && !movedByKeys) {
      state.moving = false;
    }

    updateCamera();
  }

  /* ---------- Tugmalar ---------- */

  $('rabot-global').addEventListener('click', globalView);
  $('rabot-inspect').addEventListener('click', inspectSelected);
  $('rabot-enter').addEventListener('click', enterLife);

  $('rabot-card-inspect').addEventListener(
    'click',
    inspectSelected
  );

  $('rabot-card-enter').addEventListener(
    'click',
    enterLife
  );

  /* ---------- Klaviatura hodisalari ---------- */

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (
      [
        'w',
        'a',
        's',
        'd',
        'arrowup',
        'arrowdown',
        'arrowleft',
        'arrowright'
      ].includes(key) &&
      state.mode === 'life'
    ) {
      event.preventDefault();
      state.keys.add(key);
    }

    if (event.key === 'Escape' && state.mode === 'life') {
      globalView();
    }
  });

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.key.toLowerCase());
  });

  window.addEventListener('blur', () => {
    state.keys.clear();
  });

  /* ---------- Tashqi boshqaruv ---------- */

  return {
    handleSurfaceClick,
    selectLatLon,
    update,

    get mode() {
      return state.mode;
    }
  };
}
