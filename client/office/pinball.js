// Pinball in the secret room: Tutti Frutti, a fruit table against the front wall between the beanbags and the green. Click
// the cabinet to step up: the view looks down the playfield, steeper on a narrow screen so all of it fits. Flippers: ← →,
// A D, Z M or the Shifts, or press the left or right half of the screen (a finger each works); the plunger: hold Space, S
// or ↓, or either half while a ball waits in the lane, and let go. A flip starts a game; leaving pauses it.
// Three balls. The pop bumpers are an orange, a lime and a cherry pair, the slingshots watermelon slices. The three lanes
// at the top light as the ball rolls through (the flippers shift which are lit) and all three raise the multiplier, up to
// 5×; knock down the strawberry, banana and grape targets for multiball; the juicer on the right takes the ball in and
// spits it back at the bumpers (the jackpot during multiball). The lane flashing as a ball is served is the skill shot, and
// a ball that drains in its first 8 s comes back once. The score shows on the backbox and again on the apron, which reads
// from above on a phone; the best is kept per browser.
// The table is flat (x across, y up it, in metres), stepped at 1 kHz by the pure part below, which runs under node --test;
// the 3D follows it. With reduced motion there's no shake, flashing, juice or chasing lamps; the game itself still moves.
import * as THREE from 'three';
import { mesh, paint, painted, canvasTexture, glowTexture } from './furniture.js';
import { SECRET } from './secret.js';

export const R = 0.0135, G = 1.6, DT = 1 / 1000, BALLS = 3; // ball radius (m), the table's pull down it (m/s²), a step (s)
const SAVE = 8, SKILL = 4, PULL = 0.9, TOP = 5; // seconds of ball save and skill shot; to pull the plunger right back; m/s at most
// The lane a ball is served into (its middle, inner wall and outer wall), the left wall, and the arc over the top.
export const LANE = { x: 0.2565, wall: 0.235, out: 0.28, top: 0.78 }, LEFT = -0.235, ARC = { x: 0.0225, y: 0.8025, r: 0.2575 };
export const FLIP = { len: 0.085, base: 0.011, tip: 0.006, up: 40, down: 18, e: 0.5 }; // m; rad/s up and back; bounce

export const TABLE = (() => {
  const walls = [], posts = [];
  // A wall is a line `h` thick either side; `e` is how much of the speed into it a ball keeps. A slingshot's are under its
  // watermelon, and its face kicks.
  const wall = (x1, y1, x2, y2, h = 0.003, e = 0.35, sling, kick) => walls.push({ x1, y1, x2, y2, h, e, sling, kick });
  const post = (x, y, r = 0.004, e = 0.55) => posts.push({ x, y, r, e });
  wall(LANE.out, -0.06, LANE.out, ARC.y, 0.004);
  for (let i = 0; i < 32; i++) { const a = Math.PI * i / 32, b = Math.PI * (i + 1) / 32; wall(ARC.x + ARC.r * Math.cos(a), ARC.y + ARC.r * Math.sin(a), ARC.x + ARC.r * Math.cos(b), ARC.y + ARC.r * Math.sin(b), 0.004); }
  wall(LEFT, ARC.y, LEFT, 0, 0.004);
  wall(LANE.wall, -0.06, LANE.wall, LANE.top, 0.004); post(LANE.wall, LANE.top);
  // Each side, the left as written and the right mirrored: the outlane's divider, the inlane's floor down onto the flipper,
  // and the slingshot (its face, a to c, kicks).
  const slings = [];
  for (const s of [1, -1]) {
    const X = x => x * s, i = slings.length;
    wall(X(-0.193), 0.355, X(-0.193), 0.245); post(X(-0.193), 0.355);
    wall(X(-0.193), 0.245, X(-0.112), 0.162);
    const a = [X(-0.15), 0.345], b = [X(-0.15), 0.265], c = [X(-0.115), 0.235];
    wall(...a, ...b, 0.003, 0.35, i); wall(...b, ...c, 0.003, 0.35, i); wall(...a, ...c, 0.003, 0.3, i, true); for (const p of [a, b, c]) post(...p, 0.005);
    slings.push([a, b, c]);
  }
  for (const x of [-0.125, -0.055, 0.015, 0.085]) { wall(x, 0.86, x, 0.92); post(x, 0.86); post(x, 0.92); } // the top lanes' guides
  wall(-0.223, 0.47, -0.223, 0.62, 0.002); // behind the drop targets, so one that's down leaves no pocket to sit in
  return {
    walls, posts, slings,
    bumpers: [[-0.075, 0.765], [0.045, 0.765], [-0.015, 0.67]].map(([x, y]) => ({ x, y, r: 0.03 })),
    targets: [0.5, 0.545, 0.59].map(y => ({ x: -0.215, y, h: 0.018 })), // upright, `h` either way along y
    lanes: [-0.09, -0.02, 0.05].map(x => ({ x, y: 0.89 })),
    saucer: { x: 0.165, y: 0.6 },
    gate: { x1: LANE.wall, y1: 0.79, x2: LANE.out, y2: 0.83 }, // one way, out of the lane
    flippers: [{ x: -0.1, y: 0.15, rest: -0.5, up: 0.5 }, { x: 0.1, y: 0.15, rest: Math.PI + 0.5, up: Math.PI - 0.5 }],
  };
})();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const P = { x: 0, y: 0 }, N = { x: 0, y: 0 };
// The point on a segment nearest (x, y), into P; returns how far along it that is (0 to 1).
function nearest(x, y, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, k = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1); P.x = x1 + dx * k; P.y = y1 + dy * k; return k; }
// Ball `b` within `reach` of (cx, cy): pushed out to it, and bounced off a surface there moving at (sx, sy), keeping `e` of
// its speed in. The normal is left in N. Returns how hard it hit, 0 if it doesn't touch.
function touch(b, cx, cy, reach, e, sx = 0, sy = 0) {
  let nx = b.x - cx, ny = b.y - cy; const d = Math.hypot(nx, ny);
  if (d >= reach || d < 1e-9) return 0;
  nx /= d; ny /= d; N.x = nx; N.y = ny; b.x = cx + nx * reach; b.y = cy + ny * reach;
  const vn = (b.vx - sx) * nx + (b.vy - sy) * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return Math.max(-vn, 1e-6);
}

export function newTable(best = 0) {
  return { mode: 'attract', time: 0, balls: [], flippers: TABLE.flippers.map(f => ({ ...f, a: f.rest, w: 0 })), input: { left: false, right: false, plunge: false }, was: {},
    pull: 0, score: 0, last: 0, best, ball: 0, mult: 1, lit: [false, false, false], targets: [true, true, true], resetAt: 0, multiball: false,
    launched: false, saveUntil: 0, skillUntil: 0, skillLane: 0, cool: [0, 0, 0], hitAt: {}, overAt: -Infinity, message: null, events: [] };
}
// A ball on the plunger, waiting to go.
export const waiting = t => t.balls.some(b => b.x > LANE.wall && b.y < 0.1);
const serve = t => { t.balls.push({ x: LANE.x, y: R + 0.005, vx: 0, vy: 0 }); t.launched = false; t.skillUntil = Infinity; t.skillLane = t.ball % 3; };
const say = (t, text) => { t.message = { text, at: t.time }; };
const award = (t, points) => { t.score += points * t.mult; };
export function start(t) {
  Object.assign(t, { mode: 'play', score: 0, ball: 1, mult: 1, lit: [false, false, false], targets: [true, true, true], resetAt: 0, multiball: false, balls: [], saveUntil: 0 });
  serve(t); say(t, 'BALL 1'); t.events.push({ kind: 'start' });
}

