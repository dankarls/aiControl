import * as THREE from 'three';
import { TiltedBox } from './flight.js';
import { WALL_H, WALL_T } from './furniture.js';

// The kitchen and lunch room as data: no meshes, so Node can sweep it. Local metres: the origin is the door's centre on the east wall's
// kitchen face, x runs -10..0 (west to the door wall), z -6..1 (north to south). kitchen.js draws at these positions, shot.js scores by
// surfaceTier, levels.js picks starts and targets. No randomness: daily challenges must match between installs.
export const KITCHEN = { width: 10, back: -6, front: 1 };
export const TIERS = { large: { points: 50, multiplier: 0 }, normal: { points: 100, multiplier: 1 }, hard: { points: 200, multiplier: 1 }, floor: { points: 0, multiplier: 0 } };
export const DOOR_W = 1.5, DOOR_H = 2.2; // the doorway in the east wall, z -0.75..0.75

// Container surfaces are 'floor': being in the target is not a trick. 'floor' and 'ceiling' are flight.js's own names for them.
const BY_NAME = { wall: 'large', ceiling: 'large', fridge: 'normal', counter: 'normal', island: 'normal', shelf: 'normal', table: 'normal', chair: 'normal', vending: 'normal',
  cupboard: 'hard', pan: 'hard', tray: 'hard', floor: 'floor', bin: 'floor', bucket: 'floor', basket: 'floor', sink: 'floor', tableMug: 'floor' };
export function surfaceTier(surface) {
  const tier = BY_NAME[String(surface).replace(/-.*$/, '')];
  if (!tier) throw new Error(`no tier for surface ${surface}`);
  return tier;
}

const rad = d => d * Math.PI / 180;
const box = (surface, x0, y0, z0, x1, y1, z1) => ({ surface, min: [x0, y0, z0], max: [x1, y1, z1] });
const tilt = (surface, centre, half, rotation) => ({ surface, centre, half, rotation });
// A door hinged on its back face's edge at (hx, hz), swung `deg` out towards +z: the hinge stays put, the far edge sweeps round.
const hinged = (surface, hx, y0, hz, w, h, t, deg) => {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return tilt(surface, [hx + w / 2 * c - t / 2 * s, y0 + h / 2, hz + w / 2 * s + t / 2 * c], [w / 2, h / 2, t / 2], [0, -a, 0]);
};
// An open box: its bottom and four rims, all named after it, `r` out from the centre and `t` thick.
const vessel = (surface, cx, y0, cz, r, h, t) => [
  box(surface, cx - r, y0, cz - r, cx + r, y0 + t, cz + r),
  box(surface, cx - r, y0, cz - r, cx + r, y0 + h, cz - r + t), box(surface, cx - r, y0, cz + r - t, cx + r, y0 + h, cz + r),
  box(surface, cx - r, y0, cz - r, cx - r + t, y0 + h, cz + r), box(surface, cx + r - t, y0, cz - r, cx + r, y0 + h, cz + r),
];
// A chair: seat and back (one name), turned `yaw` degrees (0 faces +z); `tip` lays it on its side. Both boxes turn with the chair, so
// the pair is rotated about the chair's own origin and handed to TiltedBox as Euler angles.
const chair = (n, x, z, yaw, tip = 0) => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rad(yaw), 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rad(tip))));
  const euler = new THREE.Euler().setFromQuaternion(q), lift = tip ? 0.22 : 0;
  return [[[0, 0.45, 0], [0.22, 0.02, 0.22]], [[0, 0.75, -0.2], [0.22, 0.22, 0.02]]].map(([at, half]) => {
    const c = new THREE.Vector3(...at).applyQuaternion(q);
    return tilt(`chair-${n}`, [x + c.x, lift + c.y, z + c.z], half, euler.toArray().slice(0, 3));
  });
};

const T = WALL_T, TABLES = [[-7.7, -1.75], [-4.6, -1.75], [-7.7, 0], [-4.6, 0]], COUPLE = 1.18, COUNTER_X = -8.6;
// Door-wall pieces beside the doorway. Shut, the doorway is filled with more of the same wall.
const edges = shut => [
  box('wall-n', -10 - T, 0, -6 - T, T, WALL_H, -6), box('wall-s', -10 - T, 0, 1, T, WALL_H, 1 + T), box('wall-w', -10 - T, 0, -6, -10, WALL_H, 1),
  box('wall-e', 0, 0, -6 - T, T, WALL_H, -DOOR_W / 2), box('wall-e', 0, 0, DOOR_W / 2, T, WALL_H, 1 + T), box('wall-e', 0, DOOR_H, -DOOR_W / 2, T, WALL_H, DOOR_W / 2),
  ...(shut ? [box('wall-e', 0, 0, -DOOR_W / 2, T, DOOR_H, DOOR_W / 2)] : []),
];

