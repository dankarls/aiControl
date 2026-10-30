// The putting green in the secret room: holes from golf-course.js, built, drawn and played here.
// Click the course (or the notice board beside it) to play: the view moves behind the ball, raised enough to see the cup,
// and follows the ball as it rolls. Press and pull back away from the ball, like drawing back a putter, and let go: the ball
// goes the other way, as hard as you pulled (pull back to the ball to call it off). The green's height is in shades of green,
// darkest in its lowest hollow and lightest on its highest crest.
// Holes 1 to 50 are the same for everyone; the notice board keeps your best on each, and any you've reached can be picked
// there to play again. Endless (on the board too) deals fresh holes, harder as it goes, until you're ten over par; your
// longest run is kept. Bumpers flash as they kick the ball away, coffee costs a stroke and puts the ball back where it was
// putted from, a pipe spits it out of its other end, and a windmill's sails close its tunnel as they come round. A hole
// changes by sinking into the floor and the next rising out of it. With reduced motion a putt finishes at once and holes
// swap in place.
import * as THREE from 'three';
import { mesh, once, canvasTexture, paint, painted } from './furniture.js';
import { toonMaterial } from './toon.js';
import { drawCall, CHALK } from './darts.js';
import { SECRET } from './secret.js';
import { BALL, CUP, RAIL, PIPE, PERIOD, DT, MAX, HOLE_COUNT, PARS, hole, endless, height, step, inside } from './golf-course.js';

