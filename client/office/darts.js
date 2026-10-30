// Darts in the secret room: a board on the back wall, a chalkboard beside it keeping score and a strip of tape for the oche.
// Click the board (or E on it) to step up to the tape: the view is the oche's, a dart in hand, board and chalkboard both in
// sight (on a narrow screen the chalkboard comes along in your other hand, up top). A ring on the board is where you aim,
// and it breathes: wide, then tight, then wide again. A dart lands anywhere inside it, so throw when it's tightest. A mouse
// moves it and a click (or E) throws; a finger drags it, as on a touchpad so the finger isn't in the way, and a tap throws.
// Esc, ✕ or a walking key steps back (office.js runs that). Much like the darts in Final Fantasy VII Remake.
// The game is 301 with any finish: from 301 down to exactly 0, three darts a turn; going under 0 is a bust and the turn
// counts for nothing. When one dart could finish, the beds that would glow. Your best is the fewest darts to check out,
// kept per browser.
// With reduced motion the ring holds still at a middling width and a dart lands at once.
import * as THREE from 'three';
import { mesh, once, canvasTexture, glowTexture, paint, painted } from './furniture.js';
import { DRAG_SLOP } from './player.js';
import { SECRET } from './secret.js';
import { toonMaterial } from './toon.js';

// Clockwise from the top, and the rings' outer radii in metres (a regulation board).
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const RINGS = { bull: 0.00635, outer: 0.0159, trebleIn: 0.099, trebleOut: 0.107, doubleIn: 0.162, doubleOut: 0.17, board: 0.225 };
// What a dart scores `x` right of and `y` above the bull, in metres.
export function score(x, y) {
  const r = Math.hypot(x, y);
  if (r <= RINGS.bull) return { points: 50, label: 'Bull' };
  if (r <= RINGS.outer) return { points: 25, label: '25' };
  if (r > RINGS.doubleOut) return { points: 0, label: 'Miss' };
  const n = ORDER[Math.floor(((Math.atan2(x, y) * 180 / Math.PI + 369) % 360) / 18)];
  if (r >= RINGS.trebleIn && r <= RINGS.trebleOut) return { points: 3 * n, label: `T${n}` };
  if (r >= RINGS.doubleIn) return { points: 2 * n, label: `D${n}` };
  return { points: n, label: `${n}` };
}
// 301: `left` to go, `from` what it was when the turn began, `turn` its darts so far. A dart after a finished turn starts the
// next; after a win, a new game.
export const newGame = () => ({ left: 301, from: 301, turn: [], darts: 0, over: false, bust: false, won: false });
export function play(game, hit) {
  const g = game.won ? newGame() : game.over ? { ...game, from: game.left, turn: [], over: false, bust: false } : { ...game };
  g.darts++; g.turn = [...g.turn, hit];
  const left = g.left - hit.points;
  if (left < 0) return { ...g, left: g.from, over: true, bust: true };
  if (left === 0) return { ...g, left: 0, over: true, won: true };
  return { ...g, left, over: g.turn.length === 3 };
}
// The beds where one dart scores exactly `left`, as score() labels them (none past 60, nor for what no bed scores).
export function finishes(left) {
  const beds = ORDER.flatMap(n => [[n, `${n}`], [2 * n, `D${n}`], [3 * n, `T${n}`]]).concat([[25, '25'], [50, 'Bull']]);
  return beds.filter(([points]) => points === left).map(([, label]) => label);
}

// In the secret room's frame. The board is a regulation one made SIZE times bigger, so it reads from the oche; the eye is
// AWAY from its face, and SPAN is how wide the view has to be there to take in the board and the chalkboard.
const BOARD = { x: 2.3, y: 1.73 }, SIZE = 1.3, FACE = -SECRET.back + 0.06, OCHE = FACE + 2.37, AWAY = 2.62, FOV = 38;
const SLATE = { x: BOARD.x + 0.95, y: 1.62 }, SPAN = SLATE.x + 0.48 - (BOARD.x - RINGS.board * SIZE - 0.05);
// The ring's radius on the wall (m) at its tightest and widest, and held still; seconds a breath takes; how far a finger's
// drag moves it, for how far the wall under the finger moves; how far off the board's middle it can be dragged.
const TIGHT = 0.006, WIDE = 0.075, STILL = 0.02, BREATH = 1.3, GAIN = 0.7, REACH = 0.42;
// How far down (css px) the chalkboard held up top starts: below office.css's row of buttons (12px down, 44px high, a shadow).
const BAR = 66;
const SPEED = 12, PULL = 1.6, BEST = 'ai-control-darts-best';
const FLIGHTS = ['#ff4fd8', '#38f2ff', '#ffe14f'];
export const CHALK = "'Comic Neue', 'Comic Sans MS', cursive";
const coarse = globalThis.matchMedia?.('(pointer: coarse)');

