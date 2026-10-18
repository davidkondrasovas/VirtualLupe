// Fase 2 — WebXR AR (6DoF).
// Na fase 1 só tínhamos a rotação do aparelho. Aqui o ARCore rastreia rotação
// E posição juntando câmera + sensores, e o WebXR entrega a pose pronta a cada
// quadro: o Three.js a aplica na câmera sozinho (renderer.xr). Nós só
// colocamos o cubo num ponto fixo do mundo — quem se move é a câmera.

import * as THREE from 'three';

// Unidades do WebXR são metros.
const CUBE_SIZE = 0.2;
// Distância à frente da posição inicial do celular onde o cubo aparece.
const START_DISTANCE = 0.6;

// ---------- Cena ----------

// alpha: true → o fundo do canvas fica transparente e a imagem da câmera
// aparece por trás do que desenhamos.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
// Durante a sessão, posição/orientação/projeção desta câmera vêm do WebXR.
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

// Mesmo cubo da fase 1, em escala real. Ordem das faces: +X, −X, +Y, −Y, +Z, −Z.
const faceColors = [0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0x3498db, 0xe67e22];
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
  faceColors.map((color) => new THREE.MeshBasicMaterial({ color })),
);
cube.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(cube.geometry),
  new THREE.LineBasicMaterial({ color: 0x111111 }),
));
// No espaço de referência 'local', a origem é onde o celular estava ao entrar
// em AR, com Y para cima e −Z para a frente.
cube.position.set(0, 0, -START_DISTANCE);
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Suporte ----------

const startScreen = document.getElementById('start');
const overlay = document.getElementById('overlay');
const status = document.getElementById('status');
const arButton = document.getElementById('btn-ar');

// Devolve null se dá para entrar em AR, ou o motivo de não dar.
async function unsupportedReason() {
  if (!window.isSecureContext) {
    return 'Página fora de HTTPS: o WebXR não fica disponível.';
  }
  if (!navigator.xr) {
    return 'Este navegador não tem WebXR. Use o Chrome no Android.';
  }
  const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
  if (!supported) {
    return 'AR não suportado neste aparelho: precisa de Chrome Android com '
      + '"Google Play Services for AR" instalado.';
  }
  return null;
}

unsupportedReason().then((reason) => {
  if (reason) {
    status.textContent = reason;
  } else {
    status.hidden = true;
    arButton.hidden = false;
  }
});

// ---------- Sessão AR ----------

async function enterAR() {
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      // DOM overlay: deixa HTML comum (dica, botão "Sair") por cima da câmera.
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: overlay },
    });
  } catch (error) {
    status.textContent = `Não foi possível entrar em AR: ${error.message}`;
    status.hidden = false;
    return;
  }
  session.addEventListener('end', () => {
    overlay.hidden = true;
    startScreen.hidden = false;
  });
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  startScreen.hidden = true;
  overlay.hidden = false;
}

arButton.addEventListener('click', enterAR);
document.getElementById('btn-exit').addEventListener('click', () => {
  renderer.xr.getSession()?.end();
});

// ---------- Loop ----------

// Fora da sessão não há nada para mostrar; dentro dela, o renderer usa a câmera
// do WebXR (com a pose do quadro) no lugar desta.
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
