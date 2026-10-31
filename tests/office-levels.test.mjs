import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeBody } from '../client/office/flight.js';
import { launch, throwSpeed } from '../client/office/throwing.js';
import { runShot } from '../client/office/shot.js';
import { CELL, walkGrid, findPath } from '../client/office/path.js';
import { EYE, free } from '../client/office/player.js';
import { KITCHEN, ZONES, flightBoxes, walkBoxes, behind } from '../client/office/kitchen-plan.js';
import { kitchenDoor } from '../client/office/layout.js';
import { WALL_T } from '../client/office/furniture.js';
import { ITEMS, STARTS, MONDAY, PAIRS, lineDone } from '../client/office/levels.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), rad = d => d * Math.PI / 180;
const look = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)); // as camera.js looks
const COARSE = { yaw: 4, pitch: 5, charges: [0.25, 0.625, 1] }, FINE = { yaw: 1, pitch: 2, charges: Array.from({ length: 8 }, (_, i) => 0.25 + i * 0.75 / 7) };

// Every throw of a grid, as the game makes it: from your eyes at the mark, through launch, standing still.
function* throwsOf(grid, { kind, start, target }, launcher = launch) {
  const { x, z } = STARTS[start], { centre } = ZONES[target], camera = { position: V(x, EYE, z) }, bearing = Math.atan2(centre.x - x, centre.z - z), walk = V(0, 0, 0);
  for (let yaw = -Math.floor(45 / grid.yaw) * grid.yaw; yaw <= 45; yaw += grid.yaw) for (let pitch = -10; pitch <= 70; pitch += grid.pitch) for (const charge of grid.charges) {
    yield { yaw: bearing + rad(yaw), pitch: rad(pitch), charge, ...launcher(kind, charge, camera, look(bearing + rad(yaw), rad(pitch)), walk) };
  }
}
const shoot = ({ kind, target }, { pos, vel }) => runShot(makeBody(kind, pos, vel), ZONES[target]);
const search = (grid, shot, predicate, launcher) => { for (const t of throwsOf(grid, shot, launcher)) { const result = shoot(shot, t); if (predicate(result)) return { ...t, result }; } return null; };
// The first throw that does it: on the coarse grid, and only if that found nothing, on the fine one.
const findThrow = (item, start, target, predicate, launcher) => { const shot = { kind: ITEMS[item], start, target }; return search(COARSE, shot, predicate, launcher) ?? search(FINE, shot, predicate, launcher); };
const onCoarse = (item, start, target, predicate) => search(COARSE, { kind: ITEMS[item], start, target }, predicate);

const asResult = (over = {}) => ({ made: true, score: 0, surfaces: [], ...over });
const OPTIONS = { timeout: 120000 };

test('the items are what the plan says', () => {
  assert.deepEqual(Object.keys(ITEMS), ['paper', 'rubber', 'roll', 'mug', 'plate', 'teabag']);
  assert.deepEqual(Object.values(ITEMS).map(k => k.throw), [8, 12, 9, 9, 10, 7]);
  for (const [id, k] of Object.entries(ITEMS)) {
    assert.ok(typeof k.name === 'string' && k.name, `${id} has a name`);
    for (const f of ['radius', 'low', 'bounce', 'roll', 'drag', 'tumble']) assert.ok(k[f] >= 0, `${id}.${f}`);
    assert.ok(k.low > 0 && k.low <= k.radius, `${id} rests on its underside`);
  }
  const { paper, rubber, roll, mug, plate, teabag } = ITEMS, all = Object.values(ITEMS), most = f => Math.max(...all.map(k => k[f])), least = f => Math.min(...all.map(k => k[f]));
  assert.ok(Math.abs(rubber.bounce - 0.85) < 0.05); assert.equal(plate.bounce, [...all].sort((a, b) => b.bounce - a.bounce)[1].bounce, 'the plate bounces second to the rubber');
  assert.ok(paper.bounce <= 0.3 && mug.bounce <= 0.3); assert.equal(teabag.drag, most('drag')); assert.equal(plate.roll, least('roll')); assert.ok(roll.roll >= 4, 'the roll stops short');
  assert.ok(roll.tumble > paper.tumble, 'the roll tumbles'); assert.ok(mug.upright && plate.upright, 'a mug and a plate land the right way up');
});

test('the clipboard has one line per item, each naming things that exist', () => {
  assert.deepEqual(MONDAY.map(e => e.id), Object.keys(ITEMS));
  for (const e of MONDAY) {
    assert.ok(ITEMS[e.item] && STARTS[e.start] && ZONES[e.target], e.id);
    assert.ok(e.trick.name === e.trick.name.toLowerCase() && e.trick.name, `${e.id}: lower case, the clipboard capitalises`);
    assert.ok(flightBoxes().some(b => e.trick.via.endsWith('-') ? b.surface.startsWith(e.trick.via) : b.surface === e.trick.via) || e.trick.via === 'ceiling', `${e.id}: ${e.trick.via} is a surface`);
    assert.ok(e.set > 0, e.id);
  }
});

