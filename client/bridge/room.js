import * as THREE from 'three';
import { CHAIR_Z, CREW_Z, DECK, DISPLAY, EDGE as WALK, HELM_Z, PIT, R, STATION_ANGLES, WALL } from './deck.js';
import { LIGHT_SCALE } from './lights.js';
import { SIGNALS } from './palettes.js';
import { C, STD, add as place, box, canvas, canvasTexture, lit, seeded } from './parts.js';

// Widths and depths follow the room's radius; the room keeps its height.
const DEG = Math.PI / 180, HW = R * Math.sin(12 * DEG), UP = Math.PI / 2, K = R / 7.2;
const BAY_Z_BACK = -6.12 * K, SILL = .44, TOP = 3.3, HOLE = 1.75, EDGE = [3.4 * K, -8.1 * K], MID = [1.8 * K, -8.65 * K], GLASS_TOP = 3.62;
// The screens you can fly over to and read, by panel. The stations' rows are the sessions themselves.
const SCREENS = { shipLeft: 'Engineering', shipRight: 'Hails', clock: 'Ship time', door: 'Door', helmLeft: 'Helm', helmRight: 'Helm', comm: 'Comm' };
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

// The hull, deck, ceiling, door, chairs and stations, in a group centred on the room.
export function buildRoom(world, still = false) {
  const group = new THREE.Group(), overhead = new THREE.Group(); world.add(group); group.add(overhead);
  const add = (geometry, material, parent, ...rest) => place(geometry, material, parent || group, ...rest);
  const panels = {};
  function panel(name, w, h, gain = 1.25, transparent = false) {
    const el = canvas(w, h, (g, width, height) => { g.fillStyle = '#05060f'; g.fillRect(0, 0, width, height); }), texture = canvasTexture(el); texture.anisotropy = 8;
    return panels[name] = { name, el, g: el.getContext('2d'), texture, gain, material: new THREE.MeshBasicMaterial({ map: texture, transparent, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) };
  }
  function screen(p, w, h, parent, x, y, z, rx = 0) { const mesh = add(new THREE.PlaneGeometry(w, h), p.material, parent, x, y, z, rx); mesh.userData.width = w; mesh.userData.height = h; mesh.userData.screen = SCREENS[p.name]; mesh.renderOrder = 1; return mesh; }
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
    chase: new THREE.MeshBasicMaterial({ map: chaseMap }), chaseMap,
    lamp: lit('#f4f6ff', 1.5), recess: lit('#f2f5ff', 1.35), edge: lit('#fff'), glass,
  };
  function glowRing(r, width, y) {
    const geometry = new THREE.RingGeometry(r - width / 2, r + width / 2, 120, 2), pos = geometry.attributes.position, colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.max(0, 1 - Math.abs(Math.hypot(pos.getX(i), pos.getY(i)) - r) / (width / 2)); colors.set([k, k, k], i * 3); }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); add(geometry, glow.ring, null, 0, y, 0, -UP);
  }

  // Floors: the pit with its dark outline, the raised deck, the two steps up.
  for (const floor of [add(new THREE.CircleGeometry(PIT, 72), MAT.carpet, null, 0, 0, 0, -UP), add(new THREE.RingGeometry(PIT - .22, PIT + .01, 72), MAT.outline, null, 0, .02, 0, -UP),
    add(new THREE.RingGeometry(PIT, R + .4, 72), MAT.deck, null, 0, DECK, 0, -UP), add(new THREE.CylinderGeometry(PIT, PIT, DECK, 72, 1, true), MAT.step, null, 0, DECK / 2)]) floor.userData.floor = true;
  for (const r of [WALK + .12, PIT + .12]) { add(new THREE.TorusGeometry(r, .022, 6, 160), glow.chase, null, 0, DECK + .02, 0, UP); glowRing(r, .9 * K, DECK + .025); }
  // Whatever the walls don't close off, apart from the bay.
  add(new THREE.CylinderGeometry(R + .35, R + .35, 3.9, 64, 1, true, Math.PI + 36 * DEG, 288 * DEG), MAT.far, null, 0, 1.95);

  // The ceiling: panels running in to a central lamp, a ring of recessed lights, a blue band at the wall.
  add(new THREE.CylinderGeometry(1.3 * K, R + .35, .55, 18, 1, true), MAT.ceiling, overhead, 0, 3.83);
  add(new THREE.CircleGeometry(1.32 * K, 36), glow.lamp, overhead, 0, 4.1, 0, UP);
  add(new THREE.TorusGeometry(1.34 * K, .07, 8, 48), glow.neon, overhead, 0, 4.09, 0, UP);
  add(new THREE.TorusGeometry(6.86 * K, .025, 6, 96), glow.neon, overhead, 0, 3.25, 0, UP);
  add(new THREE.CylinderGeometry(6.96 * K, 6.96 * K, .36, 72, 1, true), MAT.bandIn, overhead, 0, 3.45);
  const slope = .55 / (R + .35 - 1.3 * K);
  for (let i = 0; i < 18; i++) add(box(.09, .07, 6.25 * K), MAT.body, around(i * 20, 4.42 * K, overhead), 0, 3.83 - .03, 0, -slope);
  for (let i = 0; i < 24; i++) { const g = around(i * 15 + 7.5, 4.7 * K, overhead); add(box(1.02 * K, .04, .32 * K), MAT.black, g, 0, 3.78, 0, -slope); add(box(.9 * K, .03, .22 * K), glow.recess, g, 0, 3.755, 0, -slope); }

  for (const theta of [-117, 117]) { const g = around(theta, PIT); add(box(1.3 * K, .12, .34 * K), MAT.trim, g, 0, .06, .32 * K).userData.floor = true; add(box(1.3 * K, .24, .3 * K), MAT.trim, g, 0, .12, .02 * K).userData.floor = true; }

  // The window bay: a deep opening with its own walls and ledge, and three panes bowed out at the far end.
  {
    const h = 3.3, y = DECK + h / 2;
    add(frameGeometry(8.5 * K, h, 2 * HOLE, TOP - SILL, .18, .28, ((SILL + TOP) / 2) - y), MAT.wall, null, 0, y, BAY_Z_BACK);
    polygon([[-HOLE, SILL, BAY_Z_BACK], [HOLE, SILL, BAY_Z_BACK], [EDGE[0], SILL, EDGE[1]], [MID[0], SILL, MID[1]], [-MID[0], SILL, MID[1]], [-EDGE[0], SILL, EDGE[1]]], MAT.bay);
    polygon([[-HOLE, TOP, BAY_Z_BACK], [HOLE, TOP, BAY_Z_BACK], [EDGE[0], GLASS_TOP, EDGE[1]], [MID[0], GLASS_TOP, MID[1]], [-MID[0], GLASS_TOP, MID[1]], [-EDGE[0], GLASS_TOP, EDGE[1]]], MAT.bay);
    for (const s of [-1, 1]) {
      polygon([[s * HOLE, SILL, BAY_Z_BACK], [s * EDGE[0], SILL, EDGE[1]], [s * EDGE[0], GLASS_TOP, EDGE[1]], [s * HOLE, TOP, BAY_Z_BACK]], MAT.bay);
      // Ribs along the bay's sides make its depth read.
      for (let i = 1; i < 4; i++) { const k = i / 4, x = s * (HOLE + (EDGE[0] - HOLE) * k), z = BAY_Z_BACK + (EDGE[1] - BAY_Z_BACK) * k, top = TOP + (GLASS_TOP - TOP) * k; add(box(.14 * K, top - SILL, .1 * K), MAT.trim, null, x - s * .05 * K, (top + SILL) / 2, z, 0, s * 19 * DEG); }
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
  for (const [x, z] of [[-EDGE[0], EDGE[1]], [-MID[0], MID[1]], [MID[0], MID[1]], [EDGE[0], EDGE[1]]]) add(box(.2 * K, GLASS_TOP - SILL, .3 * K), MAT.black, null, x, (GLASS_TOP + SILL) / 2, z);
  screen(panel('clock', 640, 64), 1.9, .19, null, 0, 3.5, BAY_Z_BACK + .3);
  add(box(2, .25, .06), MAT.black, null, 0, 3.5, BAY_Z_BACK + .27);

  // Either side of the opening: a tall column about the whole ship, turned a little towards the chair, over a few bars in the palette's tones.
  const jewels = [], flankBars = [];
  const jewel = (parent, x, y, z, color, bright, rnd, shape = 0, owner = null) => jewels.push({ parent, x, y, z, color, bright, shape, owner, on: rnd() > .5, base: new THREE.Color() });
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 2.12, 0, BAY_Z_BACK + .45); g.rotation.y = -s * .2; group.add(g);
    add(box(.88, 1.78, .05), MAT.black, g, 0, 2.35, 0);
    screen(panel(s < 0 ? 'shipLeft' : 'shipRight', 512, 1088), .8, 1.7, g, 0, 2.35, .03);
    add(box(.5 * K, .34, .04), MAT.black, g, 0, 1.1, 0);
    for (let i = 0; i < 5; i++) { const m = lit('#fff'); flankBars.push(m); add(box(.07 * K, .22, .02), m, g, (-.17 + i * .085) * K, 1.1, .03); }
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
    add(new THREE.PlaneGeometry(.62 * K, 3.1), glow.rib, g, 0, DECK + 1.5, .13);
  }
  function fan(desk, cx, seed, owner) {
    const rnd = seeded(seed);
    for (let r = 0; r < 4; r++) { const n = 5 + r * 2; for (let i = 0; i < n; i++) { const a = (15 + 150 * i / (n - 1)) * DEG, rad = (.12 + r * .065) * K; if (rnd() < .12) continue; jewel(desk, cx + Math.cos(a) * rad * 1.5, .035, .23 * K - Math.sin(a) * rad * 1.2, Math.floor(rnd() * 3), .7, rnd, rnd() > .6 ? 1 : 0, owner); } }
  }
  // The bays around the wall. Each has a console, a row of lit tiles on a dark mount, a cove light and a row of tiles in the step.
  const stations = STATION_ANGLES.map((theta, index) => {
    const g = around(theta, WALL), width = 2 * HW, seed = `bay${theta}`;
    const station = { index, angle: theta, group: g, status: null, lamps: [] };
    add(box(width, 2.965, .12), MAT.wall, g, 0, DECK + 1.4825, -.06);
    // The console: kick plate, sloped desk with jewels, a pale lip, the agent's display above a dark band.
    add(box(width, .3, .42), MAT.body, g, 0, .51, .21);
    const desk = new THREE.Group(); desk.position.set(0, .72, .3); desk.rotation.x = .28; g.add(desk);
    add(box(width, .05, .46), MAT.black, desk, 0, 0, 0);
    add(box(width, .05, .04), MAT.rail, g, 0, .66, .52);
    fan(desk, -.82 * K, `${seed}a`, station); fan(desk, .82 * K, `${seed}b`, station);
    add(box(width, .42, .09), MAT.black, g, 0, 1.22, .08);
    add(box(width, 1.75, .1), MAT.black, g, 0, DISPLAY.bottom + .875, .05);
    station.row = panel(`row${index}`, 1408, 256, .75);
    station.mesh = screen(station.row, DISPLAY.width, DISPLAY.height, g, 0, DISPLAY.bottom + DISPLAY.height / 2, DISPLAY.z);
    station.chair = chair(g, 0, DECK, CREW_Z); station.chair.visible = false;
    rib(theta + 12);
    // Coved light in the ceiling, and lit tiles in the step down to the pit: both show the session's state.
    const cove = around(theta, 6.42 * K, overhead), coveMat = lit('#000');
    add(box(1.9 * K, .06, .44 * K), MAT.black, cove, 0, 3.54, 0, .3); add(box(1.7 * K, .025, .26 * K), coveMat, cove, 0, 3.505, .01, .3);
    const block = around(theta, PIT + .03), blockMat = lit('#120d10');
    for (let i = 0; i < 4; i++) add(box(.24 * K, .2, .05), blockMat, block, (-.39 + i * .26) * K, .18, .06);
    add(box(1.15 * K, .28, .04), MAT.black, block, 0, .18, .02);
    const pool = additive({ color: 0, map: glowTexture });
    add(new THREE.PlaneGeometry(2.4 * K, 1.3 * K), pool, block, 0, .03, .75 * K, -UP);
    // The status bar on the window's ledge.
    const ledge = lit('#000'), x = (index - 4.5) * .44 * K; add(box(.34 * K, .07, .05), ledge, null, x, SILL + .06, -7.7 * K); add(box(.4 * K, .1, .08), MAT.black, null, x, SILL + .04, -7.67 * K);
    station.lamps.push({ material: coveMat, gain: 1.5, vacant: C('#cfd8ff', .5) }, { material: blockMat, gain: 1.5, vacant: C('#120d10') }, { material: pool, gain: .3, vacant: BLACK }, { material: ledge, gain: 1.5, vacant: BLACK });
    return station;
  });
  for (const theta of [-156, -36, 36]) rib(theta);

  // The door: a bright alcove and a door in the palette's colour.
  {
    const g = new THREE.Group(); g.position.z = R * Math.cos(24 * DEG); group.add(g);
    add(frameGeometry(5.9 * K, 3.3, 2.5 * K, 2.7, .05, .22, -.3), MAT.wall, g, 0, DECK + 1.65, -.22);
    for (const s of [-1, 1]) add(box(.06, 2.9, .9 * K), MAT.cream, g, s * 1.26 * K, DECK + 1.3, .34 * K);
    add(box(2.6 * K, .06, .9 * K), MAT.cream, g, 0, DECK + 2.72, .34 * K);
    add(box(2.6 * K, 2.9, .04), MAT.cream, g, 0, DECK + 1.3, .78 * K);
    add(box(.76 * K, 2.2, .05), MAT.door, g, -.39 * K, DECK + 1.1, .74 * K); add(box(.76 * K, 2.2, .05), MAT.door, g, .39 * K, DECK + 1.1, .74 * K);
    screen(panel('door', 640, 64), 1.9 * K, .19 * K, g, 0, 3.2, -.25).rotation.set(0, Math.PI, 0);
    add(box(2 * K, .25 * K, .05), MAT.black, g, 0, 3.2, -.22);
    const light = new THREE.PointLight(C('#e8eeff'), 1.1 * LIGHT_SCALE, 3, 1.6); light.position.set(0, 2.3, 0); g.add(light);
    add(box(.06, .06, .06), lit('#f4f6ff', 1.4), g, 0, 3.06, .34 * K).scale.set(30 * K, .6, 12 * K);
  }

  // The helm: a stepped plinth, a blue block and a round dial with a lamp per session.
  const helm = new THREE.Group(); helm.position.set(0, 0, HELM_Z); group.add(helm);
  {
    add(box(3.5 * K, .08, 2 * K), MAT.black, helm, 0, .04, .28 * K); add(box(3.3 * K, .08, 1.8 * K), MAT.trim, helm, 0, .1, .28 * K);
    add(box(2.7 * K, .78, .66 * K), MAT.body, helm, 0, .53, 0);
    add(box(2.24 * K, .4, .03), MAT.black, helm, 0, .52, .34 * K); for (const k of [-1, 1]) add(box(.08 * K, .5, .03), MAT.trim, helm, k * 1.2 * K, .52, .34 * K);
    add(box(.08 * K, .8, .68 * K), MAT.black, helm, -1.36 * K, .53, 0); add(box(.08 * K, .8, .68 * K), MAT.black, helm, 1.36 * K, .53, 0);
    const top = new THREE.Group(); top.position.set(0, .94, .02 * K); top.rotation.x = .3; helm.add(top);
    add(box(2.82 * K, .05, .8 * K), MAT.black, top);
    const dial = add(new THREE.CircleGeometry(.33 * K, 40), panel('dial', 512, 512, 1.4, true).material, top, 0, .03, 0, -UP); dial.renderOrder = 2; Object.assign(dial.userData, { screen: 'Helm', width: .66 * K, height: .66 * K });
    screen(panel('helmLeft', 320, 110, 1.4), .56 * K, .19 * K, top, -.9 * K, .03, -.06 * K, -UP);
    screen(panel('helmRight', 420, 110, 1.4), .62 * K, .16 * K, top, .88 * K, .03, -.06 * K, -UP);
    const rnd = seeded('helm');
    for (let i = 0; i < 26; i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); jewel(top, s * (.44 + k * .07) * K, .035, .24 * K, Math.floor(rnd() * 3), 1.6, rnd, 1); jewel(top, s * (.44 + k * .07) * K, .035, .31 * K, Math.floor(rnd() * 3), 1.6, rnd, 0); }
  }

  // The captain's chair: a stepped plinth, a tall shell, and two arm pods.
  add(new THREE.CylinderGeometry(1, 1.05, .15, 8), MAT.black, null, 0, .075, CHAIR_Z, 0, Math.PI / 8).userData.floor = true;
  add(new THREE.CylinderGeometry(.75, .8, .15, 8), MAT.trim, null, 0, .225, CHAIR_Z, 0, Math.PI / 8).userData.floor = true;
  add(new THREE.CylinderGeometry(.22, .3, .34, 16), MAT.metal, null, 0, .47, CHAIR_Z);
  const shell = new THREE.Group(); shell.position.set(0, .3, CHAIR_Z); shell.userData.chair = true; group.add(shell);
  add(box(.66, .14, .62), MAT.seatTop, shell, 0, .46); add(box(.78, 1.12, .1), MAT.shell, shell, 0, 1.02, .33, .08); add(box(.82, .06, .14), MAT.trim, shell, 0, 1.6, .37, .08);
  const pods = new THREE.Group(); group.add(pods); const targets = {};
  const podBase = box(.38, .06, .36), bigLamps = [], crystals = [], hidden = new THREE.MeshBasicMaterial({ visible: false });
  let projector = null;
  for (const s of [-1, 1]) {
    // The arm runs forward from the seat and ends in a pod angled at the eye.
    add(box(.1, .1, .86), MAT.trim, pods, s * .48, .96, CHAIR_Z - .3);
    const pod = new THREE.Group(); pod.position.set(s * .5, 1.13, CHAIR_Z - .94); pod.rotation.x = .62; pods.add(pod);
    add(box(.38, .22, .4), MAT.metal, pod, 0, -.13, 0);
    add(podBase, MAT.black, pod);
    if (s < 0) {
      screen(panel('arm', 420, 170, 1.45), .32, .13, pod, 0, .035, .1, -UP);
      (targets.crew = add(box(.34, .06, .17), hidden, pod, 0, .05, .1)).userData.hologram = 'crew';
      for (let i = 0; i < 3; i++) { const m = lit('#e4eaff', .9), mesh = add(box(.075, .035, .15), m, pod, -.1 + i * .1, .05, -.08); crystals.push({ mesh, material: m, color: C('#e4eaff', .9), near: C(SIGNALS.near), full: C(SIGNALS.need), off: C('#e4eaff', .12) }); }
    } else {
      [[SIGNALS.need, 'need'], [SIGNALS.working, 'work'], [SIGNALS.idle, 'calm']].forEach(([color, role], i) => { const m = lit(color); add(new THREE.CylinderGeometry(.052, .06, .05, 18), m, pod, -.115 + i * .115, .05, -.07); add(new THREE.CylinderGeometry(.068, .07, .025, 18), MAT.metal, pod, -.115 + i * .115, .03, -.07); bigLamps.push({ material: m, color: C(color), role }); });
      // One button opens the room's colours as a hologram; it lights in the colour chosen. A generous invisible target lies over it.
      projector = lit('#000');
      add(new THREE.CylinderGeometry(.045, .05, .025, 24), projector, pod, 0, .045, .1); add(new THREE.CylinderGeometry(.06, .062, .02, 24), MAT.metal, pod, 0, .035, .1);
      (targets.colour = add(box(.24, .06, .17), hidden, pod, 0, .05, .1)).userData.hologram = 'colour';
    }
  }

  // The comm panel lowers from the bay's ceiling for a hail, in front of the glass rather than on it.
  const comm = new THREE.Group(); comm.position.set(0, 4.3, -6.75 * K); group.add(comm);
  add(box(1.78, .74, .08), MAT.black, comm, 0, 0, -.05); add(box(.05, 2, .05), MAT.metal, comm, -.69, 1.37, -.04); add(box(.05, 2, .05), MAT.metal, comm, .69, 1.37, -.04);
  screen(panel('comm', 1024, 400, 1.3), 1.7, .66, comm, 0, 0, 0);

  // Instanced jewel lamps, one call for the whole bridge. Built with the group at the origin, so the matrices are the group's own.
  group.updateMatrixWorld(true);
  [new THREE.CylinderGeometry(.017, .021, .016, 8), box(.04, .018, .03)].forEach((geometry, shape) => {
    const list = jewels.filter(j => j.shape === shape), mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), list.length); mesh.frustumCulled = false; group.add(mesh);
    const o = new THREE.Object3D(), out = new THREE.Matrix4();
    list.forEach((j, i) => {
      o.position.set(j.x, j.y, j.z); o.updateMatrix(); out.multiplyMatrices(j.parent.matrixWorld, o.matrix);
      mesh.setMatrixAt(i, out); j.index = i; j.mesh = mesh;
    });
  });
  group.position.set(8, 0, 8);

  let palette = null, hail = false, limit = false, offline = false, warp = 0, started = false, dim = 1, commY = 4.3;
  const paintRow = station => { station.row.gain = (station.status ? 1.3 : .75) * (station.marked ? 1.7 : station.marked === false ? .45 : 1); };
  const tmp = new THREE.Color(), seat = new THREE.Vector3(), mark = new THREE.Vector3(), SIGNAL = { need: C(SIGNALS.need), working: C(SIGNALS.working), idle: C(SIGNALS.idle) };
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
      projector.color.copy(C(next.lamp, .6));
    },
    // `status` is 'need', 'working', 'idle', or null for an empty station.
    // Signals stop at full brightness: pushed past it their channels clip, and red turns the orange of a near limit.
    setStation(index, status) {
      const station = stations[index]; if (station.status === status) return;
      station.status = status; station.chair.visible = !!status; paintRow(station);
      for (const j of jewels) if (j.owner === station) { j.bright = status ? 1.5 : .7; if (palette) paintJewel(j); }
    },
    // A sidebar filter: true for a station it takes in, false for one it leaves out, null with no filter.
    setMarked(index, marked) { const station = stations[index]; station.marked = marked; paintRow(station); },
    setMode(state) {
      limit = state.mode === 'limit'; hail = state.mode === 'hail'; offline = state.offline; warp = state.warp;
      if (!started) { started = true; dim = limit || offline ? .3 : 1; commY = hail || limit ? 2.25 : 4.3; }
    },
    hologramButton: name => targets[name],
    // Which hologram's button the ray lands on, if any.
    hologramAt(ray) {
      if (!pods.visible) return null;
      return ray.intersectObjects(shell.visible ? [pods, shell, helm] : [pods, helm], true)[0]?.object.userData.hologram || null;
    },
    tick(dt, t, camera) {
      const pulse = still ? 1 : .5 + .5 * Math.sin(t * 3.4);
      dim += ((limit || offline ? .3 : 1) - dim) * (still ? 1 : 1 - Math.pow(.08, dt));
      for (const station of stations) for (const lamp of station.lamps) {
        if (!station.status) { lamp.material.color.copy(lamp.vacant).multiplyScalar(dim); continue; }
        const level = station.status === 'need' ? .3 + pulse * 1.2 : station.status === 'working' ? 1 : .45;
        lamp.material.color.copy(SIGNAL[station.status]).multiplyScalar(Math.min(1, lamp.gain * level * dim) * (station.marked === false ? .25 : 1));
      }
      for (const p of Object.values(panels)) p.material.color.setScalar(p.gain * (limit || offline ? .55 : 1));
      for (const lamp of bigLamps) {
        const on = lamp.role === 'need' ? hail || limit : lamp.role === 'work' ? warp > 0 && !limit : !hail && !limit && !warp;
        lamp.material.color.copy(lamp.color).multiplyScalar(on ? (lamp.role === 'need' ? .5 + pulse * .5 : 1) : .1);
      }
      commY += ((hail || limit ? 2.25 : 4.3) - commY) * (still ? 1 : 1 - Math.pow(.05, dt)); comm.position.y = commY; comm.visible = commY < 4.15;
      // Your own seat's back would fill the view when you turn around in it.
      seat.copy(camera.position).sub(group.position);
      shell.visible = seat.distanceTo(mark.set(0, 1.5, CHAIR_Z)) > .7;
      pods.visible = seat.distanceTo(mark.set(0, 1.2, CHAIR_Z - .78)) > .25;
    },
  };
}
