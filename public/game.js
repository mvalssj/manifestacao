import * as THREE from 'three';

// ---------- constantes ----------
const SIDES = {
  amarelo: '#e9cf74', vermelho: '#e04a3a', verde: '#3aa65b',
  azul: '#3b6fd8', branco: '#f5f0e6', roxo: '#8a5cd6',
};
const SIDE_NAMES = {
  amarelo: 'Amarelo', vermelho: 'Vermelho', verde: 'Verde',
  azul: 'Azul', branco: 'Branco', roxo: 'Roxo',
};
const SKINS = ['#f1d1b5', '#e0b48f', '#c68e63', '#a8704a', '#7d4f31', '#5a3822'];
const HATS = { nenhum: 'Nada', bone: 'Boné', chapeu: 'Chapéu', bandana: 'Bandana' };
const ITEMS = { bandeira: 'Bandeira', cartaz: 'Cartaz', nenhum: 'Nada' };

const BOUNDS = { x: 21, z: 290 };
const ROAD_HALF = 14;
const SIDEWALK_H = 0.15;
const MASP = { x: 38, z: 40, halfX: 13, halfZ: 36 };

const $ = (id) => document.getElementById(id);

function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function randomRoom() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// ---------- lobby ----------
const params = new URLSearchParams(location.search);
const look = Object.assign({ side: 'amarelo', skin: 1, hat: 'nenhum', item: 'bandeira', sign: '' }, load('look', {}));
let lobbyMode = 'join';

$('name').value = load('name', '');
$('room').value = (params.get('sala') || load('room', '') || randomRoom()).toUpperCase();
$('sign').value = look.sign;

function renderPickers() {
  swatches('sides', Object.keys(SIDES), (k) => SIDES[k], 'side', (k) => SIDE_NAMES[k]);
  swatches('skins', SKINS.map((_, i) => i), (i) => SKINS[i], 'skin', (i) => `Tom ${i + 1}`);
  chips('hats', HATS, 'hat');
  chips('items', ITEMS, 'item');
  $('signRow').hidden = look.item !== 'cartaz';
}

function swatches(id, keys, color, field, title) {
  const el = $(id);
  el.innerHTML = '';
  for (const k of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (look[field] === k ? ' on' : '');
    b.style.background = color(k);
    b.title = title(k);
    b.setAttribute('aria-label', title(k));
    b.onclick = () => { look[field] = k; renderPickers(); };
    el.appendChild(b);
  }
}

function chips(id, map, field) {
  const el = $(id);
  el.innerHTML = '';
  for (const [k, label] of Object.entries(map)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (look[field] === k ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { look[field] = k; renderPickers(); };
    el.appendChild(b);
  }
}

function openLobby(mode) {
  lobbyMode = mode;
  $('joinRows').hidden = mode === 'edit';
  $('cancel').hidden = mode !== 'edit';
  $('play').textContent = mode === 'edit' ? 'Salvar visual' : 'Ir para a avenida';
  $('lobby').hidden = false;
  renderPickers();
}

$('lobbyForm').addEventListener('submit', (e) => {
  e.preventDefault();
  look.sign = $('sign').value.trim().slice(0, 40);
  store('look', look);
  $('lobby').hidden = true;

  if (lobbyMode === 'edit') {
    send({ t: 'look', look });
    setPlayerLook(myId, { ...look });
    return;
  }
  const name = $('name').value.trim().slice(0, 20) || 'Manifestante';
  const room = $('room').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16) || 'PAULISTA';
  store('name', name);
  store('room', room);
  connect(name, room);
});

