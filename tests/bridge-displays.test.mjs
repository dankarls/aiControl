import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentFacts, agentLayout, fitText, stationName, visibleLimits, wrapLines } from '../client/bridge/displays.js';
import { SIGNALS } from '../client/bridge/palettes.js';

const measure = text => [...text].length * 10;
test('short text is untouched', () => assert.equal(fitText('short', 100, measure), 'short'));
test('long text is cut with an ellipsis and fits', () => {
  const out = fitText('x'.repeat(200), 100, measure);
  assert.ok(out.endsWith('…') && measure(out) <= 100);
});
test('emoji are not split', () => {
  const out = fitText('🚀'.repeat(50), 100, measure);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out));
});
test('nothing fits', () => assert.equal(fitText('hello', 0, measure), ''));
test('a session always has a name', () => {
  assert.ok(stationName({ id: 'abc', title: '', project: 'site' }));
  assert.ok(stationName({ id: 'abc' }));
});
test('missing and multi-line text', () => {
  assert.equal(fitText(null, 100, measure), '');
  assert.equal(fitText('a\n  b', 100, measure), 'a b');
});
test('limits that fit stay in order, and otherwise the fullest are kept', () => {
  const rows = [10, 90, 50, 70, 20, 30].map(used => ({ used }));
  assert.deepEqual(visibleLimits(rows.slice(0, 3), 5), rows.slice(0, 3));
  assert.deepEqual(visibleLimits(rows, 5).map(row => row.used), [90, 70, 50, 30, 20]);
});
const messages = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map(text => ({ role: 'assistant', text }));
const session = { id: 'a', status: 'working', provider: 'claude', project: 'site', title: 'x', detail: 'Editing', cost: { usd: 2 }, model: 'claude-opus-5-5', effort: 'high', context: { used: 72000 }, messages, plan: [{ step: 'Sand', status: 'done' }, { step: 'Paint', status: 'active' }, { step: 'Dry', status: 'pending' }] };
const size = text => [...text].length * 50, layout = (s = session, ...rest) => agentLayout(agentFacts(s, ...rest), 1024, 1054, size);
test('long titles fit in two lines', () => {
  const lines = wrapLines('word '.repeat(60), 960, 2, size);
  assert.equal(lines.length, 2); assert.ok(lines.every(line => size(line) <= 960)); assert.ok(lines[1].endsWith('…'));
});
test('one long word fits', () => assert.ok(wrapLines('x'.repeat(200), 960, 2, size).every(line => size(line) <= 960)));
test('emoji aren\'t split and nothing odd comes of odd text', () => {
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(wrapLines('🚀'.repeat(80), 960, 2, size).join('')));
  assert.deepEqual(wrapLines('a\n  b', 960, 2, size), ['a b']);
  assert.deepEqual(wrapLines('', 960, 2, size), ['']);
});
test('each signal gets its band colour', () => {
  for (const [status, colour] of [['working', SIGNALS.working], ['idle', SIGNALS.idle], ['question', SIGNALS.need]])
    assert.equal(layout({ ...session, status }).band.colour, colour);
  assert.equal(layout({ ...session, status: 'question' }, false, true).band.colour, SIGNALS.idle);
});
test('the feed is the latest messages, newest last', () => {
  const { feed } = layout();
  assert.equal(feed.at(-1).text, 'eight'); assert.ok(feed.length >= 3); assert.ok(feed.every(line => line.kind === 'assistant'));
});
test('it says what it\'s doing with no messages yet', () => assert.deepEqual(layout({ ...session, messages: [] }).feed.map(line => line.text), ['Editing']));
test('a tool\'s line is marked, and a huge one stays one line', () => {
  const { feed } = layout({ ...session, messages: [{ tool: 'Bash', text: 'y'.repeat(5000) }] });
  assert.equal(feed[0].kind, 'tool'); assert.ok(size(feed[0].text) <= 960);
});
test('it asks when waiting', () => assert.equal(layout({ ...session, status: 'question', requests: [{ title: 'Keep it?' }] }).request, 'Keep it?'));
test('nothing to ask when working', () => assert.equal(layout().request, null));
test('progress names the current step', () => {
  assert.deepEqual(layout().progress, { done: 1, total: 3, statuses: ['done', 'active', 'pending'], current: 'Paint' });
  assert.equal(layout({ ...session, plan: [{ step: 'Sand', status: 'done' }] }).progress.current, 'All steps done');
});
test('without a plan, the feed has more room', () => {
  assert.equal(layout({ ...session, plan: undefined }).progress, null);
  assert.ok(layout({ ...session, plan: undefined }).feed.length > layout().feed.length);
});
test('the strip holds context, cost, model and helpers, and the dot is unread', () => {
  const out = layout(session, true, false, 2);
  assert.deepEqual(out.strip, ['72K', '$2.00', 'opus-5-5 · high', '2 HELPERS']); assert.equal(out.dot, true);
  assert.deepEqual(layout().strip, ['72K', '$2.00', 'opus-5-5 · high']);
});
test('a session with nothing to say still lays out', () => {
  const out = layout({ id: 'b', status: 'idle' });
  assert.deepEqual(out.feed, []); assert.equal(out.progress, null); assert.deepEqual(out.title, ['Session']);
});
