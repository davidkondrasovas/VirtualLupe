// Fase 2 — WebXR AR (6DoF).
// Na fase 1 só tínhamos a rotação do aparelho. Aqui o ARCore rastreia rotação
// E posição juntando câmera + sensores, e o WebXR entrega a pose pronta a cada
// quadro: o Three.js a aplica na câmera sozinho (renderer.xr). Nós só
// colocamos o cubo num ponto fixo do mundo — quem se move é a câmera.
//
// Fluxo: uma retícula (anel) mostra onde o raio que sai do centro da tela
// encontra uma superfície real (hit-test); o toque põe o cubo ali.
// Um botão troca o cubo pelos modelos 3D listados em models/; outro alterna a
// iluminação entre fixa e estimada pelo ARCore, para comparar.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';

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
// ponto de apoio, escalar não afunda nem levanta o objeto. `content` guarda o
// objeto à vista (em `slot`, trocado pelo botão de modelo) e a sombra.
const holder = new THREE.Group();
holder.matrixAutoUpdate = false;
holder.visible = false;
scene.add(holder);
const content = new THREE.Group();
holder.add(content);
const slot = new THREE.Group();
content.add(slot);

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
cube.castShadow = true;
slot.add(cube);

// ---------- Modelos 3D ----------

// O botão de modelo alterna entre os listados em models/models.json
// (publicados) e models/local.json (opcional, no .gitignore: modelos seus,
// só para teste local). Os locais vêm primeiro; o cubo é sempre o último.
// Formato: [{ "name": "Raposa", "url": "models/fox.glb" }].
const MODEL_LISTS = ['models/local.json', 'models/models.json'];
// Maior dimensão do modelo depois de escalado, em metros.
const MODEL_SIZE = 0.6;

const models = [];        // { name, url }; url null = o cubo
let modelIndex = 0;
let mixer = null;         // toca a animação do modelo à vista, se ele tiver uma
let showRequests = 0;     // conta trocas, para ignorar carregamentos atrasados
const clock = new THREE.Clock();
const loader = new GLTFLoader();
const loadedModels = new Map(); // url → Promise de { object, mixer }, cada um carregado uma vez só
const modelButton = document.getElementById('btn-model');

async function readModelList(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : []; // 404 = lista não existe
  } catch {
    return [];
  }
}

// Cada modelo vem na sua própria escala e posição (no Fox, 1 unidade ≈
// 1 cm). Normalizar: maior dimensão = MODEL_SIZE, centro em X/Z na origem
// e pés em Y = 0, para ficar apoiado na superfície.
function normalize(gltf) {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(MODEL_SIZE / Math.max(size.x, size.y, size.z));
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.traverse((child) => {
    child.castShadow = child.isMesh;
  });

  let modelMixer = null;
  if (gltf.animations.length > 0) {
    modelMixer = new THREE.AnimationMixer(model);
    modelMixer.clipAction(gltf.animations[0]).play();
  }
  return { object: model, mixer: modelMixer };
}

function loadModel(url) {
  if (!loadedModels.has(url)) {
    loadedModels.set(url, loader.loadAsync(url).then(normalize).catch((error) => {
      loadedModels.delete(url); // falhou: tenta de novo na próxima vez
      throw error;
    }));
  }
  return loadedModels.get(url);
}

async function showModel(index) {
  modelIndex = index;
  const { name, url } = models[index];
  modelButton.textContent = `${name} ⟳`;
  const request = ++showRequests;
  let shown = { object: cube, mixer: null };
  if (url) {
    try {
      shown = await loadModel(url);
    } catch {
      hint.textContent = `Não foi possível carregar "${name}"; mostrando o cubo.`;
    }
  }
  if (request !== showRequests) {
    return; // o usuário já pediu outro modelo enquanto este carregava
  }
  slot.clear();
  slot.add(shown.object);
  mixer = shown.mixer;
}

Promise.all(MODEL_LISTS.map(readModelList)).then((lists) => {
  models.push(...lists.flat(), { name: 'Cubo', url: null });
  showModel(0);
});

modelButton.addEventListener('click', () => {
  if (models.length > 0) {
    showModel((modelIndex + 1) % models.length);
  }
});

// ---------- Luz e sombra ----------

