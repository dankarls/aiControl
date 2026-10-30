// The bridge's layout: pure, so walking and tests can use it without a renderer.
// The room is a circle centred in the square walkGrid expects.
export const R = 7.2, PIT = 4.3, DECK = .36, CENTER = 8;
const DEG = Math.PI / 180;
export const WALL = R * Math.cos(12 * DEG);
export const ROOM = { width: 16, depth: 16, inside: ({ x, z }) => Math.hypot(x - CENTER, z - CENTER) <= R - .6 };
// Degrees from the window, front first.
export const STATION_ANGLES = [-48, 48, -72, 72, -96, 96, -120, 120, -144, 144];
// The pit, one step level, then the raised deck.
export function floorHeight(x, z) {
  const r = Math.hypot(x - CENTER, z - CENTER);
  return r < PIT ? 0 : r < PIT + .12 ? DECK / 2 : DECK;
}
export function stationAt(index) {
  const t = STATION_ANGLES[index] * DEG;
  return { x: CENTER + Math.sin(t) * WALL, z: CENTER - Math.cos(t) * WALL, yaw: -t };
}
