// Mini-golf holes for the secret room's green: their shape, slopes and what's in the way, how a ball rolls on them, and
// whether one can be made. Pure (no three.js), so holes and physics run under node --test.
//
// A hole is a green inside AREA: one to three straight legs (straight, L or dogleg, or one wide one) joined into a single
// outline, some corners cut off at an angle, wedges on the rails to bank off and, further on, walls and office things in the
// way; humps, hollows and a tilt; a tee at one end, the cup at the other. `difficulty` (0 to 1) sets how much of that it
// gets. It's makeable if some putt from the tee drops (par 2) or leaves one that does (par 3).

// In the secret room's frame (secret.js): x across from the doorway's wall, z along it.
export const AREA = { x0: 4.6, x1: 9.3, z0: -3.45, z1: 2.55 };
export const BALL = 0.022, CUP = 0.054, RAIL = 0.03; // radii; RAIL is half a rail's thickness
export const DT = 1 / 120, MAX = 4; // a step (s); the hardest putt (m/s)
// Friction (m/s²), how hard a slope pulls (per unit of slope), the fastest a ball drops in (m/s), how much of its speed a ball
// keeps off a rail, how long a putt may roll (s), the height grid's spacing and the outline's (m).
const DECEL = 0.6, PULL = 7, CAPTURE = 1.25, BOUNCE = 0.65, LIMIT = 12, GRID = 0.02, CELL = 0.1;
const SIZES = { books: { w: 0.22, d: 0.16 }, mug: { r: 0.05 }, duck: { r: 0.06 }, stapler: { w: 0.19, d: 0.05 } };

// mulberry32: a small seeded generator, the same numbers everywhere.
export const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const near = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

// Inside a polygon [[x, z], …] (even-odd), and how far a point is from the nearest of its edges.
export function inside(poly, x, z) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit; }
  return hit;
}
const toSegment = (x, z, x1, z1, x2, z2) => { const dx = x2 - x1, dz = z2 - z1, t = clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - x1 - dx * t, z - z1 - dz * t); };
export const fromEdge = (poly, x, z) => { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, toSegment(x, z, ...poly[i], ...poly[(i + 1) % poly.length])); return d; };

// The outline of a union of rectangles [x0, z0, x1, z1] (on CELL): corner to corner round the edge, straight runs merged.
function outline(rects) {
  const x0 = Math.min(...rects.map(r => r[0])), z0 = Math.min(...rects.map(r => r[1]));
  const cols = Math.round((Math.max(...rects.map(r => r[2])) - x0) / CELL), rows = Math.round((Math.max(...rects.map(r => r[3])) - z0) / CELL);
  const on = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && rects.some(([a, b, c, d]) => { const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL; return x > a && x < c && z > b && z < d; });
  const next = new Map(), add = (a, b, c, d) => next.set(`${a},${b}`, [c, d]);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (on(i, j)) {
    if (!on(i, j - 1)) add(i, j, i + 1, j); if (!on(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!on(i, j + 1)) add(i + 1, j + 1, i, j + 1); if (!on(i - 1, j)) add(i, j + 1, i, j);
  }
  const start = next.keys().next().value, corners = [];
  for (let key = start; ;) { const [i, j] = key.split(',').map(Number), [a, b] = next.get(key); corners.push([i, j]); key = `${a},${b}`; if (key === start) break; }
  return corners.filter((p, k) => { const a = corners.at(k - 1), b = corners[(k + 1) % corners.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); })
    .map(([i, j]) => [x0 + i * CELL, z0 + j * CELL]);
}
// Cuts some corners off at an angle, up to `most` metres back along each side (never past half of either).
function chamfer(poly, r, chance, most) {
  return poly.flatMap((p, k) => {
    if (r() > chance) return [p];
    const a = poly.at(k - 1), b = poly[(k + 1) % poly.length], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), d = Math.min(most * (0.4 + 0.6 * r()), la / 2.2, lb / 2.2);
    return [[p[0] + (a[0] - p[0]) / la * d, p[1] + (a[1] - p[1]) / la * d], [p[0] + (b[0] - p[0]) / lb * d, p[1] + (b[1] - p[1]) / lb * d]];
  });
}