// One step of DT: flippers and plunger from t.input, every ball, then what drained. What happened goes in t.events.
export function step(t) {
  t.time += DT;
  for (const [side, i] of [['left', 0], ['right', 1]]) {
    const down = t.input[side];
    if (down && !t.was[side]) {
      if (t.mode !== 'play' && t.time - t.overAt > 1.5) start(t);
      else if (t.mode === 'play') t.lit = i ? [t.lit[2], t.lit[0], t.lit[1]] : [t.lit[1], t.lit[2], t.lit[0]]; // lane change
      t.events.push({ kind: 'flip', i });
    }
    t.was[side] = down;
    const f = t.flippers[i], goal = down ? f.up : f.rest, speed = down ? FLIP.up : FLIP.down, d = goal - f.a;
    if (Math.abs(d) <= speed * DT) { f.a = goal; f.w = 0; } else { f.w = Math.sign(d) * speed; f.a += f.w * DT; }
  }
  // The plunger pulls back while held and fires the ball sitting on it as it's let go, harder the further it was pulled;
  // barely pulled (a tap, or a press that was for a flipper), it just goes back.
  if (t.input.plunge && t.mode === 'play') t.pull = Math.min(1, t.pull + DT / PULL);
  else if (t.pull) {
    if (t.pull > 0.15) for (const b of t.balls) if (b.x > LANE.wall && b.y < plungerY(t) + R + 0.016) { b.y = R + 0.0045; b.vy = 0.9 + 2.5 * t.pull; launch(t); } // it comes up with the plunger
    t.pull = 0;
  }
  if (t.resetAt && t.time > t.resetAt) { t.targets = [true, true, true]; t.resetAt = 0; }
  for (const b of t.balls) move(t, b);
  // Balls knock into each other (the same weight).
  for (let i = 0; i < t.balls.length; i++) for (let j = i + 1; j < t.balls.length; j++) {
    const a = t.balls[i], b = t.balls[j]; if (a.held || b.held) continue;
    let nx = b.x - a.x, ny = b.y - a.y; const d = Math.hypot(nx, ny); if (d >= 2 * R || d < 1e-9) continue;
    nx /= d; ny /= d; const push = (2 * R - d) / 2, vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    if (vn < 0) { const k = 0.95 * vn; a.vx += k * nx; a.vy += k * ny; b.vx -= k * nx; b.vy -= k * ny; }
  }
  if (!t.balls.some(b => b.gone)) return;
  for (const b of t.balls) if (b.gone) t.events.push({ kind: 'drain', x: b.x, y: b.y });
  t.balls = t.balls.filter(b => !b.gone);
  if (t.balls.length < 2) t.multiball = false;
  if (t.mode !== 'play' || t.balls.length) return;
  if (t.time < t.saveUntil) { t.saveUntil = 0; serve(t); t.launched = true; say(t, 'BALL SAVED'); t.events.push({ kind: 'saved' }); return; }
  t.mult = 1; t.lit = [false, false, false];
  if (t.ball < BALLS) { t.ball++; serve(t); say(t, `BALL ${t.ball}`); return; }
  t.mode = 'over'; t.overAt = t.time; t.last = t.score; t.best = Math.max(t.best, t.score); say(t, 'GAME OVER'); t.events.push({ kind: 'over' });
}
const plungerY = t => -0.035 * t.pull;
// The first launch of a served ball starts its ball save and the skill shot's clock.
function launch(t) { t.events.push({ kind: 'launch' }); if (t.launched) return; t.launched = true; t.saveUntil = t.time + SAVE; t.skillUntil = t.time + SKILL; }

function move(t, b) {
  if (b.held) { if (t.time < b.held) return; b.held = 0; b.free = t.time + 0.5; b.vx = -1.1; b.vy = 1; t.events.push({ kind: 'eject', x: b.x, y: b.y }); }
  if (b.auto && t.time > b.auto) { b.auto = 0; b.vy = 3; launch(t); }
  b.vy -= G * DT;
  const speed = Math.hypot(b.vx, b.vy); if (speed > TOP) { b.vx *= TOP / speed; b.vy *= TOP / speed; }
  b.x += b.vx * DT; b.y += b.vy * DT;
  const ev = t.events, ready = key => { if (t.time - (t.hitAt[key] ?? -1) < 0.08) return false; t.hitAt[key] = t.time; return true; };
  for (const w of TABLE.walls) {
    nearest(b.x, b.y, w.x1, w.y1, w.x2, w.y2);
    const hit = touch(b, P.x, P.y, R + w.h, w.e);
    // A slingshot kicks back anything that comes at it with a bit of pace.
    if (w.kick && hit > 0.15 && ready(`s${w.sling}`)) { b.vx += N.x * 1.1; b.vy += N.y * 1.1; award(t, 10); ev.push({ kind: 'sling', i: w.sling, x: b.x, y: b.y }); }
  }
  for (const p of TABLE.posts) touch(b, p.x, p.y, R + p.r, p.e);
  TABLE.bumpers.forEach((p, i) => {
    if (touch(b, p.x, p.y, R + p.r, 0.5) && ready(`b${i}`)) { b.vx += N.x * 1.3; b.vy += N.y * 1.3; award(t, 100); ev.push({ kind: 'bump', i, x: p.x, y: p.y }); }
  });
  TABLE.targets.forEach((g, i) => {
    if (!t.targets[i]) return;
    nearest(b.x, b.y, g.x, g.y - g.h, g.x, g.y + g.h);
    if (!touch(b, P.x, P.y, R + 0.004, 0.3)) return;
    t.targets[i] = false; award(t, 750); ev.push({ kind: 'target', i, x: g.x, y: g.y });
    if (t.targets.some(up => up)) return;
    award(t, 5000); t.resetAt = t.time + 1.5;
    if (t.multiball) return;
    t.multiball = true; t.balls.push({ x: LANE.x, y: R + 0.005, vx: 0, vy: 0, auto: t.time + 0.8 }); say(t, 'MULTIBALL'); ev.push({ kind: 'multiball' });
  });
  // The gate stops only what comes at it from the playfield side, so balls leave the lane but don't go back down it.
  const g = TABLE.gate, gx = g.x2 - g.x1, gy = g.y2 - g.y1, gl = Math.hypot(gx, gy), nx = -gy / gl, ny = gx / gl;
  if ((b.x - g.x1) * nx + (b.y - g.y1) * ny > 0 && b.vx * nx + b.vy * ny < 0) { nearest(b.x, b.y, g.x1, g.y1, g.x2, g.y2); touch(b, P.x, P.y, R + 0.002, 0.3); }
  const py = plungerY(t);
  if (b.x > LANE.wall && b.y > py) { const y = py; nearest(b.x, b.y, LANE.wall, y, LANE.out, y); touch(b, P.x, P.y, R + 0.004, 0.15); }
  for (const f of t.flippers) {
    const c = Math.cos(f.a), s = Math.sin(f.a), k = nearest(b.x, b.y, f.x, f.y, f.x + c * FLIP.len, f.y + s * FLIP.len), r = FLIP.base + (FLIP.tip - FLIP.base) * k;
    const dx = b.x - P.x, dy = b.y - P.y, d = Math.hypot(dx, dy);
    // Where it meets the flipper's edge moves at ω × its distance from the pivot.
    if (d < R + r && d > 1e-9) { const ex = P.x + dx / d * r - f.x, ey = P.y + dy / d * r - f.y; touch(b, P.x, P.y, R + r, FLIP.e, -f.w * ey, f.w * ex); }
  }
  // Rolling over a top lane lights it (the flashing one first thing after a launch is the skill shot); all three lit go up
  // a multiplier.
  TABLE.lanes.forEach((l, i) => {
    if (Math.abs(b.x - l.x) > 0.02 || Math.abs(b.y - l.y) > 0.02 || t.time < t.cool[i]) return;
    t.cool[i] = t.time + 0.4; ev.push({ kind: 'lane', i, x: l.x, y: l.y });
    if (t.time < t.skillUntil && i === t.skillLane) { award(t, 10000); say(t, 'SKILL SHOT'); ev.push({ kind: 'skill' }); }
    t.skillUntil = 0;
    award(t, t.lit[i] ? 100 : 500); t.lit[i] = true;
    if (t.lit.every(Boolean)) { t.lit = [false, false, false]; if (t.mult < 5) { t.mult++; say(t, `${t.mult}X`); ev.push({ kind: 'mult' }); } }
  });
  const S = TABLE.saucer;
  if (Math.hypot(b.x - S.x, b.y - S.y) < 0.016 && Math.hypot(b.vx, b.vy) < 1.2 && !(t.time < b.free)) {
    Object.assign(b, { x: S.x, y: S.y, vx: 0, vy: 0, held: t.time + 1.3 });
    award(t, t.multiball ? 25000 : 2500); say(t, t.multiball ? 'JACKPOT' : 'JUICED'); ev.push({ kind: t.multiball ? 'jackpot' : 'juicer', x: S.x, y: S.y });
  }
  if (b.y < 0.02 && b.x < LANE.wall || !(Math.abs(b.x) < 0.4 && b.y > -0.2 && b.y < 1.2)) b.gone = true; // down the drain (or, somehow, off the table)
}

