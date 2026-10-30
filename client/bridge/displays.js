// What's drawn on the ship's displays: tiles, signs, alcoves, the live rear displays. Canvases come from the room.
// Signals: red needs you, teal is working, pale blue is idle, orange is near a limit. Decoration uses the palette's other hues.
import { monitorLines } from '../office/status.js';
import { usageWindowView } from '../usage-presentation.js';
import { SIGNALS } from './palettes.js';
import { seeded } from './parts.js';
import { signalOf, stationSignals } from './ship.js';

const INK = '#f2f4ff', DIM = '#aeb4c6', Y = '#eef0f6', O = '#c4cad8', BACK = '#050406', OFF = '#262c33', { need: RED, working: TEAL, idle: BLUE, near: ORANGE } = SIGNALS;
const SIGNAL_COLOUR = { need: RED, working: TEAL, idle: BLUE };
const LABELS = { question: 'HAILING', permission: 'AUTHORIZE', working: 'ON DUTY', idle: 'STANDBY', error: 'FAULT', offline: 'OFFLINE' };
const GLYPHS = { claude: '✳', codex: '⌘' };
const LIVE_MS = 100, MAX_LIMIT_ROWS = 6, MAX_PROJECTS = 6, MAX_SHUTTLES = 3;
export const font = (weight, size) => `${weight} ${size}px Antonio, 'Arial Narrow', 'Liberation Sans Narrow', sans-serif`;
const graphemes = text => [...new Intl.Segmenter().segment(text)].map(part => part.segment);

// One line that fits `width`, cut on whole characters so an emoji is never split.
export function fitText(text, width, measure) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (measure(line) <= width) return line;
  if (measure('…') > width) return '';
  const parts = graphemes(line);
  let low = 0, high = parts.length;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (measure(`${parts.slice(0, mid).join('')}…`) <= width) low = mid; else high = mid - 1; }
  return `${parts.slice(0, low).join('').trimEnd()}…`;
}
export const stationName = session => session.title?.trim() || session.project || 'Session';
const glyph = provider => GLYPHS[provider] || '◆';
const dollars = usd => `$${usd.toFixed(2)}`;
const clock = now => new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const fit = (g, text, width) => fitText(text, width, part => g.measureText(part).width);
function wrap(g, text, x, y, width, lineH, max) {
  let line = '', rest = String(text ?? '').replace(/\s+/g, ' ').trim(), n = 0;
  for (const word of rest.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width <= width || !line) { line = next; rest = rest.slice(word.length + 1); continue; }
    if (++n === max) { g.fillText(fit(g, `${line} ${word} ${rest}`, width), x, y); return y + lineH; }
    g.fillText(fit(g, line, width), x, y); y += lineH; line = word; rest = rest.slice(word.length + 1);
  }
  g.fillText(fit(g, line, width), x, y); return y + lineH;
}
function cells(g, x, y, w, h, level, color) {
  const n = 24, gap = 3, cw = (w - gap * (n - 1)) / n, on = Math.round(Math.min(1, Math.max(0, level)) * n);
  for (let i = 0; i < n; i++) { g.fillStyle = i < on ? color : OFF; g.fillRect(x + i * (cw + gap), y, cw, h); }
}
function tile(g, x, y, w, h, draw) { g.save(); rr(g, x, y, w, h, 10); g.fillStyle = BACK; g.fill(); g.clip(); g.translate(x, y); draw(w, h); g.restore(); }
// The decorative kinds are the wall's texture; a session's own tiles hold its data.
function decor(g, w, h, kind, rnd, pal) {
  const hue = () => pal.tones[Math.floor(rnd() * 3)];
  if (kind === 0) for (let r = 0; r < 6; r++) { let x = 12; const y = 16 + r * (h - 24) / 6; while (x < w - 16) { const len = 10 + rnd() * 34; if (rnd() > .3) { g.fillStyle = hue(); g.fillRect(x, y, Math.min(len, w - 12 - x), (h - 24) / 6 - 10); } x += len + 8; } }
  if (kind === 1) for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { if (rnd() < .3) continue; g.fillStyle = hue(); g.beginPath(); g.arc(20 + c * (w - 40) / 5, 26 + r * (h - 52) / 4, 8, 0, 7); g.fill(); }
  if (kind === 2) { const bands = [pal.mount, pal.console, pal.trim, pal.tones[0]]; bands.forEach((color, b) => { g.fillStyle = color; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 12) g.lineTo(x, h - (h * .82 - b * h * .18) * Math.pow(x / w, .6) * (.86 + .14 * Math.sin(x * .05 + b))); g.lineTo(w, h); g.fill(); }); }
  if (kind === 4) { g.lineWidth = 5; for (let i = 0; i < 6; i++) { g.strokeStyle = hue(); const y = 26 + i * (h - 48) / 5, a = 14 + rnd() * 50; g.beginPath(); g.moveTo(a, y); g.lineTo(w - 14 - rnd() * 40, y); g.stroke(); } }
}

