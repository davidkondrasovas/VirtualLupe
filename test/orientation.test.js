import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY, fromAxisAngle, multiply, rotateVector, slerp,
  deviceQuaternion, yawOf, recenterOffset, orbitPosition,
} from '../orientation.js';

const FORWARD = [0, 0, -1];
const UP = [0, 1, 0];

function assertVecClose(actual, expected, eps = 1e-9) {
  actual.forEach((v, i) => {
    assert.ok(Math.abs(v - expected[i]) < eps, `esperado [${expected}], obtido [${actual}]`);
  });
}

// q e -q representam a mesma rotação.
function assertSameRotation(a, b, eps = 1e-9) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  assert.ok(Math.abs(Math.abs(dot) - 1) < eps, `rotações diferentes: [${a}] vs [${b}]`);
}

test('Dado celular em pé em retrato, Quando calcula, Então câmera olha para frente com topo para cima', () => {
  const q = deviceQuaternion(0, 90, 0, 0);
  assertVecClose(rotateVector(FORWARD, q), [0, 0, -1]);
  assertVecClose(rotateVector(UP, q), [0, 1, 0]);
});

test('Dado celular deitado com tela para cima, Quando calcula, Então câmera traseira olha para o chão', () => {
  const q = deviceQuaternion(0, 0, 0, 0);
  assertVecClose(rotateVector(FORWARD, q), [0, -1, 0]);
});

test('Dado celular em pé girado 90° à esquerda (alpha=90), Quando calcula, Então câmera olha para -X', () => {
  const q = deviceQuaternion(90, 90, 0, 0);
  assertVecClose(rotateVector(FORWARD, q), [-1, 0, 0]);
  assertVecClose(rotateVector(UP, q), [0, 1, 0]);
});

test('Dado celular em pé em paisagem (topo à esquerda, tela 90°), Quando calcula, Então imagem fica de pé', () => {
  // Nessa postura o aparelho reporta alpha=90, beta=0, gamma=-90.
  const q = deviceQuaternion(90, 0, -90, 90);
  assertVecClose(rotateVector(FORWARD, q), [0, 0, -1]);
  assertVecClose(rotateVector(UP, q), [0, 1, 0]);
});

test('Dado beta passando por 90°, Quando calcula, Então a direção de visão varia continuamente', () => {
  let previous = rotateVector(FORWARD, deviceQuaternion(30, 85, 10, 0));
  for (let beta = 85.5; beta <= 95; beta += 0.5) {
    const current = rotateVector(FORWARD, deviceQuaternion(30, beta, 10, 0));
    const jump = Math.hypot(...current.map((v, i) => v - previous[i]));
    assert.ok(jump < 0.02, `salto de ${jump} em beta=${beta}`);
    previous = current;
  }
});

test('Dado câmera virada para um lado, Quando recentra, Então volta a olhar para -Z', () => {
  const q = deviceQuaternion(137, 70, 5, 0);
  const centered = multiply(recenterOffset(q), q);
  assert.ok(Math.abs(yawOf(centered)) < 1e-9);
});

test('Dado câmera olhando reto para baixo, Quando pede yaw, Então é indefinido', () => {
  assert.equal(yawOf(deviceQuaternion(0, 0, 0, 0)), null);
  assert.equal(recenterOffset(deviceQuaternion(0, 0, 0, 0)), null);
});

test('Dado qualquer orientação, Quando calcula órbita, Então câmera fica a distância R olhando para o centro', () => {
  const center = [0, 0, 0];
  const q = deviceQuaternion(200, 40, -30, 0);
  const pos = orbitPosition(q, center, 4);
  assert.ok(Math.abs(Math.hypot(...pos) - 4) < 1e-9);
  // A direção de visão aponta da câmera para o centro.
  const toCenter = pos.map((v) => -v / 4);
  assertVecClose(rotateVector(FORWARD, q), toCenter);
});

test('Dado orientação identidade, Quando calcula órbita, Então câmera fica em +Z do centro', () => {
  assertVecClose(orbitPosition(IDENTITY, [1, 2, 3], 4), [1, 2, 7]);
});

test('Dado dois quaternions, Quando slerp, Então extremos batem e meio é metade do ângulo', () => {
  const b = fromAxisAngle([0, 1, 0], Math.PI / 2);
  assertSameRotation(slerp(IDENTITY, b, 0), IDENTITY);
  assertSameRotation(slerp(IDENTITY, b, 1), b);
  assertSameRotation(slerp(IDENTITY, b, 0.5), fromAxisAngle([0, 1, 0], Math.PI / 4));
});

test('Dado quaternion alvo com sinal invertido, Quando slerp, Então segue o caminho curto', () => {
  const b = fromAxisAngle([0, 1, 0], 0.2);
  const negB = b.map((v) => -v);
  assertSameRotation(slerp(IDENTITY, negB, 0.5), fromAxisAngle([0, 1, 0], 0.1));
});
