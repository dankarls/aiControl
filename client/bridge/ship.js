// What the ship is doing, and who sits where. Pure.
import { VACANT_MS } from '../office/layout.js';
import { compareSessions } from '../session-order.js';
import { usageWindowView } from '../usage-presentation.js';

const STATIONS = 10, NEAR = 80, FULL = 100;
const isWaiting = session => session.status === 'question' || session.status === 'permission';
const DISPLACEABLE = new Set(['idle', 'offline', 'error']);

function limitsOf(usage, now) {
  const limits = [];
  for (const account of usage || []) for (const window of account.windows || []) {
    if (!Number.isFinite(window.usedPercent)) continue;
    // An expired window is waiting for a refresh, so its old figure says nothing about now.
    const live = !usageWindowView(window, now).expired;
    limits.push({ provider: account.provider, label: account.label, window: window.label, usedPercent: window.usedPercent, resetsAt: window.resetsAt, near: live && window.usedPercent >= NEAR, full: live && window.usedPercent >= FULL });
  }
  return limits;
}

export function shipState(snapshot, now) {
  const sessions = snapshot?.sessions || [], limits = limitsOf(snapshot?.usage, now);
  const waiting = sessions.filter(isWaiting), working = sessions.filter(session => session.status === 'working' && !session.parentId).length;
  const limit = limits.some(item => item.full);
  return {
    mode: limit ? 'limit' : waiting.length ? 'hail' : working ? 'warp' : 'orbit',
    warp: limit ? 0 : working, waiting: waiting.length, next: [...waiting].sort(compareSessions)[0] || null, limits,
  };
}

// A session keeps its station while it exists, so stations can be learned by position.
export function assignStations(sessions, previous, now) {
  const main = sessions.filter(session => !session.parentId), byId = new Map(main.map(session => [session.id, session]));
  const stations = Array.from({ length: STATIONS }, (_, i) => {
    const seat = previous?.[i];
    if (!seat) return null;
    if (byId.has(seat.id)) return { id: seat.id, goneAt: null };
    const goneAt = seat.goneAt ?? now;
    return now - goneAt >= VACANT_MS ? null : { id: seat.id, goneAt };
  });
  const seated = new Set(stations.filter(seat => seat && seat.goneAt == null).map(seat => seat.id));
  const unseated = main.filter(session => !seated.has(session.id));
  const take = (index, session) => { stations[index] = { id: session.id, goneAt: null }; seated.add(session.id); };
  const displaceable = () => {
    let best = -1, oldest = Infinity;
    stations.forEach((seat, i) => { const session = seat && byId.get(seat.id); if (session && DISPLACEABLE.has(session.status) && (session.updatedAt ?? 0) < oldest) { best = i; oldest = session.updatedAt ?? 0; } });
    return best;
  };
  for (const session of unseated.filter(isWaiting)) {
    let index = stations.indexOf(null);
    if (index < 0) index = stations.findIndex(seat => seat?.goneAt != null);
    if (index < 0) { index = displaceable(); if (index >= 0) seated.delete(stations[index].id); }
    if (index >= 0) take(index, session);
  }
  for (const session of unseated.filter(session => !isWaiting(session))) {
    const index = stations.indexOf(null);
    if (index >= 0) take(index, session);
  }
  return { stations, overflow: main.filter(session => !seated.has(session.id)).length };
}