// What a waiting session is actually asking; a question's title is only ever "A question for you".
const requestText = session => { const request = session.requests?.[0]; return request?.questions?.[0]?.question || request?.title || session.asks; };

// The plain facts a station's tiles show, so a tile is redrawn only when one of them changes.
function rowFacts(session, unread, offline) {
  const signal = offline ? 'idle' : signalOf(session), request = requestText(session), used = session.context?.used || 0;
  return {
    id: session.id, signal, unread, label: offline ? 'NO SIGNAL' : LABELS[session.status] || 'STANDBY', glyph: glyph(session.provider), project: session.project || '', title: stationName(session),
    line: signal === 'need' ? request || 'Waiting for you' : session.detail || monitorLines(session, 1).lines.at(-1)?.text || '',
    plan: session.plan?.length ? session.plan.map(step => step.status) : null, used, fill: used / (session.context?.window || (used > 200_000 ? 1_000_000 : 200_000)),
    usd: session.cost?.usd ?? null, model: [session.model?.replace(/^claude-/, ''), session.effort].filter(Boolean).join(' · '),
  };
}
function drawRow(g, W, H, facts, seed, pal) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const pad = 8, h = H - pad * 2, widths = [580, 190, 190, 190, 192]; let x = pad;
  const at = widths.map(w => { const here = x; x += w + 10; return [here, w]; });
  if (facts === null) {
    const rnd = seeded(seed); g.globalAlpha = .4;
    at.forEach(([ax, w], i) => tile(g, ax, pad, w, h, (tw, th) => decor(g, tw, th, i === 0 ? 0 : [1, 4, 2, 0][i - 1], rnd, pal)));
    g.globalAlpha = 1; return;
  }
  if (facts === 'dark') return;
  const color = SIGNAL_COLOUR[facts.signal], rnd = seeded(facts.id);
  tile(g, at[0][0], pad, at[0][1], h, w => {
    g.fillStyle = color; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#0b0506'; g.font = font(700, 38); const label = `${facts.glyph} ${facts.label}`; g.fillText(label, 18, 41);
    g.textAlign = 'right'; g.font = font(600, 30); g.fillText(fit(g, facts.project.toUpperCase(), w - g.measureText(label).width - 60), w - 16, 40); g.textAlign = 'left';
    g.fillStyle = INK; g.font = font(600, 42);
    const left = facts.unread ? 44 : 18; if (facts.unread) { g.beginPath(); g.arc(28, 88, 9, 0, 7); g.fill(); }
    const y = wrap(g, facts.title, left, 102, w - left - 18, 46, 2);
    g.fillStyle = facts.signal === 'need' ? '#ffc4b6' : DIM; g.font = font(400, 28); g.fillText(fit(g, facts.line, w - 36), 18, Math.max(y + 4, 196));
  });
  tile(g, at[1][0], pad, at[1][1], h, w => {
    const plan = facts.plan, done = plan ? plan.filter(step => step === 'done').length : 0;
    g.fillStyle = Y; g.font = font(600, 30); g.fillText(plan ? `PLAN ${done}/${plan.length}` : 'NO PLAN', 16, 40);
    if (plan) { const each = Math.min(30, (h - 70) / plan.length); plan.forEach((step, i) => { g.fillStyle = step === 'done' ? Y : step === 'active' ? O : OFF; g.fillRect(16, 60 + i * each, w - 32, each - 8); }); return; }
    const faint = seeded(`${facts.id}p`);
    for (let i = 0; i < 12; i++) { g.fillStyle = faint() > .5 ? pal.mount : OFF; g.fillRect(16 + i % 3 * 54, 66 + Math.floor(i / 3) * 40, 44, 28); }
  });
  tile(g, at[2][0], pad, at[2][1], h, () => {
    g.fillStyle = Y; g.font = font(700, 62); g.fillText(facts.used ? `${Math.round(facts.used / 1000)}K` : '—', 16, 74);
    g.fillStyle = DIM; g.font = font(400, 24); g.fillText('CONTEXT', 16, 106);
    const n = 8, on = Math.round(Math.min(1, facts.fill) * n);
    for (let i = 0; i < n; i++) { g.fillStyle = i >= on ? OFF : O; g.fillRect(16 + i * 20, 124, 14, 90); }
  });
  tile(g, at[3][0], pad, at[3][1], h, (w, th) => decor(g, w, th, facts.signal === 'working' ? 0 : 1, rnd, pal));
  tile(g, at[4][0], pad, at[4][1], h, w => {
    g.fillStyle = O; g.font = font(700, 60); g.fillText(facts.glyph, 16, 72);
    if (facts.usd != null) { g.fillStyle = Y; g.font = font(600, 34); g.textAlign = 'right'; g.fillText(dollars(facts.usd), w - 16, 62); g.textAlign = 'left'; }
    g.fillStyle = INK; g.font = font(400, 26); wrap(g, facts.model, 16, 118, w - 28, 32, 3);
  });
}
function title(g, text, w, right, color = O) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, 999);
  g.fillStyle = color; g.font = font(700, 46); g.fillText(fit(g, text, w * .6), 28, 54);
  if (right) { g.fillStyle = DIM; g.font = font(400, 30); g.textAlign = 'right'; g.fillText(fit(g, right, w * .3), w - 28, 52); g.textAlign = 'left'; }
}
function drawEngineering(g, w, h, d) {
  title(g, d.mode === 'limit' ? 'ENGINE OFFLINE' : 'ENGINEERING', w, d.left, d.mode === 'limit' ? RED : O);
  const each = Math.min(72, (h - 84) / Math.max(1, d.rows.length));
  d.rows.forEach((row, i) => {
    const y = 84 + i * each, color = row.full ? RED : row.near ? ORANGE : O;
    g.fillStyle = INK; g.font = font(600, 36); g.fillText(fit(g, row.name, 220), 28, y + 34);
    g.fillStyle = color; g.font = font(600, 32); g.fillText(row.text, 266, y + 34);
    cells(g, 450, y + 8, w - 640, 30, row.used / 100, color);
    g.fillStyle = DIM; g.font = font(400, 28); g.textAlign = 'right'; g.fillText(row.left, w - 28, y + 34); g.textAlign = 'left';
  });
}
// Our own ship from above: a deck per project, a lamp per session, shuttles for subagents.
function drawDecks(g, w, h, d) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  const rows = d.decks.length || 1, rowH = Math.min(72, (h - 40 - (d.overflow ? 40 : 0)) / rows);
  d.decks.forEach((deck, i) => {
    const y = 20 + i * rowH;
    g.fillStyle = deck.alert ? RED : OFF; rr(g, 24, y + 5, 370, rowH - 12, (rowH - 12) / 2); g.fill();
    g.fillStyle = deck.alert ? '#100708' : INK; g.font = font(600, Math.min(36, rowH * .6)); g.fillText(fit(g, deck.name.toUpperCase(), 320), 50, y + rowH / 2 + 12);
    let x = 446;
    for (const signal of deck.lamps) { g.fillStyle = SIGNAL_COLOUR[signal]; g.beginPath(); g.arc(x, y + rowH / 2, Math.min(20, rowH * .3), 0, 7); g.fill(); x += 58; if (x > w - 30) break; }
    for (const signal of deck.shuttles) { if (x > w - 40) break; g.fillStyle = SIGNAL_COLOUR[signal]; const c = y + rowH / 2; g.beginPath(); g.moveTo(x, c - 15); g.lineTo(x + 32, c); g.lineTo(x, c + 15); g.closePath(); g.fill(); x += 50; }
  });
  if (d.overflow) { g.fillStyle = O; g.font = font(600, 34); g.textAlign = 'right'; g.fillText(`+${d.overflow}`, w - 28, h - 16); g.textAlign = 'left'; }
}
function drawShuttles(g, w, h, d) {
  title(g, d.shuttles.length ? 'SHUTTLES OUT' : 'ALL DOCKED', w, d.moreShuttles ? `+${d.moreShuttles}` : '');
  d.shuttles.forEach((s, i) => {
    const y = 86 + i * 92, color = SIGNAL_COLOUR[s.signal];
    g.fillStyle = color; g.beginPath(); g.moveTo(34, y + 8); g.lineTo(90, y + 34); g.lineTo(34, y + 60); g.closePath(); g.fill();
    g.fillStyle = INK; g.font = font(600, 38); g.fillText(fit(g, s.title, w - 140), 112, y + 32);
    g.fillStyle = color; g.font = font(400, 26); g.fillText(fit(g, `${s.label} · ${s.project}`.toUpperCase(), w - 140), 112, y + 66);
  });
}
function drawCredits(g, w, h, d) {
  title(g, 'CREDITS SPENT', w);
  g.fillStyle = Y; g.font = font(700, 44); g.textAlign = 'right'; g.fillText(dollars(d.total), w - 28, 54); g.textAlign = 'left';
  d.credits.forEach(([name, usd], i) => {
    const y = 108 + i * 52; g.fillStyle = INK; g.font = font(400, 34); g.fillText(fit(g, name, w - 200), 28, y);
    g.textAlign = 'right'; g.fillStyle = Y; g.fillText(dollars(usd), w - 28, y); g.textAlign = 'left';
  });
}
function drawNebula(g, w, h, pal, seed) {
  const hues = pal.tones.slice(1), rnd = seeded(seed); g.fillStyle = '#020104'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = w * (.2 + rnd() * .6), y = h * (.2 + rnd() * .6), r = 40 + rnd() * 150, grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `${hues[i % hues.length]}66`); grad.addColorStop(1, `${hues[i % hues.length]}00`); g.fillStyle = grad; g.fillRect(0, 0, w, h); }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${.3 + rnd() * .7})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
}
// The rear displays keep moving: a sweep, traces and a spectrum, in the room's neon.
function drawRadar(g, w, h, pal, t) {
  const cx = w / 2, cy = h / 2, r = h * .46, rnd = seeded('radar'), a = t * 1.2;
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  g.strokeStyle = pal.neon; g.lineWidth = 1.5; g.globalAlpha = .5;
  for (const k of [.33, .66, 1]) { g.beginPath(); g.arc(cx, cy, r * k, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  for (let i = 0; i < 16; i++) { g.globalAlpha = .07 * (16 - i) / 2; g.fillStyle = pal.neon; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a - i * .07 - .07, a - i * .07); g.fill(); }
  g.globalAlpha = 1; g.fillStyle = pal.tones[0];
  for (let i = 0; i < 9; i++) { const angle = rnd() * 6.283, d = r * (.2 + rnd() * .75); g.fillRect(cx + Math.cos(angle) * d - 2, cy + Math.sin(angle) * d - 2, 4, 4); }
}
function drawWave(g, w, h, pal, t) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h); g.lineWidth = 2.5;
  [pal.neon, pal.tones[1], pal.tones[0]].forEach((color, i) => {
    g.strokeStyle = color; g.beginPath();
    for (let x = 0; x <= w; x += 6) { const y = h * (.25 + i * .25) + Math.sin(x * (.02 + i * .012) + t * (2 + i)) * Math.sin(x * .006 - t) * h * .1; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  });
}
function drawSpectrum(g, w, h, pal, t) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  const n = 32, bw = w / n;
  for (let i = 0; i < n; i++) { const k = .2 + .4 * (.5 + .5 * Math.sin(i * .7 + t * 2.1)) + .35 * (.5 + .5 * Math.sin(i * .23 - t * 1.3)); g.fillStyle = i % 5 ? pal.neon : pal.tones[0]; g.fillRect(i * bw + 2, h * (1 - k * .9), bw - 4, h * k * .9); }
}
// The big alcove signs: one about the engines, one about hails.
function drawEngineSign(g, w, h, d) {
  const limit = d.mode === 'limit', at = d.warp > 0;
  g.fillStyle = limit ? '#e01f12' : BACK; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.fillStyle = limit ? '#2a0300' : at ? TEAL : d.offline ? DIM : Y; g.font = font(700, 118); g.fillText(d.left, w / 2, h / 2 + 12);
  g.font = font(600, 46); g.fillStyle = limit ? '#2a0300' : DIM; g.fillText(fit(g, d.engineLine, w - 60), w / 2, h / 2 + 88); g.textAlign = 'left';
}
function drawHailSign(g, w, h, d) {
  const waiting = d.right && !d.offline;
  g.fillStyle = waiting ? '#e01f12' : BACK; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.fillStyle = waiting ? '#fff5f2' : d.offline ? DIM : Y; g.font = font(700, 118); g.fillText(d.right || 'NO HAILS', w / 2, h / 2 + (waiting ? 8 : 40));
  if (waiting) { g.font = font(600, 46); g.fillText(fit(g, `NEXT ▸ ${d.rightName.toUpperCase()}`, w - 60), w / 2, h / 2 + 84); } g.textAlign = 'left';
}
function drawArm(g, w, h, d) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  const quiet = !d.waiting || d.offline;
  g.fillStyle = quiet ? d.warp ? TEAL : O : RED; g.font = font(700, 120); g.fillText(d.offline ? '–' : String(d.waiting), 18, 118);
  g.font = font(600, 42); g.fillStyle = INK; g.fillText(d.offline ? 'NO SIGNAL' : d.waiting ? 'WAITING' : 'ALL QUIET', 110, 62);
  g.fillStyle = DIM; g.font = font(400, 34); g.fillText(fit(g, d.offline ? '' : d.waiting ? `▸ ${d.rightName}` : d.warp ? `${d.warp} ON DUTY` : 'COASTING', w - 124), 110, 108);
}
function drawDial(g, w, h, d, pal) {
  const c = w / 2, r = w / 2 - 6;
  g.clearRect(0, 0, w, h);
  const grad = g.createRadialGradient(c, c, 0, c, c, r); grad.addColorStop(0, pal.trim); grad.addColorStop(.35, pal.console); grad.addColorStop(.72, pal.mount); grad.addColorStop(1, '#0a0c1c');
  g.fillStyle = grad; g.beginPath(); g.arc(c, c, r, 0, 7); g.fill();
  g.strokeStyle = '#111820'; g.lineWidth = 3; [.3, .55, .8, .98].forEach(k => { g.beginPath(); g.arc(c, c, r * k, 0, 7); g.stroke(); });
  for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283, k = i % 4 ? .92 : .84; g.beginPath(); g.moveTo(c + Math.cos(a) * r * k, c + Math.sin(a) * r * k); g.lineTo(c + Math.cos(a) * r * .98, c + Math.sin(a) * r * .98); g.stroke(); }
  d.signals.forEach((signal, i) => { if (!signal) return; const a = i / d.signals.length * 6.283 + .4, k = signal === 'need' ? .28 : signal === 'working' ? .55 : .78; g.fillStyle = SIGNAL_COLOUR[signal]; g.beginPath(); g.arc(c + Math.cos(a) * r * k, c + Math.sin(a) * r * k, signal === 'need' ? 15 : 11, 0, 7); g.fill(); });
}
function drawHelmPlate(g, w, h, text, color) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.font = font(700, 56); g.fillText(fit(g, text, w - 36), 20, 72);
}
function drawPlate(g, w, h, text) {
  g.fillStyle = BACK; g.fillRect(0, 0, w, h);
  g.fillStyle = O; g.font = font(600, h * .62); g.textAlign = 'center'; g.fillText(fit(g, text, w - 20), w / 2, h * .74); g.textAlign = 'left';
}
function drawComm(g, w, h, d) {
  g.fillStyle = '#100403'; g.fillRect(0, 0, w, h);
  if (d.mode === 'limit') {
    g.fillStyle = RED; g.textAlign = 'center'; g.font = font(700, 130); g.fillText('ALL STOP', w / 2, h / 2 - 12);
    g.fillStyle = INK; g.font = font(400, 50); g.fillText(fit(g, d.limitLine, w - 60), w / 2, h / 2 + 70); g.textAlign = 'left'; return;
  }
  if (!d.comm) return;
  g.fillStyle = RED; g.fillRect(0, 0, w, 84);
  g.fillStyle = '#140403'; g.font = font(700, 58); g.fillText(fit(g, `INCOMING HAIL · ${d.comm.project.toUpperCase()}`, w - 68), 34, 64);
  g.fillStyle = INK; g.font = font(600, 70); wrap(g, d.comm.ask, 34, 170, w - 68, 78, 2);
  g.font = font(400, 40); g.fillStyle = DIM; g.fillText(fit(g, d.comm.title, w - 68), 34, 316);
  if (d.waiting > 1) { g.fillStyle = '#ffb8a6'; g.font = font(400, 40); g.fillText(`+ ${d.waiting - 1} MORE WAITING`, 34, 368); }
}