// A hole from `seed` at `difficulty`, not yet checked (see survey).
export function make(difficulty, seed) {
  const r = rng(seed), between = (a, b) => a + (b - a) * r(), d = difficulty, snap = v => Math.round(v / CELL) * CELL;
  // Laid out in (v, u), v across the area and u along it, then maybe mirrored and turned end for end.
  const V = AREA.x1 - AREA.x0, U = AREA.z1 - AREA.z0, W = snap(between(1.45, 1.7) - 0.55 * d);
  const kind = d < 0.12 ? 'straight' : d < 0.3 ? (r() < 0.5 ? 'straight' : 'L') : ['straight', 'L', 'L', 'Z', 'Z', 'wide'][Math.floor(r() * 6)];
  let legs, tee, cup;
  if (kind === 'straight' || kind === 'wide') {
    const w = kind === 'wide' ? snap(between(2.2, 3)) : W, L = snap(between(3.4, U - 0.1)), v0 = snap(between(0, V - w)), u0 = snap(between(0, U - L));
    legs = [[v0, u0, v0 + w, u0 + L]]; tee = [v0 + w * between(0.3, 0.7), u0 + 0.4]; cup = [v0 + w * between(0.25, 0.75), u0 + L - between(0.35, 0.9)];
  } else if (kind === 'L') {
    const L1 = snap(between(3, U - 0.1)), L2 = snap(between(2.2, V - 0.1)), u0 = snap(between(0, U - L1)), v0 = snap(between(0, V - L2));
    legs = [[v0, u0, v0 + W, u0 + L1], [v0, u0 + L1 - W, v0 + L2, u0 + L1]];
    tee = [v0 + W / 2, u0 + 0.4]; cup = [v0 + L2 - between(0.35, 0.8), u0 + L1 - W * between(0.3, 0.7)];
  } else { // up one side, across, up the other
    const u0 = snap(between(0, 0.4)), u1 = snap(between(U - 0.5, U)), um = snap(between(u0 + 1.7, u1 - 1.7)), v1 = snap(between(W + 0.7, V - W));
    legs = [[0, u0, W, snap(um + W / 2)], [0, snap(um - W / 2), v1 + W, snap(um + W / 2)], [v1, snap(um - W / 2), v1 + W, u1]];
    tee = [W / 2, u0 + 0.4]; cup = [v1 + W / 2, u1 - between(0.35, 0.8)];
  }
  const mirror = r() < 0.5, flip = r() < 0.5, at = (v, u) => [AREA.x0 + (mirror ? V - v : v), AREA.z0 + (flip ? U - u : u)];
  const rects = legs.map(([a, b, c, e]) => { const [x0, z0] = at(a, b), [x1, z1] = at(c, e); return [Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]; });
  const poly = chamfer(outline(rects), r, 0.25 + 0.5 * d, 0.45);
  [tee, cup] = [tee, cup].map(p => { const [x, z] = at(...p); return { x, z }; });
  const clear = (p, gap) => near(p, tee) > gap && near(p, cup) > gap;

  // Wedges on the rails: a triangle on a long side, pointing in.
  const wedges = [];
  for (let tries = 0, count = d < 0.05 ? 0 : Math.floor(between(0, 1 + 3 * d)); wedges.length < count && tries < 30; tries++) {
    const k = Math.floor(r() * poly.length), [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length], len = Math.hypot(bx - ax, bz - az); if (len < 0.9) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len, t = between(0.2, 0.8) * len, mid = { x: ax + ux * t, z: az + uz * t }, base = between(0.3, 0.55), deep = between(0.18, 0.32), slide = between(-0.15, 0.15);
    const n = inside(poly, mid.x - uz * 0.05, mid.z + ux * 0.05) ? [-uz, ux] : [uz, -ux], apex = { x: mid.x + n[0] * deep + ux * slide, z: mid.z + n[1] * deep + uz * slide };
    if (!clear(mid, 0.55) || !clear(apex, 0.45) || !inside(poly, apex.x, apex.z)) continue;
    wedges.push([[mid.x - ux * base / 2, mid.z - uz * base / 2], [apex.x, apex.z], [mid.x + ux * base / 2, mid.z + uz * base / 2]]);
  }
  // Walls inside, further on.
  const inner = [];
  for (let tries = 0, count = d < 0.35 ? 0 : Math.floor(between(0, 1 + 2 * (d - 0.35) / 0.65)); inner.length < count && tries < 30; tries++) {
    const x = between(AREA.x0, AREA.x1), z = between(AREA.z0, AREA.z1), half = between(0.25, 0.5), a = r() * Math.PI, wall = [x - Math.cos(a) * half, z - Math.sin(a) * half, x + Math.cos(a) * half, z + Math.sin(a) * half];
    if ([[wall[0], wall[1]], [wall[2], wall[3]]].some(([px, pz]) => !inside(poly, px, pz) || fromEdge(poly, px, pz) < 0.25)) continue;
    if ([tee, cup].some(p => toSegment(p.x, p.z, ...wall) < 0.45)) continue;
    inner.push(wall);
  }
  // Office things in the way.
  const kinds = Object.keys(SIZES), things = [];
  for (let tries = 0, count = d < 0.2 ? 0 : Math.floor(between(0, 1 + 2.5 * d)); things.length < count && tries < 30; tries++) {
    const kind = kinds[Math.floor(r() * kinds.length)], o = { kind, ...SIZES[kind], x: between(AREA.x0, AREA.x1), z: between(AREA.z0, AREA.z1), turn: r() * Math.PI };
    const reach = o.r || Math.hypot(o.w, o.d) / 2;
    if (!inside(poly, o.x, o.z) || fromEdge(poly, o.x, o.z) < reach + 0.12 || !clear(o, reach + 0.3) || things.some(p => near(p, o) < 0.4)) continue;
    things.push(o);
  }
  const bumps = Array.from({ length: 1 + Math.floor(3 * d) }, () => ({ x: between(AREA.x0, AREA.x1), z: between(AREA.z0, AREA.z1), r: between(0.35, 0.85), a: (r() < 0.5 ? -1 : 1) * (0.035 + 0.07 * d) }));
  const lean = d < 0.1 ? 0 : 0.022 * d, dir = r() * Math.PI * 2;
  const walls = [...poly.map((p, i) => [...p, ...poly[(i + 1) % poly.length]]), ...wedges.flatMap(([p, q, s]) => [[...p, ...q], [...q, ...s]]), ...inner];
  const c = { difficulty, seed, outline: poly, wedges, inner, things, walls, tee, cup, bumps, tilt: { x: Math.cos(dir) * lean, z: Math.sin(dir) * lean } };
  c.grid = grid(c);
  return c;
}

