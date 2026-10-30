import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWhiteboard, usedUp } from '../client/office/boards.js';

test('the coffee machine runs empty while a usage window is used up, saying when each agent is back', () => {
  const now = new Date(2026, 9, 29, 12, 0).getTime(), at = minutes => now + minutes * 60_000;
  const usage = [
    { provider: 'claude', windows: [{ label: '5-hour', usedPercent: 100, resetsAt: at(150) }, { label: 'Weekly', usedPercent: 60, resetsAt: at(3000) }] },
    { provider: 'codex', windows: [{ label: '5-hour', usedPercent: 99, resetsAt: at(30) }] },
  ];
  assert.deepEqual(usedUp(usage, now), [{ provider: 'claude', back: 'back 14:30' }]);
  usage[1].windows.push({ label: 'Weekly', usedPercent: 100, resetsAt: at(2 * 1440) });
  assert.deepEqual(usedUp(usage, now)[1], { provider: 'codex', back: 'back in 2d' });
  assert.deepEqual(usedUp([{ provider: 'claude', windows: [{ label: '5-hour', usedPercent: 100, resetsAt: at(-1) }] }], now), [], 'a window past its reset is waiting on a refresh, not empty');
  assert.deepEqual(usedUp(undefined, now), []);
});

test('the whiteboard writes how long until each usage window resets', () => {
  const now = Date.now(), written = [];
  const g = new Proxy({}, { get: (target, key) => key === 'fillText' ? text => written.push(text) : key === 'measureText' ? text => ({ width: text.length }) : key in target ? target[key] : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
  drawWhiteboard({ g, width: 1024, height: 512 }, [{ name: 'Claude', windows: [{ label: '5-hour', usedPercent: 40, resetsAt: now + 134 * 60_000 }, { label: 'Weekly', usedPercent: 20, resetsAt: now + 4 * 1440 * 60_000 }] }], [], '', now);
  assert.ok(written.includes('resets 2h 14m'), written.join());
  assert.ok(written.includes('resets 4d 0h'), written.join());
});