// Everything but the live rear displays redraws only when what it shows has changed.
export function createDisplays(room, still = false) {
  const { panels } = room, drawn = new Map();
  let palette = null, facts = null, liveAt = -Infinity;
  const paint = (name, data, draw) => {
    const signature = JSON.stringify(data), panel = panels[name];
    if (drawn.get(name) === signature) return;
    drawn.set(name, signature); const { g, el, texture } = panel, { width, height } = el;
    g.save(); g.textAlign = 'left'; g.globalAlpha = 1; draw(g, width, height); g.restore(); texture.needsUpdate = true;
  };
  function live(t) {
    for (const [name, draw] of [['radar', drawRadar], ['wave', drawWave], ['spectrum', drawSpectrum]]) { const { g, el, texture } = panels[name]; g.save(); draw(g, el.width, el.height, palette, t); g.restore(); texture.needsUpdate = true; }
  }
  function draw() {
    if (!facts) return;
    const d = facts, pal = palette, helmColor = d.warp ? TEAL : O;
    room.stations.forEach((station, i) => paint(`row${i}`, d.rows[i], (g, w, h) => drawRow(g, w, h, d.rows[i], `bay${station.angle}`, pal)));
    paint('engineSign', [d.mode, d.warp, d.left, d.engineLine, d.offline], (g, w, h) => drawEngineSign(g, w, h, d));
    paint('hailSign', [d.right, d.rightName, d.offline], (g, w, h) => drawHailSign(g, w, h, d));
    paint('engineering', [d.mode, d.left, d.limitRows], (g, w, h) => drawEngineering(g, w, h, { mode: d.mode, left: d.left, rows: d.limitRows }));
    paint('decks', [d.decks, d.overflow], (g, w, h) => drawDecks(g, w, h, d));
    paint('shuttles', [d.shuttles, d.moreShuttles], (g, w, h) => drawShuttles(g, w, h, d));
    paint('credits', [d.total, d.credits], (g, w, h) => drawCredits(g, w, h, d));
    paint('nebula', 0, (g, w, h) => drawNebula(g, w, h, pal, 'nebula'));
    paint('arm', [d.waiting, d.warp, d.offline, d.rightName], (g, w, h) => drawArm(g, w, h, d));
    paint('dial', d.signals, (g, w, h) => drawDial(g, w, h, d, pal));
    paint('helmLeft', [d.warp], (g, w, h) => drawHelmPlate(g, w, h, d.warp ? `WARP ${d.warp}` : 'COASTING', helmColor));
    paint('helmRight', [d.offline, d.rightName, d.waiting], (g, w, h) => drawHelmPlate(g, w, h, d.offline ? 'NO SIGNAL' : d.waiting ? `▸ ${d.rightName.toUpperCase()}` : 'COURSE CLEAR', d.waiting && !d.offline ? RED : O));
    paint('door', d.machine, (g, w, h) => drawPlate(g, w, h, d.machine.toUpperCase()));
    paint('clock', d.clock, (g, w, h) => drawPlate(g, w, h, `SHIP TIME ${d.clock}`));
    paint('comm', [d.mode, d.limitLine, d.comm, d.waiting], (g, w, h) => drawComm(g, w, h, d));
    room.crystals.forEach((crystal, i) => {
      const row = d.crystals[i];
      crystal.material.color.copy(row ? (row.full ? crystal.full : row.near ? crystal.near : crystal.color) : crystal.off);
      crystal.mesh.scale.z = row ? .25 + .75 * Math.min(1, row.used / 100) : .25;
    });
  }
  return {
    update({ state, stations, overflow = 0, sessions, usage, machine, unread = () => false, now = Date.now() }) {
      const byId = new Map(sessions.map(session => [session.id, session])), quiet = session => state.offline ? 'idle' : signalOf(session), main = sessions.filter(session => !session.parentId), subs = sessions.filter(session => session.parentId);
      const limitRows = state.limits.map(limit => {
        const view = usageWindowView({ label: limit.window, usedPercent: limit.usedPercent, resetsAt: limit.resetsAt }, now);
        return { name: `${glyph(limit.provider)} ${(limit.label || limit.provider || '').toUpperCase()}`, text: `${view.shortLabel.toUpperCase()} ${Math.round(limit.usedPercent)}%`, used: view.expired ? 0 : limit.usedPercent, left: view.resetIn.toUpperCase(), near: limit.near, full: limit.full, label: limit.window };
      });
      const worst = [...limitRows].sort((a, b) => b.used - a.used), shown = limitRows.length > MAX_LIMIT_ROWS ? worst.slice(0, MAX_LIMIT_ROWS) : limitRows, full = worst.find(row => row.full);
      const projects = new Map();
      for (const session of main) { const name = session.project || 'Session'; if (!projects.has(name)) projects.set(name, { name, alert: false, lamps: [], shuttles: [] }); const deck = projects.get(name); const signal = quiet(session); deck.lamps.push(signal); deck.alert ||= signal === 'need'; }
      for (const session of subs) projects.get(session.project || 'Session')?.shuttles.push(quiet(session));
      const decks = [...projects.values()].sort((a, b) => b.alert - a.alert).slice(0, MAX_PROJECTS);
      const out = [...subs].sort((a, b) => ['need', 'working', 'idle'].indexOf(signalOf(a)) - ['need', 'working', 'idle'].indexOf(signalOf(b)));
      // Subagents share their parent's bill, so only main sessions count.
      const spent = main.filter(session => session.cost?.usd != null).sort((a, b) => b.cost.usd - a.cost.usd);
      const comm = state.next && !state.offline ? { project: state.next.project || '', ask: requestText(state.next) || 'Waiting for you', title: stationName(state.next) } : null;
      facts = {
        mode: state.mode, warp: state.warp, waiting: state.waiting, offline: state.offline, left: state.left, right: state.right, rightName: state.rightName, machine: machine || '', clock: clock(now),
        engineLine: state.offline ? 'RECONNECTING' : state.mode === 'limit' ? full ? `RESETS IN ${full.left}` : '' : state.warp ? `${state.warp} ON DUTY` : `SHIP TIME ${clock(now)}`,
        limitLine: full ? `${full.name} ${full.label.toUpperCase()} LIMIT REACHED · RESETS IN ${full.left}` : '',
        limitRows: shown, decks, overflow, shuttles: out.slice(0, MAX_SHUTTLES).map(session => ({ title: stationName(session), signal: quiet(session), label: state.offline ? 'NO SIGNAL' : LABELS[session.status] || 'STANDBY', project: session.project || '' })), moreShuttles: Math.max(0, out.length - MAX_SHUTTLES),
        total: spent.reduce((sum, session) => sum + session.cost.usd, 0), credits: spent.slice(0, 5).map(session => [stationName(session), session.cost.usd]),
        comm, crystals: worst.slice(0, room.crystals.length),
        signals: stationSignals(stations, sessions, state.offline),
        rows: stations.map(seat => { if (!seat) return null; const session = seat.goneAt == null && byId.get(seat.id); return session ? rowFacts(session, unread(session), state.offline) : 'dark'; }),
      };
      draw();
    },
    // At 10 Hz at most, whatever the frame rate.
    tickLive(t) {
      if (still || !palette || performance.now() - liveAt < LIVE_MS) return;
      liveAt = performance.now(); live(t);
    },
    // Same canvases, redrawn in the new colours.
    repaint(next) { palette = next; drawn.clear(); draw(); live(4); },
  };
}
