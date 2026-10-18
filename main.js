// Fase 1 — modo órbita: a orientação do celular move a câmera numa esfera
// em volta do cubo, sempre olhando para ele. A matemática está em
// orientation.js; aqui ficam a cena, os eventos e a interface.

import * as THREE from 'three';
import {
  IDENTITY, multiply, slerp, fromEulerYXZ,
  deviceQuaternion, recenterOffset, orbitPosition,
} from './orientation.js';

// Distância da câmera ao centro do cubo.
const ORBIT_RADIUS = 4;
// Fração do caminho até a orientação nova percorrida a cada quadro
// (0 = congela, 1 = sem suavização). Menor = mais suave, porém mais atrasado.
const SMOOTHING = 0.25;
// Sem eventos válidos dos sensores nesse prazo após "Iniciar" → modo mouse.
const SENSOR_TIMEOUT_MS = 1500;
// Radianos de giro por pixel arrastado (fallback de mouse/toque).
const DRAG_SPEED = 0.006;

const CUBE_CENTER = [0, 0, 0];

// ---------- Cena ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1f24);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);

// Uma cor por face, para saber qual lado está à vista.
// Ordem do BoxGeometry: +X, −X, +Y, −Y, +Z, −Z.
const faceColors = [0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x3498db, 0xe67e22];
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  faceColors.map((color) => new THREE.MeshBasicMaterial({ color })),
);
cube.position.fromArray(CUBE_CENTER);
cube.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(cube.geometry),
  new THREE.LineBasicMaterial({ color: 0x111111 }),
));
scene.add(cube);

// Grade no "chão" para dar sensação de espaço.
const grid = new THREE.GridHelper(12, 12, 0x555555, 0x333333);
grid.position.y = -1.5;
scene.add(grid);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Estado ----------

let source = 'aguardando';       // 'sensores' | 'mouse'
let rawQuaternion = IDENTITY;     // orientação do aparelho, sem correção
let yawOffset = null;             // correção do "recentrar" (null = recentrar no próximo dado)
let targetQuaternion = IDENTITY;  // para onde a câmera quer ir
let currentQuaternion = IDENTITY; // onde a câmera está (suavizado)
let lastAngles = null;            // último { alpha, beta, gamma } recebido
let dragYaw = 0;
let dragPitch = 0;

// ---------- Sensores ----------

function screenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

function onDeviceOrientation(event) {
  // Navegadores sem sensor às vezes disparam o evento com valores nulos.
  if (event.alpha === null || event.beta === null || event.gamma === null) {
    return;
  }
  if (source !== 'sensores') {
    source = 'sensores';
    hideNotice();
  }
  lastAngles = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
  rawQuaternion = deviceQuaternion(event.alpha, event.beta, event.gamma, screenAngle());
  if (yawOffset === null) {
    // Primeira leitura (ou "recentrar"): pôr o cubo na frente do usuário.
    yawOffset = recenterOffset(rawQuaternion);
  }
  if (yawOffset !== null) {
    targetQuaternion = multiply(yawOffset, rawQuaternion);
  }
}

async function start() {
  // iOS: a permissão só pode ser pedida dentro de um toque do usuário.
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') {
        enableMouse('Permissão dos sensores negada. Arraste para girar.');
      }
    } catch {
      enableMouse('Não foi possível pedir permissão dos sensores. Arraste para girar.');
    }
  }
  window.addEventListener('deviceorientation', onDeviceOrientation);
  setTimeout(() => {
    if (source === 'aguardando') {
      enableMouse('Sem sensores de orientação (PC?). Arraste para girar.');
    }
  }, SENSOR_TIMEOUT_MS);

  if (!window.isSecureContext) {
    showNotice('Página fora de HTTPS: os sensores não vão funcionar.');
  }
  document.getElementById('start').hidden = true;
  document.getElementById('toolbar').hidden = false;
}

// ---------- Fallback: arrastar com mouse/dedo ----------

function enableMouse(message) {
  if (source === 'sensores') {
    return;
  }
  source = 'mouse';
  showNotice(message);
}

let dragging = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => {
  dragging = null;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging || source !== 'mouse') {
    return;
  }
  dragYaw -= (e.clientX - dragging.x) * DRAG_SPEED;
  dragPitch -= (e.clientY - dragging.y) * DRAG_SPEED;
  dragPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dragPitch));
  dragging = { x: e.clientX, y: e.clientY };
  targetQuaternion = fromEulerYXZ(dragPitch, dragYaw, 0);
});

// ---------- Interface ----------

const notice = document.getElementById('notice');
function showNotice(text) {
  notice.textContent = text;
  notice.hidden = false;
}
function hideNotice() {
  notice.hidden = true;
}

document.getElementById('btn-start').addEventListener('click', start);

document.getElementById('btn-recenter').addEventListener('click', () => {
  if (source === 'mouse') {
    dragYaw = 0;
    dragPitch = 0;
    targetQuaternion = IDENTITY;
  } else {
    yawOffset = null; // o próximo evento do sensor recalcula a correção
  }
});

const debug = document.getElementById('debug');
document.getElementById('btn-debug').addEventListener('click', () => {
  debug.hidden = !debug.hidden;
});

function updateDebug() {
  if (debug.hidden) {
    return;
  }
  const fmt = (v) => (v === undefined ? '—' : v.toFixed(1).padStart(6));
  debug.textContent = [
    `modo:   órbita`,
    `fonte:  ${source}`,
    `alpha: ${fmt(lastAngles?.alpha)}°`,
    `beta:  ${fmt(lastAngles?.beta)}°`,
    `gamma: ${fmt(lastAngles?.gamma)}°`,
    `tela:  ${fmt(screenAngle())}°`,
  ].join('\n');
}

// ---------- Loop ----------

renderer.setAnimationLoop(() => {
  currentQuaternion = slerp(currentQuaternion, targetQuaternion, SMOOTHING);
  camera.quaternion.fromArray(currentQuaternion);
  camera.position.fromArray(orbitPosition(currentQuaternion, CUBE_CENTER, ORBIT_RADIUS));
  renderer.render(scene, camera);
  updateDebug();
});