// In the secret room's frame: the cabinet's back to the front wall, facing into the room. The playfield tilts up TILT
// (radians) away from you, its bottom HEIGHT above the floor and FRONT out from the wall.
const CAB = { x: 3.95, z: SECRET.front - 0.02 }, TILT = 0.115, HEIGHT = 0.86, FRONT = 1.1, FOV = 50, BEST = 'ai-control-pinball-best';
// What the playfield's art covers (table metres) and its pixels to a metre; the body's middle across.
const FIELD = { x0: LEFT - 0.02, x1: LANE.out + 0.02, y0: -0.12, y1: ARC.y + ARC.r + 0.02 }, PPM = 1500, MIDDLE = (FIELD.x0 + FIELD.x1) / 2;
const BUMPERS = ['orange', 'lime', 'cherry'], JUICE = ['#ff9a1f', '#9be25a', '#ff2d55'];
const TARGETS = [['strawberry', '#ff2d55'], ['banana', '#ffe14f'], ['grape', '#a35bff']];
// The lamps on the playfield and what lights each.
const LAMPS = [
  ...TABLE.lanes.map((l, i) => ({ x: l.x, y: 0.945, r: 0.011, color: '#ffe14f', kind: 'lane', i })),
  ...TABLE.targets.map((g, i) => ({ x: -0.192, y: g.y, r: 0.008, color: TARGETS[i][1], kind: 'target', i })),
  { x: -0.15, y: 0.545, r: 0.012, color: '#ff4fd8', kind: 'multiball' },
  ...[2, 3, 4, 5].map((k, i) => ({ x: -0.054 + i * 0.036, y: 0.37, r: 0.011, color: '#38f2ff', kind: 'mult', i: k })),
  { x: 0, y: 0.08, r: 0.01, color: '#ff8a3d', kind: 'save' },
  { x: TABLE.saucer.x, y: TABLE.saucer.y, r: 0.03, color: '#7dff6b', kind: 'juicer' },
  ...[0, 1, 2].map(i => ({ x: 0.085 + i * 0.022, y: 0.43 + i * 0.045, r: 0.008, color: '#7dff6b', kind: 'chase', i })),
  ...[0, 1, 2].map(i => ({ x: -0.085 - i * 0.02, y: 0.425 + i * 0.03, r: 0.008, color: '#ff4fd8', kind: 'chase', i })),
];
const jitter = (i, salt) => { const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); };
const fmt = n => n.toLocaleString('en-US');

// Geometry on the table, in its frame: playfield point (x, y) is (x, height, -y).
const along = (x1, y1, x2, y2, thick, high, lift = 0) => new THREE.BoxGeometry(Math.hypot(x2 - x1, y2 - y1), high, thick).rotateY(Math.atan2(y2 - y1, x2 - x1)).translate((x1 + x2) / 2, lift + high / 2, -(y1 + y2) / 2);
const cyl = (r, high, x, y, lift = 0, n = 16) => new THREE.CylinderGeometry(r, r, high, n).translate(x, lift + high / 2, -y);
const box = (w, high, d, x, y, lift = 0) => new THREE.BoxGeometry(w, high, d).translate(x, lift + high / 2, -y);
// A flat shape (playfield points) stood up `high` from `lift`.
const slab = (points, high, lift = 0) => new THREE.ExtrudeGeometry(points instanceof THREE.Shape ? points : new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), { depth: high, bevelEnabled: false, curveSegments: 10 }).rotateX(-Math.PI / 2).translate(0, lift, 0);
const ball = (r, x, h, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(x, h, z);

// Matcaps: how a sphere looks lit, so the table shines whatever the room's lights do. Glossy plastic, and chrome with the
// room's neon in it.
let looks;
const matcaps = () => looks ??= {
  plastic: canvasTexture(128, 128, (g, w) => {
    const grad = g.createRadialGradient(w * 0.4, w * 0.34, 0, w / 2, w / 2, w / 2);
    for (const [at, c] of [[0, '#ffffff'], [0.12, '#f4f4f4'], [0.5, '#b4b4b4'], [0.85, '#585858'], [1, '#242424']]) grad.addColorStop(at, c);
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
  }),
  chrome: canvasTexture(128, 128, (g, w) => {
    const sky = g.createLinearGradient(0, 0, 0, w);
    for (const [at, c] of [[0, '#ffffff'], [0.32, '#bfe6ff'], [0.47, '#5b6078'], [0.5, '#15131f'], [0.62, '#7a2f8f'], [0.8, '#ff6be0'], [1, '#ffe8a0']]) sky.addColorStop(at, c);
    g.fillStyle = sky; g.fillRect(0, 0, w, w);
    const spot = g.createRadialGradient(w * 0.36, w * 0.3, 0, w * 0.36, w * 0.3, w * 0.16); spot.addColorStop(0, '#ffffff'); spot.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = spot; g.fillRect(0, 0, w, w);
    const rim = g.createRadialGradient(w / 2, w / 2, w * 0.36, w / 2, w / 2, w / 2); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.6)'); g.fillStyle = rim; g.fillRect(0, 0, w, w);
  }),
  spark: canvasTexture(64, 64, (g, w) => { const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.fillRect(0, 0, w, w); }),
};
const shiny = (options = {}) => new THREE.MeshMatcapMaterial({ matcap: matcaps().plastic, vertexColors: true, ...options });
const glowing = (map, color = '#ffffff', options = {}) => new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...options });

