import * as THREE from 'three';
import { DECK, PIT, R, STATION_ANGLES, WALL } from './deck.js';
import { LIGHT_SCALE } from './lights.js';
import { PALETTES, SIGNALS } from './palettes.js';
import { C, STD, add as place, box, canvas, canvasTexture, lit, seeded } from './parts.js';

const DEG = Math.PI / 180, HW = R * Math.sin(12 * DEG), UP = Math.PI / 2;
const BAY_Z_BACK = -6.12, SILL = .44, TOP = 3.3, HOLE = 3.3, EDGE = [4.0, -8.1], MID = [2.1, -8.65], GLASS_TOP = 3.62, CHAIR_Z = .78;
// A station's upper display, by index: the signs up front, the live displays at the back.
const UPPER = [['engineSign', 1.35], ['hailSign', 1.35], ['decks'], ['engineering'], ['shuttles'], ['credits'], ['radar', 1.25, true], ['wave', 1.25, true], ['spectrum', 1.25, true], ['nebula', 1.2]];
const BLACK = new THREE.Color(0);

function roundedPath(path, x, y, w, h, r) { path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r); path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h); path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r); path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y); return path; }
function frameGeometry(w, h, hw, hh, r, depth, cy = 0) {
  const shape = new THREE.Shape(); shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2); shape.lineTo(w / 2, h / 2); shape.lineTo(-w / 2, h / 2); shape.closePath();
  shape.holes.push(roundedPath(new THREE.Path(), -hw / 2, -hh / 2 + cy, hw, hh, r));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 1, curveSegments: 6 });
}
function noiseTexture(size, base, spread, repeat) {
  const rnd = seeded('carpet'), texture = canvasTexture(canvas(size, size, g => {
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) { const k = 1 + (rnd() - .5) * spread; img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat, repeat);
  return texture;
}
const additive = extra => new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, ...extra });

