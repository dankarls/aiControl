import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createKitchen, DOOR_NEAR, DOOR_FAR } from '../client/office/kitchen.js';
import { KITCHEN } from '../client/office/kitchen-plan.js';
import { kitchenDoor, kitchenShift } from '../client/office/layout.js';
import { WALL_H, WALL_T } from '../client/office/furniture.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// No document in Node: a blank canvas for its textures.
const blank = () => new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => { t[k] = v; return true; } });
const DEPTH = 10, door = kitchenDoor(DEPTH), inRoom = V(-3, 1.6, door), near = V(1, 1.6, door), far = V(6, 1.6, door);
// The office's left wall, as room.js stands it.
const leftWall = depth => { const wall = new THREE.Group(); wall.position.set(-WALL_T / 2, WALL_H / 2, depth / 2); wall.rotation.y = Math.PI / 2; return wall; };

function setup(t, depth = DEPTH) {
  const was = globalThis.document; globalThis.document = { createElement: () => ({ getContext: blank }) };
  t.after(() => { if (was) globalThis.document = was; else delete globalThis.document; });
  const events = { moves: 0, shifts: [] }, kitchen = createKitchen({ onMove: () => events.moves++ });
  kitchen.moved = dz => events.shifts.push([dz, kitchen.origin.z]);
  const walking = kitchen.build({ depth, shell: new THREE.Group(), wall: leftWall(depth) });
  return { kitchen, events, walking };
}
const fill = kitchen => kitchen.flight.filter(b => b.surface === 'wall-e');
const run = (kitchen, at, seconds = 1, still = false, overview = 0) => { for (let i = 0; i < seconds * 60; i++) kitchen.update(1 / 60, at, still, overview); };

test('sits at the left wall with the door in the middle of its door side, inside only past the wall', t => {
  const { kitchen } = setup(t);
  assert.deepEqual(kitchen.origin, { x: -WALL_T, z: door });
  assert.deepEqual(kitchen.group.position.toArray(), [-WALL_T, 0, door]);
  assert.ok(kitchen.inside(inRoom));
  assert.ok(!kitchen.inside(near), 'the office');
  assert.ok(!kitchen.inside(V(-3, 1.6, door + KITCHEN.front + 0.5)), 'past its south wall');
  assert.ok(!kitchen.inside(V(-3, 1.6, door + KITCHEN.back - 0.5)), 'past its north wall');
  assert.ok(!kitchen.inside(V(-WALL_T - KITCHEN.width - 0.5, 1.6, door)), 'past its west wall');
});

test('nothing is built until you first go near, and the doorway is solid to thrown things till then', t => {
  const { kitchen } = setup(t);
  run(kitchen, far);
  assert.equal(kitchen.group.children.length, 0);
  assert.equal(kitchen.group.visible, false);
  assert.equal(fill(kitchen).length, 1, 'the shut door');
  assert.equal(kitchen.flight.length, 1, 'and nothing of the room');
  const [box] = fill(kitchen);
  assert.ok(box.min.x === -WALL_T && Math.abs(box.max.x) < 1e-9 && box.min.z === door - 0.75 && box.max.z === door + 0.75 && box.max.y === 2.2);
  run(kitchen, near);
  assert.ok(kitchen.group.children.length > 0);
  assert.equal(kitchen.group.visible, true);
  assert.equal(kitchen.group.matrixWorldAutoUpdate, true);
  assert.equal(kitchen.shown, true);
  const built = kitchen.group.children[0];
  run(kitchen, far, 2); run(kitchen, near);
  assert.equal(kitchen.group.children[0], built, 'built once');
});

test('the doors open within 2.5 m, close past 3 m, and their box is there only while shut', t => {
  const { kitchen, events } = setup(t);
  assert.equal(DOOR_NEAR, 2.5); assert.equal(DOOR_FAR, 3);
  run(kitchen, V(2.3, 1.6, door), 0.1);
  assert.equal(fill(kitchen).length, 0, 'gone as soon as they start to open');
  assert.ok(kitchen.flight.length > 50, 'and the room has joined');
  const open = kitchen.flight, moves = events.moves;
  run(kitchen, V(2.8, 1.6, door), 1);
  assert.equal(kitchen.flight, open, 'stays open between the two distances, and the list is left alone');
  assert.equal(events.moves, moves);
  run(kitchen, V(3.1, 1.6, door), 2);
  assert.equal(fill(kitchen).length, 1, 'shut');
  assert.ok(kitchen.flight.length > 50, 'what it has built stays');
  assert.notEqual(kitchen.flight, open, 'a new list');
  assert.equal(kitchen.group.visible, false, 'skipped once shut');
  assert.equal(kitchen.shown, false, 'and says so');
  run(kitchen, V(2.8, 1.6, door), 1);
  assert.equal(fill(kitchen).length, 1, 'between the two distances shut stays shut');
});

test('they stay open while you are inside, however far in, and only shut(true) holds them', t => {
  const { kitchen } = setup(t);
  run(kitchen, near); run(kitchen, V(-8, 1.6, door - 3), 2);
  assert.equal(fill(kitchen).length, 0);
  kitchen.shut(true); run(kitchen, V(-8, 1.6, door - 3), 2);
  assert.equal(fill(kitchen).length, 1);
  assert.equal(kitchen.group.visible, true, 'inside, it still shows');
  run(kitchen, V(-1, 1.6, door), 2);
  assert.equal(fill(kitchen).length, 1, 'held shut with you beside them');
  kitchen.shut(false); run(kitchen, V(-1, 1.6, door), 0.1);
  assert.equal(fill(kitchen).length, 0);
});

