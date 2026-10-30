import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, paletteFor, savedColour, saveColour } from '../client/bridge/palettes.js';

const rgb = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);
function hue(hex) {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? (g - b) / d % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function saturation(hex) {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}
const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const linear = c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const maxLinear = hex => Math.max(...rgb(hex).map(linear));
const KEYS = ['wall', 'ceiling', 'bay', 'trim', 'console', 'mount', 'rail', 'door', 'pit', 'deck', 'neon', 'lamp'];
const decorative = p => [...KEYS.map(key => p[key]), ...p.tones];
const allColours = p => [...decorative(p), p.chair, p.seat];

for (const [id, p] of Object.entries(PALETTES)) {
  test(`${id}: decoration keeps clear of the signals`, () => {
    for (const c of decorative(p)) for (const signal of ['#ff4a33', '#39e0c8', '#ff8426'].map(hue)) assert.ok(saturation(c) < .15 || hueDistance(hue(c), signal) >= 20, `${c} near ${signal}`);
  });
  test(`${id}: no gold`, () => {
    for (const c of allColours(p)) assert.ok(saturation(c) < .15 || hue(c) < 35 || hue(c) > 65, c);
  });
  test(`${id}: chairs are muted`, () => {
    for (const c of [p.chair, p.seat]) {
      assert.ok(saturation(c) <= .4, `${c} saturation`);
      assert.ok(maxLinear(c) <= .3, `${c} brightness`);
    }
  });
  test(`${id}: has every colour`, () => {
    assert.equal(p.tones.length, 3);
    for (const c of allColours(p)) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.equal(typeof p.ambient, 'number');
  });
}
test('the menu has one Bridge theme; colours are chosen inside it', () => {
  const source = readFileSync('client/themes.js', 'utf8');
  assert.ok(source.includes("id: 'bridge', scheme: 'dark'"));
  assert.ok(!source.includes('bridge-'));
});
test('every colour has a name to show', () => {
  for (const p of Object.values(PALETTES)) assert.match(p.name, /^[A-Z][a-z]+$/);
});
test('unknown colours get the first palette', () => assert.equal(paletteFor('nope'), PALETTES.neon));
function withStorage(storage, run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try { run(); } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
}
test('the chosen colour is remembered', () => {
  const kept = new Map();
  withStorage({ getItem: key => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value) }, () => {
    assert.equal(savedColour(), 'neon');
    saveColour('arctic');
    assert.equal(savedColour(), 'arctic');
  });
});
test('a stale or unreadable saved colour falls back', () => {
  withStorage({ getItem: () => 'bridge-violet' }, () => assert.equal(savedColour(), 'neon'));
  withStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, () => {
    assert.equal(savedColour(), 'neon');
    saveColour('violet');
  });
});
