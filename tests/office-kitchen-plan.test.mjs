import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeBody, simulate, TiltedBox } from '../client/office/flight.js';
import { KITCHEN, TIERS, ZONES, SPOTS, flightBoxes, walkBoxes, surfaceTier, levelWorld } from '../client/office/kitchen-plan.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ball = { radius: 0.05, low: 0.05, bounce: 0.5, roll: 1, drag: 0.1, upright: false };
const tilted = b => b instanceof TiltedBox && Math.abs(b.quaternion.w) < 0.9999;
const named = (boxes, re) => boxes.filter(b => re.test(b.surface));

test('every surface has a tier', () => {
  for (const b of flightBoxes()) assert.ok(TIERS[surfaceTier(b.surface)], b.surface);
  assert.equal(surfaceTier('floor'), 'floor'); assert.equal(surfaceTier('ceiling'), 'large');
  assert.throws(() => surfaceTier('nonsense'));
});

test('walls and ceiling are the only large surfaces, and cupboard doors, pans and the tray are hard', () => {
  const boxes = flightBoxes();
  for (const b of boxes) assert.equal(surfaceTier(b.surface) === 'large', b.surface.startsWith('wall-'), b.surface);
  for (const re of [/^cupboard-/, /^pan-/, /^tray$/]) { const list = named(boxes, re); assert.ok(list.length); for (const b of list) assert.equal(surfaceTier(b.surface), 'hard'); }
  assert.equal(named(boxes, /^cupboard-/).length, 6); assert.equal(named(boxes, /^pan-/).length, 3);
  for (const s of ['bin', 'bucket', 'basket', 'sink', 'tableMug']) assert.equal(surfaceTier(s), 'floor');
  assert.equal(surfaceTier('shelf'), 'normal');
});

test('the angled things really are angled', () => {
  const boxes = flightBoxes();
  assert.ok(named(boxes, /^cupboard-/).filter(tilted).length >= 3);
  for (const re of [/^chair-/, /^tray$/, /^pan-/, /^fridge$/]) assert.ok(named(boxes, re).some(tilted), String(re));
});

test('a cupboard door swings from its hinge edge, which stays put', () => {
  const doors = flightBoxes().filter(b => /^cupboard-/.test(b.surface));
  doors.forEach((d, i) => {
    const hinge = V(-d.half.x, 0, -d.half.z).applyQuaternion(d.quaternion).add(d.centre);
    assert.ok(Math.abs(hinge.x - (-8.6 + i * 1.18)) < 1e-9 && Math.abs(hinge.z + 5.55) < 1e-9, d.surface);
  });
  const fridge = flightBoxes().find(b => b instanceof TiltedBox && b.surface === 'fridge'), h = V(-fridge.half.x, 0, -fridge.half.z).applyQuaternion(fridge.quaternion).add(fridge.centre);
  assert.ok(Math.abs(h.x + 9.8) < 1e-9 && Math.abs(h.z + 5.25) < 1e-9);
});

test('an item can be dropped into each container and stay', () => {
  for (const [name, zone] of Object.entries(ZONES)) {
    const b = makeBody(ball, V(zone.centre.x, zone.centre.y + 0.8, zone.centre.z), V(0, 0, 0));
    const out = simulate(b, levelWorld(), { maxTime: 10 });
    assert.ok(out.rest, name);
    const d = V(...out.pos).sub(zone.centre);
    assert.ok(Math.abs(d.x) <= zone.half.x && Math.abs(d.y) <= zone.half.y && Math.abs(d.z) <= zone.half.z, `${name} ended at ${out.pos}`);
    assert.ok(out.contacts.some(c => c.box && c.box.surface === name), `${name} was landed on`);
  }
});

