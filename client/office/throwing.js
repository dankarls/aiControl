// One way of throwing, for the office's loose things and whatever else you can have in hand: hold to charge, let go to throw, in
// a hand built like the one that throws darts. No document or window here, so what a throw does can be tested in Node.
import * as THREE from 'three';
import { toonMaterial } from './toon.js';

const HOLD = new THREE.Vector3(-0.3, -0.27, -0.8); // the palm, in front of the camera
const FINGERS = 0.016; // the fist's radius, before it's scaled to what it holds

// Full at a second, and it holds there. Even a tap throws: a quarter of what the thing can do.
export const chargeAt = held => Math.max(0, Math.min(1, held));
export const throwSpeed = (kind, charge) => kind.throw * (0.25 + 0.75 * charge);
// It leaves on the line you look along, so it goes where you look, on top of how you're moving, with a little lift.
export function launch(kind, charge, camera, direction, walk) {
  const pos = camera.position.clone().addScaledVector(direction, 0.5), vel = direction.clone().multiplyScalar(throwSpeed(kind, charge)).add(walk);
  vel.y += 1.2;
  return { pos, vel };
}

// `t` in seconds. A release with no press (or after a cancel) throws nothing.
export function createCharge() {
  let from = null;
  return {
    get active() { return from !== null; },
    press(t) { from ??= t; },
    level(t) { return from === null ? 0 : chargeAt(t - from); },
    release(t) { if (from === null) return null; const charge = chargeAt(t - from); from = null; return charge; },
    cancel() { from = null; },
  };
}

// The arm and grip, with `fist` where the fist is on the arm: the arm runs off the bottom left, like the mug's (camera.js).
export function handModel() {
  const arm = new THREE.Group(), grip = new THREE.Group(), ink = toonMaterial('#26252b');
  arm.add(grip); grip.rotation.set(0.3, -0.5, 0.2);
  const fist = new THREE.Vector3(0.006, -0.022, 0.068);
  grip.add(new THREE.Mesh(new THREE.SphereGeometry(FINGERS, 14, 10).scale(1, 1.1, 1.2).translate(fist.x, fist.y, fist.z), ink));
  for (const z of [0.044, 0.056]) grip.add(new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0042, 6, 12, Math.PI * 1.15).rotateZ(-0.35).translate(0, 0, z), ink));
  grip.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.022, 4, 8).rotateX(Math.PI / 2).rotateY(0.4).translate(-0.006, -0.007, 0.06), ink));
  grip.updateMatrix(); fist.applyMatrix4(grip.matrix); const wrist = new THREE.Vector3(0.006, -0.03, 0.08).applyMatrix4(grip.matrix);
  arm.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(wrist, new THREE.Vector3(-0.04, -0.12, 0.12), new THREE.Vector3(-0.14, -0.3, 0.3)), 16, 0.012, 8), ink));
  arm.add(new THREE.Mesh(new THREE.SphereGeometry(0.0125, 12, 8).translate(wrist.x, wrist.y, wrist.z), ink));
  return { arm, grip, fist };
}

// What you're holding sits at `palm`, the fist under it, sized to it. A real mesh goes with the hand, and clicks go through it
// till it's let go of. A thing that isn't one (null: an instance of a mesh of balls) is kept at `palm` by its owner.
// `hands.userData.full`: you don't sip from your mug with it.
export function createHand(hands) {
  const palm = new THREE.Group(), { arm, fist } = handModel();
  palm.position.copy(HOLD); palm.visible = false; palm.add(arm); hands.add(palm);
  const ignored = () => {}, ignore = node => { if (!Object.hasOwn(node, 'raycast')) node.raycast = ignored; }, notice = node => { if (node.raycast === ignored) delete node.raycast; };
  palm.traverse(ignore);
  let held = null;
  const letGo = () => { if (!held) return; held.traverse(notice); held.removeFromParent(); held = null; };
  const hand = {
    palm,
    hold(mesh, radius) {
      const size = 1.6 + radius * 12;
      arm.scale.setScalar(size); arm.position.set(0, -radius - FINGERS * size * 0.4, radius * 0.2).addScaledVector(fist, -size);
      letGo(); held = mesh; if (mesh) { palm.add(mesh); mesh.position.set(0, 0, 0); mesh.traverse(ignore); }
      palm.visible = hands.userData.full = true;
    },
    // Back towards you and tipped, the whole way at a full charge.
    pull(charge) { palm.position.set(HOLD.x - 0.04 * charge, HOLD.y, HOLD.z + 0.16 * charge); palm.rotation.x = 0.35 * charge; },
    free() { letGo(); palm.visible = hands.userData.full = false; hand.pull(0); },
  };
  return hand;
}
