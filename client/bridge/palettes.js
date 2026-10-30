// The room's colours, chosen with the buttons on the captain's arm; adding one takes one entry here.
// `lamp` is its button's colour.
// All stay clear of the signal hues, and chairs stay dull so they never bloom.
export const PALETTES = {
  neon: { name: 'Neon', lamp: '#ff4fd0', wall: '#22378e', ceiling: '#1c2c78', bay: '#2a44a4', trim: '#4d6be0', console: '#12164a', mount: '#0b0d30', rail: '#5f74d8', chair: '#3a3d6a', seat: '#565a8a', door: '#3a55c8', pit: '#181450', deck: '#323a96', neon: '#ff4fd0', tones: ['#e4eaff', '#ff6ac4', '#6a8cff'], ambient: .62 },
  violet: { name: 'Violet', lamp: '#b48cff', wall: '#5a38a8', ceiling: '#4a2f92', bay: '#6a48b8', trim: '#8f74e0', console: '#241a6a', mount: '#140f40', rail: '#7f66d0', chair: '#4a3c70', seat: '#6a5a8e', door: '#3a2a8c', pit: '#281a6e', deck: '#603eaa', neon: '#58b4ff', tones: ['#e6dcff', '#58b4ff', '#b48cff'], ambient: .62 },
  arctic: { name: 'Arctic', lamp: '#e6ebf2', wall: '#e6ebf2', ceiling: '#dfe5ee', bay: '#cfd8e6', trim: '#9fb0c8', console: '#1450c8', mount: '#0f2a6e', rail: '#6f8cc4', chair: '#4a5a78', seat: '#747e92', door: '#5f8ae0', pit: '#143caa', deck: '#78a5e1', neon: '#3f9dff', tones: ['#ffffff', '#7fb4ff', '#3f7dff'], ambient: .5 },
};
export const paletteFor = name => PALETTES[name] || PALETTES.neon;
const storageKey = 'ai-control-bridge-colour';
export function savedColour() {
  try { const name = localStorage.getItem(storageKey); return PALETTES[name] ? name : 'neon'; }
  catch { return 'neon'; }
}
export function saveColour(name) {
  try { localStorage.setItem(storageKey, name); } catch { /* Private browsing can disable storage. */ }
}
