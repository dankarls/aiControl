import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COPY, cardsMaterial, officeCutouts } from '../client/office/cutouts.js';
import { makeBody, simulate } from '../client/office/flight.js';
import { WALL_H } from '../client/office/furniture.js';
import { flightBoxes, surfaceTier } from '../client/office/kitchen-plan.js';
import { COFFEE_X, kitchenDoor, layoutOffice } from '../client/office/layout.js';
import { CELL, findPath, walkGrid } from '../client/office/path.js';
import { pick } from '../client/office/player.js';
import { BALLS } from '../client/office/props.js';
import { createRoom } from '../client/office/room.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), OURS = /^cutout-[a-z]/; // the kitchen's are cutout-1 to 4
const printed = [], blank = () => new Proxy({}, { get: (t, k) => k === 'fillText' ? text => printed.push(text) : k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => { t[k] = v; return true; } });
const noDocument = t => { const was = globalThis.document; globalThis.document = { createElement: () => ({ getContext: blank }), fonts: undefined }; t.after(() => { if (was) globalThis.document = was; else delete globalThis.document; }); };
const empty = (width, depth) => ({ room: { width, depth }, door: { x: width / 2, z: depth }, desks: new Map(), pods: [] });
const standing = (width, depth) => { const scene = new THREE.Scene(), room = createRoom(scene, {}); room.sync(empty(width, depth), new Map()); return { scene, room }; };
// Every project full, each desk with all its helpers: as much in the way as there can be.
const full = pods => { const sessions = []; for (let p = 0; p < pods; p++) for (let s = 0; s < 6; s++) { const id = `p${p}s${s}`; sessions.push({ id, cwd: `/p${p}`, project: `p${p}`, status: 'working' }); for (let h = 0; h < 3; h++) sessions.push({ id: `${id}h${h}`, parentId: id, status: 'working' }); } return layoutOffice(sessions, null); };
// The real rooms: as many projects as it takes for each size, then the widest with the shallowest and the other way round.
const REAL = [1, 4, 9, 16, 25].map(pods => full(pods).room).map(({ width, depth }) => [width, depth]);
const ROOMS = [...REAL, [REAL[0][0], REAL[4][1]], [REAL[4][0], REAL[0][1]]];
const clear = ([a0, a1], [b0, b1]) => a1 <= b0 || b1 <= a0;
const stands = c => new THREE.Box3().union(c.card).union(c.strut);

// What hangs on the walls they stand along, as room.js hangs it. Along x on the windows wall, along z on the right wall.
const windowsWall = width => { const count = Math.max(1, Math.floor(width / 4)), pitch = width / count; return { posters: Array.from({ length: count - 1 }, (_, i) => [(i + 1) * pitch - 0.35, (i + 1) * pitch + 0.35]) }; };
const rightWall = depth => { const door = depth - 3.8, out = [[door - 2.35, door + 0.75]]; for (let z = 3.4; z < door - 2.95; z += 2.6) out.push([z - 0.375, z + 0.375]); return out; }; // the shelf, shut and slid open, then the pictures

test('the real rooms run from 8.6 by 10 to 35.4 by 32', () => {
  const near = ([w, d], [x, z]) => assert.ok(Math.abs(w - x) < 1e-6 && Math.abs(d - z) < 1e-6, `${w} by ${d}`);
  near(REAL[0], [8.6, 10]); near(REAL[4], [35.4, 32]);
});

test("the pear, the orange and the banana, the kitchen's own cards; the lemon stays in the kitchen", () => {
  const all = officeCutouts({ width: 8.6, depth: 10 });
  assert.deepEqual(all.map(c => c.fruit), ['pear', 'orange', 'banana']);
  for (const c of all) {
    assert.equal(c.card.surface, `cutout-${c.fruit}`); assert.equal(c.strut.surface, c.card.surface); assert.equal(surfaceTier(c.card.surface), 'hard');
    assert.deepEqual(c.card.half.toArray(), flightBoxes().find(b => b.surface === 'cutout-1').half.toArray(), 'the same size of card');
    assert.equal(COPY.cutouts[c.look].fruit, c.fruit);
  }
});