test('the doorway is open or shut by option, and the walls hold things in', () => {
  const gap = list => list.filter(b => b.surface === 'wall-e' && b.min.z < 0.75 && b.max.z > -0.75 && b.min.y < 1);
  assert.equal(gap(flightBoxes(undefined, { doorShut: false })).length, 0);
  assert.equal(gap(flightBoxes()).length, 1);
  for (const b of flightBoxes().filter(b => b.surface.startsWith('wall-'))) assert.ok(Math.min(b.max.x - b.min.x, b.max.z - b.min.z) >= 0.2 - 1e-9);
  const b = makeBody(ball, V(-1, 1, 0), V(12, 0, 0)), out = simulate(b, levelWorld(), { maxTime: 3 });
  assert.ok(out.contacts[0].surface === 'wall-e' && out.pos[0] < 0);
});

test('a leaning tray is a ramp: a ball rolled at it from the room climbs it', () => {
  const b = makeBody(ball, V(-8.5, 0.05, -0.5), V(-5, 0, 0)), out = simulate(b, levelWorld(), { maxTime: 2 });
  assert.ok(out.contacts.some(c => c.box?.surface === 'tray'));
  assert.ok(Math.max(...out.path.filter((_, i) => i % 3 === 1)) > 0.3);
});

test('a moved plan is the same plan shifted', () => {
  const at = { x: 7, z: -3 }, a = flightBoxes(), b = flightBoxes(at);
  assert.equal(a.length, b.length);
  a.forEach((p, i) => {
    assert.equal(p.surface, b[i].surface);
    for (const k of ['min', 'max']) assert.ok(Math.abs(b[i][k].x - p[k].x - 7) < 1e-9 && Math.abs(b[i][k].z - p[k].z + 3) < 1e-9 && Math.abs(b[i][k].y - p[k].y) < 1e-9);
    if (p.quaternion) assert.ok(p.quaternion.angleTo(b[i].quaternion) < 1e-6);
  });
  const w = walkBoxes(at); assert.equal(w.length, walkBoxes().length);
});

test('walk boxes are marked, and leave the doorway and the room reachable', () => {
  const walk = walkBoxes(); assert.ok(walk.length > 10);
  for (const w of walk) assert.ok(w.walkOnly && w.isBox3);
  assert.ok(!walk.some(w => w.max.x > -2.3 && w.min.z < 0.75 && w.max.z > -0.75), 'the doorway lane is clear');
  const R = 0.3, N = 0.1; // the player's radius
  const free = (x, z) => x > -KITCHEN.width + R && x < -R && z > KITCHEN.back + R && z < KITCHEN.front - R && !walk.some(w => x > w.min.x - R && x < w.max.x + R && z > w.min.z - R && z < w.max.z + R);
  const seen = new Set(), key = (x, z) => `${x.toFixed(1)},${z.toFixed(1)}`, queue = [[-0.5, 0]];
  assert.ok(free(-0.5, 0)); seen.add(key(-0.5, 0));
  while (queue.length) { const [x, z] = queue.pop(); for (const [dx, dz] of [[N, 0], [-N, 0], [0, N], [0, -N]]) { const nx = x + dx, nz = z + dz; if (free(nx, nz) && !seen.has(key(nx, nz))) { seen.add(key(nx, nz)); queue.push([nx, nz]); } } }
  const front = (x, z) => seen.has(key(x, z));
  const zoneFront = { bin: [-1.2, -2.5], bucket: [-8.8, -4.2], basket: [-3.9, -2.7], shelf: [-9.5, -2.6], sink: [-6.8, -4.9], tray: [-8.8, -0.5], vending: [-8.85, 0.4], islandWest: [-7.1, -3.6], lunch: [-6.0, -0.9] };
  for (const [n, [x, z]] of Object.entries(zoneFront)) assert.ok(front(x, z) || front(x + 0.1, z) || front(x, z + 0.1) || front(x - 0.1, z) || front(x, z - 0.1), `${n} reachable`);
  assert.ok(SPOTS.clipboard && SPOTS.scores && SPOTS.lunchTables.length === 4);
});