// The green's height (above its base) on a GRID over the hole, and the slope's pull worked out from it: flat by the rails,
// at the tee and round the cup.
function grid(c) {
  const xs = c.outline.map(p => p[0]), zs = c.outline.map(p => p[1]), x0 = Math.min(...xs) - GRID, z0 = Math.min(...zs) - GRID;
  const cols = Math.ceil((Math.max(...xs) + GRID - x0) / GRID) + 1, rows = Math.ceil((Math.max(...zs) + GRID - z0) / GRID) + 1, h = new Float32Array(cols * rows);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, mz = (Math.min(...zs) + Math.max(...zs)) / 2;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * GRID, z = z0 + j * GRID; if (!inside(c.outline, x, z)) continue;
    let v = c.tilt.x * (x - mx) + c.tilt.z * (z - mz);
    for (const b of c.bumps) v += b.a * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r));
    h[j * cols + i] = clamp(v, -0.12, 0.12) * smooth(0.04, 0.35, fromEdge(c.outline, x, z)) * smooth(0.1, 0.35, Math.hypot(x - c.cup.x, z - c.cup.z)) * smooth(0.05, 0.3, Math.hypot(x - c.tee.x, z - c.tee.z));
  }
  const px = new Float32Array(cols * rows), pz = new Float32Array(cols * rows);
  for (let j = 1; j < rows - 1; j++) for (let i = 1; i < cols - 1; i++) { const k = j * cols + i; px[k] = -PULL * (h[k + 1] - h[k - 1]) / (2 * GRID); pz[k] = -PULL * (h[k + cols] - h[k - cols]) / (2 * GRID); }
  return { x0, z0, cols, rows, h, px, pz };
}
const sample = (g, field, x, z) => {
  const u = clamp((x - g.x0) / GRID, 0, g.cols - 1.001), v = clamp((z - g.z0) / GRID, 0, g.rows - 1.001), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, k = j * g.cols + i;
  return (field[k] * (1 - a) + field[k + 1] * a) * (1 - b) + (field[k + g.cols] * (1 - a) + field[k + g.cols + 1] * a) * b;
};
export const height = (c, x, z) => sample(c.grid, c.grid.h, x, z);
// Which way and how hard the slope pulls a ball at (x, z) (m/s²).
export const slope = (c, x, z) => [sample(c.grid, c.grid.px, x, z), sample(c.grid, c.grid.pz, x, z)];

