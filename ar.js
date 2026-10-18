// Fase 2 — WebXR AR (6DoF).
// Na fase 1 só tínhamos a rotação do aparelho. Aqui o ARCore rastreia rotação
// E posição juntando câmera + sensores, e o WebXR entrega a pose pronta a cada
// quadro: o Three.js a aplica na câmera sozinho (renderer.xr). Nós só
// colocamos o cubo num ponto fixo do mundo — quem se move é a câmera.
//
// Fluxo: uma retícula (anel) mostra onde o raio que sai do centro da tela
// encontra uma superfície real (hit-test); o toque põe o cubo ali.
// Se houver um modelo 3D em models/, ele entra no lugar do cubo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
// na superfície. Dentro do suporte, `content` é o que o usuário controla:
// giro (de frente para ele) e tamanho (botões − e +). Como sua origem é o
// ponto de apoio, escalar não afunda nem levanta o objeto.
const holder = new THREE.Group();
holder.matrixAutoUpdate = false;
holder.visible = false;
scene.add(holder);
const content = new THREE.Group();
holder.add(content);

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
// Sobe meia aresta para apoiar no chão em vez de ficar enterrado pela metade.
cube.position.y = CUBE_SIZE / 2;
content.add(cube);

// ---------- Modelo 3D (opcional) ----------

// Tentados em ordem; o primeiro que carregar substitui o cubo. Os dois
// "personagem" são para um modelo seu, só local (estão no .gitignore); sem
// eles o servidor responde 404 e vale o Fox. Se nada carregar, fica o cubo.
const MODEL_URLS = ['models/personagem.glb', 'models/personagem/scene.gltf', 'models/fox.glb'];
// Maior dimensão do modelo depois de escalado, em metros.
const MODEL_SIZE = 0.6;

let mixer = null;   // toca a animação do modelo, se ele tiver uma
const clock = new THREE.Clock();

// O cubo usa cores chapadas (MeshBasicMaterial), mas modelos glTF vêm com
// materiais que dependem de luz: uma luz ambiente (céu/chão) e um "sol".
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(1, 2, 1);
scene.add(sun);

async function loadFirstModel() {
  const loader = new GLTFLoader();
  for (const url of MODEL_URLS) {
    try {
      return await loader.loadAsync(url);
    } catch {
      // não existe ou não carregou: tenta o próximo
    }
  }
  return null;
}

loadFirstModel().then((gltf) => {
  if (!gltf) {
    return;
  }
  const model = gltf.scene;
  // Cada modelo vem na sua própria escala e posição (no Fox, 1 unidade ≈
  // 1 cm). Normalizar: maior dimensão = MODEL_SIZE, centro em X/Z na origem
  // e pés em Y = 0, para ficar apoiado na superfície.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.y, size.z));
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  content.remove(cube);
  content.add(model);
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[0]).play();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Botões − e +: cada toque multiplica/divide o tamanho por este fator.
const SCALE_STEP = 1.25;
const MIN_SCALE = 0.2;
const MAX_SCALE = 10;

function resize(factor) {
  const scale = THREE.MathUtils.clamp(content.scale.x * factor, MIN_SCALE, MAX_SCALE);
  content.scale.setScalar(scale);
}

// ---------- Suporte ----------

const startScreen = document.getElementById('start');
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');
const status = document.getElementById('status');
const arButton = document.getElementById('btn-ar');
const exitButton = document.getElementById('btn-exit');
const controls = document.getElementById('controls');

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
  session.addEventListener('select', place);

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

// Toque na tela (evento 'select' do WebXR): põe o cubo/modelo onde está a retícula.
function place() {
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
  // De frente para quem tocou: posição da câmera no referencial do suporte →
  // ângulo em volta do eixo Y (a normal da superfície). Modelos glTF olham
  // para +Z, e atan2(x, z) é o giro que leva +Z até a câmera.
  holder.updateMatrixWorld(true);
  const viewer = holder.worldToLocal(renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()));
  content.rotation.y = Math.atan2(viewer.x, viewer.z);
  placed = true;
  hint.textContent = 'Ande em volta. Toque de novo para mudar de lugar.';
}

arButton.addEventListener('click', enterAR);
exitButton.addEventListener('click', () => {
  renderer.xr.getSession()?.end();
});
document.getElementById('btn-smaller').addEventListener('click', () => resize(1 / SCALE_STEP));
document.getElementById('btn-bigger').addEventListener('click', () => resize(SCALE_STEP));
// Com DOM overlay, tocar num elemento HTML também geraria 'select' (e moveria
// o objeto). Cancelar este evento evita isso nos botões.
controls.addEventListener('beforexrselect', (event) => event.preventDefault());

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
        hint.textContent = 'Toque para posicionar.';
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
  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
});
