import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEADS, SUITS, crewArrival, crewLook, crewPose } from '../client/bridge/crew.js';
import { SIGNALS } from '../client/bridge/palettes.js';

const ids = Array.from({ length: 10 }, (_, i) => `session-${i}`);
test('same id, same look', () => assert.deepEqual(crewLook('abc', new Set()), crewLook('abc', new Set())));
test('seated agents differ while looks remain', () => {
  const taken = new Set();
  for (const id of ids) { const { key } = crewLook(id, taken); assert.ok(!taken.has(key), id); taken.add(key); }
});
test('every pair is taken: it still returns a look', () => {
  const all = new Set(); HEADS.forEach((_, h) => SUITS.forEach((_, s) => all.add(`${h}-${s}`)));
  assert.ok(all.has(crewLook('abc', all).key));
});
test('no suit is close to a signal, and none is bright enough to bloom', () => {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  for (const suit of SUITS) {
    assert.ok(Math.max(...rgb(suit)) < 0xc8, suit);
    for (const signal of Object.values(SIGNALS)) assert.ok(Math.hypot(...rgb(suit).map((v, i) => v - rgb(signal)[i])) > 100, `${suit} ${signal}`);
  }
});
test('each signal has its pose', () => {
  assert.deepEqual(crewPose('need'), { turn: Math.PI, lean: 0, raise: 1, hands: false, track: false });
  assert.equal(crewPose('working').hands, true); assert.equal(crewPose('working').turn, 0);
  assert.ok(crewPose('idle').lean < 0); assert.equal(crewPose('idle').hands, false);
});
test('only a real comer or goer shimmers', () => {
  const base = { was: null, id: 'a', offline: false, wasOffline: false, started: true, still: false };
  assert.equal(crewArrival(base), 'shimmer');
  assert.equal(crewArrival({ ...base, was: 'a', id: null }), 'shimmer');
  assert.equal(crewArrival({ ...base, was: 'a' }), 'none');
  assert.equal(crewArrival({ ...base, started: false }), 'cut');
  assert.equal(crewArrival({ ...base, offline: true }), 'cut');
  assert.equal(crewArrival({ ...base, wasOffline: true }), 'cut');
  assert.equal(crewArrival({ ...base, still: true }), 'cut');
  assert.equal(crewArrival({ ...base, was: 'a', id: 'b' }), 'shimmer');
});
