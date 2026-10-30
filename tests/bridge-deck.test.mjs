import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CENTER, DECK, PIT, R, ROOM, STATION_ANGLES, floorHeight, stationAt } from '../client/bridge/deck.js';

const at = (r, degrees) => [CENTER + Math.sin(degrees * Math.PI / 180) * r, CENTER - Math.cos(degrees * Math.PI / 180) * r];

test('floor levels', () => {
  assert.equal(floorHeight(...at(1, 0)), 0);
  assert.equal(floorHeight(...at(6, 90)), DECK);
  const step = floorHeight(...at(PIT + .06, 0));
  assert.ok(step > 0 && step < DECK);
});
test('the room is the circle', () => {
  assert.ok(ROOM.inside({ x: CENTER, z: CENTER }));
  assert.ok(ROOM.inside({ x: CENTER, z: CENTER + R - .7 }));
  assert.ok(!ROOM.inside({ x: CENTER, z: CENTER + R - .5 }));
  assert.ok(!ROOM.inside({ x: .5, z: .5 }));   // in the square, outside the circle
});
test('stations go front first and face the centre', () => {
  assert.equal(STATION_ANGLES.length, 10);
  const { x, z } = stationAt(0);
  assert.ok(z < CENTER && x < CENTER);
});
