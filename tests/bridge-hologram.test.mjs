import test from 'node:test';
import assert from 'node:assert/strict';
import { hologramLayout, rowAt } from '../client/bridge/hologram.js';

const layout = hologramLayout(3, 512, 400);
test('rows stack under the title and stay inside the panel', () => {
  assert.equal(layout.rows.length, 3);
  assert.ok(layout.rows[0].y >= layout.top);
  for (const row of layout.rows) assert.ok(row.x >= 0 && row.x + row.width <= 512 && row.y + row.height <= 400);
  for (let i = 1; i < 3; i++) assert.ok(layout.rows[i].y >= layout.rows[i - 1].y + layout.rows[i - 1].height);
});
const middle = row => [(row.x + row.width / 2) / 512, 1 - (row.y + row.height / 2) / 400];
test('a point on a row picks it, with v running up the panel as in a texture', () => {
  layout.rows.forEach((row, i) => assert.equal(rowAt(layout, ...middle(row)), i));
});
test('the title and the empty space below pick nothing', () => {
  assert.equal(rowAt(layout, .5, 1 - 2 / 400), -1);
  assert.equal(rowAt(hologramLayout(1, 512, 400), .5, .02), -1);
});
test('more rows than fit are left out rather than drawn off the panel', () => {
  const crowded = hologramLayout(40, 512, 400);
  assert.ok(crowded.rows.length < 40);
  assert.ok(crowded.rows.at(-1).y + crowded.rows.at(-1).height <= 400);
});
test('no rows at all', () => assert.equal(rowAt(hologramLayout(0, 512, 400), .5, .5), -1));
