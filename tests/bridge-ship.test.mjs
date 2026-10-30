import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignStations, shipState } from '../client/bridge/ship.js';
import { VACANT_MS } from '../client/office/layout.js';
import { compareSessions } from '../client/session-order.js';

const s = (id, status, extra = {}) => ({ id, status, updatedAt: 1000, ...extra });
const usage = (usedPercent, resetsAt = 9e15) => [{ provider: 'claude', label: 'Max', windows: [{ label: '5-hour', usedPercent, resetsAt }] }];

test('mode priority', () => {
  assert.equal(shipState({ sessions: [] }, 0).mode, 'orbit');
  assert.equal(shipState({ sessions: [s('a', 'working')] }, 0).mode, 'warp');
  assert.equal(shipState({ sessions: [s('a', 'working'), s('b', 'question')] }, 0).mode, 'hail');
  const limit = shipState({ sessions: [s('a', 'working'), s('b', 'permission')], usage: usage(100) }, 0);
  assert.equal(limit.mode, 'limit');
  assert.equal(limit.waiting, 1);
  assert.equal(limit.warp, 0);
});
test('warp factor counts main sessions only', () => {
  const state = shipState({ sessions: [s('a', 'working'), s('b', 'working'), s('c', 'working', { parentId: 'a' })] }, 0);
  assert.equal(state.warp, 2);
});
test('hail keeps the warp factor', () => assert.equal(shipState({ sessions: [s('a', 'working'), s('b', 'question')] }, 0).warp, 1));
test('an expired window does not count', () => assert.equal(shipState({ sessions: [], usage: usage(100, 500) }, 1000).mode, 'orbit'));
test('a full window with no reset time counts', () => assert.equal(shipState({ sessions: [], usage: usage(100, null) }, 1000).mode, 'limit'));
test('near limit starts at 80', () => {
  assert.equal(shipState({ sessions: [], usage: usage(79) }, 0).limits[0].near, false);
  assert.equal(shipState({ sessions: [], usage: usage(80) }, 0).limits[0].near, true);
});
test('next agrees with compareSessions', () => {
  const sessions = [s('a', 'question', { requests: [{ createdAt: 20 }] }), s('b', 'permission', { requests: [{ createdAt: 10 }] })];
  assert.equal(shipState({ sessions }, 0).next.id, [...sessions].sort(compareSessions)[0].id);
});
test('no sessions or usage at all', () => {
  for (const snapshot of [{}, { sessions: [] }, { sessions: [], usage: null }, { sessions: [], usage: [] }, { sessions: [], usage: [{ windows: [] }] }, { sessions: [], usage: [{}] }]) {
    const state = shipState(snapshot, 0);
    assert.deepEqual([state.mode, state.warp, state.waiting, state.next, state.limits], ['orbit', 0, 0, null, []]);
  }
});

const ids = result => result.stations.map(station => station?.id ?? null);
const many = (n, status = 'working') => Array.from({ length: n }, (_, i) => s(`s${i}`, status, { updatedAt: i }));

test('new sessions fill from the front', () => assert.deepEqual(ids(assignStations(many(2), null, 0)).slice(0, 3), ['s0', 's1', null]));
test('a session keeps its station', () => {
  const first = assignStations(many(3), null, 0);
  const second = assignStations([s('new', 'working'), ...many(3).reverse()], first.stations, 1);
  assert.deepEqual(ids(second).slice(0, 4), ['s0', 's1', 's2', 'new']);
});
test('subagents take no station', () => assert.deepEqual(ids(assignStations([s('a', 'working', { parentId: 'x' })], null, 0)), Array(10).fill(null)));
test('overflow counts the rest', () => assert.equal(assignStations(many(12), null, 0).overflow, 2));
test('a waiting session displaces the longest idle', () => {
  const first = assignStations(many(10, 'idle'), null, 0);
  const second = assignStations([...many(10, 'idle'), s('ask', 'question')], first.stations, 1);
  assert.equal(ids(second)[0], 'ask');       // s0 has the oldest updatedAt
  assert.equal(second.overflow, 1);
});
test('a waiting session never displaces work', () => {
  const first = assignStations(many(10, 'working'), null, 0);
  const second = assignStations([...many(10, 'working'), s('ask', 'question')], first.stations, 1);
  assert.ok(!ids(second).includes('ask'));
  assert.equal(second.overflow, 1);
});
test('a closed session clears after VACANT_MS', () => {
  const first = assignStations(many(1), null, 0);
  const gone = assignStations([], first.stations, 10);
  assert.deepEqual(gone.stations[0], { id: 's0', goneAt: 10 });
  assert.equal(assignStations([], gone.stations, 10 + VACANT_MS).stations[0], null);
});
test('a returning session keeps its station', () => {
  const gone = assignStations([], assignStations(many(1), null, 0).stations, 10);
  assert.deepEqual(assignStations(many(1), gone.stations, 20).stations[0], { id: 's0', goneAt: null });
});
test('a waiting session takes a closing station before displacing', () => {
  const first = assignStations(many(10, 'idle'), null, 0);
  const rest = many(10, 'idle').slice(1);
  const second = assignStations([...rest, s('ask', 'question')], first.stations, 1);
  assert.equal(ids(second)[0], 'ask');
  assert.equal(second.overflow, 0);
});