// O cubo usa cores chapadas (MeshBasicMaterial), mas modelos glTF vêm com
// materiais físicos (PBR), que dependem da luz e dos reflexos do ambiente.
// Dois modos, alternados pelo botão de luz:
// - fixa: luz céu/chão + um "sol" numa direção fixa + reflexos de uma sala
//   genérica (RoomEnvironment);
// - ARCore: o WebXR ('light-estimation') estima pela câmera a luz do ambiente
//   real — luz ambiente, direção/cor/intensidade da luz principal e um mapa
//   de reflexos. O addon XREstimatedLight entrega isso como luzes do Three.js.
const FIXED_SUN_DIRECTION = new THREE.Vector3(1, 2, 1).normalize();
const FIXED_SUN_INTENSITY = 1.5;
// O sol fica a esta distância do objeto, na direção da luz, mirando nele.
const SUN_DISTANCE = 3;

renderer.shadowMap.enabled = true;

const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnvironment;

const hemisphere = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemisphere);

// O sol é sempre esta luz — no modo ARCore ela copia a estimativa —, porque
// é ela que projeta a sombra e precisa acompanhar o objeto (ver aimSun).
const sun = new THREE.DirectionalLight(0xffffff, FIXED_SUN_INTENSITY);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Plano que só mostra a sombra: o resto dele é transparente e o chão real
// aparece. Fica em `content`, então acompanha o tamanho do objeto.
const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(MODEL_SIZE * 3, MODEL_SIZE * 3).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.35 }),
);
shadowPlane.receiveShadow = true;
content.add(shadowPlane);

const estimatedLight = new XREstimatedLight(renderer);
estimatedLight.directionalLight.visible = false; // quem ilumina é o sol, com os valores dela
let estimating = false;      // o ARCore está mandando estimativas
let wantsEstimate = true;    // escolha do usuário no botão de luz
const lightButton = document.getElementById('btn-light');

estimatedLight.addEventListener('estimationstart', () => {
  estimating = true;
  updateLightMode();
});
estimatedLight.addEventListener('estimationend', () => {
  estimating = false;
  updateLightMode();
});

function usingEstimate() {
  return estimating && wantsEstimate;
}

function updateLightMode() {
  const arcore = usingEstimate();
  if (arcore) {
    scene.add(estimatedLight); // traz a luz ambiente estimada (light probe)
  } else {
    scene.remove(estimatedLight);
    sun.color.set(0xffffff);
    sun.intensity = FIXED_SUN_INTENSITY;
  }
  hemisphere.visible = !arcore;
  scene.environment = (arcore && estimatedLight.environment) || roomEnvironment;
  if (arcore) {
    lightButton.textContent = 'Luz: ARCore ⟳';
  } else if (estimating || !wantsEstimate) {
    lightButton.textContent = 'Luz: fixa ⟳';
  } else {
    lightButton.textContent = 'Luz: fixa (sem estimativa)';
  }
}
updateLightMode();

lightButton.addEventListener('click', () => {
  wantsEstimate = !wantsEstimate;
  updateLightMode();
});

const holderPosition = new THREE.Vector3();
const sunDirection = new THREE.Vector3();

// A cada quadro: põe o sol na direção da luz (fixa ou estimada), mirando no
// objeto, e ajusta a área coberta pela sombra ao tamanho dele.
function aimSun() {
  sunDirection.copy(FIXED_SUN_DIRECTION);
  if (usingEstimate()) {
    const estimate = estimatedLight.directionalLight;
    sun.color.copy(estimate.color);
    sun.intensity = estimate.intensity;
    if (estimate.position.lengthSq() > 1e-6) {
      sunDirection.copy(estimate.position).normalize();
    }
  }
  holder.getWorldPosition(holderPosition);
  sun.target.position.copy(holderPosition);
  sun.target.updateMatrixWorld();
  sun.position.copy(holderPosition).addScaledVector(sunDirection, SUN_DISTANCE);

  const radius = MODEL_SIZE * content.scale.x;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -radius;
  shadowCamera.right = shadowCamera.top = radius;
  shadowCamera.near = 0.1;
  shadowCamera.far = SUN_DISTANCE + 2 * radius;
  shadowCamera.updateProjectionMatrix();
}

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
      // Light estimation: estimativa da luz real (ver "Luz e sombra").
      optionalFeatures: ['dom-overlay', 'anchors', 'light-estimation'],
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
  aimSun();
  renderer.render(scene, camera);
});