// A ball touching something: pushed out along (nx, nz) and bounced; the push is remembered, so next step a slope can't
// press it on into what it rests against.
const hit = (b, nx, nz, depth) => {
  b.x += nx * depth; b.z += nz * depth;
  const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= (1 + BOUNCE) * vn * nx; b.vz -= (1 + BOUNCE) * vn * nz; }
  b.touch.push([nx, nz]);
};
function thing(o, b) {
  if (o.r) { const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz); if (d < o.r + BALL && d > 1e-6) hit(b, dx / d, dz / d, o.r + BALL - d); return; }
  const cos = Math.cos(o.turn), sin = Math.sin(o.turn), lx = (b.x - o.x) * cos + (b.z - o.z) * sin, lz = -(b.x - o.x) * sin + (b.z - o.z) * cos;
  let nx = lx - clamp(lx, -o.w / 2, o.w / 2), nz = lz - clamp(lz, -o.d / 2, o.d / 2), depth;
  const d = Math.hypot(nx, nz);
  if (d > 1e-6) { if (d >= BALL) return; nx /= d; nz /= d; depth = BALL - d; }
  else { const px = o.w / 2 - Math.abs(lx), pz = o.d / 2 - Math.abs(lz); [nx, nz, depth] = px < pz ? [Math.sign(lx) || 1, 0, px + BALL] : [0, Math.sign(lz) || 1, pz + BALL]; } // inside: out the nearest side
  hit(b, nx * cos - nz * sin, nx * sin + nz * cos, depth);
}
// One step of a rolling ball { x, z, vx, vz, touch }: slope, friction, walls, things, the cup. Sets b.sunk or b.rest.
export function step(c, b) {
  let fx = sample(c.grid, c.grid.px, b.x, b.z), fz = sample(c.grid, c.grid.pz, b.x, b.z);
  for (const [nx, nz] of b.touch) { const into = fx * nx + fz * nz; if (into < 0) { fx -= into * nx; fz -= into * nz; } }
  b.touch = [];
  b.vx += fx * DT; b.vz += fz * DT;
  const s = Math.hypot(b.vx, b.vz), drop = DECEL * DT;
  if (s <= drop) { b.vx = b.vz = 0; if (Math.hypot(fx, fz) <= DECEL) { b.rest = true; return b; } }
  else { b.vx -= b.vx / s * drop; b.vz -= b.vz / s * drop; }
  b.x += b.vx * DT; b.z += b.vz * DT;
  // Walls are capsules RAIL round their line, so corners at any angle bounce true.
  for (const [x1, z1, x2, z2] of c.walls) {
    const dx = x2 - x1, dz = z2 - z1, t = clamp(((b.x - x1) * dx + (b.z - z1) * dz) / (dx * dx + dz * dz), 0, 1), ex = b.x - x1 - dx * t, ez = b.z - z1 - dz * t, d = Math.hypot(ex, ez);
    if (d < BALL + RAIL && d > 1e-9) hit(b, ex / d, ez / d, BALL + RAIL - d);
  }
  for (const o of c.things) thing(o, b);
  if (Math.hypot(b.x - c.cup.x, b.z - c.cup.z) < CUP && Math.hypot(b.vx, b.vz) < CAPTURE) b.sunk = true;
  return b;
}
// Where a putt from `from` at (vx, vz) ends up.
export function roll(c, from, vx, vz) {
  const b = { x: from.x, z: from.z, vx, vz, touch: [] };
  for (let t = 0; t < LIMIT && !b.sunk && !b.rest; t += DT) step(c, b);
  return b;
}

// Whether a hole can be made, a little at a time (a generator, so the next one can be got ready between frames): putts
// all the way round, from straight at the cup outward, each at a range of strengths, stopping at the first that drops.
// Returns 2 if one from the tee does, 3 if one leaves a putt that does, 0 if neither.
export function* survey(c) {
  const left = b => Math.hypot(b.x - c.cup.x, b.z - c.cup.z);
  function* putts(from, every) {
    const out = [], toward = Math.atan2(c.cup.z - from.z, c.cup.x - from.x);
    for (let k = 0; k * every <= Math.PI; k++) for (const a of k ? [k * every, -k * every] : [0]) {
      for (let s = 0.4; s <= MAX; s += 0.25) { const b = roll(c, from, Math.cos(toward + a) * s, Math.sin(toward + a) * s); if (b.sunk) return null; out.push(b); }
      yield;
    }
    return out;
  }
  const first = yield* putts(c.tee, 0.044);
  if (!first) return 2;
  for (const b of first.sort((a, b) => left(a) - left(b)).slice(0, 3)) if (!(yield* putts(b, 0.07))) return 3;
  return 0;
}
export const par = c => { const it = survey(c); for (;;) { const s = it.next(); if (s.done) return s.value; } };

// The course: holes 1 to 50, harder as they go, the same for everyone, each with its par worked out ahead (a test checks
// them), so none has to be surveyed while you play.
export const HOLE_COUNT = 50, PARS = '22222222232232222222232333233232333222222232333322';
export const difficulty = n => Math.min(1, (n - 1) / 45);
export const seedOf = (n, k) => n * 7919 + k * 104729;
export const hole = n => ({ ...make(difficulty(n), seedOf(n, 0)), n, par: Number(PARS[n - 1]) });
// Endless: hole `index` of a run started with `seed`, harder as the run goes on; the first makeable try, surveyed a little at a
// time (yields between putts).
export function* endless(index, seed) {
  for (let k = 0; ; k++) { const c = make(Math.min(1, 0.3 + 0.035 * index), seed + index * 7919 + k * 104729), p = yield* survey(c); if (p) return { ...c, index, par: p }; }
}