test('a line is done by a made shot, by a made shot off the right surface, by the set score', () => {
  const fridge = { trick: { name: '', via: 'fridge' }, set: 600 }, pans = { trick: { name: '', via: 'pan-' }, set: 600 };
  assert.ok(lineDone('away', asResult(), fridge)); assert.ok(!lineDone('away', asResult({ made: false }), fridge));
  assert.ok(lineDone('trick', asResult({ surfaces: ['wall-n', 'fridge'] }), fridge));
  assert.ok(!lineDone('trick', asResult({ surfaces: ['fridge'], made: false }), fridge), 'off it and missed');
  assert.ok(!lineDone('trick', asResult({ surfaces: ['fridge-2', 'floor'] }), fridge), 'without a - it is that surface exactly');
  assert.ok(lineDone('trick', asResult({ surfaces: ['pan-2'] }), pans)); assert.ok(!lineDone('trick', asResult({ surfaces: ['panel'] }), pans), 'with a - it is that family');
  assert.ok(lineDone('score', asResult({ score: 600 }), fridge)); assert.ok(!lineDone('score', asResult({ score: 599 }), fridge));
  assert.ok(!lineDone('nonsense', asResult({ score: 600 }), fridge));
});

// What runShot gives lineDone: a graze of the right surface isn't in `surfaces`, so it can't be the trick.
test('a graze of the trick surface doesn\'t do the trick', () => {
  const entry = { trick: { name: '', via: 'table-1' }, set: 600 };
  const grazed = runShot(makeBody(ITEMS.teabag, V(-7.2, 0.74 + ITEMS.teabag.low + 0.005, -1.4), V(0, -0.2, 0)), { centre: V(-7.2, 0.8, -1.4), half: V(0.7, 0.2, 0.4) });
  assert.ok(grazed.made && grazed.contacts.length === 0, 'it was put down softly on the table');
  assert.ok(!lineDone('trick', grazed, entry));
  const hit = runShot(makeBody(ITEMS.teabag, V(-7.2, 1.2, -1.4), V(0, 0, 0)), { centre: V(-7.2, 0.8, -1.4), half: V(0.7, 0.2, 0.4) });
  assert.ok(lineDone('trick', hit, entry));
});

test('the sweep throws the way the game does: through launch, from your eyes, standing still', () => {
  const calls = [], spy = (kind, charge, camera, direction, walk) => { calls.push({ kind, charge, from: camera.position.clone(), direction: direction.clone(), walk: walk.clone() }); return launch(kind, charge, camera, direction, walk); };
  const { start, target, item } = MONDAY[0], found = findThrow(item, start, target, r => r.made, spy), mark = STARTS[start];
  assert.ok(found && calls.length, 'it found a throw');
  for (const c of calls) { assert.equal(c.kind, ITEMS[item]); assert.deepEqual(c.from.toArray(), [mark.x, EYE, mark.z]); assert.deepEqual(c.walk.toArray(), [0, 0, 0]); assert.ok(Math.abs(c.direction.length() - 1) < 1e-9); }
  assert.equal(EYE, 1.5, "the player's eye height is what the sweep threw from; change it and the proof reruns");
  // And what's returned is launch's throw, reproducing the same shot from nothing but the aim.
  const dir = look(found.yaw, found.pitch), again = launch(ITEMS[item], found.charge, { position: V(mark.x, EYE, mark.z) }, dir, V(0, 0, 0)), result = runShot(makeBody(ITEMS[item], again.pos, again.vel), ZONES[target]);
  assert.deepEqual(result.pos, found.result.pos); assert.ok(result.made);
  assert.ok(Math.abs(again.vel.y - (dir.y * throwSpeed(ITEMS[item], found.charge) + 1.2)) < 1e-9, 'with launch\'s lift');
  // A launcher that throws elsewhere changes what the sweep finds, so nothing in it computes a velocity of its own.
  const dud = (kind, charge, camera, direction) => ({ pos: camera.position.clone().addScaledVector(direction, 0.5), vel: V(0, 0, 0) });
  assert.equal(findThrow(item, start, target, r => r.made, dud), null);
});

// A rubber ball bounces out of any bucket this size, so the bucket has mop water in it. Only its bottom, and wherever the kitchen stands.
test('the bucket\'s water keeps what lands in it, and nothing else does', () => {
  const zone = ZONES.bucket, drop = at => makeBody(ITEMS.rubber, at, V(0, -4, 0));
  const inWater = runShot(drop(V(zone.centre.x, zone.centre.y, zone.centre.z)), zone);
  assert.ok(inWater.made && inWater.time < 0.5, `it stopped in the water, after ${inWater.time} s`);
  const onFloor = runShot(drop(V(-3, 0.5, -1)), null);
  assert.ok(onFloor.time > inWater.time * 2, 'the floor still bounces it');
  const soft = o => flightBoxes(o).filter(b => b.bounce !== undefined);
  for (const o of [undefined, { x: 3, z: 4 }]) { const [water, more] = soft(o); assert.ok(water.surface === 'bucket' && water.bounce === 0 && water.max.y - water.min.y < 0.05 && !more); }
});