test('with reduced motion they jump', t => {
  const { kitchen } = setup(t), [a, b] = kitchen.doors.children.filter(c => c.userData.leaf);
  kitchen.update(1 / 60, far, true, 0); const shutA = a.rotation.y, shutB = b.rotation.y;
  kitchen.update(1 / 60, near, true, 0);
  assert.ok(Math.abs(a.rotation.y - shutA) > 1.4 && Math.abs(b.rotation.y - shutB) > 1.4, 'wide open in one frame');
  kitchen.update(1 / 60, far, true, 0);
  assert.equal(a.rotation.y, shutA);
  kitchen.update(1 / 60, near, false, 0);
  assert.ok(Math.abs(a.rotation.y - shutA) < 0.5, 'otherwise a swing');
});

test('the leaves swing into the kitchen, and shut they fill the doorway', t => {
  const { kitchen } = setup(t), leaves = kitchen.doors.children.filter(c => c.userData.leaf), tip = l => l.localToWorld(V(0, 1, 0.74));
  run(kitchen, far, 0.1, true);
  const shut = leaves.map(tip);
  assert.ok(Math.abs(shut[0].z - shut[1].z) < 0.03, 'they meet');
  assert.ok(Math.abs(shut[0].z - door) < 0.03);
  for (const p of shut) assert.ok(p.x < 0 && p.x > -WALL_T, 'in the wall');
  run(kitchen, near, 0.1, true);
  for (const l of leaves) assert.ok(tip(l).x < -WALL_T - 0.6, `${tip(l).x}`);
});

test('in the overview it is skipped whole, and hidden no ray goes in', t => {
  const { kitchen } = setup(t);
  run(kitchen, inRoom, 0.1);
  assert.equal(kitchen.group.visible, true);
  assert.notEqual(kitchen.group.raycast(), false);
  run(kitchen, inRoom, 0.1, false, 0.5);
  assert.equal(kitchen.group.visible, false);
  assert.equal(kitchen.group.matrixWorldAutoUpdate, false);
  assert.equal(kitchen.group.raycast(), false);
});

test('growing the room moves the same group and tells whoever cares first', t => {
  const { kitchen, events } = setup(t, 8);
  run(kitchen, V(1, 1.6, kitchenDoor(8)));
  const child = kitchen.group.children[0], group = kitchen.group, list = kitchen.flight;
  const walls = kitchen.build({ depth: 8, shell: new THREE.Group(), wall: leftWall(8) });
  assert.deepEqual(events.shifts, [], 'same depth, no move');
  kitchen.build({ depth: 10, shell: new THREE.Group(), wall: leftWall(10) });
  assert.deepEqual(events.shifts, [[kitchenShift(8, 10), kitchenDoor(8)]], 'told while the kitchen is still where it was');
  assert.equal(kitchen.group, group); assert.equal(kitchen.group.children[0], child);
  assert.equal(kitchen.group.position.z, kitchenDoor(10));
  assert.notEqual(kitchen.flight, list);
  list.forEach((b, i) => assert.ok(Math.abs(kitchen.flight[i].min.z - b.min.z - 2) < 1e-9 && Math.abs(kitchen.flight[i].min.x - b.min.x) < 1e-9, b.surface));
  assert.ok(walls.length);
});

test('what it hands back: walls and walk boxes, walls only as far as the office wall, and no piece of the wall twice', t => {
  const { kitchen, walking } = setup(t);
  assert.deepEqual(walking.filter(b => !b.walkOnly).map(b => b.surface).sort(), ['wall-n', 'wall-s', 'wall-w']);
  assert.ok(walking.filter(b => b.walkOnly).length > 10);
  assert.ok(walking.every(b => b.isBox3));
  const back = walking.find(b => b.surface === 'behind');
  assert.ok(back.walkOnly && back.min.z === 0 && back.max.z === door + KITCHEN.back - WALL_T, 'nowhere to end up behind its north wall');
  run(kitchen, near);
  assert.deepEqual(kitchen.flight.filter(b => b.surface.startsWith('wall-')), [], 'open: the office wall stands there already');
  assert.ok(kitchen.flight.some(b => b.surface === 'tray') && kitchen.flight.some(b => b.surface === 'pan-1'));
  assert.ok(!kitchen.flight.some(b => b.walkOnly));
});

test('a game gets the group when it is built, is updated with it, and what it stands on the floor blocks walking', t => {
  const { kitchen } = setup(t), calls = [];
  const game = { build: group => calls.push(['build', group]), update: (dt, at, still, shown) => calls.push(['update', shown]), blocks: [new THREE.Box3(V(-2, 0, -1), V(-1, 1, 0))] };
  kitchen.add(game);
  const walking = kitchen.build({ depth: DEPTH, shell: new THREE.Group(), wall: leftWall(DEPTH) });
  const block = walking.find(b => Math.abs(b.min.x - (-2 - WALL_T)) < 1e-9 && Math.abs(b.min.z - (door - 1)) < 1e-9 && b.max.y === 1);
  assert.ok(block, 'moved to where the kitchen is');
  kitchen.update(1 / 60, far, false, 0);
  assert.deepEqual(calls, [['update', false]], 'not built yet');
  run(kitchen, near, 0.1);
  assert.deepEqual(calls.filter(c => c[0] === 'build'), [['build', kitchen.group]]);
  assert.equal(calls.at(-1)[1], true);
  const late = []; kitchen.add({ build: group => late.push(group), update() {} });
  assert.deepEqual(late, [kitchen.group], 'added after it was built: at once');
});