// Fruit drawn round (0, 0), about `r` from the middle to the edge.
const disc = (g, x, y, r, color) => { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const slice = (g, r, peel, pith, flesh) => {
  disc(g, 0, 0, r, peel); disc(g, 0, 0, r * 0.88, pith); g.fillStyle = flesh;
  for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r * 0.8, k * Math.PI / 4 + 0.07, (k + 1) * Math.PI / 4 - 0.07); g.closePath(); g.fill(); }
};
const DRAW = {
  orange: (g, r) => slice(g, r, '#ff7a00', '#fff1d6', '#ffa630'),
  lime: (g, r) => slice(g, r, '#3f9b2f', '#f0ffd8', '#9be25a'),
  lemon: (g, r) => slice(g, r, '#f2c200', '#fffbe0', '#ffe55c'),
  cherry: (g, r) => {
    g.strokeStyle = '#3d8b37'; g.lineWidth = r * 0.12; g.lineCap = 'round'; g.beginPath();
    g.moveTo(-r * 0.45, r * 0.2); g.quadraticCurveTo(-r * 0.2, -r * 0.6, r * 0.15, -r * 0.95); g.moveTo(r * 0.45, r * 0.3); g.quadraticCurveTo(r * 0.35, -r * 0.4, r * 0.15, -r * 0.95); g.stroke();
    for (const [x, y] of [[-0.45, 0.45], [0.45, 0.55]]) { disc(g, x * r, y * r, r * 0.42, '#e0213a'); disc(g, (x - 0.14) * r, (y - 0.14) * r, r * 0.1, '#ffd0d8'); }
  },
  strawberry: (g, r) => {
    g.fillStyle = '#ff2d55'; g.beginPath(); g.moveTo(0, r); g.bezierCurveTo(-r * 1.1, r * 0.2, -r * 0.9, -r * 0.75, 0, -r * 0.6); g.bezierCurveTo(r * 0.9, -r * 0.75, r * 1.1, r * 0.2, 0, r); g.fill();
    g.fillStyle = '#ffe14f'; for (let k = 0; k < 9; k++) g.fillRect((k % 3 - 1) * r * 0.38 - r * 0.04, (Math.floor(k / 3) - 0.6) * r * 0.42, r * 0.08, r * 0.12);
    g.fillStyle = '#3fae49'; for (let k = 0; k < 5; k++) { g.save(); g.translate(0, -r * 0.6); g.rotate(-1 + k * 0.5); g.beginPath(); g.ellipse(0, -r * 0.18, r * 0.1, r * 0.24, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  },
  banana: (g, r) => {
    g.lineCap = 'round'; g.lineWidth = r * 0.5; g.strokeStyle = '#ffe14f'; g.beginPath(); g.arc(0, -r * 0.9, r * 1.3, 0.28 * Math.PI, 0.72 * Math.PI); g.stroke();
    for (const a of [0.28, 0.72]) disc(g, Math.cos(a * Math.PI) * r * 1.3, -r * 0.9 + Math.sin(a * Math.PI) * r * 1.3, r * 0.14, '#6b4423');
  },
  grape: (g, r) => {
    for (const [x, y] of [[-0.5, -0.35], [0, -0.42], [0.5, -0.35], [-0.27, 0.08], [0.27, 0.08], [0, 0.5]]) { disc(g, x * r, y * r, r * 0.3, '#8e3bd1'); disc(g, (x - 0.1) * r, (y - 0.1) * r, r * 0.08, '#d9b3ff'); }
    g.fillStyle = '#3fae49'; g.beginPath(); g.ellipse(r * 0.3, -r * 0.85, r * 0.3, r * 0.14, -0.4, 0, Math.PI * 2); g.fill();
  },
  melon: (g, r) => {
    for (const [k, c] of [[1, '#2e9c5a'], [0.9, '#e9f7d8'], [0.8, '#ff3b5c']]) { g.fillStyle = c; g.beginPath(); g.arc(0, -r * 0.3, r * k, 0, Math.PI); g.fill(); }
    g.fillStyle = '#1b1a1f'; for (let k = 0; k < 5; k++) { const a = (k + 1) / 6 * Math.PI; g.beginPath(); g.ellipse(Math.cos(a) * r * 0.5, -r * 0.3 + Math.sin(a) * r * 0.5, r * 0.04, r * 0.08, a - Math.PI / 2, 0, Math.PI * 2); g.fill(); }
  },
};
const fruit = (g, kind, x, y, r, turn = 0, alpha = 1) => { g.save(); g.globalAlpha = alpha; g.translate(x, y); g.rotate(turn); DRAW[kind](g, r); g.restore(); };
const FONT = "'Comic Neue', 'Comic Sans MS', cursive";
const neonText = (g, text, x, y, size, fill, edge, glow) => {
  g.font = `bold ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.shadowColor = glow; g.shadowBlur = size * 0.35; g.lineWidth = size * 0.16; g.strokeStyle = edge; g.strokeText(text, x, y);
  g.shadowBlur = 0; g.fillStyle = fill; g.fillText(text, x, y);
};

// The playfield's art, drawn once: glows where the action is, a sunburst behind the logo, a scatter of little fruit, and
// the labels by the lamps.
function drawField(g, w, h) {
  const X = x => (x - FIELD.x0) * PPM, Y = y => (FIELD.y1 - y) * PPM, S = m => m * PPM;
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2a0b4d'); bg.addColorStop(0.55, '#45105c'); bg.addColorStop(1, '#14052a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const glow = (x, y, r, color) => { const grad = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), S(r)); grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grad; g.fillRect(0, 0, w, h); };
  glow(-0.015, 0.73, 0.26, 'rgba(255,79,216,0.45)'); glow(0, 0.18, 0.26, 'rgba(56,242,255,0.28)'); glow(0.165, 0.6, 0.1, 'rgba(125,255,107,0.35)'); glow(-0.2, 0.545, 0.1, 'rgba(255,225,79,0.25)');
  g.save(); g.translate(X(0), Y(0.47));
  for (let k = 0; k < 28; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,79,216,0.06)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, S(1), k * Math.PI / 14, (k + 1) * Math.PI / 14); g.fill(); }
  g.restore();
  const kinds = ['orange', 'lime', 'lemon', 'cherry', 'strawberry', 'grape', 'banana', 'melon'];
  for (let i = 0; i < 48; i++) fruit(g, kinds[i % kinds.length], jitter(i, 1) * w, jitter(i, 2) * h, S(0.01 + jitter(i, 4) * 0.01), jitter(i, 3) * 6.3, 0.2);
  // The logo: a big orange slice with TUTTI FRUTTI across it.
  fruit(g, 'orange', X(0), Y(0.47), S(0.085), 0.2, 0.85);
  neonText(g, 'TUTTI', X(0), Y(0.5), S(0.05), '#ffe14f', '#c2187f', '#ff4fd8');
  neonText(g, 'FRUTTI', X(0), Y(0.445), S(0.05), '#7ff6ff', '#1d3fae', '#38f2ff');
  // Where the bumpers stand, their fruit's colour; under the slingshots, a pink splash.
  TABLE.bumpers.forEach((p, i) => { disc(g, X(p.x), Y(p.y), S(0.045), JUICE[i] + '55'); disc(g, X(p.x), Y(p.y), S(0.036), '#120420'); });
  for (const [a, , c] of TABLE.slings) glow((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0.07, 'rgba(255,59,92,0.35)');
  // The lane: dark, with chevrons up it.
  g.fillStyle = '#0c0418'; g.fillRect(X(LANE.wall), Y(LANE.top), S(LANE.out - LANE.wall), h);
  g.fillStyle = '#ffe14f';
  for (let y = 0.1; y < 0.7; y += 0.08) { g.globalAlpha = 0.3 + 0.7 * y; g.beginPath(); g.moveTo(X(LANE.x - 0.012), Y(y)); g.lineTo(X(LANE.x), Y(y + 0.015)); g.lineTo(X(LANE.x + 0.012), Y(y)); g.lineTo(X(LANE.x), Y(y + 0.007)); g.fill(); }
  g.globalAlpha = 1;
  // Lamp rings, labels and the fruit each lane and target stands for.
  for (const l of LAMPS) { g.strokeStyle = l.color; g.lineWidth = S(0.0025); g.beginPath(); g.arc(X(l.x), Y(l.y), S(l.r + 0.002), 0, Math.PI * 2); g.stroke(); }
  TABLE.lanes.forEach((l, i) => fruit(g, ['cherry', 'lemon', 'orange'][i], X(l.x), Y(l.y), S(0.014)));
  TABLE.targets.forEach((t, i) => fruit(g, TARGETS[i][0], X(-0.17), Y(t.y), S(0.011)));
  g.save(); g.translate(X(-0.128), Y(0.6)); g.rotate(-Math.PI / 2 + 0.25); neonText(g, 'MULTIBALL', 0, 0, S(0.016), '#ffffff', '#c2187f', '#ff4fd8'); g.restore();
  neonText(g, 'JUICER', X(TABLE.saucer.x), Y(TABLE.saucer.y - 0.045), S(0.016), '#ffffff', '#1f7a2a', '#7dff6b');
  [2, 3, 4, 5].forEach((k, i) => neonText(g, `${k}×`, X(-0.054 + i * 0.036), Y(0.345), S(0.012), '#ffffff', '#1d3fae', '#38f2ff'));
  neonText(g, 'SAVE', X(0), Y(0.105), S(0.011), '#ffffff', '#b34700', '#ff8a3d');
}
// The backglass: the name in neon over a sunburst, fruit all round.
function drawGlass(g, w, h) {
  const bg = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, w * 0.7); bg.addColorStop(0, '#ff4fd8'); bg.addColorStop(0.45, '#6a1fb8'); bg.addColorStop(1, '#1c0638'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.save(); g.translate(w / 2, h * 0.55); for (let k = 0; k < 24; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(255,225,79,0.08)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w, k * Math.PI / 12, (k + 1) * Math.PI / 12); g.fill(); } g.restore();
  for (const [kind, x, y, r, turn] of [['orange', 0.1, 0.18, 0.09, 0.3], ['lime', 0.9, 0.2, 0.08, -0.4], ['cherry', 0.12, 0.8, 0.09, -0.2], ['strawberry', 0.88, 0.8, 0.09, 0.3], ['banana', 0.5, 0.9, 0.08, 0], ['grape', 0.27, 0.92, 0.07, 0.2], ['melon', 0.73, 0.95, 0.08, 0], ['lemon', 0.5, 0.1, 0.06, 0.5]]) fruit(g, kind, x * w, y * h, r * w, turn);
  neonText(g, 'TUTTI', w / 2, h * 0.36, h * 0.24, '#ffe14f', '#c2187f', '#ff4fd8');
  neonText(g, 'FRUTTI', w / 2, h * 0.6, h * 0.24, '#7ff6ff', '#1d3fae', '#38f2ff');
}
// The dot-matrix display: text drawn small, then each pixel a dot, orange, or a rainbow for news.
let dotCanvas;
function drawDots(g, w, h, s) {
  dotCanvas ??= Object.assign(document.createElement('canvas'), { width: 128, height: 32 });
  const d = dotCanvas.getContext('2d', { willReadFrequently: true }); d.clearRect(0, 0, 128, 32);
  const line = (text, size, y) => { d.font = `${size}px VT323, monospace`; d.font = `${Math.min(size, Math.floor(size * 124 / d.measureText(text).width))}px VT323, monospace`; d.fillText(text, 64, y); };
  if (s) { d.fillStyle = '#fff'; d.textAlign = 'center'; d.textBaseline = 'middle'; if (s.top) { line(s.top, 13, 6.5); line(s.big, 21, 21.5); } else line(s.big, 30, 17); }
  const px = d.getImageData(0, 0, 128, 32).data, cw = w / 128, ch = h / 32, lit = new Path2D(), dark = new Path2D();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) (px[(y * 128 + x) * 4 + 3] > 100 ? lit : dark).rect(x * cw + 0.6, y * ch + 0.6, cw - 1.2, ch - 1.2);
  g.fillStyle = '#0d0503'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1407'; g.fill(dark);
  if (s?.rainbow) { const grad = g.createLinearGradient(0, 0, w, 0); for (let k = 0; k <= 6; k++) grad.addColorStop(k / 6, `hsl(${(k * 60 + s.phase * 36) % 360} 100% 62%)`); g.fillStyle = grad; } else g.fillStyle = '#ff9b2e';
  g.fill(lit);
}

// `canvas`: the scene's, for presses; `camera`, whose aspect sets the view; `onPlay(pinball)`: the cabinet was clicked.
export function createPinball({ canvas, camera, onPlay }) {
  let best = 0; try { best = Number(localStorage.getItem(BEST)) || 0; } catch {}
  const t = newTable(best), keys = { left: false, right: false, plunge: false }, pointers = new Map();
  let room = null, table, active = false, still = false, time = 0, acc = 0, shake = 0, party = 0, flash = 0, dmdAt = 0, dmdKey = '';
  let flippers, plunger, targets, caps, rings, bands, balls, shadows, dots, halos, trail, juice, overlay, dmd, neon, floorGlow;
  const fit = { aspect: 0, from: new THREE.Vector3(), look: new THREE.Vector3() }, probe = new THREE.PerspectiveCamera(), wobble = new THREE.Vector3(), tint = new THREE.Color();
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', KeyZ: 'left', ShiftLeft: 'left', ArrowRight: 'right', KeyD: 'right', KeyM: 'right', Slash: 'right', ShiftRight: 'right', Space: 'plunge', ArrowDown: 'plunge', KeyS: 'plunge' };
  const release = () => { keys.left = keys.right = keys.plunge = false; pointers.clear(); }, coarse = globalThis.matchMedia?.('(pointer: coarse)');

  const pinball = {
    // Where the cabinet stands, so nobody walks through it (secret.js), in the room's frame.
    blocks: [new THREE.Box3(new THREE.Vector3(CAB.x - 0.33, 0, CAB.z - 1.27), new THREE.Vector3(CAB.x + 0.33, 1.8, CAB.z + 0.02))],
    enter() { active = true; },
    leave() { active = false; release(); },
    blur: release, // the window lost focus: no key-ups are coming
    stand() { const p = room.localToWorld(new THREE.Vector3(CAB.x, 0, CAB.z - 1.7)); return { x: p.x, z: p.z, yaw: 0 }; },
    pose() {
      if (fit.aspect !== camera.aspect) frame(camera.aspect);
      return { from: fit.from.clone().add(wobble), look: fit.look.clone().add(wobble), fov: FOV, hands: false };
    },
    click() { return false; }, // presses work the flippers (below)
    // A key while playing: true if it's one of the table's (office.js then leaves it be).
    key(code, down) { const k = KEYS[code]; if (!k || !active) return false; keys[k] = down; return true; },
    build(group) {
      room = group; fit.aspect = 0;
      const cab = new THREE.Group(); cab.position.set(CAB.x, 0, CAB.z); cab.rotation.y = Math.PI; cab.userData.toggle = () => onPlay(pinball); group.add(cab);
      const deck = new THREE.Group(); deck.position.set(0, HEIGHT, FRONT); deck.rotation.x = TILT; cab.add(deck);
      table = new THREE.Group(); table.position.x = -MIDDLE; deck.add(table);
      buildBody(cab, deck); buildTable(); buildBackbox(cab);
      document.fonts?.load(`bold 40px 'Comic Neue'`).then(() => document.fonts.load('20px VT323')).then(() => { for (const m of [table.userData.field, cab.userData.glass]) m.redraw(); dmdKey = ''; }).catch(() => {});
    },
    update(dt, at, reduced, shown) {
      time += dt; still = reduced;
      if (!room || !shown) return;
      if (active) {
        const sides = [...pointers.values()];
        t.input.left = keys.left || sides.includes('left'); t.input.right = keys.right || sides.includes('right');
        t.input.plunge = keys.plunge || (pointers.size > 0 && waiting(t));
        for (acc += dt; acc >= DT; acc -= DT) step(t);
      }
      react(dt); draw(dt);
    },
  };

  // The cabinet: a purple body with chrome rails and legs, a coin door and the plunger's knob out front.
  function buildBody(cab, deck) {
    const x0 = FIELD.x0 - 0.03, x1 = FIELD.x1 + 0.03, y0 = FIELD.y0 - 0.025, y1 = FIELD.y1 + 0.03, wide = x1 - x0, long = y1 - y0, mid = (y0 + y1) / 2, body = '#3a1670', chrome = '#d4d8e2';
    const parts = [[box(wide, 0.25, long, MIDDLE, mid, -0.254), body], [box(wide, 0.064, 0.025, MIDDLE, y0 + 0.0125, -0.004), body], [box(wide, 0.064, 0.03, MIDDLE, y1 - 0.015, -0.004), body],
      [box(wide + 0.012, 0.022, 0.05, MIDDLE, y0 + 0.02, 0.06), chrome], [box(0.24, 0.15, 0.012, MIDDLE, y0 - 0.006, -0.21), '#1b1a1f'], [box(0.2, 0.012, 0.014, MIDDLE, y0 - 0.007, -0.08), chrome]];
    for (const [x, s] of [[x0 + 0.015, -1], [x1 - 0.015, 1]]) {
      parts.push([box(0.03, 0.064, long, x, mid, -0.004), body], [box(0.036, 0.012, long, x, mid, 0.06), chrome]);
      parts.push([box(0.004, 0.02, long - 0.12, x + s * 0.0165, mid, -0.06), '#ffe14f'], [box(0.004, 0.02, long - 0.12, x + s * 0.0165, mid, -0.1), '#ff4fd8'], [box(0.004, 0.02, long - 0.12, x + s * 0.0165, mid, -0.14), '#38f2ff']);
    }
    table.add(mesh(paint(parts), painted(), 0.006));
    // Coin slots, lit.
    table.add(new THREE.Mesh(paint([-0.05, 0.05].map(x => [box(0.012, 0.03, 0.004, MIDDLE + x, y0 - 0.013, -0.2), '#ff3b30'])), new THREE.MeshBasicMaterial({ vertexColors: true })));
    // Legs stand straight down from the body's corners.
    deck.updateMatrix(); table.updateMatrix();
    const legs = [];
    for (const x of [x0 + 0.03, x1 - 0.03]) for (const y of [y0 + 0.05, y1 - 0.06]) {
      const p = new THREE.Vector3(x, -0.25, -y).applyMatrix4(table.matrix).applyMatrix4(deck.matrix);
      legs.push([new THREE.CylinderGeometry(0.02, 0.018, p.y, 10).translate(p.x, p.y / 2, p.z), '#c9ced8'], [new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12).translate(p.x, 0.01, p.z), '#1b1a1f']);
    }
    cab.add(mesh(paint(legs), painted(), 0.006));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.1).rotateX(-Math.PI / 2), glowing(glowTexture(), '#ff4fd8')); glow.position.set(0, 0.012, 0.7); glow.raycast = () => {}; cab.add(glow); floorGlow = glow;
  }

  // The playfield and everything on it.
  function buildTable() {
    const field = canvasTexture(Math.ceil((FIELD.x1 - FIELD.x0) * PPM), Math.ceil((FIELD.y1 - FIELD.y0) * PPM), drawField); table.userData.field = field;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0).rotateX(-Math.PI / 2).translate(MIDDLE, 0, -(FIELD.y0 + FIELD.y1) / 2), new THREE.MeshBasicMaterial({ map: field }));
    table.add(plane);
    // What doesn't move, in one: rails, guides and rubber posts, the bumpers' bases, the watermelons, the juicer, the apron.
    const parts = [];
    for (const w of TABLE.walls) if (w.sling === undefined) {
      const rail = w.h >= 0.004;
      parts.push([along(w.x1, w.y1, w.x2, w.y2, w.h * 2, rail ? 0.035 : 0.022), rail ? '#c9ced8' : w.h < 0.003 ? '#2a1450' : Math.max(w.y1, w.y2) > 0.8 ? '#ff4fd8' : '#38f2ff']);
    }
    const g = TABLE.gate; parts.push([along(g.x1, g.y1, g.x2, g.y2, 0.003, 0.012, 0.018), '#ffe14f']);
    for (const p of TABLE.posts) parts.push([cyl(p.r + 0.0015, 0.026, p.x, p.y), '#f4f2ec'], [cyl(p.r * 0.7, 0.004, p.x, p.y, 0.026), '#ffe14f']);
    TABLE.bumpers.forEach((p, i) => parts.push([cyl(p.r, 0.016, p.x, p.y, 0, 24), '#1b1a1f'], [cyl(p.r + 0.003, 0.004, p.x, p.y, 0.002, 24), '#f4f2ec'], [cyl(p.r - 0.002, 0.006, p.x, p.y, 0.012, 24), JUICE[i]]));
    for (const [a, b, c] of TABLE.slings) {
      const toward = (p, k) => [p[0] + (b[0] - p[0]) * k, p[1] + (b[1] - p[1]) * k];
      parts.push([slab([a, b, c], 0.028), '#2e9c5a'], [slab([toward(a, 0.12), b, toward(c, 0.12)], 0.001, 0.028), '#e9f7d8'], [slab([toward(a, 0.22), b, toward(c, 0.22)], 0.0015, 0.0285), '#ff3b5c']);
      for (const k of [0.35, 0.5, 0.65]) { const p = toward([a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k], 0.45); parts.push([ball(0.003, p[0], 0.03, -p[1], 1, 0.4, 1.6), '#1b1a1f']); }
    }
    const S = TABLE.saucer; parts.push([cyl(0.019, 0.0015, S.x, S.y, 0.001, 24), '#050308'], [new THREE.TorusGeometry(0.02, 0.0025, 6, 24).rotateX(Math.PI / 2).translate(S.x, 0.003, -S.y), '#c9ced8']);
    parts.push([slab([[LEFT - 0.004, FIELD.y0], [LANE.wall + 0.004, FIELD.y0], [LANE.wall + 0.004, 0.035], [LEFT - 0.004, 0.035]], 0.03), '#2b1650']);
    table.add(new THREE.Mesh(paint(parts), shiny()));
    // The bumpers' fruit (each its own material, to flash) and the rings that burst off them.
    const fruitParts = {
      orange: [[ball(0.026, 0, 0.034, 0, 1, 0.82, 1), '#ff8c1a'], [ball(0.008, 0.006, 0.055, 0, 1.6, 0.35, 0.8), '#3fae49'], [cyl(0.002, 0.006, 0, 0, 0.052), '#6b4423']],
      lime: [[ball(0.025, 0, 0.033, 0, 1.15, 0.8, 0.9), '#8fd14f'], [ball(0.006, 0.028, 0.033, 0), '#6fb13a'], [ball(0.006, -0.028, 0.033, 0), '#6fb13a']],
      cherry: [[ball(0.016, -0.012, 0.03, 0.004), '#e0213a'], [ball(0.016, 0.013, 0.029, -0.004), '#e0213a'],
        [new THREE.CylinderGeometry(0.0015, 0.0015, 0.04).rotateZ(-0.45).translate(-0.004, 0.062, 0), '#3d8b37'], [new THREE.CylinderGeometry(0.0015, 0.0015, 0.04).rotateZ(0.35).translate(0.009, 0.062, 0), '#3d8b37'], [ball(0.007, 0.006, 0.083, 0, 1.6, 0.3, 0.8), '#3fae49']],
    };
    caps = TABLE.bumpers.map((p, i) => { const m = new THREE.Mesh(paint(fruitParts[BUMPERS[i]]), shiny()); m.position.set(p.x, 0, -p.y); m.userData.flash = 0; table.add(m); return m; });
    rings = TABLE.bumpers.map(p => { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), glowing(null, '#ffffff', { side: THREE.DoubleSide })); m.position.set(p.x, 0.004, -p.y); m.visible = false; m.userData.age = 1; m.raycast = () => {}; table.add(m); return m; });
    // The slingshots' rubber, which jumps as it kicks.
    bands = TABLE.slings.map(([a, b, c]) => {
      const m = new THREE.Mesh(along(...a, ...c, 0.004, 0.012, 0.008), shiny({ vertexColors: false, color: '#f4f2ec' })), mx = (a[0] + c[0]) / 2 - b[0], my = (a[1] + c[1]) / 2 - b[1], l = Math.hypot(mx, my);
      m.userData.out = new THREE.Vector3(mx / l, 0, -my / l); m.userData.kick = 0; table.add(m); return m;
    });
    // The flippers are bananas.
    const shape = new THREE.Shape(); shape.absarc(0, 0, FLIP.base, Math.PI / 2, Math.PI * 1.5, false); shape.lineTo(FLIP.len, -FLIP.tip); shape.absarc(FLIP.len, 0, FLIP.tip, -Math.PI / 2, Math.PI / 2, false); shape.lineTo(0, FLIP.base);
    const flipper = paint([[slab(shape, 0.02), '#ffe14f'], [cyl(FLIP.tip * 0.9, 0.022, FLIP.len, 0), '#6b4423'], [cyl(0.005, 0.024, 0, 0), '#c9ced8']]);
    flippers = TABLE.flippers.map(f => { const m = new THREE.Mesh(flipper, shiny()); m.position.set(f.x, 0, -f.y); table.add(m); return m; });
    targets = TABLE.targets.map((g, i) => { const m = new THREE.Mesh(paint([[box(0.008, 0.03, g.h * 2 - 0.002, g.x, g.y), TARGETS[i][1]], [box(0.0085, 0.005, g.h * 2 - 0.001, g.x, g.y, 0.022), '#ffffff']]), shiny()); table.add(m); return m; });
    // The plunger: a rod up the lane with a red tip, and its knob out the front, moving together.
    plunger = new THREE.Mesh(paint([[new THREE.CylinderGeometry(0.0045, 0.0045, 0.1).rotateX(Math.PI / 2).translate(LANE.x, 0.012, 0.055), '#c9ced8'], [new THREE.CylinderGeometry(0.011, 0.011, 0.01).rotateX(Math.PI / 2).translate(LANE.x, 0.012, 0.001), '#e0213a'],
      [new THREE.CylinderGeometry(0.006, 0.006, 0.07).rotateX(Math.PI / 2).translate(LANE.x, -0.05, -FIELD.y0 + 0.06), '#c9ced8'], [ball(0.016, LANE.x, -0.05, -FIELD.y0 + 0.1), '#e0213a']]), shiny());
    table.add(plunger);
    balls = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), new THREE.MeshMatcapMaterial({ matcap: matcaps().chrome })); m.visible = false; table.add(m); return m; });
    shadows = balls.map(() => { const m = new THREE.Mesh(new THREE.CircleGeometry(R * 1.1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false })); m.raycast = () => {}; table.add(m); return m; });
    // The lamps, and a glow round each, as two instanced meshes; their colours change each frame.
    dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(), LAMPS.length);
    halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowing(matcaps().spark), LAMPS.length); halos.raycast = () => {};
    const place = new THREE.Matrix4();
    LAMPS.forEach((l, i) => {
      l.c = new THREE.Color(l.color);
      dots.setMatrixAt(i, place.makeScale(l.r, 1, l.r).setPosition(l.x, 0.0007, -l.y)); halos.setMatrixAt(i, place.makeScale(l.r * 5, 1, l.r * 5).setPosition(l.x, 0.0012, -l.y));
      dots.setColorAt(i, l.c); halos.setColorAt(i, l.c);
    });
    table.add(dots, halos);
    // Sparks: the balls' trails and the juice that splashes off what they hit.
    const points = (n, size) => { const p = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3)), new THREE.PointsMaterial({ size, map: matcaps().spark, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); p.frustumCulled = false; p.raycast = () => {}; table.add(p); return p; };
    trail = points(3 * 12, 0.03); trail.userData.past = [[], [], []];
    juice = points(120, 0.02); juice.userData = { v: new Float32Array(360), life: new Float32Array(120), hue: new Float32Array(360), next: 0 };
    // A wash of colour over the whole table for the big moments.
    overlay = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0).rotateX(-Math.PI / 2).translate(MIDDLE, 0.06, -(FIELD.y0 + FIELD.y1) / 2), glowing(null, '#ffffff', { opacity: 0 }));
    overlay.visible = false; overlay.raycast = () => {}; table.add(overlay);
    // The score, on the apron.
    dmd = canvasTexture(512, 128, drawDots);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dmd })); apron.position.set(0, 0.031, 0.045); table.add(apron);
  }

  // The backbox on the body's far end: the backglass, the display under it, a neon frame and a cherry pair on top.
  function buildBackbox(cab) {
    const base = 1.0, at = (x, y) => [x, base + y];
    cab.add(mesh(paint([[new THREE.BoxGeometry(0.64, 0.76, 0.22).translate(0, base + 0.38, 0.12), '#3a1670'], [new THREE.BoxGeometry(0.66, 0.03, 0.24).translate(0, base + 0.775, 0.12), '#d4d8e2'],
      ...[-0.25, 0.25].map(x => [new THREE.CylinderGeometry(0.035, 0.035, 0.006, 20).rotateX(Math.PI / 2).translate(x, base + 0.15, 0.232), '#1b1a1f']),
      [ball(0.055, -0.045, base + 0.86, 0.12), '#e0213a'], [ball(0.055, 0.05, base + 0.845, 0.13), '#e0213a'], [new THREE.CylinderGeometry(0.006, 0.006, 0.16).rotateZ(-0.4).translate(-0.015, base + 0.97, 0.12), '#3d8b37'],
      [new THREE.CylinderGeometry(0.006, 0.006, 0.16).rotateZ(0.3).translate(0.03, base + 0.96, 0.12), '#3d8b37'], [ball(0.03, 0.04, base + 1.04, 0.12, 1.8, 0.35, 0.9), '#3fae49']]), painted(), 0.006));
    const glass = canvasTexture(512, 384, drawGlass); cab.userData.glass = glass;
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), new THREE.MeshBasicMaterial({ map: glass })); front.position.set(...at(0, 0.48), 0.232); cab.add(front);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshBasicMaterial({ map: dmd })); screen.position.set(...at(0, 0.15), 0.233); cab.add(screen);
    neon = new THREE.Mesh(paint([[0, 0.7, 0.58, 0.012], [0, 0.26, 0.58, 0.012], [-0.29, 0.48, 0.012, 0.452], [0.29, 0.48, 0.012, 0.452]].map(([x, y, w, h]) => [new THREE.BoxGeometry(w, h, 0.012).translate(x, base + y, 0.236), '#ffffff'])), new THREE.MeshBasicMaterial({ vertexColors: true, color: '#ff4fd8' }));
    cab.add(neon);
  }

  // The view: from the table's front, steeper on a narrow screen, as close as fits the playfield and the backbox's display,
  // centred on what it shows. Worked out again only when the screen's shape changes.
  function frame(aspect) {
    fit.aspect = aspect; table.updateWorldMatrix(true, false);
    const world = (x, y, h = 0) => table.localToWorld(new THREE.Vector3(x, h, -y));
    const ends = [[FIELD.x0, FIELD.y0], [FIELD.x1, FIELD.y0], [FIELD.x0, FIELD.y1], [FIELD.x1, FIELD.y1]].map(([x, y]) => world(x, y));
    if (aspect > 1) ends.push(...[-0.2, 0.2].map(x => table.parent.parent.localToWorld(new THREE.Vector3(x, 1.2, 0.23))));
    const rise = THREE.MathUtils.lerp(0.8, 1.2, clamp(1.5 - aspect, 0, 1)), up = new THREE.Vector3(0, 1, 0).transformDirection(table.matrixWorld), ahead = new THREE.Vector3(0, 0, -1).transformDirection(table.matrixWorld);
    const back = ahead.multiplyScalar(-Math.cos(rise)).addScaledVector(up, Math.sin(rise)), look = world(MIDDLE, 0.47), ndc = new THREE.Vector3();
    probe.fov = FOV; probe.aspect = aspect; probe.updateProjectionMatrix();
    const put = d => { probe.position.copy(look).addScaledVector(back, d); probe.lookAt(look); probe.updateMatrixWorld(); };
    const box = () => { const b = new THREE.Box2(); for (const p of ends) { ndc.copy(p).project(probe); b.expandByPoint(new THREE.Vector2(ndc.x, ndc.y)); } return b; };
    let d = 1.5;
    for (let pass = 0; pass < 3; pass++) {
      let near = 0.3, far = 6;
      for (let k = 0; k < 20; k++) { d = (near + far) / 2; put(d); const b = box(); if (b.min.x > -0.94 && b.max.x < 0.94 && b.min.y > -0.9 && b.max.y < 0.88) far = d; else near = d; }
      d = far; put(d);
      const b = box(), half = d * Math.tan(THREE.MathUtils.degToRad(FOV / 2)), right = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 0), upward = new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld, 1);
      look.addScaledVector(right, (b.min.x + b.max.x) / 2 * half * aspect).addScaledVector(upward, (b.min.y + b.max.y) / 2 * half);
    }
    put(d); fit.from.copy(probe.position); fit.look.copy(look);
  }

  // What just happened on the table: flashes, juice, a shake, the best kept.
  function react(dt) {
    for (const e of t.events) {
      if (e.kind === 'over') { best = t.best; try { localStorage.setItem(BEST, String(best)); } catch {} }
      if (still) continue;
      if (e.kind === 'bump') { caps[e.i].userData.flash = 1; rings[e.i].userData.age = 0; splash(e.x, e.y, JUICE[e.i], 16); shake = Math.max(shake, 0.004); }
      else if (e.kind === 'sling') { bands[e.i].userData.kick = 1; splash(e.x, e.y, '#ff3b5c', 10); shake = Math.max(shake, 0.003); }
      else if (e.kind === 'target') { splash(e.x + 0.012, e.y, TARGETS[e.i][1], 14); shake = Math.max(shake, 0.003); }
      else if (e.kind === 'juicer' || e.kind === 'eject') splash(e.x, e.y, '#7dff6b', 24);
      else if (e.kind === 'lane') splash(e.x, e.y, '#ffe14f', 8);
      else if (['jackpot', 'multiball', 'skill', 'mult', 'saved', 'start'].includes(e.kind)) {
        overlay.material.color.set({ jackpot: '#ffe14f', multiball: '#ff4fd8', skill: '#38f2ff', mult: '#38f2ff', saved: '#ff8a3d', start: '#7dff6b' }[e.kind]);
        flash = e.kind === 'start' ? 0.25 : 0.55; party = time + (e.kind === 'jackpot' || e.kind === 'multiball' ? 1.6 : 0.8); shake = Math.max(shake, e.kind === 'start' ? 0 : 0.006);
        if (e.kind === 'jackpot') splash(TABLE.saucer.x, TABLE.saucer.y, '#ffe14f', 60);
      } else if (e.kind === 'drain' && !t.balls.length) { overlay.material.color.set('#ff2d55'); flash = 0.3; }
    }
    t.events.length = 0;
    shake *= Math.exp(-dt * 18); if (shake < 2e-4 || still) shake = 0;
    wobble.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake);
  }
  // `n` drops of juice off (x, y), in `color`.
  function splash(x, y, color, n) {
    const { v, life, hue } = juice.userData, pos = juice.geometry.attributes.position; tint.set(color);
    for (let k = 0; k < n; k++) {
      const i = juice.userData.next = (juice.userData.next + 1) % life.length, a = Math.random() * Math.PI * 2, s = 0.25 + Math.random() * 0.6;
      pos.setXYZ(i, x, 0.02, -y); v.set([Math.cos(a) * s, 0.3 + Math.random() * 0.6, Math.sin(a) * s], i * 3); life[i] = 0.35 + Math.random() * 0.35;
      hue.set([tint.r * (0.7 + Math.random() * 0.6), tint.g * (0.7 + Math.random() * 0.6), tint.b * (0.7 + Math.random() * 0.6)], i * 3);
    }
  }

  function draw(dt) {
    t.flippers.forEach((f, i) => { flippers[i].rotation.y = f.a; });
    plunger.position.z = 0.035 * t.pull;
    targets.forEach((m, i) => { m.position.y += ((t.targets[i] ? 0 : -0.035) - m.position.y) * (still ? 1 : Math.min(1, dt * 25)); });
    // The balls, and their trails as they go.
    const past = trail.userData.past, tp = trail.geometry.attributes.position, tc = trail.geometry.attributes.color;
    balls.forEach((m, i) => {
      const b = t.balls[i]; m.visible = shadows[i].visible = !!b;
      if (b) { m.position.set(b.x, R - (b.held ? 0.008 : 0), -b.y); shadows[i].position.set(b.x, 0.0015, -b.y + 0.004); }
      const line = past[i]; if (b && !still) { line.unshift([b.x, R, -b.y, Math.hypot(b.vx, b.vy)]); line.length = Math.min(line.length, 12); } else line.length = 0;
      for (let k = 0; k < 12; k++) {
        const p = line[k], j = i * 12 + k, glow = p ? (1 - k / 12) * Math.min(1, p[3] / 2.5) : 0;
        if (p) tp.setXYZ(j, p[0], p[1], p[2]); tc.setXYZ(j, glow, glow * 0.55, glow * 0.95);
      }
    });
    tp.needsUpdate = tc.needsUpdate = true;
    // Juice: thrown up off the table, falling back and fading.
    const { v, life, hue } = juice.userData, jp = juice.geometry.attributes.position, jc = juice.geometry.attributes.color;
    for (let i = 0; i < life.length; i++) {
      if (life[i] <= 0) { jc.setXYZ(i, 0, 0, 0); continue; }
      life[i] -= dt; v[i * 3 + 1] -= 3 * dt;
      jp.setXYZ(i, jp.getX(i) + v[i * 3] * dt, Math.max(0.001, jp.getY(i) + v[i * 3 + 1] * dt), jp.getZ(i) + v[i * 3 + 2] * dt);
      const k = Math.min(1, life[i] * 3); jc.setXYZ(i, hue[i * 3] * k, hue[i * 3 + 1] * k, hue[i * 3 + 2] * k);
    }
    jp.needsUpdate = jc.needsUpdate = true;
    caps.forEach(m => { m.material.color.setScalar(1 + 1.6 * m.userData.flash); m.userData.flash = Math.max(0, m.userData.flash - dt * 7); });
    rings.forEach(m => { const age = m.userData.age += dt; m.visible = age < 0.35; if (m.visible) { m.scale.setScalar(0.035 + age * 0.2); m.material.opacity = 1 - age / 0.35; } });
    bands.forEach(m => { m.position.copy(m.userData.out).multiplyScalar(0.005 * m.userData.kick); m.userData.kick = Math.max(0, m.userData.kick - dt * 14); });
    overlay.visible = flash > 0.01; overlay.material.opacity = flash; flash *= Math.exp(-dt * 5);
    lamps();
    const cycle = still ? 0.88 : (time * 0.08) % 1;
    neon.material.color.setHSL(cycle, 1, 0.6); floorGlow.material.color.setHSL((cycle + 0.5) % 1, 1, 0.55);
    // The display, at most ten times a second and only when what it shows changes.
    if (time - dmdAt > 0.1) {
      dmdAt = time; const s = screen(), key = JSON.stringify(s);
      if (key !== dmdKey) { dmdKey = key; dmd.redraw(s); }
    }
  }
  function lamps() {
    const blink = hz => still || (time * hz) % 1 < 0.5 ? 1 : 0, wild = !still && time < party, down = t.targets.filter(up => !up).length;
    LAMPS.forEach((l, n) => {
      let on;
      if (wild) on = (time * 12 + n) % 2 < 1 ? 1 : 0.1;
      else if (t.mode !== 'play') on = still ? 0.6 : 0.5 + 0.5 * Math.sin(time * 5 - n * 0.7);
      else if (l.kind === 'lane') on = t.lit[l.i] ? 1 : t.time < t.skillUntil && l.i === t.skillLane ? blink(5) : 0;
      else if (l.kind === 'target') on = t.targets[l.i] ? 0 : 1;
      else if (l.kind === 'multiball') on = t.multiball ? blink(4) : down === 2 ? blink(2) : 0;
      else if (l.kind === 'mult') on = t.mult >= l.i ? 1 : 0;
      else if (l.kind === 'save') on = t.time < t.saveUntil ? blink(2.5) : 0;
      else if (l.kind === 'juicer') on = t.balls.some(b => b.held) ? blink(10) : t.multiball ? blink(3) : 0.3;
      else on = still ? 0.4 : ((time * 3 - l.i) % 3 + 3) % 3 < 1 ? 1 : 0.12;
      dots.setColorAt(n, tint.copy(l.c).multiplyScalar(0.14 + 0.86 * on)); halos.setColorAt(n, tint.copy(l.c).multiplyScalar(2 * on));
    });
    dots.instanceColor.needsUpdate = halos.instanceColor.needsUpdate = true;
  }
  // What the display says: news first, then the game, else the attract loop.
  function screen() {
    const news = t.message && t.time - t.message.at < 1.8 ? t.message.text : '', phase = still ? 0 : Math.floor(time * 10);
    if (news) return { big: news, rainbow: true, phase };
    if (t.mode === 'play') {
      const top = !active ? 'PAUSED' : waiting(t) && !t.launched ? (coarse?.matches ? 'HOLD, LET GO' : 'HOLD SPACE, LET GO') : `BALL ${t.ball}${t.mult > 1 ? `  ${t.mult}X` : ''}`;
      return { top, big: fmt(t.score) };
    }
    return [{ top: 'TUTTI FRUTTI', big: active ? 'FLIP TO PLAY' : 'PINBALL' }, { top: 'HIGH SCORE', big: fmt(best) }, { top: t.last ? 'LAST GAME' : 'MULTIBALL', big: t.last ? fmt(t.last) : 'JACKPOT' }][Math.floor(time / 2.5) % 3];
  }

  // Presses: the left or right half of the screen works that flipper (and the plunger, while a ball waits).
  canvas.addEventListener('pointerdown', event => {
    if (!active || event.pointerType === 'mouse' && event.button !== 0) return;
    const r = canvas.getBoundingClientRect(); pointers.set(event.pointerId, event.clientX < r.left + r.width / 2 ? 'left' : 'right');
  });
  const lift = event => pointers.delete(event.pointerId);
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  return pinball;
}
