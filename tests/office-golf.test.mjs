import test from 'node:test';
import assert from 'node:assert/strict';
import { make, hole, par, roll, endless, inside, height, HOLE_COUNT, PARS } from '../client/office/golf-course.js';

test('every hole on the course is the same each time and makes its par', () => {
  assert.deepEqual(hole(7).outline, hole(7).outline);
  for (let n = 1; n <= HOLE_COUNT; n++) {
    const c = hole(n);
    assert.equal(par(c), Number(PARS[n - 1]), `hole ${n}`);
    assert.ok(Math.abs(height(c, c.cup.x, c.cup.z)) < 1e-9, `hole ${n}: the cup sits on the flat`);
  }
});

test('on the flat a putt stops as far as its strength says; nothing leaves the green', () => {
  const flat = make(0, 1);
  for (const field of ['h', 'px', 'pz']) flat.grid[field].fill(0);
  Object.assign(flat, { walls: [], things: [], cup: { x: -9, z: -9 } });
  const from = { x: 6, z: 0 }, end = roll(flat, from, Math.sqrt(2 * 0.6 * 1.5), 0);
  assert.ok(end.rest && Math.abs(end.x - from.x - 1.5) < 0.03, `stopped after ${end.x - from.x}`);
  const c = hole(40);
  for (let a = 0; a < Math.PI * 2; a += 0.7) {
    const b = roll(c, c.tee, Math.cos(a) * 4, Math.sin(a) * 4);
    assert.ok(b.sunk || inside(c.outline, b.x, b.z), `a hard putt at ${a.toFixed(1)} ended off the green`);
  }
});

test('Endless deals makeable holes, a little at a time', () => {
  const run = endless(3, 42);
  let steps = 0, s;
  while (!(s = run.next()).done) steps++;
  assert.ok(steps > 0 && [2, 3].includes(s.value.par) && s.value.index === 3);
});
