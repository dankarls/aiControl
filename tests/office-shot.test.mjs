import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeBody, simulate } from '../client/office/flight.js';
import { ZONES, levelWorld } from '../client/office/kitchen-plan.js';
import { scoreContacts, inZone, runShot, createRun } from '../client/office/shot.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const kind = (bounce, extra = {}) => ({ radius: 0.05, low: 0.05, bounce, roll: 1, drag: 0.1, upright: false, ...extra });
const ball = kind(0.5), rubber = kind(0.95), dead = kind(0.1);
const hit = (surface, speed = 3) => ({ surface, speed }), pick = ({ points, multiplier }) => ({ points, multiplier });
const onBin = () => makeBody(ball, V(-0.5, 1, -2.5), V(0, 8, 0)); // up to the ceiling, then down into the bin
const count = (r, surface) => r.contacts.filter(c => c.surface === surface).length;

test('a surface is worth its size', () => {
  assert.deepEqual(pick(scoreContacts([hit('fridge'), hit('pan-1'), hit('ceiling')])), { points: 350, multiplier: 3 });
  assert.deepEqual(pick(scoreContacts([hit('floor')])), { points: 0, multiplier: 1 });
});
test('repeats are worth half, then a quarter, then nothing, with no multiplier', () => {
  const r = scoreContacts(['fridge', 'fridge', 'fridge', 'fridge'].map(s => hit(s)));
  assert.deepEqual(pick(r), { points: 175, multiplier: 2 });
});
test('each chair and each wall scores on its own', () => assert.equal(scoreContacts([hit('chair-1'), hit('chair-2')]).multiplier, 3));
test('a contact softer than 0.5 m/s scores nothing', () => {
  assert.equal(scoreContacts([hit('table-1', 0.4)]).points, 0);
  assert.deepEqual(scoreContacts([hit('table-1', 0.4), hit('table-1', 3)]).surfaces, ['table-1']);
});
test('inZone takes a position as an array or a vector', () => {
  const z = ZONES.bin;
  assert.ok(inZone(z.centre.toArray(), z) && inZone(z.centre, z) && !inZone([0, 5, 0], z));
});

test('a made shot scores points times multiplier, a miss scores 0', () => {
  const made = runShot(onBin(), ZONES.bin);
  assert.ok(made.made && made.rest && made.surfaces.includes('ceiling'));
  assert.deepEqual([made.points, made.multiplier, made.score], [50, 1, 50]);
  const miss = runShot(makeBody(ball, V(-1.5, 1, -2.5), V(0, 8, 0)), ZONES.bin);
  assert.ok(!miss.made && miss.points === 50 && miss.score === 0);
});

test('a shot that bounces out of its zone doesn\'t count', () => {
  let found = 0;
  for (let vx = 0.5; vx <= 3 && !found; vx += 0.25) for (let vz = -2; vz <= 2 && !found; vz += 0.5) {
    const b = makeBody(rubber, V(-0.5, 1.2, -2.5), V(vx, 0, vz)), r = runShot(b, ZONES.bin);
    let entered = false; for (let i = 0; i < r.path.length; i += 3) entered ||= inZone([r.path[i], r.path[i + 1], r.path[i + 2]], ZONES.bin);
    if (entered && !r.made) found++;
  }
  assert.ok(found, 'some rubber throw entered and left');
});

test('one real drop on a table is one hit, not a repeat', () => {
  const r = runShot(makeBody(dead, V(-7.2, 1, -1.4), V(0, 0, 0)), null);
  assert.equal(count(r, 'table-1'), 1);
  assert.ok(r.rest && r.surfaces.length === 1 && r.surfaces[0] === 'table-1' && r.contacts[0].speed > 1.5);
  assert.deepEqual(pick(r), { points: 100, multiplier: 2 });
});

test('a ball rolling across the floor from one touch is one touch', () => {
  const r = runShot(makeBody(ball, V(-2, 0.06, -2.5), V(-2, -0.5, 0)), null);
  assert.equal(count(r, 'floor'), 1);
  assert.ok(r.rest && r.time < 8 && r.contacts[0].speed < 1 && r.contacts[0].speed >= 0.5);
  assert.ok(Math.abs(r.path.at(-3) - -2) > 0.5, 'and it rolled');
});

test('the shot ends on its second floor touch', () => {
  const r = runShot(makeBody(ball, V(-2, 1.5, -2.5), V(0, 0, 0)), ZONES.bin);
  assert.deepEqual(r.contacts.map(c => c.surface), ['floor', 'floor']);
  assert.ok(!r.rest && !r.made && r.time < 2 && r.score === 0);
});

test('a shot is cut off after 8 s and isn\'t made', () => {
  const r = runShot(makeBody(kind(0.995), V(-0.5, 2.5, -2.5), V(0, 0, 0)), ZONES.bin);
  assert.ok(r.time === 8 && !r.rest && !r.made && r.score === 0);
});

