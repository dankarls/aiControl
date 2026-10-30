import test from 'node:test';
import assert from 'node:assert/strict';
import { newTable, start, step, waiting, TABLE, LANE, LEFT, R, DT } from '../client/office/pinball.js';

const run = (t, seconds, each) => { for (let i = 0; i < seconds / DT; i++) { step(t); each?.(t); } };
const playing = () => { const t = newTable(); t.input.left = true; step(t); t.input.left = false; return t; };
const plunge = (t, seconds) => { t.input.plunge = true; run(t, seconds); t.input.plunge = false; };

test('a flip starts a game with a ball on the plunger; a full pull sends it round the top, a tap leaves it there', () => {
  const t = playing();
  assert.deepEqual([t.mode, t.ball, t.balls.length, waiting(t)], ['play', 1, 1, true]);
  plunge(t, 0.1); run(t, 1);
  assert.ok(waiting(t), 'a tap does nothing');
  plunge(t, 1); let top = 0, out = false;
  run(t, 2, t => { const b = t.balls[0]; if (b) { top = Math.max(top, b.y); out ||= b.x < LANE.wall - 0.05; } });
  assert.ok(top > 1 && out, `went round the arc into the playfield (top ${top.toFixed(2)})`);
  assert.ok(t.saveUntil > t.time, 'and the ball save is on');
});

test('balls let loose anywhere drain in the end, never stuck or off the table', () => {
  let seed = 7; const rand = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let n = 0; n < 150; n++) {
    const t = newTable(); t.mode = 'play'; t.ball = 3;
    t.balls = [{ x: -0.2 + rand() * 0.42, y: 0.35 + rand() * 0.6, vx: (rand() - 0.5) * 4, vy: (rand() - 0.5) * 4 }];
    let drained = false;
    for (let s = 0; s < 60 && !drained; s += DT) {
      step(t); drained = t.mode === 'over';
      for (const b of t.balls) assert.ok(b.x > LEFT - R && b.x < LANE.out && b.y < 1.07, `ball ${n} escaped at ${b.x}, ${b.y}`);
    }
    assert.ok(drained, `ball ${n} never drained: ${JSON.stringify(t.balls)}`);
  }
});

test('the flippers hit hard enough to reach the bumpers', () => {
  const t = newTable(); t.mode = 'play';
  t.balls = [{ x: -0.06, y: 0.25, vx: 0, vy: 0 }]; run(t, 0.3);
  t.input.left = true; let top = 0; run(t, 1, t => { if (t.balls[0]) top = Math.max(top, t.balls[0].y); });
  assert.ok(top > 0.6, `reached ${top.toFixed(2)}`);
});

test('the rules: a saved ball once, three balls, lanes raise the multiplier, the targets start multiball', () => {
  const t = playing(); plunge(t, 1); run(t, 0.5);
  t.balls[0] = { x: 0, y: 0.05, vx: 0, vy: -1 }; run(t, 0.1);
  assert.deepEqual([t.ball, t.message.text, waiting(t)], [1, 'BALL SAVED', true]);
  plunge(t, 1); run(t, 0.5); t.balls[0] = { x: 0, y: 0.05, vx: 0, vy: -1 }; run(t, 0.1);
  assert.equal(t.ball, 2, 'only once');
  t.balls = [{ x: 0.05, y: 0.94, vx: 0, vy: -0.5 }]; t.lit = [true, true, false]; t.skillUntil = 0; run(t, 0.1);
  assert.deepEqual([t.mult, t.lit], [2, [false, false, false]]);
  const g = TABLE.targets[2]; t.targets = [false, false, true];
  t.balls = [{ x: g.x + 0.03, y: g.y, vx: -1, vy: 0 }]; run(t, 0.1);
  assert.deepEqual([t.multiball, t.balls.length, t.message.text], [true, 2, 'MULTIBALL']);
  run(t, 2);
  assert.deepEqual(t.targets, [true, true, true], 'and they come back up');
  t.balls = []; t.ball = 3; t.saveUntil = 0; t.balls.push({ x: 0, y: 0.05, vx: 0, vy: -1 }); run(t, 0.1);
  assert.deepEqual([t.mode, t.last, t.best], ['over', t.score, t.score]);
});
