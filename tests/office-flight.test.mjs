import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STEP, TiltedBox, makeBody, stepBody, advance, simulate } from '../client/office/flight.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const kind = (extra = {}) => ({ radius: 0.1, low: 0.1, bounce: 0.5, roll: 1, drag: 0.1, throw: 8, tumble: 4, upright: false, centre: V(0, 0, 0), ...extra });
const deg = (a, b) => a.angleTo(b) * 180 / Math.PI;
const until = (b, world, done, limit = 2400) => { for (let i = 0; i < limit && !done(); i++) stepBody(b, world); };
const plate = (centre, half, rotation, extra = {}) => new TiltedBox({ centre, half, rotation, ...extra });
const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1));

test('the same throw lands in exactly the same place at any frame rate', () => {
  const world = { colliders: [plate([2, 0.5, 0], [0.05, 0.5, 1], [0, 0, 0.3]), box(3, 0, -1, 4, 0.8, 1)], ceiling: 2.6 };
  const k = kind({ radius: 0.07, low: 0.07 });
  const reference = makeBody(k, V(0, 1.2, 0.1), V(5, 2, 0.4));
  const out = simulate(reference, world, { maxTime: 20 });
  assert.ok(out.rest);
  const rates = [[1 / 30], [1 / 60], [1 / 144], [1 / 50, 1 / 75, 1 / 31, 1 / 120]];
  for (const list of rates) {
    const b = makeBody(k, V(0, 1.2, 0.1), V(5, 2, 0.4));
    for (let i = 0; !b.rest && i < 100000; i++) advance(b, list[i % list.length], world);
    assert.ok(b.rest);
    assert.deepEqual(b.pos.toArray(), out.pos);
  }
});

test('a ball bounces off a 45° plate at the right angle', () => {
  const world = { colliders: [plate([0, 0.5, 0], [1, 0.02, 1], [0, 0, Math.PI / 4])] };
  const b = makeBody(kind({ bounce: 1, roll: 0, drag: 0 }), V(0, 1.2, 0), V(0, 0, 0));
  let hit = false; world.onContact = () => { hit = true; };
  const before = () => b.vel.length();
  let fall = 0; until(b, world, () => hit && ((fall = fall || before()), true));
  stepBody(b, world); // the bounce was resolved in the step that reported it
  assert.ok(Math.abs(b.vel.y) / b.vel.length() < Math.sin(Math.PI / 180) + 0.02, 'horizontal');
  assert.ok(Math.abs(b.vel.length() - fall) / fall < 0.02);
});

test('edges and corners deflect along the line from the point of contact', () => {
  const corner = V(1, 1, 0);
  const world = { colliders: [box(0, 0.5, -1, 1, 1, 1)] };
  const b = makeBody(kind({ bounce: 1, roll: 0, drag: 0 }), V(1.04, 1.6, 0), V(0, -5, 0));
  const into = V(), from = V(); let reported = false; world.onContact = () => { reported = true; };
  until(b, world, () => { if (reported) return true; into.copy(b.vel); return false; });
  const centre = V().copy(b.pos), n = centre.clone().sub(corner).normalize();
  // the contact is resolved after onContact in the same step: read the velocity then
  const out = b.vel.clone();
  const expected = into.clone().addScaledVector(n, -2 * into.dot(n));
  assert.ok(deg(out, expected) < 2, `${deg(out, expected)}`);
});

test("a fast paper ball can't pass through a thin door", () => {
  for (let i = 0; i < 20; i++) {
    const angle = (i / 19) * Math.PI / 3 * (i % 2 ? 1 : -1), off = (i * 0.0137) % 0.05;
    const door = plate([0, 1, 0], [0.01, 1, 20], [0, 0, 0]); // a 2 cm plate, wide enough to go round only by tunnelling
    const speed = 12, dir = V(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(speed);
    const b = makeBody(kind({ radius: 0.045, low: 0.045, bounce: 0.3, drag: 0.02 }), V(-1 + off, 1, off), dir);
    for (let s = 0; s < 480; s++) stepBody(b, { colliders: [door] });
    assert.ok(b.pos.x < 0, `start ${i}: x ${b.pos.x}`);
  }
});

test('a ball on a sloped tray rolls off rather than freezing', () => {
  const tray = plate([0, 0.5, 0], [0.5, 0.01, 0.5], [0, 0, Math.PI / 6]); // slopes down towards +x
  const world = { colliders: [tray] };
  const b = makeBody(kind({ radius: 0.05, low: 0.05, roll: 0.5, drag: 0 }), V(0, 0.5 + 0.05 / Math.cos(Math.PI / 6) + 0.013, 0), V(0, 0, 0));
  const edge = tray.max.x;
  for (let s = 0; s < 240 * 8 && !b.rest; s++) stepBody(b, world);
  assert.ok(b.rest); assert.ok(b.pos.x > edge || b.pos.x < -edge); assert.ok(Math.abs(b.pos.y - 0.05) < 1e-6);
});

test('a body whose centre is inside a box comes out, with finite numbers', () => {
  const door = plate([0, 1, 0], [0.01, 1, 1], [0, 0, 0]);
  const b = makeBody(kind(), V(0.003, 1, 0), V(0, 0, 0));
  for (let s = 0; s < 240; s++) stepBody(b, { colliders: [door] });
  assert.ok(!door.containsPoint(b.pos));
  for (const v of [...b.pos.toArray(), ...b.vel.toArray(), ...b.spin.toArray()]) assert.ok(Number.isFinite(v));
  // a fast one that tunnelled to the middle goes back out the face it came in by
  const c = makeBody(kind(), V(0.005, 1, 0), V(-3, 0, 0));
  stepBody(c, { colliders: [door] }); assert.ok(c.pos.x > 0.01);
});

test('contacts name their surface', () => {
  const world = { colliders: [box(0, 0, 0, 1, 0.5, 1), box(2, 0, 0, 3, 0.5, 1)], ceiling: 2.6 };
  world.colliders.forEach(c => { c.surface = 'chair'; });
  const seen = new Set(), hits = [];
  world.onContact = (b, c) => { seen.add(c.surface); hits.push(c); };
  for (const [x, y, vy] of [[0.5, 1, -3], [2.5, 1, -3], [5, 1, -3], [5, 2.4, 6]]) {
    const b = makeBody(kind(), V(x, y, 0.5), V(0, vy, 0)); for (let s = 0; s < 120; s++) stepBody(b, world);
  }
  assert.deepEqual([...seen].sort(), ['ceiling', 'chair', 'floor']);
  assert.ok(hits.every(c => c.speed > 0));
});

test('a shot stops at 8 s at the latest', () => {
  const b = makeBody(kind({ gravity: 0, drag: 0 }), V(0, 1, 0), V(1, 0, 0));
  const out = simulate(b, { colliders: [] });
  assert.ok(out.time <= 8 && out.time > 7.99); assert.ok(!out.rest);
  assert.ok(out.path instanceof Float32Array && out.path.length === 480 * 3);
  const c = makeBody(kind(), V(0, 1, 0), V(1, 0, 0));
  assert.ok(simulate(c, { colliders: [] }, { stop: ({ surface }) => surface === 'floor' }).contacts.at(-1).surface === 'floor');
  assert.equal(STEP, 1 / 240);
});