// ponytail: cupboard carcasses and the table legs have no colliders (the doors, tops and seats are what a thrown thing meets), and the sink
// hole is cut so a drop passes just in front of the closed door above it.
const PARTS = shut => [
  ...edges(shut),
  box('fridge', -9.8, 0, -5.95, -9, 1.9, -5.25), hinged('fridge', -9.8, 0, -5.25, 0.8, 1.9, 0.05, 25),
  box('counter', COUNTER_X, 0, -6, -7.1, 0.91, -5.4), box('counter', -6.5, 0, -6, -1.5, 0.91, -5.4),
  box('sink', -7.1, 0, -6, -6.5, 0.91, -5.92), box('sink', -7.1, 0, -5.62, -6.5, 0.91, -5.4), box('sink', -7.1, 0, -5.92, -6.5, 0.6, -5.62),
  ...[0, 0, 35, 70, 110, 20].map((deg, i) => hinged(`cupboard-${i + 1}`, COUNTER_X + i * COUPLE, 1.5, -5.55, COUPLE, 0.7, 0.03, deg)),
  box('island', -6.5, 0, -4.15, -3.5, 0.92, -3.05),
  ...[6, 10, 14].map((deg, i) => tilt(`pan-${i + 1}`, [-6 + i * 0.6, 1.7, -3.6], [0.16, 0.012, 0.12], [0, 0, rad(deg)])),
  ...vessel('basket', -3.9, 0.92, -3.6, 0.2, 0.3, 0.03),
  box('shelf', -10, 1.46, -3.3, -9.7, 1.5, -1.9), box('shelf', -9.73, 1.5, -3.3, -9.7, 1.58, -1.9), box('shelf', -10, 1.5, -3.3, -9.7, 1.58, -3.27), box('shelf', -10, 1.5, -1.93, -9.7, 1.58, -1.9),
  tilt('tray', [-9.56, 0.28, -0.5], [0.5, 0.012, 0.25], [0, 0, rad(-35)]),
  ...TABLES.map(([x, z], i) => box(`table-${i + 1}`, x - 0.7, 0, z - 0.4, x + 0.7, 0.74, z + 0.4)),
  ...vessel('tableMug', -4.6, 0.74, 0, 0.095, 0.12, 0.02),
  ...[[-7.9, -2.6, 15], [-4.9, -2.6, -35], [-6.65, -1.75, 300], [-5.65, -1.75, 120], [-3.5, -1.75, 295], [-8.85, -1.75, 140], [-6.65, 0, 310], [-5.65, 0, 130]].flatMap(([x, z, yaw], i) => chair(i + 1, x, z, yaw)),
  ...chair(9, -2.9, -0.2, 50, 90),
  box('vending', -10, 0, 0, -9.2, 1.9, 0.8),
  ...vessel('bin', -0.5, 0, -2.5, 0.25, 0.6, 0.03), ...vessel('bucket', -9.5, 0, -4.2, 0.2, 0.4, 0.03),
];

// Where a drop is meant to end: the centre and half-extents of "came to rest inside", within each container's rim (the shelf: above its top, within its lip).
export const ZONES = {
  bin: { centre: [-0.5, 0.3, -2.5], half: [0.2, 0.25, 0.2] },
  bucket: { centre: [-9.5, 0.2, -4.2], half: [0.15, 0.15, 0.15] },
  basket: { centre: [-3.9, 1.05, -3.6], half: [0.12, 0.1, 0.12] },
  shelf: { centre: [-9.86, 1.57, -2.6], half: [0.1, 0.07, 0.5] },
  sink: { centre: [-6.8, 0.75, -5.77], half: [0.2, 0.12, 0.1] },
  tableMug: { centre: [-4.6, 0.81, 0], half: [0.06, 0.05, 0.06] },
};
for (const z of Object.values(ZONES)) { z.centre = new THREE.Vector3(...z.centre); z.half = new THREE.Vector3(...z.half); }

// Things drawn without a collider, or needing more than a box. Sizes are w (along the wall) by h.
export const SPOTS = {
  clipboard: { x: -0.02, y: 1.35, z: -1.6, facing: 'west', w: 0.3, h: 0.4 },
  scores: { x: -0.02, y: 1.9, z: -4.2, facing: 'west', w: 1.6, h: 0.9 },
  lunchTables: TABLES.map(([x, z]) => ({ x, z, w: 1.4, d: 0.8, h: 0.74 })),
  panRack: { x: -5.4, y: 2, z: -3.6, w: 2.2 },
  tap: { x: -6.8, y: 0.91, z: -5.9 },
};

const shifted = (o, p) => Object.assign(new THREE.Box3(new THREE.Vector3(p.min[0] + o.x, p.min[1], p.min[2] + o.z), new THREE.Vector3(p.max[0] + o.x, p.max[1], p.max[2] + o.z)), { surface: p.surface });
export function flightBoxes(origin = { x: 0, z: 0 }, { doorShut = true } = {}) {
  return PARTS(doorShut).map(p => p.centre ? new TiltedBox({ centre: [p.centre[0] + origin.x, p.centre[1], p.centre[2] + origin.z], half: p.half, rotation: p.rotation, surface: p.surface }) : shifted(origin, p));
}

// Floor-standing things the player walks round, each name as one axis-aligned box (a turned chair, the fridge with its door, a leaning tray).
// ponytail: walls, anything above head height, and what stands on a table or the island are left out; they can overlap, the doorway stays clear.
const NOT_WALKED = /^(wall|cupboard|pan|shelf|basket|tableMug)/;
export function walkBoxes(origin = { x: 0, z: 0 }) {
  const groups = new Map();
  for (const b of flightBoxes(origin, { doorShut: false })) {
    if (NOT_WALKED.test(b.surface) || b.min.y > 1.2) continue;
    const key = b.surface === 'sink' ? 'counter' : b.surface, g = groups.get(key) ?? new THREE.Box3().makeEmpty(); groups.set(key, g.union(b)); // the sink is part of the counter to a walker
  }
  return [...groups].map(([surface, b]) => Object.assign(b, { surface, walkOnly: true }));
}

export const levelWorld = onContact => ({ colliders: flightBoxes(), columns: [], ceiling: WALL_H, onContact });
