// Matemática pura: orientação do aparelho → quaternion da câmera.
//
// Sem dependência do Three.js, para poder ser testada no Node (`node --test`).
// Quaternions são arrays [x, y, z, w]; vetores são arrays [x, y, z].
//
// Sistema de coordenadas da cena (o mesmo do Three.js): Y para cima,
// a câmera olha para -Z, X para a direita.

const DEG = Math.PI / 180;

export const IDENTITY = [0, 0, 0, 1];

// Rotação de `angle` radianos em torno do eixo unitário `axis`.
export function fromAxisAngle([ax, ay, az], angle) {
  const s = Math.sin(angle / 2);
  return [ax * s, ay * s, az * s, Math.cos(angle / 2)];
}

// Produto a * b: aplica primeiro b, depois a.
export function multiply([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// Euler na ordem 'YXZ' (primeiro Y, depois X, depois Z, em eixos locais),
// igual ao Quaternion.setFromEuler do Three.js.
export function fromEulerYXZ(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

// Aplica a rotação q ao vetor v (v' = q · v · q⁻¹).
export function rotateVector([vx, vy, vz], q) {
  const [x, y, z, w] = multiply(multiply(q, [vx, vy, vz, 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [x, y, z];
}

// Interpolação esférica de a até b (t = 0 → a, t = 1 → b).
export function slerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  // q e -q são a mesma rotação: escolher o caminho curto.
  if (cos < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    cos = -cos;
  }
  let ka, kb;
  if (cos > 0.9995) {
    // Quase iguais: interpolação linear basta (e evita dividir por ~0).
    ka = 1 - t;
    kb = t;
  } else {
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    ka = Math.sin((1 - t) * theta) / sin;
    kb = Math.sin(t * theta) / sin;
  }
  const q = [a[0] * ka + bx * kb, a[1] * ka + by * kb, a[2] * ka + bz * kb, a[3] * ka + bw * kb];
  const len = Math.hypot(...q);
  return q.map((c) => c / len);
}

// Rotação de −90° em X: sem ela, a câmera olharia "para fora do topo" do
// aparelho. Com ela, olha para fora da traseira (como a câmera traseira).
const BACK_CAMERA = fromAxisAngle([1, 0, 0], -Math.PI / 2);

// O coração do projeto: ângulos do DeviceOrientationEvent → quaternion.
//
// - alpha: giro em torno do eixo vertical (bússola), 0–360°
// - beta:  inclinação para frente/trás (eixo X do aparelho), −180–180°
// - gamma: inclinação para os lados (eixo Y do aparelho), −90–90°
// - screenAngle: rotação da tela (0 retrato, 90/−90/270 paisagem)
//
// A especificação W3C define a orientação como Rz(alpha)·Rx(beta)·Ry(gamma)
// num mundo com Z para cima. No mundo do Three.js o Y é que aponta para
// cima, então o mesmo giro vira Euler 'YXZ' com (beta, alpha, −gamma).
// Montar tudo em quaternion (e não Euler direto na câmera) evita o gimbal
// lock quando o celular passa pela vertical (beta ≈ 90°).
export function deviceQuaternion(alpha, beta, gamma, screenAngle = 0) {
  let q = fromEulerYXZ(beta * DEG, alpha * DEG, -gamma * DEG);
  q = multiply(q, BACK_CAMERA);
  // Em paisagem, a tela girou em relação ao aparelho: desfazer esse giro
  // em torno do eixo de visão (Z local da câmera).
  return multiply(q, fromAxisAngle([0, 0, 1], -screenAngle * DEG));
}

// Direção "para onde a câmera olha" no plano horizontal, como ângulo em
// torno de Y. Ry(yaw) leva (0, 0, −1) para a direção de visão.
export function yawOf(q) {
  const [fx, , fz] = rotateVector([0, 0, -1], q);
  if (Math.hypot(fx, fz) < 1e-3) {
    return null; // olhando reto para cima/baixo: yaw indefinido
  }
  return Math.atan2(-fx, -fz);
}

// Correção de "recentrar": um giro em torno de Y que leva a direção atual
// de visão para −Z (onde está o cubo). Aplicar como multiply(offset, q).
export function recenterOffset(q) {
  const yaw = yawOf(q);
  return yaw === null ? null : fromAxisAngle([0, 1, 0], -yaw);
}

// Modo órbita: a câmera fica a uma distância R do centro do cubo, no ponto
// para onde o "+Z local" dela aponta. Como ela olha para −Z local, fica
// sempre olhando para o cubo, qualquer que seja a orientação.
export function orbitPosition(q, center, radius) {
  const [ox, oy, oz] = rotateVector([0, 0, radius], q);
  return [center[0] + ox, center[1] + oy, center[2] + oz];
}

// Modo "olhar em volta": a câmera fica parada e só gira com o celular — o
// comportamento fisicamente correto para 3DoF (como uma foto 360°). Ela fica
// no mesmo ponto onde a órbita começa, então com o celular recentrado os dois
// modos mostram a mesma imagem; a diferença só aparece ao mexer.
export function lookAroundPosition(center, radius) {
  return [center[0], center[1], center[2] + radius];
}

// Posição da câmera para o modo escolhido ('orbita' | 'olhar').
export function cameraPosition(mode, q, center, radius) {
  return mode === 'olhar' ? lookAroundPosition(center, radius) : orbitPosition(q, center, radius);
}