$('cancel').onclick = () => { $('lobby').hidden = true; };
$('edit').onclick = () => openLobby('edit');
$('invite').onclick = async () => {
  const link = `${location.origin}/?sala=${encodeURIComponent(roomCode)}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Convite copiado! Mande para os amigos.');
  } catch {
    prompt('Copie o convite:', link);
  }
};

renderPickers();

// ---------- cena ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#161a1f');
scene.fog = new THREE.Fog('#161a1f', 45, 190);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

scene.add(new THREE.HemisphereLight('#9fb2d0', '#22252b', 1.1));
const sun = new THREE.DirectionalLight('#ffe2b8', 1.3);
sun.position.set(40, 80, 30);
scene.add(sun);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const colliders = []; // caixas {x0, x1, z0, z1} onde ninguém entra

function addBox(w, h, d, color, x, y, z, extra = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, ...extra }));
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

function buildAvenue() {
  const L = 640;

  // chão em volta
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, L), new THREE.MeshLambertMaterial({ color: '#1b1e23' }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // asfalto
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, L), new THREE.MeshLambertMaterial({ color: '#2b2e34' }));
  road.rotation.x = -Math.PI / 2;
  scene.add(road);

  // ciclovia vermelha no meio
  const bike = new THREE.Mesh(new THREE.PlaneGeometry(3, L), new THREE.MeshLambertMaterial({ color: '#7e2c25' }));
  bike.rotation.x = -Math.PI / 2;
  bike.position.y = 0.01;
  scene.add(bike);

  const white = new THREE.MeshLambertMaterial({ color: '#d9d6cf' });
  for (const x of [-1.6, 1.6]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L), white);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.012, 0);
    scene.add(line);
  }

  // faixas tracejadas
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 3), white, 4 * Math.ceil(L / 8));
  const m = new THREE.Matrix4();
  const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  let n = 0;
  for (const x of [-9, -5.5, 5.5, 9]) {
    for (let z = -L / 2; z < L / 2; z += 8) {
      m.makeTranslation(x, 0.012, z).multiply(rot);
      dashes.setMatrixAt(n++, m);
    }
  }
  dashes.count = n;
  scene.add(dashes);

  // faixas de pedestre
  for (const z of [-200, -100, 120, 220]) {
    for (let x = -ROAD_HALF + 1; x < ROAD_HALF; x += 1.6) {
      if (Math.abs(x) < 1.8) continue;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 4), white);
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.013, z);
      scene.add(s);
    }
  }

  // calçadas com desenho ondulado
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#5a5d64';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3d4046';
  g.lineWidth = 9;
  for (let y = -16; y < 160; y += 32) {
    g.beginPath();
    for (let x = 0; x <= 128; x += 4) g.lineTo(x, y + Math.sin((x / 128) * Math.PI * 2) * 8);
    g.stroke();
  }
  const walkTex = canvasTexture(c, true);
  walkTex.repeat.set(2, L / 4);
  const walkMat = new THREE.MeshLambertMaterial({ map: walkTex });
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(8, SIDEWALK_H, L), walkMat);
    walk.position.set(side * (ROAD_HALF + 4), SIDEWALK_H / 2, 0);
    scene.add(walk);
    addBox(0.3, SIDEWALK_H + 0.02, L, '#8b8d92', side * (ROAD_HALF + 0.15), SIDEWALK_H / 2, 0);
  }
}

function makeWindowTextures() {
  const variants = [];
  for (let v = 0; v < 5; v++) {
    const base = makeCanvas(64, 128);
    const glow = makeCanvas(64, 128);
    const b = base.getContext('2d');
    const gl = glow.getContext('2d');
    b.fillStyle = '#ffffff';
    b.fillRect(0, 0, 64, 128);
    gl.fillStyle = '#000000';
    gl.fillRect(0, 0, 64, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const lit = Math.random() < 0.32;
        const x = col * 16 + 3;
        const y = row * 16 + 4;
        b.fillStyle = lit ? '#ffe6ae' : '#2b2f37';
        b.fillRect(x, y, 10, 9);
        if (lit) {
          gl.fillStyle = Math.random() < 0.5 ? '#ffcf7a' : '#f6e3b8';
          gl.fillRect(x, y, 10, 9);
        }
      }
    }
    variants.push({ map: canvasTexture(base, true), glow: canvasTexture(glow, true) });
  }
  return variants;
}

function buildCity() {
  const windows = makeWindowTextures();
  const tones = ['#6c7079', '#7d7a73', '#5c626c', '#8a8c90', '#545861', '#77736d'];

  for (const side of [-1, 1]) {
    let z = -320;
    while (z < 320) {
      const w = 12 + Math.random() * 14;
      const zc = z + w / 2;
      z += w + 1.5;
      if (side === 1 && Math.abs(zc - MASP.z) < MASP.halfZ + 12) continue;

      const d = 14 + Math.random() * 14;
      const h = 18 + Math.random() * 75;
      const v = windows[Math.floor(Math.random() * windows.length)];
      const map = v.map.clone();
      const glow = v.glow.clone();
      for (const t of [map, glow]) {
        t.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 24)));
        t.needsUpdate = true;
      }
      const mat = new THREE.MeshLambertMaterial({
        color: tones[Math.floor(Math.random() * tones.length)],
        map,
        emissive: '#ffffff',
        emissiveMap: glow,
        emissiveIntensity: 0.85,
      });
      const b = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), mat);
      b.position.set(side * (ROAD_HALF + 8 + 2 + d / 2), h / 2, zc);
      scene.add(b);

      // luz vermelha no topo dos prédios altos
      if (h > 60) {
        addBox(0.6, 0.6, 0.6, '#ff3b2f', b.position.x, h + 0.3, zc, { emissive: '#ff3b2f' });
      }
    }
  }
}

function buildMasp() {
  const red = '#d0302a';
  const { x, z, halfX, halfZ } = MASP;

  // vão livre
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(36, halfZ * 2 + 16), new THREE.MeshLambertMaterial({ color: '#6f7177' }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(x - 2, 0.01, z);
  scene.add(plaza);

  // caixa suspensa
  const box = addBox(halfX * 2 - 2, 9, halfZ * 2 - 2, '#8f9196', x, 13, z);
  box.material = new THREE.MeshLambertMaterial({ color: '#8f9196' });
  addBox(halfX * 2 - 1.6, 5.5, halfZ * 2 - 1.6, '#1d2733', x, 13, z, { emissive: '#3a4a5c', emissiveIntensity: 0.5 });

  // pórticos vermelhos
  const pillarH = 18.6;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      addBox(1.6, pillarH, 1.6, red, x + sx * halfX, pillarH / 2, z + sz * halfZ);
    }
    addBox(halfX * 2 + 1.6, 1.8, 1.6, red, x, pillarH, z + sz * halfZ);
  }
  for (const sx of [-1, 1]) {
    addBox(1.6, 1.8, halfZ * 2 + 1.6, red, x + sx * halfX, pillarH, z);
    addBox(1.6, 1.4, halfZ * 2 + 1.6, red, x + sx * halfX, 8, z);
  }

  // letreiro
  const c = makeCanvas(256, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#161a1f';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#f7f3ea';
  g.font = '900 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MASP', 128, 34);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: canvasTexture(c) }));
  sign.position.set(x - halfX - 0.85, 7, z);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
}

function buildStreetFurniture() {
  // árvores
  const spots = [];
  for (const side of [-1, 1]) {
    for (let z = -300; z <= 300; z += 13) {
      if (side === 1 && Math.abs(z - MASP.z) < MASP.halfZ + 6) continue;
      spots.push([side * 20.2, z + (Math.random() * 4 - 2)]);
    }
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.25, 3, 6),
    new THREE.MeshLambertMaterial({ color: '#4a3a2c' }),
    spots.length,
  );
  const crowns = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.9, 0),
    new THREE.MeshLambertMaterial({ color: '#2f5a3a', flatShading: true }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    m.makeTranslation(x, 1.5 + SIDEWALK_H, z);
    trunks.setMatrixAt(i, m);
    const s = 0.8 + Math.random() * 0.5;
    m.makeScale(s, s * 1.15, s).setPosition(x, 4 + SIDEWALK_H, z);
    crowns.setMatrixAt(i, m);
  });
  scene.add(trunks, crowns);

  // postes
  const poleMat = new THREE.MeshLambertMaterial({ color: '#3a3e45' });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe0a3' });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 8, 6);
  const armGeo = new THREE.BoxGeometry(2.4, 0.15, 0.15);
  const bulbGeo = new THREE.SphereGeometry(0.35, 10, 8);
  for (const side of [-1, 1]) {
    for (let z = -300; z <= 300; z += 30) {
      const x = side * (ROAD_HALF + 0.9);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 4, z);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(x - side * 1.1, 8, z);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x - side * 2.1, 7.8, z);
      scene.add(pole, arm, bulb);
    }
  }
}

function buildSoundTruck(x, z, color, text) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 9), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 2.2;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), new THREE.MeshLambertMaterial({ color: '#d9d6cf' }));
  cab.position.set(0, 1.8, 5.8);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: '#1d2733' }));
  glass.position.set(0, 2.4, 7.02);
  g.add(body, cab, glass);

  const speakerMat = new THREE.MeshLambertMaterial({ color: '#16181c' });
  for (const sx of [-0.8, 0.8]) {
    for (const sz of [-3, 3]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.2), speakerMat);
      sp.position.set(sx, 4.7, sz);
      g.add(sp);
    }
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 9), new THREE.MeshLambertMaterial({ color: '#c9c9c9' }));
  rail.position.y = 3.85;
  g.add(rail);

  const c = makeCanvas(512, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#161a1f';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#f7f3ea';
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66, 480);
  const banner = new THREE.MeshBasicMaterial({ map: canvasTexture(c) });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), banner);
    p.position.set(sx * 1.52, 2.4, 0);
    p.rotation.y = sx * Math.PI / 2;
    g.add(p);
  }

  g.position.set(x, 0, z);
  scene.add(g);
  colliders.push({ x0: x - 1.9, x1: x + 1.9, z0: z - 5, z1: z + 7.4 });
}

buildAvenue();
buildCity();
buildMasp();
buildStreetFurniture();
buildSoundTruck(-8, -70, '#e9cf74', 'DOMINGO NA PAULISTA');
buildSoundTruck(8, 150, '#e04a3a', 'A AVENIDA É NOSSA');

// ---------- personagens ----------
const CHAR_GEO = {
  leg: new THREE.BoxGeometry(0.24, 0.8, 0.26).translate(0, -0.4, 0),
  body: new THREE.BoxGeometry(0.64, 0.8, 0.36),
  arm: new THREE.BoxGeometry(0.18, 0.72, 0.2).translate(0, -0.34, 0),
  head: new THREE.SphereGeometry(0.27, 16, 12),
  eye: new THREE.BoxGeometry(0.06, 0.06, 0.02),
  pole: new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6),
  signPole: new THREE.CylinderGeometry(0.035, 0.035, 1.75, 6),
};
const MAT_CACHE = new Map();
function mat(color) {
  if (!MAT_CACHE.has(color)) MAT_CACHE.set(color, new THREE.MeshLambertMaterial({ color }));
  return MAT_CACHE.get(color);
}

function flagTexture(side) {
  const c = makeCanvas(128, 80);
  const g = c.getContext('2d');
  g.fillStyle = SIDES[side];
  g.fillRect(0, 0, 128, 80);
  g.fillStyle = 'rgba(22, 26, 31, 0.22)';
  g.fillRect(0, 56, 128, 10);
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.beginPath();
  g.arc(64, 34, 14, 0, Math.PI * 2);
  g.fill();
  return canvasTexture(c);
}

function signTexture(text) {
  const c = makeCanvas(256, 160);
  const g = c.getContext('2d');
  g.fillStyle = '#f7f3ea';
  g.fillRect(0, 0, 256, 160);
  g.strokeStyle = '#161a1f';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 244, 148);
  g.fillStyle = '#161a1f';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const words = (text || 'A AVENIDA É NOSSA').toUpperCase().split(/\s+/);
  let size = 44;
  let lines;
  while (size > 14) {
    g.font = `900 ${size}px system-ui, sans-serif`;
    lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > 224 && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
    if (lines.length * size * 1.1 <= 136 && lines.every((l) => g.measureText(l).width <= 230)) break;
    size -= 3;
  }
  const top = 80 - ((lines.length - 1) * size * 1.1) / 2;
  lines.forEach((l, i) => g.fillText(l, 128, top + i * size * 1.1));
  return canvasTexture(c);
}

function buildCharacter(lk) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);

  const shirt = mat(SIDES[lk.side]);
  const skin = mat(SKINS[lk.skin]);
  const pants = mat('#2b2f38');

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.16, 0.8, 0);
  legR.position.set(0.16, 0.8, 0);
  legL.add(new THREE.Mesh(CHAR_GEO.leg, pants));
  legR.add(new THREE.Mesh(CHAR_GEO.leg, pants));

  const body = new THREE.Mesh(CHAR_GEO.body, shirt);
  body.position.y = 1.2;

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.42, 1.55, 0);
  armR.position.set(0.42, 1.55, 0);
  armL.add(new THREE.Mesh(CHAR_GEO.arm, shirt));
  armR.add(new THREE.Mesh(CHAR_GEO.arm, shirt));
  const handGeo = new THREE.SphereGeometry(0.1, 8, 6).translate(0, -0.74, 0);
  armL.add(new THREE.Mesh(handGeo, skin));
  armR.add(new THREE.Mesh(handGeo, skin));

  const head = new THREE.Mesh(CHAR_GEO.head, skin);
  head.position.y = 1.9;
  for (const ex of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(CHAR_GEO.eye, mat('#161a1f'));
    eye.position.set(ex, 1.94, 0.26);
    inner.add(eye);
  }

  inner.add(legL, legR, body, armL, armR, head);

  if (lk.hat === 'bone') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), shirt);
    cap.position.y = 1.95;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.26), shirt);
    brim.position.set(0, 1.97, 0.3);
    inner.add(cap, brim);
  } else if (lk.hat === 'chapeu') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20), mat('#d8c48e'));
    brim.position.y = 2.08;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.28, 16), mat('#d8c48e'));
    top.position.y = 2.22;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.06, 16), shirt);
    band.position.y = 2.12;
    inner.add(brim, top, band);
  } else if (lk.hat === 'bandana') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), mat('#e04a3a'));
    band.position.y = 2.02;
    inner.add(band);
  }

  let flag = null;
  let labelH = 2.5;
  if (lk.item !== 'nenhum') {
    // no cartaz o cabo para embaixo da placa, para não tapar o texto
    const pole = new THREE.Mesh(lk.item === 'cartaz' ? CHAR_GEO.signPole : CHAR_GEO.pole, mat('#7a5a3a'));
    pole.position.set(0.5, lk.item === 'cartaz' ? 1.68 : 2.1, 0.15);
    inner.add(pole);
    armR.rotation.x = -2.7;
    labelH = 3.9;

    if (lk.item === 'bandeira') {
      const geo = new THREE.PlaneGeometry(1.4, 0.9, 12, 1);
      geo.translate(0.7, 0, 0);
      flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: flagTexture(lk.side), side: THREE.DoubleSide }));
      flag.position.set(0.5, 2.95, 0.15);
      flag.userData.base = geo.attributes.position.array.slice();
      inner.add(flag);
    } else {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.04), [
        mat('#e8e2d4'), mat('#e8e2d4'), mat('#e8e2d4'), mat('#e8e2d4'),
        new THREE.MeshLambertMaterial({ map: signTexture(lk.sign) }),
        new THREE.MeshLambertMaterial({ map: signTexture(lk.sign) }),
      ]);
      board.position.set(0.5, 3.0, 0.2);
      inner.add(board);
      armL.rotation.x = -2.7;
      armL.rotation.z = -0.5;
    }
  }

  return { root, inner, legL, legR, armL, armR, flag, labelH, phase: 0, swing: 0, hasItem: lk.item !== 'nenhum', twoHands: lk.item === 'cartaz' };
}

function animateCharacter(c, moving, running, t, dt) {
  c.swing += ((moving ? 1 : 0) - c.swing) * Math.min(1, dt * 10);
  c.phase += dt * (running ? 14 : 9) * c.swing;
  const s = Math.sin(c.phase) * 0.7 * c.swing;
  c.legL.rotation.x = s;
  c.legR.rotation.x = -s;
  if (!c.twoHands) c.armL.rotation.x = -s * 0.8;
  if (!c.hasItem) c.armR.rotation.x = s * 0.8;

  if (c.flag) {
    const pos = c.flag.geometry.attributes.position;
    const base = c.flag.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(x * 4 - t * 7) * 0.09 * x;
    }
    pos.needsUpdate = true;
  }
}

// ---------- jogadores ----------
const players = new Map();
let myId = null;
let roomCode = '';
const me = { x: 0, y: 0, z: 0, ry: Math.PI, vy: 0, moving: false, running: false };

function addPlayer(p) {
  const char = buildCharacter(p.look);
  char.root.position.set(p.x, p.y, p.z);
  char.root.rotation.y = p.ry;
  scene.add(char.root);

  const label = document.createElement('div');
  label.className = 'label' + (p.id === myId ? ' me' : '');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.hidden = true;
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = p.name;
  label.append(bubble, name);
  $('labels').appendChild(label);

  players.set(p.id, {
    id: p.id, name: p.name, look: p.look, char, label, bubble, bubbleUntil: 0,
    tx: p.x, ty: p.y, tz: p.z, tr: p.ry, moving: false,
  });
  $('count').textContent = players.size;
}

function removePlayer(id) {
  const p = players.get(id);
  if (!p) return;
  scene.remove(p.char.root);
  p.label.remove();
  players.delete(id);
  $('count').textContent = players.size;
}

function setPlayerLook(id, lk) {
  const p = players.get(id);
  if (!p) return;
  const { position, rotation } = p.char.root;
  scene.remove(p.char.root);
  p.look = lk;
  p.char = buildCharacter(lk);
  p.char.root.position.copy(position);
  p.char.root.rotation.copy(rotation);
  scene.add(p.char.root);
}

function showChat(id, text) {
  const p = players.get(id);
  if (!p) return;
  p.bubble.textContent = text;
  p.bubble.hidden = false;
  p.bubbleUntil = performance.now() + 6000;
  logLine(p.name, text);
}

function logLine(name, text, sys = false) {
  const div = document.createElement('div');
  if (sys) {
    div.className = 'sys';
    div.textContent = text;
  } else {
    const b = document.createElement('b');
    b.textContent = name + ': ';
    div.append(b, document.createTextNode(text));
  }
  const log = $('log');
  log.appendChild(div);
  while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => (div.style.opacity = '0'), 12000);
  setTimeout(() => div.remove(), 13000);
}

let toastTimer;
function toast(text, sticky = false) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (el.hidden = true), 2500);
}

// ---------- rede ----------
let ws = null;

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect(name, room) {
  $('hud').hidden = false;
  history.replaceState(null, '', '?sala=' + encodeURIComponent(room));
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => send({ t: 'join', name, room, look });
  ws.onclose = () => toast('Conexão perdida. Recarregue a página para voltar à avenida.', true);
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handle(msg);
  };
}

function handle(msg) {
  switch (msg.t) {
    case 'welcome': {
      myId = msg.id;
      roomCode = msg.room;
      $('roomCode').textContent = roomCode;
      for (const p of msg.players) addPlayer(p);
      const mine = players.get(myId);
      me.x = mine.tx;
      me.z = mine.tz;
      me.ry = mine.tr;
      camYaw = me.ry + Math.PI;
      logLine('', `Você entrou na sala ${roomCode}. Chame os amigos com "Copiar convite".`, true);
      break;
    }
    case 'join':
      addPlayer(msg.p);
      logLine('', `${msg.p.name} chegou na avenida.`, true);
      break;
    case 'leave': {
      const p = players.get(msg.id);
      if (p) logLine('', `${p.name} saiu.`, true);
      removePlayer(msg.id);
      break;
    }
    case 's':
      for (const [id, x, y, z, ry, m] of msg.s) {
        if (id === myId) continue;
        const p = players.get(id);
        if (!p) continue;
        p.tx = x; p.ty = y; p.tz = z; p.tr = ry; p.moving = !!m;
      }
      break;
    case 'chat':
      showChat(msg.id, msg.text);
      break;
    case 'look':
      if (msg.id !== myId) setPlayerLook(msg.id, msg.look);
      break;
    case 'error':
      toast(msg.msg, true);
      break;
  }
}

// ---------- controles ----------
const keys = new Set();
const stick = { x: 0, y: 0 };
let camYaw = 0;
let camHeight = 4.2;
let jumpQueued = false;

const typing = () => document.activeElement && document.activeElement.tagName === 'INPUT';

addEventListener('keydown', (e) => {
  if (typing() || !$('lobby').hidden) return;
  if (e.key === 'Enter' && myId !== null) {
    e.preventDefault();
    $('chatInput').focus();
    return;
  }
  if (e.code === 'Space') { jumpQueued = true; e.preventDefault(); }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

$('chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chatInput');
  const text = input.value.trim();
  if (text) {
    send({ t: 'chat', text });
    showChat(myId, text.slice(0, 120));
  }
  input.value = '';
  input.blur();
});
$('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') e.target.blur();
});

// arrastar para girar a câmera
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  if (typing()) document.activeElement.blur();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  camYaw -= (e.clientX - drag.x) * 0.006;
  camHeight = Math.min(12, Math.max(1.2, camHeight + (e.clientY - drag.y) * 0.03));
  drag.x = e.clientX;
  drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('pointercancel', () => (drag = null));
canvas.addEventListener('wheel', (e) => {
  camHeight = Math.min(12, Math.max(1.2, camHeight + e.deltaY * 0.005));
}, { passive: true });

// joystick no celular
if (matchMedia('(pointer: coarse)').matches) {
  $('stick').hidden = false;
  $('jump').hidden = false;
}
const stickEl = $('stick');
const knob = $('knob');
let stickId = null;
function moveStick(e) {
  const r = stickEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy);
  const max = r.width / 2 - 10;
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  stick.x = dx / max;
  stick.y = -dy / max;
}
stickEl.addEventListener('pointerdown', (e) => {
  stickId = e.pointerId;
  stickEl.setPointerCapture(e.pointerId);
  moveStick(e);
});
stickEl.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
const releaseStick = () => {
  stickId = null;
  stick.x = stick.y = 0;
  knob.style.transform = '';
};
stickEl.addEventListener('pointerup', releaseStick);
stickEl.addEventListener('pointercancel', releaseStick);
$('jump').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpQueued = true; });

// ---------- loop ----------
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let sendTimer = 0;
let lastSent = '';

function groundAt(x) {
  return Math.abs(x) > ROAD_HALF ? SIDEWALK_H : 0;
}

function pushOut(x, z) {
  for (const c of colliders) {
    if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
      const opts = [[c.x0 - x, 0], [c.x1 - x, 0], [0, c.z0 - z], [0, c.z1 - z]];
      opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
      x += opts[0][0];
      z += opts[0][1];
    }
  }
  return [x, z];
}

function angleLerp(a, b, f) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

function updateMe(dt) {
  let ix = stick.x;
  let iz = stick.y;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyQ')) camYaw += dt * 2;
  if (keys.has('KeyE')) camYaw -= dt * 2;

  const len = Math.hypot(ix, iz);
  me.moving = len > 0.1;
  me.running = keys.has('ShiftLeft') || keys.has('ShiftRight') || len > 0.95 && stickId !== null;

  if (me.moving) {
    const s = Math.sin(camYaw);
    const c = Math.cos(camYaw);
    const nx = ix / Math.max(1, len);
    const nz = iz / Math.max(1, len);
    // frente = da câmera para o jogador; direita = perpendicular
    const mx = -s * nz + c * nx;
    const mz = -c * nz - s * nx;
    const speed = me.running ? 11 : 6;
    me.x = Math.min(BOUNDS.x, Math.max(-BOUNDS.x, me.x + mx * speed * dt));
    me.z = Math.min(BOUNDS.z, Math.max(-BOUNDS.z, me.z + mz * speed * dt));
    [me.x, me.z] = pushOut(me.x, me.z);
    me.ry = angleLerp(me.ry, Math.atan2(mx, mz), Math.min(1, dt * 12));
  }

  const floor = groundAt(me.x);
  if (jumpQueued && me.y <= floor + 0.001) me.vy = 6.5;
  jumpQueued = false;
  me.vy -= 18 * dt;
  me.y = Math.max(floor, me.y + me.vy * dt);
  if (me.y === floor) me.vy = 0;

  const p = players.get(myId);
  if (!p) return;
  p.char.root.position.set(me.x, me.y, me.z);
  p.char.root.rotation.y = me.ry;
  p.moving = me.moving;
  p.running = me.running;

  sendTimer += dt;
  if (sendTimer > 0.08) {
    sendTimer = 0;
    const state = [me.x.toFixed(2), me.y.toFixed(2), me.z.toFixed(2), me.ry.toFixed(2), me.moving].join();
    if (state !== lastSent) {
      lastSent = state;
      send({ t: 'move', x: me.x, y: me.y, z: me.z, ry: me.ry, m: me.moving ? 1 : 0 });
    }
  }
}

function updateCamera(dt) {
  const target = tmp.set(me.x, me.y + 1.8, me.z);
  const dist = 7 + camHeight * 0.35;
  const want = new THREE.Vector3(
    me.x + Math.sin(camYaw) * dist,
    me.y + camHeight,
    me.z + Math.cos(camYaw) * dist,
  );
  camera.position.lerp(want, Math.min(1, dt * 8));
  camera.lookAt(target);
}

const proj = new THREE.Vector3();
function updateLabels(now) {
  const w = innerWidth;
  const h = innerHeight;
  for (const p of players.values()) {
    if (p.bubbleUntil && now > p.bubbleUntil) {
      p.bubble.hidden = true;
      p.bubbleUntil = 0;
    }
    const pos = p.char.root.position;
    proj.set(pos.x, pos.y + p.char.labelH, pos.z);
    const dist = proj.distanceTo(camera.position);
    proj.project(camera);
    if (proj.z > 1 || dist > 70) {
      p.label.style.display = 'none';
      continue;
    }
    p.label.style.display = '';
    p.label.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w}px, ${(-proj.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
  }
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  const now = performance.now();

  if (myId !== null) {
    updateMe(dt);
    updateCamera(dt);
  } else {
    // câmera passeando pela avenida enquanto está no lobby
    camera.position.set(Math.sin(t * 0.1) * 6, 7, 30 - ((t * 4) % 200));
    camera.lookAt(0, 3, camera.position.z - 40);
  }

  const f = Math.min(1, dt * 10);
  for (const p of players.values()) {
    if (p.id !== myId) {
      const r = p.char.root;
      r.position.x += (p.tx - r.position.x) * f;
      r.position.y += (p.ty - r.position.y) * f;
      r.position.z += (p.tz - r.position.z) * f;
      r.rotation.y = angleLerp(r.rotation.y, p.tr, f);
    }
    animateCharacter(p.char, p.moving, p.running, t, dt);
  }

  updateLabels(now);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