test('each is turned 10-30 degrees off its wall and leans back, on the floor and on its strut, no two alike', () => {
  const all = officeCutouts({ width: 8.6, depth: 10 }), facing = c => V(0, 0, 1).applyQuaternion(c.card.quaternion);
  for (const c of all) {
    const f = facing(c), wall = c.wall === 'right' ? V(-1, 0, 0) : V(0, 0, 1), off = Math.atan2(Math.abs(wall.x ? f.z : f.x), wall.x ? -f.x : f.z) * 180 / Math.PI, lean = Math.asin(f.y) * 180 / Math.PI;
    assert.ok(off >= 10 && off <= 30, `${c.fruit} is ${off} off its wall`);
    assert.ok(lean >= 5 && lean <= 15, `${c.fruit} leans ${lean}`);
    assert.ok(Math.abs(c.card.min.y) < 1e-3 && Math.abs(c.strut.min.y) < 1e-3, `${c.fruit} stands on the floor`);
    const up = V(0, 1, 0).applyQuaternion(c.card.quaternion), tip = c.card.centre.clone().addScaledVector(up, c.card.half.y / 3), top = V(0, 1, 0).applyQuaternion(c.strut.quaternion).multiplyScalar(c.strut.half.y).add(c.strut.centre);
    assert.ok(top.distanceTo(tip) < 0.05, `${c.fruit}'s strut reaches its card`);
  }
  assert.equal(new Set(all.map(c => `${Math.round(c.yaw % 90)},${c.lean}`)).size, 3);
  assert.equal(new Set(all.map(c => c.lean)).size, 3);
});

for (const [width, depth] of ROOMS) test(`in a room ${width.toFixed(1)} by ${depth} they stand by a wall, clear of what's on it and what's near it`, t => {
  noDocument(t);
  const { room } = standing(width, depth), all = officeCutouts({ width, depth }), others = room.furnitureColliders.filter(b => !OURS.test(b.surface ?? '')), { posters } = windowsWall(width), hung = rightWall(depth);
  assert.equal(room.furnitureColliders.length - others.length, 3, 'one walking box each');
  for (const c of all) {
    const box = stands(c), xs = [box.min.x, box.max.x], zs = [box.min.z, box.max.z];
    assert.ok(box.min.x > 0.02 && box.max.x < width - 0.02 && box.min.z > 0.02 && box.max.z < depth - 0.02, `${c.fruit} is in the room: ${box.min.toArray()} ${box.max.toArray()}`);
    assert.ok(box.max.y < 1.6, `${c.fruit} stays under the posters' tops`);
    if (c.wall === 'right') { assert.ok(box.max.x > width - 0.2 && box.min.x > width - 0.8, `${c.fruit} is close to the right wall`); for (const span of hung) assert.ok(clear(zs, span), `${c.fruit} at ${zs} is clear of ${span}`); }
    else {
      assert.ok(box.min.z < 0.2 && box.max.z < 0.8, `${c.fruit} is close to the windows wall`);
      for (const span of posters) assert.ok(clear(xs, span), `${c.fruit} at ${xs} is clear of the poster at ${span}`);
    }
    for (const other of others) assert.ok(!box.intersectsBox(other), `${c.fruit} at ${xs},${zs} is clear of the furniture at ${other.min.toArray()} ${other.max.toArray()}`);
    for (const kind of BALLS) for (const [x, z] of kind.spots(width, depth)) assert.ok(box.distanceToPoint(V(x, kind.radius, z)) > kind.radius, `${c.fruit} is clear of the ball at ${x},${z}`);
    assert.ok(clear(zs, [kitchenDoor(depth) - 0.75, kitchenDoor(depth) + 0.75]) || box.min.x > 1, 'the kitchen doorway');
    assert.ok(box.max.x < COFFEE_X || box.min.x > COFFEE_X + 1.5 || box.max.z < depth - 1, 'the coffee corner');
    assert.ok(box.max.z < depth - 2, 'the door wall and all that stands by it');
  }
});

test('they stay in place between visits: the same spots every time for a room', () => {
  assert.deepEqual(officeCutouts({ width: 15.3, depth: 15.5 }).map(c => c.card.centre.toArray()), officeCutouts({ width: 15.3, depth: 15.5 }).map(c => c.card.centre.toArray()));
});

