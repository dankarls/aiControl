// Trickshot's items, taped marks and lists, in kitchen-local coordinates (kitchen-plan.js). Data only, so Node can sweep it: every level here
// has a throw that does it, from your eyes (player.js's EYE) through launch (throwing.js), proven in tests/office-levels.test.mjs.
const bearing = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const mark = (x, z, tx, tz) => ({ x, z, stand: bearing(x, z, tx, tz) }); // facing yaw as player.js has it: 0 looks along +z

// Kinds for flight.js. `throw` is the hardest it goes (throwing.js), `tumble` how fast a throw spins it, `upright` lands the right way up.
export const ITEMS = {
  paper: { name: 'paper ball', radius: 0.045, low: 0.045, bounce: 0.25, roll: 4, drag: 0.5, throw: 8, tumble: 20, upright: false },
  rubber: { name: 'rubber ball', radius: 0.04, low: 0.04, bounce: 0.85, roll: 3, drag: 0.1, throw: 12, tumble: 30, upright: false },
  roll: { name: 'bread roll', radius: 0.06, low: 0.05, bounce: 0.3, roll: 7, drag: 0.2, throw: 9, tumble: 25, upright: false },
  mug: { name: 'mug', radius: 0.07, low: 0.05, bounce: 0.3, roll: 6, drag: 0.1, throw: 9, tumble: 6, upright: true },
  plate: { name: 'plate', radius: 0.08, low: 0.012, bounce: 0.65, roll: 0.5, drag: 0.1, throw: 10, tumble: 12, upright: true },
  teabag: { name: 'tea bag', radius: 0.03, low: 0.015, bounce: 0.1, roll: 5, drag: 0.7, throw: 7, tumble: 10, upright: false },
};

export const STARTS = {
  doors: mark(-1, 0, -5, -2.5),
  island: mark(-7.5, -3.6, -5, -2.5),
  farTable: mark(-6.25, -0.5, -5, -2.5),
  betweenTables: mark(-6.35, 0.45, -5, -2.5),
  fridge: mark(-8.4, -4.8, -5, -2.5),
  vending: mark(-8.6, -0.4, -5, -2.5),
  stove: mark(-3, -4.8, -5, -2.5),
};

// ponytail: the tea bag's set is its trick again. From between the tables the chair is all that scores, and always 200.
export const MONDAY = [
  { id: 'paper', item: 'paper', start: 'stove', target: 'bin', trick: { name: 'bin, off the wall', via: 'wall-e' }, set: 100 },
  { id: 'rubber', item: 'rubber', start: 'doors', target: 'bucket', trick: { name: 'bucket, off the ceiling', via: 'ceiling' }, set: 600 },
  { id: 'roll', item: 'roll', start: 'island', target: 'basket', trick: { name: 'basket, off a pan', via: 'pan-' }, set: 400 },
  { id: 'mug', item: 'mug', start: 'fridge', target: 'shelf', trick: { name: 'mug on the shelf, off the fridge', via: 'fridge' }, set: 500 },
  { id: 'plate', item: 'plate', start: 'fridge', target: 'sink', trick: { name: 'sink, off a cupboard', via: 'cupboard-' }, set: 400 },
  { id: 'teabag', item: 'teabag', start: 'betweenTables', target: 'tableMug', trick: { name: 'mug, off a chair', via: 'chair-' }, set: 200 },
];

// What else each item can do, for the daily challenges: [start, target]. A rubber ball only ever stays in the bucket's water.
export const PAIRS = {
  paper: [['doors', 'bin'], ['stove', 'bucket'], ['island', 'sink'], ['island', 'basket'], ['fridge', 'shelf'], ['farTable', 'tableMug']],
  rubber: [['doors', 'bucket'], ['stove', 'bucket'], ['fridge', 'bucket'], ['island', 'bucket']],
  roll: [['doors', 'bin'], ['stove', 'sink'], ['island', 'basket'], ['fridge', 'shelf'], ['farTable', 'tableMug']],
  mug: [['doors', 'bin'], ['stove', 'bucket'], ['island', 'sink'], ['vending', 'shelf'], ['farTable', 'tableMug']],
  plate: [['doors', 'bucket'], ['island', 'bin'], ['fridge', 'sink'], ['fridge', 'shelf'], ['farTable', 'sink']],
  teabag: [['stove', 'bin'], ['stove', 'bucket'], ['island', 'basket'], ['island', 'sink'], ['vending', 'shelf'], ['farTable', 'tableMug']],
};

// `away`: it's in. `trick`: in, off the entry's surface (or family, when `via` ends in -). `score`: the set score. result.surfaces holds only contacts that scored, so a graze doesn't count.
export function lineDone(line, result, entry) {
  if (line === 'away') return result.made;
  if (line === 'score') return result.score >= entry.set;
  if (line !== 'trick' || !result.made) return false;
  const { via } = entry.trick;
  return result.surfaces.some(s => via.endsWith('-') ? s.startsWith(via) : s === via);
}