test('every clipboard level can be put away', OPTIONS, () => {
  const failed = MONDAY.filter(e => !findThrow(e.item, e.start, e.target, r => lineDone('away', r, e))).map(e => e.id);
  assert.deepEqual(failed, []);
});

test('every clipboard trick can be done', OPTIONS, () => {
  const failed = MONDAY.filter(e => !findThrow(e.item, e.start, e.target, r => lineDone('trick', r, e))).map(e => `${e.id}: ${e.trick.name}`);
  assert.deepEqual(failed, []);
});

test('every clipboard set score can be reached', OPTIONS, () => {
  const failed = MONDAY.filter(e => !findThrow(e.item, e.start, e.target, r => lineDone('score', r, e))).map(e => `${e.id}: ${e.set}`);
  assert.deepEqual(failed, []);
});

// Possible isn't playable: one throw in 30,000 passes the tests above and isn't a game. Putting it away and the trick are on the grid a player's own hand can hit.
test('every clipboard level and trick is found on the coarse grid', OPTIONS, () => {
  const failed = MONDAY.flatMap(e => ['away', 'trick'].filter(line => !onCoarse(e.item, e.start, e.target, r => lineDone(line, r, e))).map(line => `${e.id} ${line}`));
  assert.deepEqual(failed, []);
});

test('every start and target pair can be made with its item', OPTIONS, () => {
  const failed = Object.entries(PAIRS).flatMap(([item, pairs]) => pairs.filter(([start, target]) => !findThrow(item, start, target, r => r.made)).map(p => `${item} ${p.join(' to ')}`));
  assert.deepEqual(failed, []);
});

test('each item has three pairs or more, and together they use every target', () => {
  assert.deepEqual(Object.keys(PAIRS), Object.keys(ITEMS));
  for (const [item, pairs] of Object.entries(PAIRS)) {
    assert.ok(pairs.length >= 3, item);
    for (const [start, target] of pairs) assert.ok(STARTS[start] && ZONES[target], `${item} ${start} ${target}`);
    assert.equal(new Set(pairs.map(String)).size, pairs.length, `${item} repeats a pair`);
  }
  assert.deepEqual([...new Set(Object.values(PAIRS).flat().map(p => p[1]))].sort(), Object.keys(ZONES).sort());
});

// The real path grid at the kitchen's real place, as in the plan's own test: cells fall differently in rooms of different depths.
const DEPTHS = [8, 8.6, 10, 12.3, 14, 15.5], LEFT = -(WALL_T + KITCHEN.width);
test('no start mark stands in a collider', () => {
  assert.deepEqual(Object.keys(STARTS).sort(), ['doors', 'farTable', 'fridge', 'island', 'stove', 'vending']);
  const boxes = flightBoxes();
  for (const [name, { x, z, stand }] of Object.entries(STARTS)) {
    assert.ok(Number.isFinite(stand), `${name} faces somewhere`);
    for (const y of [0.05, 0.5, 1, EYE]) assert.ok(!boxes.some(b => b.containsPoint(V(x, y, z))), `${name} is inside something at ${y}`);
    const ahead = V(x, 0, z).addScaledVector(look(stand, 0), 1);
    assert.ok(ahead.x > -KITCHEN.width && ahead.x < 0 && ahead.z > KITCHEN.back && ahead.z < KITCHEN.front, `${name} faces the room`);
  }
  for (const depth of DEPTHS) {
    const origin = { x: -WALL_T, z: kitchenDoor(depth) }, room = { left: LEFT, width: WALL_T, depth }, at = (x, z) => V(x + origin.x, 0, z + origin.z);
    const colliders = [...flightBoxes(origin, { doorShut: false }).filter(b => b.surface.startsWith('wall-')), ...walkBoxes(origin), behind(origin)], grid = walkGrid(colliders, room);
    for (const [name, { x, z }] of Object.entries(STARTS)) {
      const p = at(x, z), cell = Math.floor(p.z / CELL) * grid.cols + Math.floor((p.x - grid.left) / CELL);
      assert.ok(free(p, colliders, room), `${name} (room ${depth}) stands in something you walk round`);
      assert.equal(grid.open[cell], 1, `${name} (room ${depth}) is not on an open cell`);
      const way = findPath(grid, at(-1, 0), p);
      assert.ok(way, `${name} (room ${depth}) can't be walked to from the doors`);
      assert.ok(way.at(-1).distanceTo(p) < 1e-9, `${name} (room ${depth}): the way ends on the mark`);
    }
  }
});
