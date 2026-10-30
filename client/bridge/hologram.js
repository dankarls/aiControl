// A hologram that opens over a projector on the bridge: a title and rows you can click, on a panel that turns to face you.
import * as THREE from 'three';
import { fitText, font } from './displays.js';

const PADDING = 22, TITLE = 70, ROW = 70, GAP = 8, UNFOLD = .22, REACH = 5;
export function hologramLayout(count, width, height) {
  const fits = Math.floor((height - TITLE - PADDING + GAP) / (ROW + GAP)), rows = [];
  for (let i = 0; i < Math.min(count, fits); i++) rows.push({ x: PADDING, y: TITLE + i * (ROW + GAP), width: width - 2 * PADDING, height: ROW });
  return { width, height, top: TITLE, rows };
}
// The row at a point on the panel (u and v as in a texture, v running up), or -1.
export function rowAt(layout, u, v) {
  const x = u * layout.width, y = (1 - v) * layout.height;
  return layout.rows.findIndex(row => x >= row.x && x <= row.x + row.width && y >= row.y && y <= row.y + row.height);
}

const beamMap = () => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), fade = g.createLinearGradient(0, 0, 0, 64); fade.addColorStop(0, '#000'); fade.addColorStop(1, '#777');
  g.fillStyle = fade; g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
};
const rounded = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

// `from` is the projector, `at` the panel's centre, both in `parent`'s space. Rows are { id, label, swatch: [colours], on }.
export function createHologram(parent, { from, at, width = .78, height = .6, still }) {
  const W = 512, H = Math.round(W * height / width), canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'), map = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const group = new THREE.Group(); group.position.copy(at); group.visible = false; parent.add(group);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material); plane.renderOrder = 6; group.add(plane);
  const glow = { blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false };
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(width, height * .03), new THREE.MeshBasicMaterial({ ...glow, opacity: .22 })); sweep.position.z = .002; sweep.renderOrder = 7; sweep.visible = !still; group.add(sweep);
  const reach = at.clone().sub(from);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(width * .34, .025, reach.length(), 18, 1, true), new THREE.MeshBasicMaterial({ ...glow, map: beamMap(), side: THREE.DoubleSide }));
  beam.position.copy(from).addScaledVector(reach, .5); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), reach.clone().normalize()); beam.visible = false; beam.renderOrder = 5; parent.add(beam);

  let open = false, amount = 0, title = '', rows = [], hovered = -1, tint = '#6a8cff', text = '#e4eaff', layout = hologramLayout(0, W, H), drawn = '';
  function draw() {
    const signature = JSON.stringify([title, rows, hovered, tint, text]); if (signature === drawn) return; drawn = signature;
    g.clearRect(0, 0, W, H);
    const bottom = layout.rows.length ? layout.rows.at(-1).y + ROW + PADDING : TITLE + PADDING;
    rounded(g, 3, 3, W - 6, bottom - 6, 10); g.fillStyle = 'rgba(5,9,34,.9)'; g.fill();
    g.strokeStyle = tint; g.lineWidth = 3; g.stroke();
    g.fillStyle = tint; g.font = font(700, 36); g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(fitText(title, W - 2 * PADDING, s => g.measureText(s).width), PADDING, TITLE / 2 + 2);
    layout.rows.forEach((row, i) => {
      const { swatch = [], label, on } = rows[i], lit = on || i === hovered;
      rounded(g, row.x, row.y, row.width, row.height, 6);
      if (lit) { g.globalAlpha = i === hovered ? .42 : .24; g.fillStyle = tint; g.fill(); g.globalAlpha = 1; }
      g.strokeStyle = tint; g.lineWidth = on ? 3 : 1; g.stroke();
      swatch.forEach((colour, n) => { g.fillStyle = colour; g.fillRect(row.x + 12 + n * 30, row.y + 18, 26, row.height - 36); });
      const left = row.x + 16 + swatch.length * 30 + (swatch.length ? 8 : 0), room = row.x + row.width - left - 12;
      g.fillStyle = text; g.font = font(600, 34); g.fillText(fitText(label, room, s => g.measureText(s).width), left, row.y + row.height / 2 + 2);
    });
    // Scan lines cut through it, so it reads as light rather than as a screen.
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.2)';
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
    g.globalCompositeOperation = 'source-over';
    map.needsUpdate = true;
  }
  const point = new THREE.Vector3(), eye = new THREE.Vector3();
  return {
    get open() { return open; },
    show(nextTitle, nextRows) { title = nextTitle; rows = nextRows; layout = hologramLayout(rows.length, W, H); open = true; draw(); },
    hide() { open = false; if (hovered !== -1) { hovered = -1; draw(); } },
    // What's under the ray: null off the panel, otherwise the row (undefined between rows).
    at(ray) {
      if (!open || !group.visible) return null;
      const hit = ray.intersectObject(plane)[0]; if (!hit) return null;
      const index = rowAt(layout, hit.uv.x, hit.uv.y);
      // The panel's unused lower part is empty space.
      if (index < 0 && (1 - hit.uv.y) * H > (layout.rows.length ? layout.rows.at(-1).y + ROW + PADDING : TITLE + PADDING)) return null;
      return { row: rows[index] };
    },
    hover(row) { const next = row ? rows.indexOf(row) : -1; if (next !== hovered) { hovered = next; draw(); } },
    paint(colour, label) { tint = colour; text = label; sweep.material.color.set(colour); beam.material.color.set(colour); draw(); },
    tick(dt, t, camera) {
      if (open && group.getWorldPosition(point).distanceTo(camera.getWorldPosition(eye)) > REACH) open = false;
      amount = still ? +open : THREE.MathUtils.clamp(amount + (open ? dt : -dt) / UNFOLD, 0, 1);
      group.visible = beam.visible = amount > 0; if (!amount) return;
      group.lookAt(camera.getWorldPosition(eye)); group.scale.y = Math.sin(amount * Math.PI / 2);
      if (still) return;
      material.opacity = .9 + .05 * Math.sin(t * 31) * Math.sin(t * 7);
      sweep.position.y = height * (.5 - (t * .35 % 1));
    },
  };
}
