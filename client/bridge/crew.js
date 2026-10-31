// The crew: one seated figure at each occupied station, hard-surface and faceless, carrying the same signal as the display above it.
import { seeded } from './parts.js';

// All muted, clear of the signal hues and too dull to bloom. A head and a suit together tell an agent from its neighbours.
export const SUITS = ['#6e4a6b', '#5b5478', '#5a6b47', '#4b4c55', '#33574a'];
export const HEADS = ['dome', 'crest', 'tall', 'ring'], MARKS = ['bar', 'chevron', 'dots'];
// An agent always gets the look its id hashes to, unless someone seated already has it. Heads and suits come in different counts, so
// stepping one along each reaches every pair, and the next look along differs in both.
export function crewLook(id, taken) {
  const rnd = seeded(String(id)), pairs = HEADS.length * SUITS.length, start = Math.floor(rnd() * pairs), mark = Math.floor(rnd() * MARKS.length);
  const at = i => { const head = i % HEADS.length, suit = i % SUITS.length; return { head, suit, mark, key: `${head}-${suit}` }; };
  for (let i = 0; i < pairs; i++) { const look = at(start + i); if (!taken.has(look.key)) return look; }
  return at(start);
}
const POSES = {
  need: { turn: Math.PI, lean: 0, raise: 1, hands: false, track: false },
  working: { turn: 0, lean: .08, raise: 0, hands: true, track: true },
  idle: { turn: 0, lean: -.2, raise: 0, hands: false, track: false },
};
export const crewPose = signal => POSES[signal] || POSES.idle;
// How a seat changes hands. Only a session really coming or going shimmers: not the page loading, not a lost or returning connection.
export function crewArrival({ was, id, offline, wasOffline, started, still }) {
  if (was === id) return 'none';
  return !started || offline || wasOffline || still ? 'cut' : 'shimmer';
}