// The hull, deck, rails, ceiling, door, chairs and stations, in a group centred on the room.
export function buildRoom(world, still = false) {
  const group = new THREE.Group(), overhead = new THREE.Group(); world.add(group); group.add(overhead);
  const add = (geometry, material, parent, ...rest) => place(geometry, material, parent || group, ...rest);
  const panels = {};
  function panel(name, w, h, gain = 1.25, transparent = false) {
    const el = canvas(w, h, (g, width, height) => { g.fillStyle = '#05060f'; g.fillRect(0, 0, width, height); }), texture = canvasTexture(el); texture.anisotropy = 8;
    return panels[name] = { el, g: el.getContext('2d'), texture, gain, material: new THREE.MeshBasicMaterial({ map: texture, transparent, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) };
  }
  function screen(p, w, h, parent, x, y, z, rx = 0) { const mesh = add(new THREE.PlaneGeometry(w, h), p.material, parent, x, y, z, rx); mesh.userData.width = w; mesh.renderOrder = 1; return mesh; }
  // Placed around the ring: `theta` is measured from the window, and the group's +z faces the centre.
  function around(theta, r, parent = group) { const t = theta * DEG, g = new THREE.Group(); g.position.set(Math.sin(t) * r, 0, -Math.cos(t) * r); g.rotation.y = -t; parent.add(g); return g; }
  function polygon(points, material) {
    const geometry = new THREE.BufferGeometry(), pos = [];
    for (let i = 1; i < points.length - 1; i++) pos.push(...points[0], ...points[i], ...points[i + 1]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.computeVertexNormals();
    return add(geometry, material);
  }
  const glowTexture = canvasTexture(canvas(128, 128, g => { const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, '#fff'); grad.addColorStop(.4, '#7a7a7a'); grad.addColorStop(1, '#000'); g.fillStyle = grad; g.fillRect(0, 0, 128, 128); }), false);
  const MAT = {
    wall: STD('#fff', .5, .05), trim: STD('#fff', .38, .3), body: STD('#fff', .42, .1), black: STD('#fff', .45, .1),
    rail: STD('#fff', .32, .1), bandIn: STD('#fff', .45, .08, { side: THREE.BackSide }), step: STD('#fff', .6, 0, { side: THREE.BackSide }), far: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    carpet: STD('#ffffff', 1, 0, { map: noiseTexture(256, [200, 200, 200], .16, 22) }), deck: STD('#ffffff', 1, 0, { map: noiseTexture(256, [200, 200, 200], .16, 24) }), outline: STD('#fff', .6, 0),
    ceiling: STD('#fff', .7, .04, { flatShading: true, side: THREE.BackSide }), metal: STD('#9aa4b8', .38, .55), shell: STD('#fff', .34, .12), bay: STD('#fff', .5, .06, { side: THREE.DoubleSide }), seatTop: STD('#fff', .55, .05),
    cream: STD('#fff', .5, .05), door: STD('#fff', .35, .1),
  };
  // The neon: strips and pools that all follow one colour, and turn red with the room. A chasing strip runs round the deck.
  const chaseMap = canvasTexture(canvas(64, 4, g => { const grad = g.createLinearGradient(0, 0, 64, 0); grad.addColorStop(0, '#333'); grad.addColorStop(.7, '#fff'); grad.addColorStop(.72, '#333'); grad.addColorStop(1, '#333'); g.fillStyle = grad; g.fillRect(0, 0, 64, 4); }), false);
  chaseMap.wrapS = chaseMap.wrapT = THREE.RepeatWrapping; chaseMap.repeat.set(48, 1);
  const washMap = canvasTexture(canvas(256, 128, g => { const grad = g.createRadialGradient(128, 64, 10, 128, 64, 140); grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#3a3a3a'); g.fillStyle = grad; g.fillRect(0, 0, 256, 128); }));
  const glass = (() => {
    // A dim reflection of the room: the rail, the lamp, the helm's lights.
    const map = canvasTexture(canvas(512, 256, g => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
      const glow = (x, y, rx, ry, color) => { g.save(); g.translate(x, y); g.scale(rx, ry); const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1); grad.addColorStop(0, color); grad.addColorStop(1, '#000'); g.fillStyle = grad; g.globalCompositeOperation = 'lighter'; g.fillRect(-1, -1, 2, 2); g.restore(); };
      glow(256, 30, 150, 30, '#2e3448'); glow(120, 190, 120, 14, '#262c40'); glow(392, 190, 120, 14, '#262c40'); glow(256, 214, 70, 10, '#262c40'); glow(60, 120, 70, 90, '#1a2026'); glow(452, 120, 70, 90, '#1a2026');
    }));
    return additive({ map, side: THREE.DoubleSide });
  })();
  const glow = {
    neon: lit('#fff'), rib: additive({ map: glowTexture }), ring: additive({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    chase: new THREE.MeshBasicMaterial({ map: chaseMap }), chaseMap, wash: new THREE.MeshBasicMaterial({ map: washMap }),
    lamp: lit('#f4f6ff', 1.5), recess: lit('#f2f5ff', 1.35), edge: lit('#fff'), strip: new THREE.MeshBasicMaterial({ color: 0 }), glass,
  };
  function glowRing(r, width, y) {
    const geometry = new THREE.RingGeometry(r - width / 2, r + width / 2, 120, 2), pos = geometry.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.max(0, 1 - Math.abs(Math.hypot(pos.getX(i), pos.getY(i)) - r) / (width / 2)); colors.set([k, k, k], i * 3); }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); add(geometry, glow.ring, null, 0, y, 0, -UP);
  }

  // Floors: the pit with its dark outline, the raised deck, the two steps up.
  add(new THREE.CircleGeometry(PIT, 72), MAT.carpet, null, 0, 0, 0, -UP);
  add(new THREE.RingGeometry(PIT - .22, PIT + .01, 72), MAT.outline, null, 0, .02, 0, -UP);
  add(new THREE.RingGeometry(PIT, R + .4, 72), MAT.deck, null, 0, DECK, 0, -UP);
  add(new THREE.CylinderGeometry(PIT, PIT, DECK, 72, 1, true), MAT.step, null, 0, DECK / 2);
  for (const r of [6.12, PIT + .12]) { add(new THREE.TorusGeometry(r, .022, 6, 160), glow.chase, null, 0, DECK + .02, 0, UP); glowRing(r, .9, DECK + .025); }
  // Whatever the walls don't close off, apart from the bay.
  add(new THREE.CylinderGeometry(R + .35, R + .35, 3.9, 64, 1, true, Math.PI + 36 * DEG, 288 * DEG), MAT.far, null, 0, 1.95);

  // The ceiling: panels running in to a central lamp, a ring of recessed lights, a blue band at the wall.
  add(new THREE.CylinderGeometry(1.3, R + .35, .55, 18, 1, true), MAT.ceiling, overhead, 0, 3.83);
  add(new THREE.CircleGeometry(1.32, 36), glow.lamp, overhead, 0, 4.1, 0, UP);
  add(new THREE.TorusGeometry(1.34, .07, 8, 48), glow.neon, overhead, 0, 4.09, 0, UP);
  add(new THREE.TorusGeometry(6.86, .025, 6, 96), glow.neon, overhead, 0, 3.25, 0, UP);
  add(new THREE.CylinderGeometry(6.96, 6.96, .36, 72, 1, true), MAT.bandIn, overhead, 0, 3.45);
  const slope = .55 / (R + .35 - 1.3);
  for (let i = 0; i < 18; i++) add(box(.09, .07, 6.25), MAT.body, around(i * 20, 4.42, overhead), 0, 3.83 - .03, 0, -slope);
  for (let i = 0; i < 24; i++) { const g = around(i * 15 + 7.5, 4.7, overhead); add(box(1.02, .04, .32), MAT.black, g, 0, 3.78, 0, -slope); add(box(.9, .03, .22), glow.recess, g, 0, 3.755, 0, -slope); }

  // Curved rails on angled posts, broken for the steps and the way to the window.
  function railArc(from, to) {
    const shape = new THREE.Shape(), inner = PIT - .1, outer = PIT + .2, steps = Math.round((to - from) / 5), pts = [];
    for (let i = 0; i <= steps; i++) { const t = (from + (to - from) * i / steps) * DEG; pts.push([Math.sin(t) * outer, Math.cos(t) * outer]); }
    for (let i = steps; i >= 0; i--) { const t = (from + (to - from) * i / steps) * DEG; pts.push([Math.sin(t) * inner, Math.cos(t) * inner]); }
    pts.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
    add(new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2 }), MAT.rail, null, 0, 1.2, 0, -UP);
    for (let a = from + 4; a <= to - 2; a += Math.max(14, (to - from - 6) / Math.round((to - from - 6) / 16))) add(box(.07, .86, .3), MAT.black, around(a, PIT + .05), 0, .78, 0, -.14);
  }
  for (const sign of [-1, 1]) { const [a, b] = sign > 0 ? [20, 108] : [-108, -20], [c, d] = sign > 0 ? [126, 168] : [-168, -126]; railArc(a, b); railArc(c, d); }
  for (const theta of [-117, 117]) { const g = around(theta, PIT); add(box(1.3, .12, .34), MAT.trim, g, 0, .06, .32); add(box(1.3, .24, .3), MAT.trim, g, 0, .12, .02); }

  // The window bay: a deep opening with its own walls and ledge, and three panes bowed out at the far end.
  {
    const h = 3.3, y = DECK + h / 2;
    add(frameGeometry(8.5, h, 2 * HOLE, TOP - SILL, .18, .28, ((SILL + TOP) / 2) - y), MAT.wall, null, 0, y, BAY_Z_BACK);
    polygon([[-HOLE, SILL, BAY_Z_BACK], [HOLE, SILL, BAY_Z_BACK], [EDGE[0], SILL, EDGE[1]], [MID[0], SILL, MID[1]], [-MID[0], SILL, MID[1]], [-EDGE[0], SILL, EDGE[1]]], MAT.bay);
    polygon([[-HOLE, TOP, BAY_Z_BACK], [HOLE, TOP, BAY_Z_BACK], [EDGE[0], GLASS_TOP, EDGE[1]], [MID[0], GLASS_TOP, MID[1]], [-MID[0], GLASS_TOP, MID[1]], [-EDGE[0], GLASS_TOP, EDGE[1]]], MAT.bay);
    for (const s of [-1, 1]) {
      polygon([[s * HOLE, SILL, BAY_Z_BACK], [s * EDGE[0], SILL, EDGE[1]], [s * EDGE[0], GLASS_TOP, EDGE[1]], [s * HOLE, TOP, BAY_Z_BACK]], MAT.bay);
      // Ribs along the bay's sides make its depth read.
      for (let i = 1; i < 4; i++) { const k = i / 4, x = s * (HOLE + (EDGE[0] - HOLE) * k), z = BAY_Z_BACK + (EDGE[1] - BAY_Z_BACK) * k, top = TOP + (GLASS_TOP - TOP) * k; add(box(.14, top - SILL, .1), MAT.trim, null, x - s * .05, (top + SILL) / 2, z, 0, s * 19 * DEG); }
    }
  }
  function pane(ax, az, bx, bz) {
    const len = Math.hypot(bx - ax, bz - az), mesh = add(new THREE.PlaneGeometry(len, GLASS_TOP - SILL), glow.glass, null, (ax + bx) / 2, (SILL + GLASS_TOP) / 2, (az + bz) / 2, 0, Math.atan2(az - bz, bx - ax)); mesh.renderOrder = 5;
    // The lit edge above and below, the strut at each join.
    add(box(len + .05, .05, .05), glow.edge, null, (ax + bx) / 2, SILL + .05, (az + bz) / 2 + .05, 0, mesh.rotation.y);
    add(box(len + .05, .05, .05), glow.edge, null, (ax + bx) / 2, GLASS_TOP - .05, (az + bz) / 2 + .05, 0, mesh.rotation.y);
    add(box(len + .1, .1, .22), MAT.black, null, (ax + bx) / 2, SILL + .01, (az + bz) / 2, 0, mesh.rotation.y);
    add(box(len + .1, .1, .22), MAT.black, null, (ax + bx) / 2, GLASS_TOP - .01, (az + bz) / 2, 0, mesh.rotation.y);
  }
  pane(-EDGE[0], EDGE[1], -MID[0], MID[1]); pane(-MID[0], MID[1], MID[0], MID[1]); pane(MID[0], MID[1], EDGE[0], EDGE[1]);
  for (const [x, z] of [[-EDGE[0], EDGE[1]], [-MID[0], MID[1]], [MID[0], MID[1]], [EDGE[0], EDGE[1]]]) add(box(.2, GLASS_TOP - SILL, .3), MAT.black, null, x, (GLASS_TOP + SILL) / 2, z);
  screen(panel('stardate', 640, 64), 1.9, .19, null, 0, 3.5, BAY_Z_BACK + .3);
  add(box(2, .25, .06), MAT.black, null, 0, 3.5, BAY_Z_BACK + .27);

  // Either side of the opening: lamp panels and a tall lamp strip. Lamps with no meaning behind them use the palette's tones.
  const jewels = [], flankBars = [];
  const jewel = (parent, x, y, z, color, bright, rnd, shape = 0, owner = null) => jewels.push({ parent, x, y, z, color, bright, shape, owner, on: rnd() > .5, base: new THREE.Color() });
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 3.78, 0, BAY_Z_BACK + .3); group.add(g);
    add(box(.62, 1.5, .05), MAT.black, g, 0, 2.2, 0);
    const rnd = seeded(`flank${s}`);
    for (let r = 0; r < 10; r++) for (let c = 0; c < 5; c++) if (rnd() > .25) jewel(g, -.2 + c * .1, 1.6 + r * .125, .035, Math.floor(rnd() * 3), 1.5, rnd, 1);
    add(box(.1, 1.5, .03), glow.strip, g, s * -.45, 2.2, 0);
    add(box(.5, .34, .04), MAT.black, g, 0, 1.1, 0);
    for (let i = 0; i < 5; i++) { const m = lit('#fff'); flankBars.push(m); add(box(.07, .22, .02), m, g, -.17 + i * .085, 1.1, .03); }
  }

  const shellBack = (() => { const s = new THREE.Shape(); s.moveTo(-.14, 0); s.lineTo(.14, 0); s.quadraticCurveTo(.3, .3, .24, .62); s.quadraticCurveTo(0, .74, -.24, .62); s.quadraticCurveTo(-.3, .3, -.14, 0); return new THREE.ExtrudeGeometry(s, { depth: .04, bevelEnabled: true, bevelSize: .015, bevelThickness: .015, bevelSegments: 1, curveSegments: 8 }); })();
  function chair(parent, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const foot = box(.05, .025, .34); for (let i = 0; i < 4; i++) add(foot, MAT.black, g, Math.sin(i * 1.57 + .78) * .14, .02, Math.cos(i * 1.57 + .78) * .14, 0, i * 1.57 + .78);
    add(new THREE.CylinderGeometry(.035, .06, .42, 10), MAT.metal, g, 0, .22); add(new THREE.CylinderGeometry(.24, .2, .07, 16), MAT.seatTop, g, 0, .46);
    add(shellBack, MAT.shell, g, 0, .46, .2, .12);
    return g;
  }
  function rib(theta) {
    const g = around(theta, R - .04);
    add(box(.18, 3.2, .3), MAT.trim, g, 0, DECK + 1.5, 0); add(box(.04, 3, .02), glow.neon, g, 0, DECK + 1.5, .16);
    add(new THREE.PlaneGeometry(.62, 3.1), glow.rib, g, 0, DECK + 1.5, .13);
  }
  function fan(desk, cx, seed, owner) {
    const rnd = seeded(seed);
    for (let r = 0; r < 4; r++) { const n = 5 + r * 2; for (let i = 0; i < n; i++) { const a = (15 + 150 * i / (n - 1)) * DEG, rad = .12 + r * .065; if (rnd() < .12) continue; jewel(desk, cx + Math.cos(a) * rad * 1.5, .035, .23 - Math.sin(a) * rad * 1.2, Math.floor(rnd() * 3), .7, rnd, rnd() > .6 ? 1 : 0, owner); } }
  }
  // The bays around the wall. Each has a console, a row of lit tiles, an alcove above it, a cove light and a block under the rail.
  const stations = STATION_ANGLES.map((theta, index) => {
    const g = around(theta, WALL), width = 2 * HW, seed = `bay${theta}`, [upperName, upperGain, live] = UPPER[index];
    const station = { index, angle: theta, group: g, status: null, lamps: [] };
    add(box(width, 1.66, .12), MAT.wall, g, 0, DECK + .83, -.06);
    add(frameGeometry(width, 1.3, width - .5, 1, .16, .2, 0), MAT.wall, g, 0, 2.63, 0);
    // Backlight in the alcove, its display on a dark mount.
    add(new THREE.PlaneGeometry(width - .4, 1), glow.wash, g, 0, 2.63, .02);
    add(box(2.34, .9, .04), MAT.black, g, 0, 2.63, .06);
    station.upper = live ? panel(upperName, 512, 188, upperGain) : panel(upperName, 1024, 375, upperGain);
    screen(station.upper, 2.24, .82, g, 0, 2.63, .085);
    // The console: kick plate, sloped desk with jewels, a pale lip, tiles behind a hood.
    add(box(width, .5, .62), MAT.body, g, 0, .62, .31);
    const desk = new THREE.Group(); desk.position.set(0, .92, .42); desk.rotation.x = .28; g.add(desk);
    add(box(width, .05, .66), MAT.black, desk, 0, 0, 0);
    add(box(width, .05, .04), MAT.rail, g, 0, .85, .74);
    fan(desk, -.82, `${seed}a`, station); fan(desk, .82, `${seed}b`, station);
    add(box(width, .34, .09), MAT.black, g, 0, 1.1, .08);
    add(box(width, .72, .1), MAT.black, g, 0, 1.56, .05);
    station.row = panel(`row${index}`, 1408, 256, .75);
    station.mesh = screen(station.row, 2.76, .5, g, 0, 1.56, .112);
    add(box(width, .07, .3), MAT.trim, g, 0, 1.94, .14);
    station.chair = chair(g, 0, DECK, 1.34); station.chair.visible = false;
    rib(theta + 12);
    // Coved light in the ceiling, and a lit block under the rail: both show the session's state.
    const cove = around(theta, 6.42, overhead), coveMat = lit('#000');
    add(box(1.9, .06, .44), MAT.black, cove, 0, 3.54, 0, .3); add(box(1.7, .025, .26), coveMat, cove, 0, 3.505, .01, .3);
    const block = around(theta, PIT + .03), blockMat = lit('#120d10');
    for (let i = 0; i < 4; i++) add(box(.24, .26, .05), blockMat, block, -.39 + i * .26, .66, .06);
    add(box(1.15, .34, .04), MAT.black, block, 0, .66, .02);
    const pool = additive({ color: 0, map: glowTexture });
    add(new THREE.PlaneGeometry(2.4, 1.3), pool, block, 0, .03, .75, -UP);
    // The status bar on the window's ledge, and a lamp above the left panel.
    const ledge = lit('#000'), x = (index - 4.5) * .44; add(box(.34, .07, .05), ledge, null, x, SILL + .06, -7.7); add(box(.4, .1, .08), MAT.black, null, x, SILL + .04, -7.67);
    const small = lit('#000'); add(new THREE.CircleGeometry(.05, 12), small, null, -3.78 - .12 + (index % 3) * .12, 3.1 + Math.floor(index / 3) * .13 - .14, BAY_Z_BACK + .34);
    station.lamps.push({ material: coveMat, gain: 1.5, vacant: C('#cfd8ff', .5) }, { material: blockMat, gain: 1.5, vacant: C('#120d10') }, { material: pool, gain: .3, vacant: BLACK }, { material: ledge, gain: 1.5, vacant: BLACK }, { material: small, gain: 1.8, vacant: BLACK });
    return station;
  });
  for (const theta of [-156, -36, 36]) rib(theta);

  // The door: a bright alcove and a door in the palette's colour.
  {
    const g = new THREE.Group(); g.position.z = R * Math.cos(24 * DEG); group.add(g);
    add(frameGeometry(5.9, 3.3, 2.5, 2.7, .05, .22, -.3), MAT.wall, g, 0, DECK + 1.65, -.22);
    for (const s of [-1, 1]) add(box(.06, 2.9, .9), MAT.cream, g, s * 1.26, DECK + 1.3, .34);
    add(box(2.6, .06, .9), MAT.cream, g, 0, DECK + 2.72, .34);
    add(box(2.6, 2.9, .04), MAT.cream, g, 0, DECK + 1.3, .78);
    add(box(.76, 2.2, .05), MAT.door, g, -.39, DECK + 1.1, .74); add(box(.76, 2.2, .05), MAT.door, g, .39, DECK + 1.1, .74);
    screen(panel('door', 640, 64), 1.9, .19, g, 0, 3.2, -.25).rotation.set(0, Math.PI, 0);
    add(box(2, .25, .05), MAT.black, g, 0, 3.2, -.22);
    const light = new THREE.PointLight(C('#e8eeff'), 1.1 * LIGHT_SCALE, 4, 1.6); light.position.set(0, 2.3, 0); g.add(light);
    add(box(.06, .06, .06), lit('#f4f6ff', 1.4), g, 0, 3.06, .34).scale.set(30, .6, 12);
  }

  // The helm: a stepped plinth, a blue block and a round dial with a lamp per session.
  const helm = new THREE.Group(); helm.position.set(0, 0, -2.85); group.add(helm);
  let sweep;
  {
    add(box(3.5, .08, 2), MAT.black, helm, 0, .04, .28); add(box(3.3, .08, 1.8), MAT.trim, helm, 0, .1, .28);
    add(box(2.7, .78, .66), MAT.body, helm, 0, .53, 0);
    add(box(2.24, .4, .03), MAT.black, helm, 0, .52, .34); for (const k of [-1, 1]) add(box(.08, .5, .03), MAT.trim, helm, k * 1.2, .52, .34);
    add(box(.08, .8, .68), MAT.black, helm, -1.36, .53, 0); add(box(.08, .8, .68), MAT.black, helm, 1.36, .53, 0);
    const top = new THREE.Group(); top.position.set(0, .94, .02); top.rotation.x = .3; helm.add(top);
    add(box(2.82, .05, .8), MAT.black, top);
    add(new THREE.CircleGeometry(.33, 40), panel('dial', 512, 512, 1.4, true).material, top, 0, .03, 0, -UP).renderOrder = 2;
    const sweepMap = canvasTexture(canvas(256, 256, g => { for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(225,240,255,${.02 + i * .012})`; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, -1.2 + i * .04, -1.2 + i * .04 + .06); g.fill(); } }), false);
    sweep = add(new THREE.CircleGeometry(.33, 40), additive({ map: sweepMap }), top, 0, .033, 0, -UP); sweep.renderOrder = 3;
    screen(panel('helmLeft', 320, 110, 1.4), .56, .19, top, -.9, .03, -.06, -UP);
    screen(panel('helmRight', 420, 110, 1.4), .62, .16, top, .88, .03, -.06, -UP);
    const rnd = seeded('helm');
    for (let i = 0; i < 26; i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); jewel(top, s * (.44 + k * .07), .035, .24, Math.floor(rnd() * 3), 1.6, rnd, 1); jewel(top, s * (.44 + k * .07), .035, .31, Math.floor(rnd() * 3), 1.6, rnd, 0); }
    chair(group, -.86, .14, -2.02); chair(group, .86, .14, -2.02);
  }

  // The captain's chair: a stepped plinth, a tall shell, and two arm pods.
  add(new THREE.CylinderGeometry(1.3, 1.36, .15, 8), MAT.black, null, 0, .075, CHAIR_Z, 0, Math.PI / 8);
  add(new THREE.CylinderGeometry(.95, 1, .15, 8), MAT.trim, null, 0, .225, CHAIR_Z, 0, Math.PI / 8);
  add(new THREE.CylinderGeometry(.22, .3, .34, 16), MAT.metal, null, 0, .47, CHAIR_Z);
  const shell = new THREE.Group(); shell.position.set(0, .3, CHAIR_Z); group.add(shell);
  add(box(.66, .14, .62), MAT.seatTop, shell, 0, .46); add(box(.78, 1.12, .1), MAT.shell, shell, 0, 1.02, .33, .08); add(box(.82, .06, .14), MAT.trim, shell, 0, 1.6, .37, .08);
  const pods = new THREE.Group(); group.add(pods);
  const podBase = box(.38, .06, .36), bigLamps = [], crystals = [], hidden = new THREE.MeshBasicMaterial({ visible: false });
  let colourButtons = [];
  for (const s of [-1, 1]) {
    // The arm runs forward from the seat and ends in a pod angled at the eye.
    add(box(.1, .1, .86), MAT.trim, pods, s * .48, .96, CHAIR_Z - .3);
    const pod = new THREE.Group(); pod.position.set(s * .5, 1.13, -.16); pod.rotation.x = .62; pods.add(pod);
    add(box(.38, .22, .4), MAT.metal, pod, 0, -.13, 0);
    add(podBase, MAT.black, pod);
    if (s < 0) {
      screen(panel('arm', 420, 170, 1.45), .32, .13, pod, 0, .035, .1, -UP);
      for (let i = 0; i < 3; i++) { const m = lit('#e4eaff', .9), mesh = add(box(.075, .035, .15), m, pod, -.1 + i * .1, .05, -.08); crystals.push({ mesh, material: m, color: C('#e4eaff', .9), i }); }
    } else {
      [[SIGNALS.need, 'need'], [SIGNALS.working, 'work'], [SIGNALS.idle, 'calm']].forEach(([color, role], i) => { const m = lit(color); add(new THREE.CylinderGeometry(.052, .06, .05, 18), m, pod, -.115 + i * .115, .05, -.07); add(new THREE.CylinderGeometry(.068, .07, .025, 18), MAT.metal, pod, -.115 + i * .115, .03, -.07); bigLamps.push({ material: m, color: C(color), role }); });
      // The room's colours: a button for each, with a generous invisible target over it.
      colourButtons = Object.keys(PALETTES).map((name, i, all) => {
        const material = lit('#000'), x = (i - (all.length - 1) / 2) * .115;
        add(new THREE.CylinderGeometry(.04, .046, .03, 18), material, pod, x, .05, .1); add(new THREE.CylinderGeometry(.054, .056, .02, 18), MAT.metal, pod, x, .035, .1);
        add(box(.11, .06, .13), hidden, pod, x, .05, .1).userData.colour = name;
        return { name, material };
      });
    }
  }

  // The comm panel lowers from the bay's ceiling for a hail, in front of the glass rather than on it.
  const comm = new THREE.Group(); comm.position.set(0, 4.3, -6.75); group.add(comm);
  add(box(2.84, 1.18, .08), MAT.black, comm, 0, 0, -.05); add(box(.05, 2, .05), MAT.metal, comm, -1.1, 1.5, -.04); add(box(.05, 2, .05), MAT.metal, comm, 1.1, 1.5, -.04);
  screen(panel('comm', 1024, 400, 1.3), 2.72, 1.06, comm, 0, 0, 0);

  // Instanced jewel lamps, one call for the whole bridge. Built with the group at the origin, so the matrices are the group's own.
  group.updateMatrixWorld(true);
  [new THREE.CylinderGeometry(.017, .021, .016, 8), box(.04, .018, .03)].forEach((geometry, shape) => {
    const list = jewels.filter(j => j.shape === shape), mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), list.length); mesh.frustumCulled = false; group.add(mesh);
    const o = new THREE.Object3D(), out = new THREE.Matrix4();
    list.forEach((j, i) => {
      o.position.set(j.x, j.y, j.z); o.rotation.x = j.z < .05 && j.parent.position.z < -5 ? UP : 0; o.updateMatrix(); out.multiplyMatrices(j.parent.matrixWorld, o.matrix);
      mesh.setMatrixAt(i, out); j.index = i; j.mesh = mesh;
    });
  });
  group.position.set(8, 0, 8);

  let palette = null, hail = false, limit = false, offline = false, warp = 0, started = false, dim = 1, commY = 4.3, jewelClock = 0;
  const tmp = new THREE.Color(), off = new THREE.Color(), seat = new THREE.Vector3(), mark = new THREE.Vector3(), SIGNAL = { need: C(SIGNALS.need), working: C(SIGNALS.working), idle: C(SIGNALS.idle) };
  const paintJewel = j => { j.base.copy(C(palette.tones[j.color])).multiplyScalar(j.bright * .7); j.mesh.setColorAt(j.index, j.on ? j.base : tmp.copy(j.base).multiplyScalar(.07)); j.mesh.instanceColor.needsUpdate = true; };
  return {
    group, stations, panels, glow, ceiling: overhead, crystals,
    // Repaints what exists; creates nothing.
    repaint(next) {
      palette = next;
      const paint = (key, color) => MAT[key].color.copy(C(color));
      for (const [key, color] of Object.entries({ wall: next.wall, trim: next.trim, body: next.console, black: next.mount, rail: next.rail, bandIn: next.console, step: next.mount, far: next.mount, outline: next.mount, ceiling: next.ceiling, shell: next.chair, bay: next.bay, seatTop: next.seat, cream: next.wall, door: next.door })) paint(key, color);
      // The floors' noise is grey, so their tint is lifted to come out at the palette's colour.
      MAT.carpet.color.copy(C(next.pit, 1.7)); MAT.deck.color.copy(C(next.deck, 1.7));
      flankBars.forEach((material, i) => material.color.copy(C(next.tones[i % 3], .55)));
      for (const j of jewels) paintJewel(j);
      for (const { name, material } of colourButtons) material.color.copy(C(PALETTES[name].lamp, PALETTES[name] === next ? 1.2 : .2));
    },
    // `status` is 'need', 'working', 'idle', or null for an empty station.
    // Signals stop at full brightness: pushed past it their channels clip, and red turns the orange of a near limit.
    setStation(index, status) {
      const station = stations[index]; if (station.status === status) return;
      station.status = status; station.chair.visible = !!status; station.row.gain = status ? 1.3 : .75;
      for (const j of jewels) if (j.owner === station) { j.bright = status ? 1.5 : .7; if (palette) paintJewel(j); }
    },
    setMode(state) {
      limit = state.mode === 'limit'; hail = state.mode === 'hail'; offline = state.offline; warp = state.warp;
      if (!started) { started = true; dim = limit || offline ? .3 : 1; commY = hail || limit ? 2.25 : 4.3; }
    },
    // The colour button under a ray, unless something of the chair is in the way.
    colourAt(ray) {
      if (!pods.visible) return null;
      return ray.intersectObjects(shell.visible ? [pods, shell, helm] : [pods, helm], true)[0]?.object.userData.colour || null;
    },
    tick(dt, t, camera) {
      const pulse = still ? 1 : .5 + .5 * Math.sin(t * 3.4);
      dim += ((limit || offline ? .3 : 1) - dim) * (still ? 1 : 1 - Math.pow(.08, dt));
      for (const station of stations) for (const lamp of station.lamps) {
        if (!station.status) { lamp.material.color.copy(lamp.vacant).multiplyScalar(dim); continue; }
        const level = station.status === 'need' ? .3 + pulse * 1.2 : station.status === 'working' ? 1 : .45;
        lamp.material.color.copy(SIGNAL[station.status]).multiplyScalar(Math.min(1, lamp.gain * level * dim));
      }
      for (const p of Object.values(panels)) p.material.color.setScalar(p.gain * (limit ? .55 : 1));
      for (const lamp of bigLamps) {
        const on = lamp.role === 'need' ? hail || limit : lamp.role === 'work' ? warp > 0 && !limit : !hail && !limit && !warp;
        lamp.material.color.copy(lamp.color).multiplyScalar(on ? (lamp.role === 'need' ? .5 + pulse * .5 : 1) : .1);
      }
      commY += ((hail || limit ? 2.25 : 4.3) - commY) * (still ? 1 : 1 - Math.pow(.05, dt)); comm.position.y = commY; comm.visible = commY < 4.15;
      sweep.rotation.z = still ? 0 : -t * 1.1;
      jewelClock += dt;
      if (!still && jewelClock > .35) {
        jewelClock = 0;
        for (let i = 0; i < 8; i++) { const j = jewels[Math.floor(Math.random() * jewels.length)]; j.on = !j.on; j.mesh.setColorAt(j.index, j.on ? tmp.copy(j.base).multiplyScalar(limit ? .35 : 1) : off.copy(j.base).multiplyScalar(.04)); j.mesh.instanceColor.needsUpdate = true; }
      }
      // Your own seat's back would fill the view when you turn around in it.
      seat.copy(camera.position).sub(group.position);
      shell.visible = seat.distanceTo(mark.set(0, 1.5, CHAIR_Z)) > .7;
      pods.visible = seat.distanceTo(mark.set(0, 1.2, 0)) > .25;
    },
  };
}
