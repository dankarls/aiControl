import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bracketsFor, boxCorners } from '../client/bridge/brackets.js';

const camera = new THREE.PerspectiveCamera(90, 1, .2, 34); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
const box = (x0, x1, y0, y1, z0, z1) => { const out = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new THREE.Vector3(x, y, z)); return out; };

test('brackets surround the projected corners', () => {
  const out = bracketsFor(box(-1, 1, -1, 1, -2, -2), camera);
  for (const [k, v] of Object.entries({ left: -.5, right: .5, bottom: -.5, top: .5 })) assert.ok(Math.abs(out[k] - v) < 1e-6, k);
});
test('nothing for something behind the camera', () => assert.equal(bracketsFor(box(-1, 1, -1, 1, 2, 3), camera), null));
test('nothing for something off to the side', () => assert.equal(bracketsFor(box(5, 6, -1, 1, -2, -2), camera), null));
test('something you stand inside or beside stays on screen and finite', () => {
  const out = bracketsFor(box(-1, 1, -1, 1, -2, 2), camera);
  for (const v of Object.values(out)) assert.ok(Number.isFinite(v) && Math.abs(v) <= 1);
});
test('a box has eight corners, taken from the object in the world', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); mesh.position.set(5, 0, 0); mesh.updateMatrixWorld(true);
  const corners = boxCorners(mesh);
  assert.equal(corners.length, 8);
  assert.ok(corners.every(({ x, y, z }) => (x === 4 || x === 6) && Math.abs(y) === 1 && Math.abs(z) === 1));
});