// Full of desks, nothing a walker could reach without them is cut off, and every desk, door and corner can still be walked to.
for (const pods of [1, 2, 3, 4, 6, 9, 16, 25]) test(`with ${pods} full projects nothing's cut off`, t => {
  noDocument(t);
  const layout = full(pods), { width, depth } = layout.room, scene = new THREE.Scene(), room = createRoom(scene, { initTexture() {} }); room.sync(layout, new Map());
  const cards = b => OURS.test(b.surface ?? ''), without = room.colliders.filter(b => !cards(b));
  assert.equal(room.colliders.length - without.length, 3);
  const grid = walkGrid(room.colliders, layout.room), before = walkGrid(without, layout.room), door = V(width / 2, 0, depth - 0.6);
  const spread = g => { const seen = new Uint8Array(g.open.length), start = Math.floor((door.z - g.back) / CELL) * g.cols + Math.floor((door.x - g.left) / CELL), queue = [start]; seen[start] = 1; while (queue.length) { const k = queue.pop(), i = k % g.cols, j = (k - i) / g.cols; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = j + b, n = i + a, c = m * g.cols + n; if (n >= 0 && m >= 0 && n < g.cols && m < g.rows && g.open[c] && !seen[c]) { seen[c] = 1; queue.push(c); } } } return seen; };
  const was = spread(before), is = spread(grid), lost = [];
  for (let k = 0; k < was.length; k++) if (was[k] && grid.open[k] && !is[k]) lost.push([k % grid.cols * CELL, Math.floor(k / grid.cols) * CELL]);
  assert.ok(lost.length <= 1, `open floor walled off: ${JSON.stringify(lost)}`); // in the one-project room, a cell between a helper's desk and the poster's plant: no desk or route, and the two cards share the only gap
  const ends = [...[...layout.desks.values()].map(d => V(d.x, 0, d.z - 0.87 * Math.cos(d.rotation))), room.secret.spot, V(0.9, 0, kitchenDoor(depth)), V(COFFEE_X, 0, depth - 1), V(width - 1, 0, 1.25), V(1, 0, depth / 2)];
  const reached = ends.filter(end => findPath(before, door, end));
  assert.ok(reached.length > ends.length / 3, `enough of it could be reached at all: ${reached.length} of ${ends.length}`); // desks packed this full wall in some seats, cutouts or not
  for (const end of reached) assert.ok(findPath(grid, door, end), `a way to ${end.toArray()}`);
});

test('growing the room moves their boxes, for walking and for throwing, and leaves none behind', t => {
  noDocument(t);
  const scene = new THREE.Scene(), room = createRoom(scene, {}), find = list => list.filter(b => OURS.test(b.surface ?? ''));
  const [small, big] = [[8.6, 10], [15.3, 15.5]];
  room.sync(empty(...small), new Map());
  const walk = find(room.colliders).map(b => b.clone()), flight = find(room.flightColliders).map(b => b.centre.clone());
  assert.equal(walk.length, 3, 'three to walk round'); assert.equal(flight.length, 6, 'a card and a strut each to throw at');
  room.sync(empty(...big), new Map());
  const walked = find(room.colliders), flown = find(room.flightColliders);
  assert.equal(walked.length, 3, 'none left behind'); assert.equal(flown.length, 6);
  walk.forEach((b, i) => assert.ok(b.min.x !== walked[i].min.x, `the ${i}'s walking box moved`));
  flight.forEach((c, i) => assert.ok(c.distanceTo(flown[i].centre) > 0.5, `the ${i}'s flying box moved: ${c.toArray()} ${flown[i].centre.toArray()}`));
  assert.ok(walked[2].min.x > big[0] - 1, 'the one on the right wall went with it');
});

for (const fruit of ['pear', 'orange', 'banana']) test(`a throw bounces off the ${fruit}, and over its head it doesn't`, t => {
  noDocument(t);
  const { room } = standing(15.3, 15.5), c = officeCutouts({ width: 15.3, depth: 15.5 }).find(x => x.fruit === fruit), world = { colliders: room.flightColliders, columns: [], ceiling: WALL_H };
  const kind = { radius: 0.045, low: 0.045, bounce: 0.35, roll: 4, drag: 0, upright: false, tumble: 0, centre: V(0, 0, 0) }, normal = V(0, 0, 1).applyQuaternion(c.card.quaternion).setY(0).normalize(), from = c.card.centre.clone().addScaledVector(normal, 1.2);
  const out = simulate(makeBody(kind, from, c.card.centre.clone().sub(from).normalize().multiplyScalar(8)), world, { maxTime: 1, stop: hit => hit.surface === c.card.surface });
  assert.equal(out.contacts.at(-1)?.surface, c.card.surface);
  const back = simulate(makeBody(kind, from, c.card.centre.clone().sub(from).normalize().multiplyScalar(8)), world, { maxTime: 0.4 });
  assert.ok(V(...back.pos).sub(c.card.centre).dot(normal) > 0, 'it comes back off the card');
  const over = simulate(makeBody(kind, from.clone().setY(2.2), c.card.centre.clone().sub(from).setY(0).normalize().multiplyScalar(8)), world, { maxTime: 0.2 });
  assert.ok(!over.contacts.some(hit => hit.surface === c.card.surface), 'nothing up there');
});