const BASE = 0.16, CAP = 0.06; // the green's surface over the floor; how far rails stand above it
// Metres of pull for the hardest putt; strokes before you pick up; how far over par ends an Endless run.
const PULL = 1.1, STROKES = 8, OUT = 10, SAVE = 'ai-control-golf';
const NEON = ['#ff4fd8', '#38f2ff', '#ffe14f', '#7dff6b', '#ff8a3d'], RAIL_BODY = '#2b2346';
const BOARD = { x: SECRET.w - 0.03, y: 1.55, z: -2.55, w: 1.7, h: 1.2 }; // the notice board, on the far wall
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (i, j) => { const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
// A spot kept `inset` metres inside the secret room's walls.
const within = (x, z, inset) => [clamp(x, inset, SECRET.w - inset), clamp(z, -SECRET.back + inset, SECRET.front - inset)];

// What the office things in the way are made of, in their own frame, standing on y = 0.
const thingParts = {
  books: () => { let top = 0; return [['#d1495b', 0.05, 0.22, 0.16, 0], ['#2e86ab', 0.045, 0.2, 0.15, 0.2], ['#edae49', 0.04, 0.18, 0.14, -0.15]].map(([color, h, w, d, turn]) => { const g = new THREE.BoxGeometry(w, h, d).rotateY(turn).translate(0, top + h / 2, 0); top += h; return [g, color]; }); },
  mug: () => [[new THREE.CylinderGeometry(0.05, 0.045, 0.11, 18).translate(0, 0.055, 0), '#f4efe6'], [new THREE.TorusGeometry(0.03, 0.009, 8, 14).translate(0.055, 0.06, 0), '#f4efe6'], [new THREE.CylinderGeometry(0.044, 0.044, 0.01, 18).translate(0, 0.1, 0), '#5b3a24']],
  duck: () => [[new THREE.SphereGeometry(0.06, 14, 10).scale(1.15, 0.85, 1).translate(0, 0.05, 0), '#ffd23f'], [new THREE.SphereGeometry(0.035, 12, 8).translate(0.04, 0.115, 0), '#ffd23f'], [new THREE.ConeGeometry(0.014, 0.03, 8).rotateZ(-Math.PI / 2).translate(0.085, 0.11, 0), '#ff8a3d']],
  stapler: () => [[new THREE.BoxGeometry(0.19, 0.02, 0.05).translate(0, 0.01, 0), '#2f3542'], [new THREE.BoxGeometry(0.18, 0.03, 0.04).translate(0.005, 0.04, 0), '#d63a3a'], [new THREE.BoxGeometry(0.03, 0.03, 0.035).translate(-0.08, 0.025, 0), '#8a8f99']],
};
// A putter in its own frame: the face at the origin looking along +x, the shaft leaning back and up from the heel.
function putterParts() {
  const lean = new THREE.Vector3(-0.28, 0.94, -0.2).normalize(), heel = new THREE.Vector3(-0.017, 0.026, -0.045);
  const along = (g, from, length) => g.translate(0, length / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean)).translate(from.x, from.y, from.z);
  return [
    [new THREE.BoxGeometry(0.034, 0.026, 0.11).translate(-0.017, 0.013, 0), '#c9ced8'], [new THREE.BoxGeometry(0.002, 0.012, 0.06).translate(0.0005, 0.014, 0), '#e63946'],
    [along(new THREE.CylinderGeometry(0.005, 0.005, 0.62, 8), heel, 0.62), '#aab0bb'], [along(new THREE.CylinderGeometry(0.0095, 0.008, 0.24, 10), heel.clone().addScaledVector(lean, 0.6), 0.24), '#1b1a1f'],
  ];
}
// The rails, posts, wedges and inner walls of hole `c` in one painted geometry: dark bodies under coloured caps.
function railParts(c) {
  const parts = [], post = (x, z, bottom) => parts.push([new THREE.CylinderGeometry(RAIL * 1.3, RAIL * 1.3, BASE + CAP + 0.012 - bottom, 12).translate(x, (BASE + CAP + 0.012 + bottom) / 2, z), '#f4f2ec']);
  const bar = ([x1, z1, x2, z2], bottom, color) => {
    const length = Math.hypot(x2 - x1, z2 - z1) + 0.004, turn = -Math.atan2(z2 - z1, x2 - x1), x = (x1 + x2) / 2, z = (z1 + z2) / 2;
    parts.push([new THREE.BoxGeometry(length, BASE - bottom, RAIL * 2).rotateY(turn).translate(x, (BASE + bottom) / 2, z), RAIL_BODY]);
    parts.push([new THREE.BoxGeometry(length, CAP, RAIL * 2 + 0.006).rotateY(turn).translate(x, BASE + CAP / 2, z), color]);
  };
  c.outline.forEach((p, i) => { bar([...p, ...c.outline[(i + 1) % c.outline.length]], 0, NEON[i % NEON.length]); post(...p, 0); });
  // A wedge stands on the green: its two inner sides as rails, its top filled in.
  for (const [p, q, s] of c.wedges) {
    bar([...p, ...q], BASE - 0.03, NEON[1]); bar([...q, ...s], BASE - 0.03, NEON[1]); post(...q, BASE - 0.03);
    parts.push([new THREE.ShapeGeometry(new THREE.Shape([p, q, s].map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2).translate(0, BASE + CAP, 0), NEON[1]]);
  }
  for (const wall of c.inner) { bar(wall, BASE - 0.03, NEON[2]); post(wall[0], wall[1], BASE - 0.03); post(wall[2], wall[3], BASE - 0.03); }
  return parts;
}
// The green's top: a 5 cm grid over the hole, the vertices outside the outline pulled onto it, raised by the slopes.
function surfaceGeometry(c, box) {
  const step = 0.05, cols = Math.ceil((box.x1 - box.x0) / step) + 1, rows = Math.ceil((box.z1 - box.z0) / step) + 1;
  const position = new Float32Array(cols * rows * 3), uv = new Float32Array(cols * rows * 2), within = new Uint8Array(cols * rows), index = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let x = Math.min(box.x1, box.x0 + i * step), z = Math.min(box.z1, box.z0 + j * step); const k = j * cols + i;
    within[k] = inside(c.outline, x, z) ? 1 : 0;
    if (!within[k]) {
      let best = Infinity, px = x, pz = z;
      c.outline.forEach(([x1, z1], e) => { const [x2, z2] = c.outline[(e + 1) % c.outline.length], dx = x2 - x1, dz = z2 - z1, t = clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz), 0, 1), d = Math.hypot(x - x1 - dx * t, z - z1 - dz * t); if (d < best) { best = d; px = x1 + dx * t; pz = z1 + dz * t; } });
      x = px; z = pz;
    }
    position.set([x, height(c, x, z), z], k * 3); uv.set([(x - box.x0) / (box.x1 - box.x0), 1 - (z - box.z0) / (box.z1 - box.z0)], k * 2);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
    if (within[a] || within[b] || within[d] || within[e]) index.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(position, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(index); g.computeVertexNormals();
  return g;
}
// Height as felt in seven shades of green, from the darkest in this hole's lowest hollow to the lightest on its highest crest,
// with a darker line where one shade meets the next, like a map's; a flat hole is one even green. Drawn unlit (the room's
// coloured light would muddy the shades).
const SHADES = ['#2b7631', '#38893b', '#479c45', '#58ae50', '#6dc05d', '#88d06f', '#aade8a'].map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
function drawGreen(g, w, h, c, box) {
  if (!c) return;
  let low = Infinity, high = -Infinity; for (const v of c.grid.h) { low = Math.min(low, v); high = Math.max(high, v); }
  const img = g.createImageData(w, h), sx = (box.x1 - box.x0) / w, sz = (box.z1 - box.z0) / h, span = high - low;
  const shade = (x, z) => span < 0.008 ? 3 : Math.min(SHADES.length - 1, Math.floor((height(c, x, z) - low) / span * SHADES.length));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = box.x0 + (i + 0.5) * sx, z = box.z0 + (j + 0.5) * sz, here = shade(x, z), k = (j * w + i) * 4;
    const tint = (here !== shade(x + sx, z) || here !== shade(x, z + sz) ? 0.72 : 1) * (0.97 + hash(i, j) * 0.06);
    for (let n = 0; n < 3; n++) img.data[k + n] = SHADES[here][n] * tint;
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
// The notice board: cork with the scorecard pinned on, the hole on now above it, Endless below. Returns where the holes'
// boxes and the Endless post-it are, in canvas pixels, for clicks.
function drawBoard(g, w, h, s) {
  const spots = { holes: [], endless: null }, pars = [...PARS].map(Number);
  g.fillStyle = '#c9a26b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = hash(i, 3) < 0.5 ? '#b58c55' : '#d9b781'; g.fillRect(hash(i, 1) * w, hash(i, 2) * h, 3, 3); }
  g.save(); g.translate(w / 2, h / 2); g.rotate(-0.012); g.fillStyle = '#fdfbf4'; g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 12; g.fillRect(-w / 2 + 36, -h / 2 + 30, w - 72, h - 60); g.restore();
  g.fillStyle = '#e63946'; g.beginPath(); g.arc(w / 2, 40, 9, 0, Math.PI * 2); g.fill();
  g.textBaseline = 'middle'; g.fillStyle = '#1b1a1f'; g.font = `bold 46px ${CHALK}`; g.textAlign = 'left';
  g.fillText(s.mode === 'endless' ? `Endless · hole ${s.index + 1} · par ${s.par}` : `Hole ${s.n} · par ${s.par}`, 70, 92);
  g.textAlign = 'right'; g.fillText(s.mode === 'endless' ? `+${s.over} of ${OUT}` : `stroke ${s.strokes}`, w - 70, 92);
  if (s.hint) { g.textAlign = 'center'; g.font = `bold 30px ${CHALK}`; g.fillStyle = '#6b7280'; g.fillText(s.hint, w / 2, 140); }
  // 50 boxes, 10 a row: the hole, then your best, coloured by how it went against par.
  const left = 70, top = 170, cw = (w - 140) / 10, ch = 78;
  for (let n = 1; n <= HOLE_COUNT; n++) {
    const x = left + (n - 1) % 10 * cw, y = top + Math.floor((n - 1) / 10) * ch, best = s.best[n], par = pars[n - 1], open = n <= s.reached, on = s.mode !== 'endless' && n === s.n;
    g.fillStyle = !open ? '#e7e3d8' : best === undefined ? '#ffffff' : best === 1 ? '#ffd166' : best < par ? '#b9e4a1' : best === par ? '#eef1f5' : '#f7b8b8';
    g.fillRect(x + 4, y + 4, cw - 8, ch - 8); g.strokeStyle = on ? '#2f7cf6' : '#c9c3b4'; g.lineWidth = on ? 5 : 2; g.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    g.fillStyle = open ? '#6b7280' : '#b8b2a4'; g.font = `bold 20px ${CHALK}`; g.textAlign = 'left'; g.fillText(n, x + 12, y + 20);
    if (best !== undefined) { g.fillStyle = '#1b1a1f'; g.font = `bold 38px ${CHALK}`; g.textAlign = 'center'; g.fillText(best, x + cw / 2, y + ch / 2 + 6); }
    if (open) spots.holes.push([n, x, y, cw, ch]);
  }
  const played = Object.keys(s.best).length, over = Object.entries(s.best).reduce((sum, [n, best]) => sum + best - pars[n - 1], 0);
  g.fillStyle = '#1b1a1f'; g.font = `bold 34px ${CHALK}`; g.textAlign = 'left'; g.fillText(played ? `${played} played · ${over > 0 ? '+' : ''}${over || 'even'}` : 'Pick a hole', 70, h - 78);
  const bx = w - 360, by = h - 122, bw = 290, bh = 82;
  g.save(); g.translate(bx + bw / 2, by + bh / 2); g.rotate(0.02); g.fillStyle = '#f7b8de'; g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 8; g.fillRect(-bw / 2, -bh / 2, bw, bh); g.restore();
  g.fillStyle = '#1b1a1f'; g.textAlign = 'center'; g.font = `bold 34px ${CHALK}`; g.fillText(s.mode === 'endless' ? 'Endless: on' : 'Endless ▶', bx + bw / 2, by + 30);
  g.font = `bold 24px ${CHALK}`; g.fillText(s.endlessBest ? `best ${s.endlessBest} holes` : `until ${OUT} over par`, bx + bw / 2, by + 62);
  spots.endless = [bx, by, bw, bh];
  return spots;
}
let pipeLook;
// An obstacle's meshes, placed in the room's frame on the green (`y(x, z)` is its surface there). A windmill's sails come
// back as userData.sails, a bumper's cap as userData.cap (they move and flash; the cap's material is its own).
function obstacle(f, y) {
  const at = (m, x, z) => { m.position.set(x, y(x, z), z); return m; }, out = new THREE.Group();
  if (f.kind === 'bumper') {
    out.add(at(mesh(once('golf-bumper', () => paint([[new THREE.CylinderGeometry(0.06, 0.065, 0.05, 20).translate(0, 0.025, 0), RAIL_BODY], [new THREE.TorusGeometry(0.052, 0.008, 6, 20).rotateX(Math.PI / 2).translate(0, 0.05, 0), '#f4f2ec']])), painted(), 0.004), f.x, f.z));
    const cap = at(mesh(once('golf-bumper-cap', () => new THREE.CylinderGeometry(0.042, 0.048, 0.025, 20).translate(0, 0.062, 0)), toonMaterial(NEON[0], { emissive: '#000000' }), 0.003), f.x, f.z);
    out.add(cap); out.userData.cap = cap;
  } else if (f.kind === 'spill') {
    for (const [scale, color, lift] of [[1, '#4a2a14', 0.003], [0.55, '#6e4120', 0.004]]) {
      const pool = at(new THREE.Mesh(once('golf-spill', () => new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color })), f.x, f.z);
      pool.scale.set(f.rx * scale, 1, f.rz * scale); pool.rotation.y = -f.turn; pool.position.y += lift; pool.position.x += (1 - scale) * 0.03; out.add(pool);
    }
  } else if (f.kind === 'pipe') {
    const green = pipeLook ??= toonMaterial('#3da35d', { side: THREE.DoubleSide });
    out.add(at(new THREE.Mesh(new THREE.CircleGeometry(PIPE, 24).rotateX(-Math.PI / 2).translate(0, 0.003, 0), new THREE.MeshBasicMaterial({ color: '#0d0c10' })), f.x, f.z));
    out.add(at(mesh(new THREE.TorusGeometry(PIPE + 0.01, 0.012, 8, 24).rotateX(Math.PI / 2).translate(0, 0.006, 0), green, 0.003), f.x, f.z));
    // Its other end: a short tube lying on the green, open toward where the ball comes out.
    const end = at(new THREE.Group(), f.to.x, f.to.z); end.rotation.y = -f.out; out.add(end);
    end.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 18, 1, true).rotateZ(Math.PI / 2).translate(-0.03, 0.035, 0), green, 0.004), mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 20).rotateY(Math.PI / 2).translate(0.04, 0.035, 0), green, 0.003));
  } else { // the windmill: two blocks either side of a tunnel, a roof over both, sails in front
    const mill = at(new THREE.Group(), f.x, f.z); mill.rotation.y = -f.turn; out.add(mill);
    mill.add(mesh(once('golf-mill', () => paint([
      ...[-0.24, 0.24].map(z => [new THREE.BoxGeometry(0.3, 0.24, 0.32).translate(0, 0.12, z), '#efe6d2']), [new THREE.BoxGeometry(0.3, 0.07, 0.16).translate(0, 0.205, 0), '#efe6d2'],
      [new THREE.CylinderGeometry(0.2, 0.2, 0.86, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.33, 0), '#d1495b'], [new THREE.BoxGeometry(0.02, 0.08, 0.06).translate(0.151, 0.12, -0.24), '#2f3542'],
    ])), painted(), 0.005));
    const sails = new THREE.Group(); sails.position.set(f.side * 0.19, 0.3, 0); mill.add(sails);
    sails.add(mesh(once('golf-sails', () => paint([...[0, 1, 2, 3].map(k => [new THREE.BoxGeometry(0.012, 0.28, 0.07).translate(0, -0.16, 0).rotateX(k * Math.PI / 2), '#f4f2ec']), [new THREE.SphereGeometry(0.03, 10, 8), '#2f3542']])), painted(), 0.003));
    out.userData.sails = sails;
  }
  return out;
}
const verdict = (strokes, par) => strokes === 1 ? 'Hole in one!' : ['Albatross!', 'Eagle!', 'Birdie!', 'Par', 'Bogey', 'Double bogey'][strokes - par + 3] ?? `+${strokes - par}`;
const finish = gen => { for (;;) { const s = gen.next(); if (s.done) return s.value; } };
// An Endless hole, dealt in a worker (surveying one can take seconds); one worker a hole, gone once it answers.
const deal = (index, seed) => new Promise(resolve => {
  const worker = new Worker(new URL('./golf-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); }; worker.postMessage({ index, seed });
});

// `camera`; `canvas` (the scene's) and `ray(event)`, the direction under a screen point; `onPlay(golf)`: the course was clicked.
export function createGolf({ camera, canvas, ray, onPlay }) {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch {}
  const progress = { best: saved.best || {}, reached: saved.reached || 1, n: saved.n || 1, endlessBest: saved.endlessBest || 0 };
  const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(progress)); } catch {} };
  let room = null, c = null, mode = 'holes', run = null, strokes = 0, time = 0, still = false, active = false, shown = false;
  let ball = null, rolling = false, sunkAt = -1, spillAt = -1, dealing = false, acc = 0, swap = null, pull = null, swing = null, spots = null, putFrom = null, mills = [];
  let course3d, surface, rails, things = [], cup, flag, flagTexture, tee, ballMesh, shadow, club, arrow, confetti, call, board, boardTexture;
  const box = { x0: 0, z0: 0, x1: 1, z1: 1 }, local = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0)), hitPoint = new THREE.Vector3(), rayer = new THREE.Ray();
  // The view while playing, easing after the ball: behind it along `heading` (to the cup when it last stopped).
  const view = { from: new THREE.Vector3(), look: new THREE.Vector3(), heading: new THREE.Vector2(1, 0), set: false };
  const surfaceY = (x, z) => BASE + height(c, x, z);
  const hint = () => !active ? 'Click the green to play' : mode === 'holes' && progress.n === 1 && !strokes ? 'Press, pull back from the ball and let go' : '';
  const redraw = () => boardTexture?.redraw({ mode, n: progress.n, index: run?.index ?? 0, over: run?.over ?? 0, par: c.par, strokes, best: progress.best, reached: progress.reached, endlessBest: progress.endlessBest, hint: hint() });
  const aimAtCup = () => { const d = view.heading.set(c.cup.x - ball.x, c.cup.z - ball.z); if (d.lengthSq() > 1e-6) d.normalize(); };

  // Lays out hole `next` (its green, rails, things, cup and tee) in place of the one there.
  function lay(next) {
    c = next; strokes = 0; sunkAt = spillAt = -1; rolling = dealing = false; pull = swing = null;
    ball = { x: c.tee.x, z: c.tee.z, vx: 0, vz: 0, touch: [], rest: true, t: 0 };
    const xs = c.outline.map(p => p[0]), zs = c.outline.map(p => p[1]);
    Object.assign(box, { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) });
    surface.geometry.dispose(); surface.geometry = surfaceGeometry(c, box);
    surface.material.map?.dispose(); surface.material.map = canvasTexture(Math.round((box.x1 - box.x0) * 110), Math.round((box.z1 - box.z0) * 110), (g, w, h) => drawGreen(g, w, h, c, box)); surface.material.needsUpdate = true;
    rails?.removeFromParent(); rails?.geometry.dispose(); rails = mesh(paint(railParts(c)), painted(), 0.004); course3d.add(rails);
    for (const m of things) { m.removeFromParent(); m.userData.cap?.material.dispose(); }
    things = c.things.map(o => { const m = mesh(once(`golf-${o.kind}`, () => paint(thingParts[o.kind]())), painted(), 0.004); m.position.set(o.x, surfaceY(o.x, o.z), o.z); m.rotation.y = -o.turn; course3d.add(m); return m; });
    const pieces = c.features.map(f => { const m = obstacle(f, surfaceY); m.userData.feature = f; course3d.add(m); return m; });
    things.push(...pieces); mills = pieces.filter(m => m.userData.sails);
    cup.position.set(c.cup.x, BASE + 0.002, c.cup.z); flag.position.set(c.cup.x, BASE, c.cup.z); flagTexture.redraw(mode === 'endless' ? run.index + 1 : progress.n);
    aimAtCup(); tee.position.set(c.tee.x, BASE + 0.001, c.tee.z); tee.rotation.y = -Math.atan2(view.heading.y, view.heading.x);
    view.set = false; redraw();
  }
  // A new hole: the course sinks into the floor and this one rises (or it's just swapped, unseen or with reduced motion).
  const change = next => { if (still || !shown) lay(next); else swap = { t: 0, next }; };
  const playHole = n => { mode = 'holes'; run = null; progress.n = n; save(); change(hole(n)); };
  // Endless: its first hole is quick to work out here; each next one is dealt in a worker while you play the one before.
  const playEndless = () => { mode = 'endless'; run = { index: 0, seed: Math.floor(Math.random() * 1e9), over: 0 }; change(finish(endless(0, run.seed))); run.next = deal(1, run.seed); };

  const golf = {
    get ready() { return active && !rolling && !swing && sunkAt < 0 && spillAt < 0 && !dealing && !swap; },
    enter() { active = true; view.set = false; redraw(); },
    leave() { active = false; pull = null; redraw(); },
    // Where you stand when you step back (on the floor, in world space, facing the cup), and the view while playing.
    stand() { const [x, z] = within(ball.x - view.heading.x * 0.9, ball.z - view.heading.y * 0.9, 0.4), p = room.localToWorld(new THREE.Vector3(x, 0, z)); return { x: p.x, z: p.z, yaw: Math.atan2(view.heading.x, view.heading.y) }; },
    pose() { return { from: room.localToWorld(view.from.clone()), look: room.localToWorld(view.look.clone()), fov: 55, hands: false }; },
    click() { return false; }, // a putt is a pull, not a click
    build(group) {
      room = group;
      // The course: click any of it to play (outlined under the pointer).
      course3d = new THREE.Group(); course3d.userData.toggle = () => onPlay(golf); group.add(course3d);
      surface = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); surface.position.y = BASE; course3d.add(surface);
      cup = new THREE.Group(); course3d.add(cup);
      cup.add(new THREE.Mesh(new THREE.CircleGeometry(CUP, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#141317' })), new THREE.Mesh(new THREE.RingGeometry(CUP, CUP + 0.012, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f4f2ec' })));
      flagTexture = canvasTexture(128, 96, (g, tw, th, number) => { g.clearRect(0, 0, tw, th); g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(0, 0); g.lineTo(tw, th / 2); g.lineTo(0, th); g.fill(); g.fillStyle = '#ffffff'; g.font = `bold 44px ${CHALK}`; g.textBaseline = 'middle'; g.fillText(number ?? '', 8, th / 2 + 2); });
      flag = new THREE.Group(); course3d.add(flag);
      flag.add(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.62).translate(0, 0.31, 0), new THREE.MeshBasicMaterial({ color: '#e8e6df' })), new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15).translate(0.1, 0.53, 0), new THREE.MeshBasicMaterial({ map: flagTexture, transparent: true, side: THREE.DoubleSide })));
      // The tee: a darker mat with a white marker either side.
      tee = mesh(once('golf-tee', () => paint([[new THREE.BoxGeometry(0.3, 0.008, 0.22).translate(0, 0.004, 0), '#2f6b3a'], ...[-0.1, 0.1].map(z => [new THREE.SphereGeometry(0.012, 10, 8).translate(-0.06, 0.012, z), '#f4f2ec'])])), painted(), 0.003); course3d.add(tee);
      ballMesh = mesh(new THREE.SphereGeometry(BALL, 18, 14), toonMaterial('#ffffff'), 0.003); course3d.add(ballMesh);
      shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL * 1.3, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false })); shadow.raycast = () => {}; course3d.add(shadow);
      club = mesh(once('golf-putter', () => paint(putterParts())), painted(), 0.003); club.visible = false; room.add(club);
      // The aim arrow, flat over the green and always on top: as long and as hot as the pull is hard.
      const arrowShape = new THREE.Shape([[0, -0.018], [0.8, -0.018], [0.8, -0.045], [1, 0], [0.8, 0.045], [0.8, 0.018], [0, 0.018]].map(([x, y]) => new THREE.Vector2(x, y)));
      arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7dff6b', transparent: true, opacity: 0.85, depthTest: false })); arrow.renderOrder = 3; arrow.visible = false; arrow.raycast = () => {}; room.add(arrow);
      const colors = new Float32Array(150 * 3); for (let i = 0; i < 150; i++) new THREE.Color(NEON[i % NEON.length]).toArray(colors, i * 3);
      confetti = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(150 * 3), 3)).setAttribute('color', new THREE.BufferAttribute(colors, 3)), new THREE.PointsMaterial({ size: 0.03, vertexColors: true }));
      confetti.userData.v = new Float32Array(150 * 3); confetti.visible = false; confetti.raycast = () => {}; room.add(confetti);
      call = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(512, 128, drawCall), transparent: true, depthTest: false })); call.scale.set(1.2, 0.3, 1); call.renderOrder = 3; call.visible = false; room.add(call);
      // The notice board: a click on a hole you've reached plays it; on Endless, starts a run; anywhere else, plays on.
      boardTexture = canvasTexture(1024, 720, (g, w, h, s) => { if (s) spots = drawBoard(g, w, h, s); });
      board = new THREE.Group(); board.position.set(BOARD.x, BOARD.y, BOARD.z); board.rotation.y = -Math.PI / 2; room.add(board);
      board.add(mesh(new THREE.BoxGeometry(BOARD.w + 0.08, BOARD.h + 0.08, 0.03).translate(0, 0, -0.015), toonMaterial('#7a4e2d'), 0.006), new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h).translate(0, 0, 0.002), new THREE.MeshBasicMaterial({ map: boardTexture })));
      board.userData.toggle = point => {
        if (point && spots) {
          const p = board.worldToLocal(point.clone()), px = (p.x / BOARD.w + 0.5) * 1024, py = (0.5 - p.y / BOARD.h) * 720, [ex, ey, ew, eh] = spots.endless;
          const picked = spots.holes.find(([, x, y, w, h]) => px > x && px < x + w && py > y && py < y + h);
          if (px > ex && px < ex + ew && py > ey && py < ey + eh) playEndless(); else if (picked) playHole(picked[0]);
        }
        onPlay(golf);
      };
      lay(hole(clamp(progress.n, 1, HOLE_COUNT)));
      document.fonts?.load(`bold 44px 'Comic Neue'`).then(() => { flagTexture.redraw(mode === 'endless' ? run.index + 1 : progress.n); redraw(); }).catch(() => {});
    },
    update(dt, at, reduced, visible) {
      time += dt; still = reduced; shown = visible;
      if (!room || !shown) return;
      for (const m of mills) m.userData.sails.rotation.x = 2 * Math.PI * time / PERIOD * m.userData.feature.side; // in step with shut() (golf-course.js)
      // Changing holes: down into the floor, swap, back up with a little hop.
      if (swap) {
        const t = swap.t = Math.min(1, swap.t + dt / 1.1);
        if (t >= 0.45 && !swap.laid) { swap.laid = true; lay(swap.next); }
        course3d.position.y = t < 0.45 ? -0.35 * (t / 0.45) ** 2 : -0.35 * (1 - (t - 0.45) / 0.55) ** 2 + 0.03 * Math.sin(Math.PI * (t - 0.45) / 0.55);
        if (t === 1) { swap = null; course3d.position.y = 0; }
      }
      // The swing: the club comes through, then the ball goes.
      if (swing) {
        swing.t += dt; place(swing.dir, Math.max(-0.05, swing.back * (1 - swing.t / 0.1)));
        if (swing.t >= 0.1 && !swing.hit) {
          swing.hit = true; putFrom = { x: ball.x, z: ball.z };
          Object.assign(ball, { vx: swing.dir.x * swing.speed, vz: swing.dir.y * swing.speed, rest: false, touch: [], t: time }); rolling = true; acc = 0; strokes++; redraw();
          if (still) { while (!ball.sunk && !ball.rest && !ball.spilled) step(c, ball); }
        }
        if (swing.t > 0.45) swing = null;
      }
      if (rolling) {
        for (acc += dt; acc >= DT && rolling; acc -= DT) { step(c, ball); if (ball.sunk || ball.rest || ball.spilled) rolling = false; }
        // A bumper it hit flashes.
        if (ball.bumped) { const cap = things.find(m => m.userData.feature === ball.bumped)?.userData.cap; if (cap) { cap.material.emissive.set(NEON[0]); cap.userData.until = time + 0.15; } ball.bumped = null; }
        const s = Math.hypot(ball.vx, ball.vz); if (s > 0) ballMesh.rotateOnWorldAxis(local.set(ball.vz / s, 0, -ball.vx / s), s * dt / BALL);
        if (!rolling) settle();
      }
      for (const m of things) if (m.userData.cap?.userData.until < time) { m.userData.cap.material.emissive.set('#000000'); m.userData.cap.userData.until = undefined; }
      // In the coffee: a moment, then back where it was putted from.
      if (spillAt >= 0 && time - spillAt > (still ? 0.3 : 1)) { spillAt = -1; Object.assign(ball, { ...putFrom, vx: 0, vz: 0, spilled: false, rest: true, touch: [] }); if (strokes >= STROKES) settle(); else aimAtCup(); }
      const down = sunkAt >= 0 && ball.sunk ? Math.min(1, (time - sunkAt) / 0.2) : 0;
      ballMesh.position.set(ball.sunk ? c.cup.x : ball.x, surfaceY(ball.x, ball.z) + BALL - down * 0.06, ball.sunk ? c.cup.z : ball.z);
      shadow.visible = !ball.sunk; shadow.position.set(ball.x, surfaceY(ball.x, ball.z) + 0.002, ball.z);
      // The flag comes out as the ball nears the cup.
      flag.position.y += ((Math.hypot(ball.x - c.cup.x, ball.z - c.cup.z) < 0.7 && (rolling || pull) ? 0.4 : 0) - flag.position.y) * Math.min(1, dt * 6);
      if (sunkAt >= 0 && time - sunkAt > (still ? 0.6 : 1.9)) next();
      // The club rests behind the ball, facing the cup, until you pull.
      if (golf.ready && !pull) place(view.heading, 0.03);
      club.visible = golf.ready || !!swing;
      arrow.visible = !!pull && pull.power > 0.03;
      if (arrow.visible) { arrow.position.set(ball.x, surfaceY(ball.x, ball.z) + 0.012, ball.z); arrow.rotation.y = -Math.atan2(pull.dir.y, pull.dir.x); arrow.scale.set(0.25 + 1.4 * pull.power, 1, 1); arrow.material.color.setHSL(0.33 * (1 - pull.power), 1, 0.6); }
      if (confetti.visible) {
        const pos = confetti.geometry.attributes.position, v = confetti.userData.v;
        for (let i = 0; i < 150; i++) { v[i * 3 + 1] -= 3 * dt; pos.setXYZ(i, pos.getX(i) + v[i * 3] * dt, Math.max(BASE, pos.getY(i) + v[i * 3 + 1] * dt), pos.getZ(i) + v[i * 3 + 2] * dt); }
        pos.needsUpdate = true; confetti.visible = time - confetti.userData.at < 1.8;
      }
      if (call.visible) { const age = time - call.userData.at; call.material.opacity = Math.max(0, 1 - age / 1.8); if (age > 1.8) call.visible = false; }
      // The view: behind the ball, high enough to see down to the cup, kept off the walls (rising by however far it was
      // pulled in); it eases after the ball, and holds still while you pull.
      if (!pull) {
        const k = still || !view.set ? 1 : 1 - Math.exp(-dt * 2.5), y = surfaceY(ball.x, ball.z), far = Math.hypot(c.cup.x - ball.x, c.cup.z - ball.z);
        const back = [ball.x - view.heading.x * 1.5, ball.z - view.heading.y * 1.5], [cx, cz] = within(...back, 0.3);
        view.from.lerp(local.set(cx, y + Math.min(2.5, 1.05 + 0.28 * far + 0.7 * Math.hypot(back[0] - cx, back[1] - cz)), cz), k);
        view.look.lerp(local.set(ball.x + (c.cup.x - ball.x) * 0.4, y, ball.z + (c.cup.z - ball.z) * 0.4), k); view.set = true;
      }
    },
  };
  // The club behind the ball, `back` metres off it, facing `dir` (where the putt goes).
  function place(dir, back) {
    const x = ball.x - dir.x * (BALL + 0.004 + back), z = ball.z - dir.y * (BALL + 0.004 + back);
    club.position.set(x, surfaceY(x, z), z); club.rotation.y = -Math.atan2(dir.y, dir.x);
  }
  // Your best on hole `n`, and the next one opened.
  const score = (n, strokes) => { progress.best[n] = Math.min(progress.best[n] ?? Infinity, strokes); progress.reached = Math.max(progress.reached, Math.min(HOLE_COUNT, n + 1)); save(); };
  // The ball stopped: in the cup, in coffee (a stroke's penalty), out of strokes (you pick up, scoring one more), or ready
  // for the next putt.
  function settle() {
    if (ball.spilled) { strokes++; spillAt = time; say('Splash! +1', '#ff8a3d', ball); }
    else if (ball.sunk || strokes >= STROKES) {
      const taken = ball.sunk ? strokes : STROKES + 1;
      sunkAt = time;
      if (mode === 'holes') score(progress.n, taken); else run.over += taken - c.par;
      say(ball.sunk ? verdict(strokes, c.par) : 'Picked up', ball.sunk && strokes < c.par ? '#ffe14f' : '#f4f2ec');
      if (ball.sunk && strokes < c.par && !still) cheer();
    } else aimAtCup();
    redraw();
  }
  // On to the next hole: the course's next, or Endless's (or the end of the run).
  function next() {
    sunkAt = -1;
    if (mode === 'holes') { playHole(progress.n < HOLE_COUNT ? progress.n + 1 : 1); return; }
    if (run.over >= OUT) { progress.endlessBest = Math.max(progress.endlessBest, run.index); save(); say(`Run over: ${run.index} holes`, '#ff8a3d'); playHole(progress.n); return; }
    const dealt = run; dealt.index++; dealing = true;
    dealt.next.then(next => { if (run !== dealt) return; dealt.next = deal(dealt.index + 1, dealt.seed); change(next); });
  }
  function say(text, color, at = c.cup) { call.material.map.redraw(text, color); call.position.set(at.x, BASE + 0.55, at.z); call.userData.at = time; call.visible = true; call.material.opacity = 1; }
  function cheer() {
    const pos = confetti.geometry.attributes.position, v = confetti.userData.v;
    for (let i = 0; i < 150; i++) { const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.9; pos.setXYZ(i, c.cup.x, BASE + 0.05, c.cup.z); v.set([Math.cos(a) * s, 1.8 + Math.random() * 1.6, Math.sin(a) * s], i * 3); }
    confetti.userData.at = time; confetti.visible = true;
  }

  // Pulling back: where the pointer meets the level of the ball, against where you pressed; the putt goes the other way.
  const onPlane = event => {
    rayer.origin.copy(room.worldToLocal(local.copy(camera.position))); rayer.direction.copy(ray(event));
    plane.constant = -surfaceY(ball.x, ball.z); return rayer.intersectPlane(plane, hitPoint) && hitPoint.clone();
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !golf.ready) return;
    const at = onPlane(event); if (at) pull = { start: at, dir: view.heading.clone(), power: 0 };
  });
  canvas.addEventListener('pointermove', event => {
    if (!pull) return;
    const at = onPlane(event); if (!at) return;
    const dx = pull.start.x - at.x, dz = pull.start.z - at.z, length = Math.hypot(dx, dz);
    pull.power = Math.min(1, length / PULL); if (length > 0.01) pull.dir.set(dx / length, dz / length);
    place(pull.dir, 0.03 + pull.power * 0.4);
  });
  canvas.addEventListener('pointerup', () => {
    if (!pull) return;
    const { dir, power } = pull; pull = null;
    if (power > 0.03 && golf.ready) swing = { t: 0, dir, back: 0.03 + power * 0.4, speed: power * MAX };
  });
  canvas.addEventListener('pointercancel', () => { pull = null; });
  return golf;
}
