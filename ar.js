// Fase 2 — WebXR AR (6DoF).
// Na fase 1 só tínhamos a rotação do aparelho. Aqui o ARCore rastreia rotação
// E posição juntando câmera + sensores, e o WebXR entrega a pose pronta a cada
// quadro: o Three.js a aplica na câmera sozinho (renderer.xr). Nós só
// colocamos o cubo num ponto fixo do mundo — quem se move é a câmera.
//
// Fluxo: uma retícula (anel) mostra onde o raio que sai do centro da tela
// encontra uma superfície real (hit-test); o toque põe o cubo ali.

import * as THREE from 'three';

// Unidades do WebXR são metros.
const CUBE_SIZE = 0.2;

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

// Retícula: anel deitado no plano XZ. Nas poses de hit-test o eixo Y aponta
// para fora da superfície (a normal), então o anel fica rente a ela.
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
reticle.matrixAutoUpdate = false; // a matriz vem pronta do WebXR
reticle.visible = false;
scene.add(reticle);

// O cubo fica dentro de um "suporte" cuja matriz é a pose do ponto escolhido
// na superfície; dentro dele, o cubo sobe meia aresta para apoiar no chão
// em vez de ficar enterrado pela metade.
const holder = new THREE.Group();
holder.matrixAutoUpdate = false;
holder.visible = false;
scene.add(holder);

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
cube.position.y = CUBE_SIZE / 2;
holder.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Suporte ----------

const startScreen = document.getElementById('start');
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');
const status = document.getElementById('status');
const arButton = document.getElementById('btn-ar');
const exitButton = document.getElementById('btn-exit');

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

let hitTestSource = null; // fonte de hit-test: raio saindo do centro da tela
let lastHit = null;       // resultado de hit-test mais recente (onde está a retícula)
let anchor = null;        // âncora do cubo, se o aparelho suportar
let placed = false;
let placements = 0;       // conta toques, para descartar âncoras que chegam atrasadas

async function enterAR() {
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      // DOM overlay: deixa HTML comum (dica, botão "Sair") por cima da câmera.
      // Anchors: ponto que o ARCore mantém preso ao mundo real mesmo quando
      // corrige o mapa — sem ela, o cubo fica numa coordenada fixa e pode
      // "escorregar" quando o rastreamento se ajusta.
      optionalFeatures: ['dom-overlay', 'anchors'],
      domOverlay: { root: overlay },
    });
  } catch (error) {
    status.textContent = `Não foi possível entrar em AR: ${error.message}`;
    status.hidden = false;
    return;
  }
  session.addEventListener('end', onSessionEnd);
  session.addEventListener('select', placeCube);

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  // O espaço 'viewer' acompanha o celular: um raio na direção −Z dele é o
  // raio que sai do centro da tela para a frente.
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  hint.textContent = 'Aponte para o chão ou uma mesa até aparecer o anel.';
  startScreen.hidden = true;
  overlay.hidden = false;
}

function onSessionEnd() {
  hitTestSource = null;
  lastHit = null;
  anchor = null;
  placed = false;
  reticle.visible = false;
  holder.visible = false;
  overlay.hidden = true;
  startScreen.hidden = false;
}

// Toque na tela (evento 'select' do WebXR): põe o cubo onde está a retícula.
function placeCube() {
  if (!lastHit) {
    return;
  }
  anchor?.delete();
  anchor = null;
  const placement = ++placements;
  if (lastHit.createAnchor) {
    // A pose do cubo passa a vir da âncora a cada quadro (ver loop).
    lastHit.createAnchor().then((created) => {
      if (placement === placements) {
        anchor = created;
      } else {
        created.delete(); // chegou depois de um toque mais novo
      }
    }, () => {}); // falhou: fica com a pose fixa abaixo
  }
  // Até a âncora existir (ou se não houver suporte): pose fixa da retícula.
  holder.matrix.copy(reticle.matrix);
  holder.visible = true;
  placed = true;
  hint.textContent = 'Ande em volta. Toque de novo para mudar de lugar.';
}

arButton.addEventListener('click', enterAR);
exitButton.addEventListener('click', () => {
  renderer.xr.getSession()?.end();
});
// Com DOM overlay, tocar num elemento HTML também geraria 'select' (e moveria
// o cubo). Cancelar este evento evita isso no botão "Sair".
exitButton.addEventListener('beforexrselect', (event) => event.preventDefault());

// ---------- Loop ----------

// `frame` (XRFrame) só existe durante a sessão: é dele que saem as poses do
// quadro atual — dos resultados de hit-test e da âncora.
renderer.setAnimationLoop((time, frame) => {
  if (frame && hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace();

    const hits = frame.getHitTestResults(hitTestSource);
    lastHit = hits[0] ?? null;
    if (lastHit) {
      reticle.matrix.fromArray(lastHit.getPose(refSpace).transform.matrix);
      if (!placed && !reticle.visible) {
        hint.textContent = 'Toque para pôr o cubo.';
      }
    }
    reticle.visible = lastHit !== null;

    if (anchor && frame.trackedAnchors?.has(anchor)) {
      const pose = frame.getPose(anchor.anchorSpace, refSpace);
      if (pose) {
        holder.matrix.fromArray(pose.transform.matrix);
      }
    }
  }
  renderer.render(scene, camera);
});
