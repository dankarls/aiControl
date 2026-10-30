import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitText, stationName } from '../client/bridge/displays.js';

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