test("a tap goes through them to the floor: they don't get in the way of what's behind or round them", t => {
  noDocument(t);
  const { room, scene } = standing(8.6, 10), canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) }, camera = new THREE.PerspectiveCamera(70, 1, 0.05, 80);
  scene.updateMatrixWorld(true);
  const tap = (from, to) => { camera.position.copy(from); camera.lookAt(to); camera.updateMatrixWorld(); return pick({ clientX: 200, clientY: 200 }, canvas, camera, scene); };
  for (const c of officeCutouts({ width: 8.6, depth: 10 })) {
    const box = stands(c), mid = box.getCenter(V(0, 0, 0)), behind = c.wall === 'right' ? V(box.max.x - 0.03, 0, mid.z) : V(mid.x, 0, box.min.z + 0.05), side = c.wall === 'right' ? V(box.min.x - 0.1, 0, mid.z) : V(mid.x, 0, box.max.z + 0.1), from = c.wall === 'right' ? V(mid.x - 3, 1.5, mid.z) : V(mid.x, 1.5, mid.z + 3);
    for (const to of [behind, side]) { const hit = tap(from, to); assert.equal(hit?.kind, 'floor', `${c.fruit} at ${to.toArray()}`); assert.ok(hit.point.distanceTo(to) < 0.02, `${c.fruit}: landed at ${hit.point.toArray()}, not ${to.toArray()}`); }
  }
  assert.ok(room.cutouts.length === 6);
});

test('one mesh, one material on the shared sheet, lit like the room, its sheet kept through a rebuild; the kitchen shares it and the rest of its print waits', t => {
  noDocument(t); // `printed` isn't cleared: the sheet's built once, by whichever test built a room first, and none before this opens the kitchen
  const scene = new THREE.Scene(), room = createRoom(scene, {}); room.sync(empty(8.6, 10), new Map());
  const material = cardsMaterial(), meshes = []; scene.traverse(node => { if (node.isMesh && node.material === material) meshes.push(node); });
  assert.equal(meshes.length, 1, 'one mesh in the office'); assert.ok(!Array.isArray(meshes[0].material));
  assert.equal(meshes[0].children.length, 0, 'no outline, so one draw');
  assert.notEqual(material.type, 'MeshBasicMaterial', 'lit, so it follows the switch');
  assert.equal(material.alphaTest, 0.5); assert.equal(material.userData.shared, true);
  assert.ok(printed.some(line => /PEAR/.test(line)), 'its copy is printed at load');
  assert.ok(!printed.includes(COPY.motto), 'the rest of the print waits for the kitchen'); assert.ok(!printed.includes(COPY.special[2]));
  const { width: w, height: h } = material.map.image; assert.ok(w * h <= 1200 * 900, `a small sheet: ${w} x ${h}`);
  let disposed = 0; material.map.addEventListener('dispose', () => disposed++);
  room.sync(empty(15.3, 15.5), new Map()); assert.equal(disposed, 0); assert.equal(cardsMaterial(), material);
  const after = []; scene.traverse(node => { if (node.isMesh && node.material === material) after.push(node); }); assert.equal(after.length, 1, 'and still only one');
  const door = kitchenDoor(15.5); room.kitchen.update(1 / 60, V(1, 0, door), true, 0);
  assert.ok(printed.includes(COPY.motto), 'the kitchen prints the rest when it first opens');
  const inKitchen = []; room.kitchen.group.traverse(node => { if (node.isMesh && node.material === material) inKitchen.push(node); });
  assert.equal(inKitchen.length, 1, "the kitchen's four are one mesh on the same material");
  inKitchen[0].geometry.computeBoundingBox(); assert.ok(inKitchen[0].raycast !== THREE.Mesh.prototype.raycast, 'and a ray goes through');
});

test("the kitchen's cutouts are still named for its plan", () => {
  assert.deepEqual([...new Set(flightBoxes().filter(b => /^cutout/.test(b.surface)).map(b => b.surface))], ['cutout-1', 'cutout-2', 'cutout-3', 'cutout-4']);
});
