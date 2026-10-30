import * as THREE from 'three';
import './bridge.css';
import { Player, officeHasKeys, sceneFocused } from '../office/player.js';
import { walkGrid, findPath } from '../office/path.js';
import { VACANT_MS } from '../office/layout.js';
import { BridgeCamera } from './camera.js';
import { CENTER, ROOM, deckColliders, stationAt } from './deck.js';
import { createDisplays, stationName } from './displays.js';
import { createHologram } from './hologram.js';
import { createLights } from './lights.js';
import { PALETTES, SIGNALS, paletteFor, saveColour, savedColour } from './palettes.js';
import { createPost } from './post.js';
import { buildRoom } from './room.js';
import { assignStations, displayState, shipState, stationSignals } from './ship.js';
import { createSpace } from './space.js';

export function webglAvailable() {
  // three.js needs WebGL 2; the probe's context is released straight away.
  try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch { return false; }
}

// Where you start: at the captain's chair, facing the window.
const STANDING = { x: CENTER, y: 1.6, z: 8.72, yaw: 0, pitch: -.07 };
const PROJECTORS = { colour: 'Colours', waiting: 'Waiting' };
const shown = node => { for (let n = node; n; n = n.parent) if (!n.visible) return false; return true; };

export function mountBridge(container, hooks = {}, options = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = false; renderer.setClearColor(0, 1);
  const el = renderer.domElement; container.append(el);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, 1, .2, 34); camera.rotation.order = 'YXZ';
  const room = buildRoom(world, still), lights = createLights(world, room.glow, still), space = createSpace(still), post = createPost(renderer);
  room.stations.forEach((station, i) => station.lamps.push({ material: space.arcs[i], gain: 2.4, vacant: new THREE.Color(0) }));
  let broken = false, seats = null, last = null, latest = null, picked = null;
  const fired = new Map(); // session id → when it was fired from the panel
  const view = { ...STANDING, ...options.view };
  const place = () => { camera.position.set(view.x, view.y, view.z); camera.rotation.set(view.pitch, view.yaw, 0); camera.updateMatrixWorld(); };

  // The arms' projectors: colours on the right, who's waiting on the left.
  const projected = (x) => ({ from: new THREE.Vector3(x * .5, 1.12, -.05), at: new THREE.Vector3(x * .72, 1.72, -.62), still });
  const holograms = { colour: createHologram(room.group, projected(1)), waiting: createHologram(room.group, projected(-1)) };
  let colour = savedColour(), queue = [];
  const showColours = () => holograms.colour.show('COLOURS', Object.entries(PALETTES).map(([id, palette]) => ({ id, label: palette.name, swatch: [palette.wall, palette.trim, palette.neon], on: id === colour })));
  const showQueue = () => { if (queue.length) holograms.waiting.show(`${queue.length} WAITING`, queue.map(session => ({ id: session.id, label: stationName(session), swatch: [SIGNALS.need] }))); else holograms.waiting.hide(); };
  const showHologram = { colour: showColours, waiting: showQueue };
  const closeHolograms = () => { for (const hologram of Object.values(holograms)) hologram.hide(); };
  const chosen = { colour: ({ id }) => { colour = id; saveColour(id); repaint(paletteFor(id)); showColours(); }, waiting: ({ id }) => bridge.talkTo(id) };
  // A click belongs to an open hologram first, then to a projector's button; anywhere else it just closes what's open.
  function clickHologram(at) {
    aim(at);
    for (const [name, hologram] of Object.entries(holograms)) {
      const hit = hologram.at(ray); if (hit) { if (hit.row) chosen[name](hit.row); return true; }
    }
    const button = room.hologramAt(ray), wasOpen = button && holograms[button].open, anyOpen = Object.values(holograms).some(hologram => hologram.open);
    closeHolograms();
    if (button && !wasOpen) showHologram[button]();
    return !!button || anyOpen;
  }

  // Walking: the way round the deck is worked out once, as it never changes.
  const colliders = deckColliders(), grid = walkGrid(colliders, ROOM);
  const player = new Player(el, { colliders: () => colliders, room: () => ROOM, route: (from, to) => findPath(grid, from, to), onPick: at => {
    if (clickHologram(at)) return;
    const hit = under(at);
    if (hit?.kind === 'character') bridge.talkTo(hit.id);
    else if (hit?.kind === 'floor' && !look.overview) player.walkTo(hit.point);
  } });
  player.place(STANDING.x, STANDING.z, Math.PI); player.pitch = STANDING.pitch;
  const look = new BridgeCamera(camera, player, { reducedMotion: still, container });

  const displays = createDisplays(room, still);
  function repaint(palette) { room.repaint(palette); lights.repaint(palette); space.repaint(palette); displays.repaint(palette); container.style.setProperty('--bridge-accent', palette.trim); for (const hologram of Object.values(holograms)) hologram.paint(palette.tones[2], palette.tones[0]); }
  repaint(paletteFor(savedColour()));
  const setMode = state => { room.setMode(state); lights.setMode(state); space.setMode(state); };
  setMode({ mode: 'orbit', warp: 0, offline: false });
  // The canvases are drawn before the bundled font has loaded, and text drawn in a fallback stays that way.
  document.fonts?.load?.("700 40px Antonio").then(() => { if (!broken) repaint(paletteFor(savedColour())); }).catch(() => {});

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.25 : 1.5)); renderer.setSize(w, h, false);
    const drawn = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.resize(drawn.x, drawn.y); space.resize(drawn.x, drawn.y);
    camera.aspect = w / h; camera.fov = look.above.fov = h > w ? 90 : 68; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();

  // The colour buttons on the captain's right arm.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = event => {
    const box = el.getBoundingClientRect(); ndc.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  // What's under a screen point: the session at a station, the floor, or nothing. Hidden things (the ceiling in the overview, an
  // empty station's chair) and glass and glow are looked past. Office's `pick` stops at anything inside something hidden.
  function under(event) {
    aim(event);
    for (const { object, point } of ray.intersectObject(room.group, true)) {
      if (!shown(object) || object.material.transparent || !object.material.visible) continue;
      for (let node = object; node; node = node.parent) if (node.userData.sessionId) return { kind: 'character', id: node.userData.sessionId };
      return object.userData.floor ? { kind: 'floor', point } : null;
    }
    return null;
  }
  let hoverAt = 0;
  const onHover = event => {
    if (event.pointerType !== 'mouse' || event.timeStamp - hoverAt < 100 || event.buttons) return;
    hoverAt = event.timeStamp;
    aim(event);
    let row = null;
    for (const hologram of Object.values(holograms)) { const hit = hologram.at(ray); hologram.hover(hit?.row); row ||= hit?.row; }
    const button = row ? null : room.hologramAt(ray), hit = row || button ? null : under(event), session = hit?.kind === 'character' && last?.sessions?.find(({ id }) => id === hit.id);
    el.title = row ? row.label : button ? PROJECTORS[button] : session ? hooks.describe?.(session)?.title || stationName(session) : '';
    el.style.cursor = row || button || session ? 'pointer' : '';
  };
  el.addEventListener('pointermove', onHover);

  const bar = document.createElement('div'); bar.className = 'bridge-overlay'; container.append(bar);
  const button = (text, title, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; b.setAttribute('aria-label', title); b.onclick = onclick; bar.append(b); return b; };
  const next = button('', 'Next waiting (n)', () => bridge.talkTo(hooks.nextWaiting?.()?.id)); next.className = 'bridge-next'; next.hidden = true;
  button('☰', 'Show the list', () => hooks.showList?.());
  const eye = button('👁', 'Overview (Tab)', () => setOverview(!look.overview)); eye.setAttribute('aria-pressed', 'false');
  function setOverview(on) { if (on) closeHolograms(); look.setOverview(on); eye.setAttribute('aria-pressed', String(on)); }
  const onKey = event => {
    if (!officeHasKeys(event)) return;
    if (event.key === 'Tab' && sceneFocused(el)) { event.preventDefault(); if (!event.repeat) setOverview(!look.overview); }
    else if (event.key === 'Escape' && Object.values(holograms).some(hologram => hologram.open)) closeHolograms();
    else if (event.key === 'Escape' && look.overview) setOverview(false);
  };
  document.addEventListener('keydown', onKey);

  // Stations the sidebar's filter takes in stand out, and the others step back.
  const mark = () => {
    const taken = picked && new Set((last?.sessions || []).filter(picked).map(session => session.parentId || session.id));
    room.stations.forEach((station, i) => room.setMarked(i, !taken ? null : taken.has(seats?.[i]?.id)));
  };

  let raf = 0, lastFrame = performance.now(), T = 0;
  const stop = () => { broken = true; cancelAnimationFrame(raf); };
  const onLost = event => { event.preventDefault(); stop(); };
  el.addEventListener('webglcontextlost', onLost);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { lastFrame = now; return; }
    const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now; if (!still) T += dt;
    try {
      if (!look.overview) player.update(dt);
      look.update(dt);
      if (options.view) place();
      room.ceiling.visible = !look.amount;
      for (const hologram of Object.values(holograms)) hologram.tick(dt, T, camera);
      space.tick(dt, T); lights.tick(dt, T, space); room.tick(dt, T, camera); displays.tickLive(T);
      post.flash = space.flash; post.time = T; post.render(world, space.scene, camera);
    } catch (error) { console.error(error); stop(); }
  }
  raf = requestAnimationFrame(frame);

  const bridge = {
    // syncScene turns this throw into the fallback to the list.
    update(snapshot, { error } = {}) {
      if (broken) throw new Error('The bridge lost its graphics context');
      const now = Date.now();
      for (const [id, at] of fired) if (now - at > VACANT_MS + 10_000) fired.delete(id);
      // A session just fired leaves its station straight away, before the server has caught up.
      const sessions = (snapshot.sessions || []).filter(session => !fired.has(session.id)), live = { ...snapshot, sessions };
      const state = displayState(shipState(live, now), error), { stations, overflow } = assignStations(sessions, seats, now);
      seats = stations; last = live; latest = { snapshot, error };
      setMode(state);
      stationSignals(stations, sessions, state.offline).forEach((signal, i) => {
        room.setStation(i, signal);
        const seat = stations[i]; room.stations[i].group.userData.sessionId = seat && seat.goneAt == null ? seat.id : null;
      });
      displays.update({ state, stations, overflow, sessions, usage: snapshot.usage, machine: snapshot.machine, unread: hooks.isUnread, now });
      next.hidden = !state.waiting; next.textContent = `⚠ ${state.waiting}`;
      queue = state.queue; if (holograms.waiting.open) showQueue();
      mark();
    },
    unmount() {
      cancelAnimationFrame(raf); observer.disconnect();
      document.removeEventListener('keydown', onKey); el.removeEventListener('pointermove', onHover);
      player.dispose(); look.dispose(); bar.remove();
      for (const scene of [world, space.scene]) scene.traverse(object => {
        object.geometry?.dispose();
        for (const material of [object.material].flat()) { if (!material) continue; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); }
      });
      post.dispose(); renderer.dispose(); el.remove();
    },
    // main.js: a filter or project was picked in the sidebar (null: all sessions); from a click, rise to see them.
    pick(test, open) { picked = test; mark(); if (open) setOverview(true); },
    // main.js calls this when the session panel closes.
    panelClosed() { look.turnTo(null); },
    // Turn to their station, then their session opens beside the scene. Without a station (a crowded bridge), just the panel.
    talkTo(id) {
      if (!id) return;
      const parent = last?.sessions?.find(session => session.id === id)?.parentId;
      const index = seats?.findIndex(seat => seat && seat.goneAt == null && (seat.id === id || seat.id === parent)) ?? -1;
      closeHolograms();
      if (index >= 0) { const { x, z } = stationAt(index); setOverview(false); player.target = null; look.turnTo(x, z); }
      hooks.openPanel?.(id);
    },
    // Their session was just ended from the panel.
    fire(id) { fired.set(id, Date.now()); if (latest) bridge.update(latest.snapshot, { error: latest.error }); },
  };
  return bridge;
}