const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// A dart along +z with its tip at the origin: point, barrel, shaft and two crossed flights.
const dartParts = color => [
  [new THREE.ConeGeometry(0.0016, 0.022, 6).rotateX(-Math.PI / 2).translate(0, 0, 0.011), '#c9ced8'],
  [new THREE.CylinderGeometry(0.0038, 0.0034, 0.045, 10).rotateX(Math.PI / 2).translate(0, 0, 0.044), '#8a8f99'],
  [new THREE.CylinderGeometry(0.0018, 0.0018, 0.05, 6).rotateX(Math.PI / 2).translate(0, 0, 0.09), '#2f3542'],
  [B(0.03, 0.0012, 0.04, 0, 0, 0.12), color], [B(0.0012, 0.03, 0.04, 0, 0, 0.12), color],
];
const dart = i => mesh(once(`dart${i}`, () => paint(dartParts(FLIGHTS[i]))), painted(), 0.002);

// Paths on a board drawn round (c, c) at `k` pixels a metre: wedge `i` (clockwise from 20) between two radii, or a whole
// ring between them.
const wedge = (g, c, k, r0, r1, i) => {
  const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = a0 + Math.PI / 10;
  g.beginPath(); g.arc(c, c, r1 * k, a0, a1); g.arc(c, c, r0 * k, a1, a0, true); g.closePath();
};
const ringPath = (g, c, k, r0, r1) => { g.beginPath(); g.arc(c, c, r1 * k, 0, Math.PI * 2); if (r0) { g.moveTo(c + r0 * k, c); g.arc(c, c, r0 * k, 0, Math.PI * 2, true); } };
// The board: black and cream singles, red and green doubles and trebles, the numbers round the outside.
function drawBoard(g, size) {
  const c = size / 2, k = c / RINGS.board, fill = color => { g.fillStyle = color; g.fill(); };
  g.fillStyle = '#1b1a1f'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
  ORDER.forEach((n, i) => {
    const [single, ring] = i % 2 ? ['#f1e3c4', '#2e9c5a'] : ['#1b1a1f', '#d63a3a'];
    wedge(g, c, k, RINGS.outer, RINGS.doubleOut, i); fill(single); wedge(g, c, k, RINGS.trebleIn, RINGS.trebleOut, i); fill(ring); wedge(g, c, k, RINGS.doubleIn, RINGS.doubleOut, i); fill(ring);
    const a = (i * 18 - 90) * Math.PI / 180, r = (RINGS.doubleOut + RINGS.board) / 2 * k;
    g.fillStyle = '#f4f2ec'; g.font = `bold ${Math.round(size * 0.052)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, c + Math.cos(a) * r, c + Math.sin(a) * r);
  });
  ringPath(g, c, k, 0, RINGS.outer); fill('#2e9c5a'); ringPath(g, c, k, 0, RINGS.bull); fill('#d63a3a');
  // The wire.
  g.strokeStyle = '#c9ced8'; g.lineWidth = size / 700;
  for (const r of [RINGS.outer, RINGS.trebleIn, RINGS.trebleOut, RINGS.doubleIn, RINGS.doubleOut]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 20; i++) { const a = (i * 18 - 9 - 90) * Math.PI / 180; g.beginPath(); g.moveTo(c + Math.cos(a) * RINGS.outer * k, c + Math.sin(a) * RINGS.outer * k); g.lineTo(c + Math.cos(a) * RINGS.doubleOut * k, c + Math.sin(a) * RINGS.doubleOut * k); g.stroke(); }
}
// Over the board, the beds that would finish (as finishes() labels them) lit up.
function drawFinish(g, size, _, labels = []) {
  const c = size / 2, k = c / RINGS.board;
  g.clearRect(0, 0, size, size);
  const beds = labels.flatMap(label => {
    const i = ORDER.indexOf(Number(label.replace(/^[DT]/, ''))); // the 25 and the bull are rings, not wedges
    const radii = label === 'Bull' ? [[0, RINGS.bull]] : label === '25' ? [[RINGS.bull, RINGS.outer]] : label[0] === 'T' ? [[RINGS.trebleIn, RINGS.trebleOut]]
      : label[0] === 'D' ? [[RINGS.doubleIn, RINGS.doubleOut]] : [[RINGS.outer, RINGS.trebleIn], [RINGS.trebleOut, RINGS.doubleIn]];
    return radii.map(([r0, r1]) => () => i < 0 ? ringPath(g, c, k, r0, r1) : wedge(g, c, k, r0, r1, i));
  });
  // A gold halo first, then each bed filled and edged in white: a double's only a few pixels across on a phone.
  g.lineJoin = 'round'; g.shadowColor = '#ffe14f'; g.shadowBlur = size / 25; g.strokeStyle = '#ffe14f'; g.lineWidth = size / 45;
  for (const path of beds) { path(); g.stroke(); }
  g.shadowBlur = 0; g.fillStyle = '#ffe14f'; g.strokeStyle = '#ffffff'; g.lineWidth = size / 110;
  for (const path of beds) { path(); g.fill(); g.stroke(); }
}
// The chalkboard: what's left big, this turn's darts, a word on how it went, darts thrown and the best.
function drawScore(g, w, h, game, best, active) {
  g.fillStyle = '#24302b'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2ea'; g.textBaseline = 'alphabetic';
  g.font = `bold 40px ${CHALK}`; g.textAlign = 'left'; g.fillText('301', 26, 52);
  g.textAlign = 'right'; g.font = `bold 30px ${CHALK}`; g.fillText(best ? `best ${best} darts` : 'any finish', w - 24, 50);
  g.textAlign = 'center'; g.font = `bold 150px ${CHALK}`; g.fillText(game.left, w / 2, 205);
  g.font = `bold 44px ${CHALK}`;
  const darts = [0, 1, 2].map(i => game.turn[i]?.label ?? '·');
  darts.forEach((label, i) => { g.fillStyle = game.turn[i] ? FLIGHTS[i] : '#8c968f'; g.fillText(label, w * (0.2 + i * 0.2), 275); });
  g.fillStyle = '#f2f2ea'; g.textAlign = 'right'; g.fillText(game.bust ? '' : `= ${game.turn.reduce((sum, hit) => sum + hit.points, 0)}`, w - 24, 275);
  g.textAlign = 'center'; g.font = `bold 40px ${CHALK}`;
  const word = game.won ? [`Checkout! ${game.darts} darts`, '#ffe14f'] : game.bust ? ['Bust!', '#ff6b6b'] : game.darts ? [`${game.darts} darts thrown`, '#b8c2bb']
    : [!active ? 'Click the board to play' : coarse?.matches ? 'Drag to aim, tap to throw' : 'Throw when it’s tightest', '#b8c2bb'];
  g.fillStyle = word[1]; g.fillText(word[0], w / 2, 345);
}
// What a dart just scored, floating up off the board (golf.js calls its holes with it too).
export function drawCall(g, w, h, text, color) {
  g.clearRect(0, 0, w, h); if (!text) return;
  // As big as fits across, room left for the outline.
  g.font = `bold 84px ${CHALK}`; g.font = `bold ${Math.min(84, Math.floor(84 * (w - 30) / g.measureText(text).width))}px ${CHALK}`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#1b1a1f'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
}

// `hands`: the camera's hands (camera.js), where the next dart is held; `aim()`: where the mouse points, as a direction;
// `canvas`: the scene's, for a finger's drags; `onPlay(darts)`: the board was clicked.
export function createDarts({ hands, camera, aim, canvas, onPlay }) {
  let game = newGame(), best = null, room = null, active = false, flight = null, pullAt = 0, time = 0, still = false;
  let mouse = false, drag = null, breath = 0, wasReady = false, lit = '';
  try { best = Number(localStorage.getItem(BEST)) || null; } catch {}
  const held = dart(0); held.rotation.set(0.12, 0.08, 0); held.visible = false; hands.add(held);
  let stuck, ring, chalk, call, glow, hud;
  // Where you aim, on the board's face in the room's frame.
  const spot = new THREE.Vector2(BOARD.x, BOARD.y), local = new THREE.Vector3(), tight = new THREE.Color('#ffe14f');
  const onBoard = p => Math.hypot(p.x - BOARD.x, p.y - BOARD.y) <= RINGS.board * SIZE;
  const tan = () => Math.tan(camera.fov * Math.PI / 360), narrow = () => 2 * AWAY * Math.tan(FOV * Math.PI / 360) * camera.aspect < SPAN;
  // How wide the ring is now: it starts each dart wide and breathes in and out, lingering a moment when tight.
  const spread = () => still ? STILL : TIGHT + (WIDE - TIGHT) * ((1 + Math.cos(2 * Math.PI * (time - breath) / BREATH)) / 2) ** 2;
  // Where a line along `direction` from the camera meets the back wall, in the room's frame; null if it doesn't.
  const landing = direction => {
    const o = room.worldToLocal(local.copy(camera.position)), d = direction;
    if (d.z > -0.05) return null;
    const t = (FACE - o.z) / d.z, x = o.x + d.x * t, y = o.y + d.y * t;
    return x > 0.1 && x < SECRET.w - 0.1 && y > 0.1 && y < 2.9 ? new THREE.Vector2(x, y) : null;
  };
  const darts = {
    // Holding a dart: playing, nothing in the air, the last turn's darts pulled out.
    get ready() { return active && !flight && !(game.over && time < pullAt); },
    // Playing: office.js steps you up to the oche and back. A finger starts off aiming at the bull.
    enter() { active = true; if (!mouse) spot.set(BOARD.x, BOARD.y); chalk.redraw(); },
    leave() { active = false; drag = null; chalk.redraw(); },
    // Where you stand to play (on the floor, in world space) and which way you face; the view while playing: the board as
    // near the middle as leaves the chalkboard in sight, or on a narrow screen the board low, for the chalkboard up top.
    stand() { const p = room.localToWorld(new THREE.Vector3(BOARD.x, 0, OCHE + 0.35)); return { x: p.x, z: p.z, yaw: Math.PI }; },
    pose() {
      const look = new THREE.Vector3(BOARD.x, BOARD.y, FACE), half = AWAY * Math.tan(FOV * Math.PI / 360);
      if (narrow()) look.y += 0.22 * half; else look.x += Math.max(0, SLATE.x + 0.48 - BOARD.x - half * camera.aspect);
      return { from: room.localToWorld(new THREE.Vector3(BOARD.x, 1.6, FACE + AWAY)), look: room.localToWorld(look), fov: FOV, hands: true };
    },
    click() { return darts.throw(); },
    // The secret room's group: board, chalkboard and tape go in it (secret.js calls this when it builds the room).
    build(group) {
      room = group;
      // The board and its chalkboard: click either to play (outlined under the pointer).
      const set = new THREE.Group(); set.userData.toggle = () => onPlay(darts); group.add(set); group = set;
      const backing = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 40).rotateX(Math.PI / 2), toonMaterial('#2b2730'), 0.006);
      backing.position.set(BOARD.x, BOARD.y, -SECRET.back + 0.015); group.add(backing);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(BOARD.x, BOARD.y, -SECRET.back + 0.004); group.add(halo);
      const board = new THREE.Mesh(new THREE.CircleGeometry(RINGS.board * SIZE, 64), new THREE.MeshBasicMaterial({ map: canvasTexture(1024, 1024, drawBoard) }));
      board.position.set(BOARD.x, BOARD.y, FACE); group.add(board);
      // Where one dart would finish, lit over the face.
      glow = new THREE.Mesh(board.geometry, new THREE.MeshBasicMaterial({ map: canvasTexture(512, 512, drawFinish), transparent: true, depthWrite: false }));
      glow.position.set(BOARD.x, BOARD.y, FACE + 0.002); glow.renderOrder = 1; glow.visible = false; room.add(glow);
      // The board's body, behind its face (stopping short of it, or the two would fight over the same depth).
      const body = new THREE.Mesh(new THREE.CylinderGeometry(RINGS.board * SIZE + 0.005, RINGS.board * SIZE + 0.005, 0.026, 48).rotateX(Math.PI / 2), toonMaterial('#1b1a1f'));
      body.position.set(BOARD.x, BOARD.y, FACE - 0.016); group.add(body);
      const frame = mesh(B(0.86, 0.66, 0.03, 0, 0, 0), toonMaterial('#7a4e2d'), 0.006); frame.position.set(SLATE.x, SLATE.y, -SECRET.back + 0.015); group.add(frame);
      chalk = canvasTexture(512, 384, (g, w, h) => drawScore(g, w, h, game, best, active));
      const slate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ map: chalk })); slate.position.set(SLATE.x, SLATE.y, -SECRET.back + 0.032); group.add(slate);
      // Flat things drawn over the rest, in `order`.
      const flat = (geometry, material, order) => { const m = new THREE.Mesh(geometry, material); m.renderOrder = order; return m; };
      const plain = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity });
      // The same chalkboard held up top on a narrow screen (update sizes it), drawn after everything else, the ring included.
      hud = new THREE.Group(); hud.visible = false; hands.add(hud);
      hud.add(flat(new THREE.PlaneGeometry(1.08, 0.83), plain('#7a4e2d'), 10), flat(new THREE.PlaneGeometry(1, 0.75), new THREE.MeshBasicMaterial({ map: chalk, depthTest: false, transparent: true }), 11));
      document.fonts?.load(`bold 40px 'Comic Neue'`).then(() => chalk.redraw()).catch(() => {});
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.05).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); tape.position.set(BOARD.x, 0.014, OCHE); room.add(tape);
      stuck = FLIGHTS.map((_, i) => { const m = dart(i); m.visible = false; room.add(m); return m; });
      // The ring: where the dart can land, shaded, and its edge, both turning gold as it tightens; four ticks outside it and a
      // dot in the middle stay one size, so it shows however tight it gets. White on a dark edge shows on cream and black.
      ring = new THREE.Group(); ring.visible = false; room.add(ring);
      const area = flat(new THREE.CircleGeometry(1, 40), plain('#ffffff', 0.22), 2), edge = flat(new THREE.RingGeometry(0.93, 1, 40), plain('#ffffff', 0.8), 3);
      ring.add(area, edge, flat(new THREE.CircleGeometry(0.009, 16), plain('#1b1a1f'), 4), flat(new THREE.CircleGeometry(0.006, 16), plain('#ffffff'), 5));
      const ticks = [0, 1, 2, 3].map(i => {
        const tick = new THREE.Group(); tick.rotation.z = i * Math.PI / 2; ring.add(tick);
        tick.add(flat(new THREE.PlaneGeometry(0.034, 0.012), plain('#1b1a1f'), 4), flat(new THREE.PlaneGeometry(0.03, 0.008), plain('#ffffff'), 5));
        return tick;
      });
      ring.userData = { area, edge, ticks };
      call = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(512, 128, drawCall), transparent: true, depthTest: false })); call.scale.set(0.72, 0.18, 1); call.renderOrder = 6; call.visible = false; room.add(call);
      relight();
    },
    // Throws the dart in hand at the ring: it lands anywhere inside it. False if there's no dart in hand.
    throw() {
      if (!darts.ready) return false;
      const a = Math.random() * Math.PI * 2, r = spread() * Math.sqrt(Math.random());
      const to = new THREE.Vector3(THREE.MathUtils.clamp(spot.x + Math.cos(a) * r, 0.1, SECRET.w - 0.1), THREE.MathUtils.clamp(spot.y + Math.sin(a) * r, 0.1, 2.9), FACE);
      const hit = onBoard(to) ? score((to.x - BOARD.x) / SIZE, (to.y - BOARD.y) / SIZE) : { points: 0, label: 'Miss', wall: true };
      if (hit.wall) to.z = -SECRET.back + 0.004;
      if (game.over) for (const m of stuck) m.visible = false;
      const i = game.over || game.won ? 0 : game.turn.length, m = stuck[i];
      held.updateWorldMatrix(true, false);
      const from = room.worldToLocal(held.getWorldPosition(new THREE.Vector3()));
      flight = { m, i, from, to, hit, t: 0, time: Math.max(0.12, from.distanceTo(to) / SPEED) };
      m.visible = true; if (still) land();
      return true;
    },
    update(dt, at, reduced) {
      time += dt; still = reduced;
      if (!room) return;
      if (game.over && time >= pullAt && stuck.some(m => m.visible) && !flight) for (const m of stuck) m.visible = false; // pulled out
      const ready = darts.ready;
      if (ready && !wasReady) breath = time; // a fresh dart: the ring starts wide
      wasReady = ready; held.visible = ready;
      if (ready) { const next = game.over || game.won ? 0 : game.turn.length; if (held.userData.i !== next) { held.userData.i = next; held.geometry = stuck[next].geometry; } }
      // The dart in hand at the bottom left and, on a narrow screen, the chalkboard up top, both kept inside the view.
      const deep = 0.4, high = deep * tan(), across = high * camera.aspect, px = 2 * high / (canvas.clientHeight || 1);
      held.position.set(-Math.min(0.11, 0.55 * across), -Math.min(0.11, 0.8 * high), -deep);
      hud.visible = active && narrow();
      if (hud.visible) { const w = Math.min(0.45 * high, 1.1 * across); hud.scale.setScalar(w); hud.position.set(0, high - BAR * px - 0.415 * w, -deep); }
      if (active && mouse) { const p = landing(aim()); if (p) spot.copy(p); }
      ring.visible = ready;
      if (ready) {
        const r = spread(), { area, edge, ticks } = ring.userData;
        ring.position.set(spot.x, spot.y, (onBoard(spot) ? FACE : -SECRET.back) + 0.004);
        area.scale.setScalar(r); edge.scale.setScalar(r);
        area.material.color.setRGB(1, 1, 1).lerp(tight, 1 - (r - TIGHT) / (WIDE - TIGHT)); edge.material.color.copy(area.material.color);
        for (const tick of ticks) for (const m of tick.children) m.position.x = r + 0.02;
      }
      glow.visible = active && !!lit; if (glow.visible) glow.material.opacity = still ? 0.9 : 0.75 + 0.25 * Math.sin(time * 5);
      if (flight) {
        // A shallow arc, the tail trailing (its +z) back along the way it's going.
        const f = flight, h = 0.05 * f.from.distanceTo(f.to); f.t = Math.min(1, f.t + dt / f.time);
        const pos = f.from.clone().lerp(f.to, f.t), v = f.to.clone().sub(f.from); pos.y += 4 * h * f.t * (1 - f.t); v.y += 4 * h * (1 - 2 * f.t);
        f.m.position.copy(pos); f.m.lookAt(room.localToWorld(pos.clone().sub(v)));
        if (f.t === 1) land();
      }
      if (call.visible) { const age = time - call.userData.at; call.position.y = call.userData.y + age * 0.25; call.material.opacity = Math.max(0, 1 - age / 1.1); if (age > 1.1) call.visible = false; }
    },
  };
  // The beds that would finish what's left, lit (none once it's won: the next dart starts again from 301).
  function relight() { const now = game.won ? '' : finishes(game.left).join(); if (now !== lit) { lit = now; glow.material.map.redraw(lit ? lit.split(',') : []); } }
  // The dart in the air lands: stuck where it hit, nose in, tail up a touch; then the score.
  function land() {
    const f = flight; flight = null;
    f.m.position.copy(f.to); f.m.lookAt(room.localToWorld(f.to.clone().add(new THREE.Vector3(0.02, 0.06, 1))));
    game = play(game, f.hit);
    if (game.over) pullAt = time + PULL;
    if (game.won && (!best || game.darts < best)) { best = game.darts; try { localStorage.setItem(BEST, String(best)); } catch {} }
    chalk.redraw(); relight();
    const word = game.won ? 'Checkout!' : game.bust ? 'Bust!' : f.hit.points === 0 ? 'Miss' : f.hit.label === 'Bull' || f.hit.label === '25' ? f.hit.label : `${f.hit.label} · ${f.hit.points}`;
    call.material.map.redraw(word, game.won ? '#ffe14f' : game.bust ? '#ff6b6b' : FLIGHTS[f.i]);
    call.userData = { at: time, y: f.to.y + 0.16 }; call.position.set(f.to.x, f.to.y + 0.16, f.to.z + 0.1); call.material.opacity = 1; call.visible = true;
  }
  // A mouse aims where it points. A finger drags the ring along, slower than itself, once it's really dragging (as player.js
  // tells a drag from a tap, which throws).
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') { mouse = true; return; }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    drag.moved = true; drag.x = event.clientX; drag.y = event.clientY;
    const k = GAIN * 2 * AWAY * tan() / (canvas.clientHeight || 1);
    spot.x += dx * k; spot.y -= dy * k;
    const off = Math.hypot(spot.x - BOARD.x, spot.y - BOARD.y); if (off > REACH) spot.set(BOARD.x + (spot.x - BOARD.x) * REACH / off, BOARD.y + (spot.y - BOARD.y) * REACH / off);
  });
  canvas.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') mouse = false; });
  canvas.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse' || !active) return; mouse = false; drag ??= { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; });
  const lift = event => { if (drag?.id === event.pointerId) drag = null; };
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
  return darts;
}