test('runShot agrees with simulate on the path, and leaves the shared world alone', () => {
  const a = runShot(onBin(), ZONES.bin), b = simulate(onBin(), levelWorld(), { maxTime: 8, stop: (() => { let f = 0; return c => c.surface === 'floor' && ++f > 1; })() });
  assert.deepEqual(a.path, b.path.slice(0, a.path.length));
  assert.deepEqual(runShot(onBin(), ZONES.bin).path, a.path, 'twice the same');
});

const play = (run, dt = 1 / 60) => { const events = []; for (let i = 0; i < 2000 && run.state === 'flying'; i++) events.push(...run.advance(dt)); return events; };
const start = V(-1, 1.2, -1);

test('playback emits each contact in order and the end once, at the shot\'s end', () => {
  const run = createRun({ start }), at = V();
  assert.equal(run.state, 'aiming'); assert.deepEqual(run.advance(1), []); assert.deepEqual(run.at(at).toArray(), start.toArray());
  run.shoot(onBin(), ZONES.bin);
  assert.equal(run.state, 'flying');
  const events = play(run), contacts = events.filter(e => e.type === 'contact'), ends = events.filter(e => e.type === 'end');
  assert.equal(ends.length, 1); assert.equal(events.at(-1), ends[0]); assert.equal(ends[0].result, run.result);
  assert.deepEqual(contacts.map(e => e.surface), run.result.contacts.map(c => c.surface));
  assert.ok(contacts.every(e => e.pos.length === 3 && e.speed > 0));
  assert.equal(run.state, 'done'); assert.deepEqual(run.advance(1), []);
  run.at(at); assert.ok(at.distanceTo(V(...run.result.pos)) < 1e-6, 'it stops where the shot did');
});

test('one huge dt (a stalled tab) emits every contact in order and the end once', () => {
  const run = createRun({ start }); run.shoot(onBin(), ZONES.bin);
  const events = run.advance(1e6);
  assert.deepEqual(events.slice(0, -1).map(e => e.surface), run.result.contacts.map(c => c.surface));
  assert.deepEqual(events.map(e => e.type).filter(t => t === 'end'), ['end']);
  assert.equal(run.state, 'done');
});

test('playback follows the path between samples', () => {
  const run = createRun({ start }), at = V(); run.shoot(makeBody(ball, V(-1, 1.2, -1), V(0, 0, 0)), null);
  run.advance(1 / 120); run.at(at); assert.ok(at.y < 1.2 && at.y > 1.2 - 0.01, `${at.y}`);
  assert.ok(Math.abs(run.time - 1 / 120) < 1e-9);
});

test('slow motion covers the last 0.6 s of a made shot, and never under reduced motion', () => {
  for (const reducedMotion of [false, true]) {
    const run = createRun({ start, reducedMotion }); run.shoot(onBin(), ZONES.bin);
    const total = run.result.time; assert.ok(run.result.made && total > 1);
    let slow = 0, scaled = 0;
    while (run.state === 'flying') {
      run.advance(1 / 60);
      if (run.timeScale < 1) { slow++; assert.ok(run.time > total - 0.6 - 1e-9, 'only in the last 0.6 s'); }
      if (run.time > total - 0.6 + 1 / 60 && run.state === 'flying') scaled++;
    }
    assert.equal(slow > 0, !reducedMotion); assert.ok(reducedMotion || scaled > 0);
  }
  const run = createRun({ start }); run.shoot(makeBody(ball, V(-2, 1.5, -2.5), V(0, 0, 0)), ZONES.bin);
  run.advance(1 / 60); while (run.state === 'flying') { assert.equal(run.timeScale, 1, 'a miss never slows'); run.advance(1 / 60); }
});

test('slow motion takes longer to play out than the shot', () => {
  const run = createRun({ start }); run.shoot(onBin(), ZONES.bin);
  let t = 0; while (run.state === 'flying') { run.advance(1 / 60); t += 1 / 60; }
  assert.ok(t > run.result.time + 0.5, `${t} vs ${run.result.time}`);
});

test('a reset during slow motion leaves nothing running', () => {
  const run = createRun({ start }); run.shoot(onBin(), ZONES.bin);
  while (run.timeScale === 1) run.advance(1 / 60);
  assert.ok(run.timeScale < 1);
  run.reset();
  assert.equal(run.state, 'aiming'); assert.equal(run.timeScale, 1); assert.equal(run.result, null); assert.equal(run.time, 0);
  assert.deepEqual(run.advance(1), []);
  assert.deepEqual(run.at(V()).toArray(), start.toArray());
});

test('a second shot after done or reset plays on its own', () => {
  const run = createRun({ start }); run.shoot(onBin(), ZONES.bin); run.advance(1e6);
  run.shoot(makeBody(ball, V(-2, 1.5, -2.5), V(0, 0, 0)), ZONES.bin);
  assert.equal(run.state, 'flying'); assert.equal(run.time, 0);
  assert.equal(run.advance(1e6).filter(e => e.type === 'end').length, 1);
});
