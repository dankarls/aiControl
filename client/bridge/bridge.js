import * as THREE from 'three';
import './bridge.css';
import { Player, menuOpen, officeHasKeys, sceneFocused } from '../office/player.js';
import { walkGrid, findPath } from '../office/path.js';
import { VACANT_MS } from '../office/layout.js';
import { BridgeCamera } from './camera.js';
import { CENTER, ROOM, deckColliders, stationAt } from './deck.js';
import { createDisplays, stationName } from './displays.js';
import { ROSTER, createHologram } from './hologram.js';
import { createLights } from './lights.js';
import { PALETTES, SIGNALS, paletteFor, saveColour, savedColour } from './palettes.js';
import { createPost } from './post.js';
import { createReticle } from './reticle.js';
import { buildRoom } from './room.js';
import { clickAction, screenPose } from './seat.js';
import { assignStations, displayState, shipState, signalOf, stationSignals } from './ship.js';
import { createSpace } from './space.js';

export function webglAvailable() {
  // three.js needs WebGL 2; the probe's context is released straight away.
  try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch { return false; }
}

// Where you start: in the captain's chair, facing the window. Everything here can be reached from it; walking about is optional.
const SEAT = { x: CENTER, y: 1.6, z: 8.72, yaw: 0, pitch: -.07 };
const PROJECTORS = { colour: 'Colours', crew: 'Sessions' };
const WALK = /^Key[WASD]$/;
const shown = node => { for (let n = node; n; n = n.parent) if (!n.visible) return false; return true; };

export function mountBridge(container, hooks = {}, options = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = false; renderer.setClearColor(0, 1);
  const el = renderer.domElement; container.append(el);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, 1, .2, 34); camera.rotation.order = 'YXZ';
  const room = buildRoom(world, still), lights = createLights(world, room.glow, still), space = createSpace(still), post = createPost(renderer);
  room.stations.forEach((station, i) => station.lamps.push({ material: space.arcs[i], gain: 2.4, vacant: new THREE.Color(0) }));
  let broken = false, seats = null, last = null, latest = null, picked = null, seated = true, zoomed = null, backKey = null;
  const fired = new Map(); // session id → when it was fired from the panel
  const view = { ...SEAT, ...options.view };
  const place = () => { camera.position.set(view.x, view.y, view.z); camera.rotation.set(view.pitch, view.yaw, 0); camera.updateMatrixWorld(); };

  // The arms' projectors: colours on the right, everyone on board on the left.
  const projected = (x) => ({ from: new THREE.Vector3(x * .5, 1.12, -.05), at: new THREE.Vector3(x * .72, 1.72, -.62), still });
  const phone = () => Math.min(container.clientWidth, container.clientHeight) <= 640;
  const holograms = { colour: createHologram(room.group, { ...projected(1), phone }), crew: createHologram(room.group, { ...projected(-1), ...ROSTER, phone, at: new THREE.Vector3(-.72, 1.66, -.62) }) };
  let colour = savedColour(), crew = [];
  const showColours = () => holograms.colour.show('COLOURS', Object.entries(PALETTES).map(([id, palette]) => ({ id, label: palette.name, swatch: [palette.wall, palette.trim, palette.neon], on: id === colour })));
  const showCrew = () => holograms.crew.show(crew.length ? `${crew.length} SESSIONS` : 'NO SESSIONS', crew.map(session => ({ id: session.id, label: stationName(session), swatch: [SIGNALS[signalOf(session)]] })));
  const showHologram = { colour: showColours, crew: showCrew };
  const closeHolograms = () => { for (const hologram of Object.values(holograms)) hologram.hide(); };
  const chosen = { colour: ({ id }) => { colour = id; saveColour(id); repaint(paletteFor(id)); showColours(); }, crew: ({ id }) => bridge.talkTo(id) };
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
  const player = new Player(el, { colliders: () => colliders, room: () => ROOM, route: (from, to) => findPath(grid, from, to), onPick: (at, mouse) => {
    if (!zoomed && !look.overview && clickHologram(at)) return;
    const hit = under(at), action = clickAction(hit, { seated, zoomed: !!zoomed, overview: look.overview, locked: player.locked, mouse });
    if (action === 'back') back();
    else if (action === 'talk') bridge.talkTo(hit.id);
    else if (action === 'zoom') zoom(hit.mesh);
    else if (action === 'sit') sit();
    else if (action === 'capture') player.lock();
    else if (action === 'walk') player.walkTo(hit.point);
  },
  // Esc while captured reaches us only as this. The window losing focus also calls it, and that shouldn't lose your place.
  onCancel: () => { if (!zoomed || !document.hasFocus()) return false; back(); return true; } });
  player.place(SEAT.x, SEAT.z, Math.PI); player.pitch = SEAT.pitch;
  const look = new BridgeCamera(camera, player, { reducedMotion: still, container });

  // Close up on a screen: you stay where you are, and only the view flies over.
  function zoom(mesh) { closeHolograms(); zoomed = { mesh, yaw: player.yaw, pitch: player.pitch }; player.setOverview(true); look.closing = true; }
  function back() { if (!zoomed) return; zoomed = null; player.setOverview(false); look.closing = false; }
  function sit() { closeHolograms(); player.flyTo(new THREE.Vector3(SEAT.x, 0, SEAT.z), new THREE.Vector3(CENTER, 0, 0), () => { seated = true; }, still, SEAT.pitch); }
  const leaveChair = () => { seated = false; player.walkTo(new THREE.Vector3(CENTER, 0, SEAT.z - .95)); };

  const reticle = createReticle(camera, still); world.add(camera);
  const displays = createDisplays(room, still);
  function repaint(palette) { room.repaint(palette); lights.repaint(palette); space.repaint(palette); displays.repaint(palette); container.style.setProperty('--bridge-accent', palette.trim); for (const painted of [...Object.values(holograms), reticle]) painted.paint(palette.tones[2], palette.tones[0]); }
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

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aim = event => {
    const box = el.getBoundingClientRect(); ndc.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  // What's under a screen point: a screen, the session at a station, the chair, the floor, or nothing. Hidden things (the ceiling in
  // the overview, an empty station's chair) and glass and glow are looked past. Office's `pick` stops at anything inside something hidden.
  function under(event) {
    aim(event);
    for (const { object, point } of ray.intersectObject(room.group, true)) {
      if (!shown(object)) continue;
      if (object.userData.screen) return { kind: 'screen', mesh: object, label: object.userData.screen };
      if (object.material.transparent || !object.material.visible) continue;
      for (let node = object; node; node = node.parent) {
        if (node.userData.sessionId) return { kind: 'character', id: node.userData.sessionId };
        if (node.userData.chair) return { kind: 'chair' };
      }
      return object.userData.floor ? { kind: 'floor', point } : null;
    }
    return null;
  }
  // What's under the pointer or, aiming, the sight: named by a tooltip or by the sight, a few times a second.
  let hoverIn = 0, mouseAt = null;
  const onMove = event => { if (event.pointerType === 'mouse') mouseAt = event.buttons ? null : { clientX: event.clientX, clientY: event.clientY }; };
  el.addEventListener('pointermove', onMove);
  function hover(dt) {
    hoverIn -= dt; if (hoverIn > 0) return; hoverIn = .1;
    const at = player.aiming ? player.centre : mouseAt; if (!at) return;
    aim(at);
    let row = null, onPanel = false;
    for (const hologram of Object.values(holograms)) { const hit = !zoomed && hologram.at(ray); hologram.hover(hit?.row); row ||= hit?.row; onPanel ||= !!hit; }
    const button = onPanel || zoomed || look.overview ? null : room.hologramAt(ray), hit = onPanel || button || zoomed ? null : under(at), session = hit?.kind === 'character' && last?.sessions?.find(({ id }) => id === hit.id);
    const name = row ? row.label : button ? PROJECTORS[button] : session ? hooks.describe?.(session)?.title || stationName(session) : look.overview ? null : hit?.kind === 'screen' ? hit.label : hit?.kind === 'chair' && !seated ? 'Sit' : null;
    reticle.aim(name); el.title = player.aiming ? '' : name || ''; el.style.cursor = name && !player.aiming ? 'pointer' : '';
  }

  const bar = document.createElement('div'); bar.className = 'bridge-overlay'; container.append(bar);
  const button = (text, title, onclick) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; b.setAttribute('aria-label', title); b.onclick = onclick; bar.append(b); return b; };
  const next = button('', 'Next waiting (n)', () => bridge.talkTo(hooks.nextWaiting?.()?.id)); next.className = 'bridge-next'; next.hidden = true;
  button('☰', 'Show the list', () => hooks.showList?.());
  const eye = button('👁', 'Overview (Tab)', () => setOverview(!look.overview)); eye.setAttribute('aria-pressed', 'false');
  // One button for getting out of whatever you're in: the close-up, then the chair; out of the chair it takes you back.
  const leave = button('', '', () => { if (zoomed) back(); else if (seated) leaveChair(); else sit(); leave.blur(); });
  const LEAVE = { back: ['✕ Back', 'Back (Esc)'], seated: ['⏏ Leave', 'Leave the chair (WASD)'], standing: ['Sit', 'Back to the chair'] };
  let leaveShows = null;
  function showLeave() {
    const state = zoomed ? 'back' : seated ? 'seated' : 'standing'; leave.hidden = look.overview;
    if (state === leaveShows) return; leaveShows = state;
    leave.textContent = LEAVE[state][0]; leave.title = LEAVE[state][1]; leave.setAttribute('aria-label', LEAVE[state][1]);
  }
  function setOverview(on) { if (on) { closeHolograms(); back(); player.unlock(); } look.setOverview(on); eye.setAttribute('aria-pressed', String(on)); }
  // The mouse is yours to take back when nothing else needs it (office.js does the same).
  const free = () => !document.body.classList.contains('panel-open') && !menuOpen() && !look.overview && document.hasFocus();
  let wasFree = true;
  const onKey = event => {
    if (!officeHasKeys(event)) return;
    if (!player.locked && player.wanted && /^(Key[WASD]|Arrow\w+|Space)$/.test(event.code) && free()) player.lock();
    if (zoomed && WALK.test(event.code)) { back(); backKey = event.code; } // this press only comes back; held on, it doesn't also walk you off
    else if (event.key === 'Tab' && sceneFocused(el)) { event.preventDefault(); if (!event.repeat) setOverview(!look.overview); }
    else if (event.key === 'Escape' && zoomed) back();
    else if (event.key === 'Escape' && Object.values(holograms).some(hologram => hologram.open)) closeHolograms();
    else if (event.key === 'Escape' && look.overview) setOverview(false);
  };
  const onKeyUp = event => { if (event.code === backKey) backKey = null; };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);

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
      if (player.locked && document.body.classList.contains('panel-open')) player.unlock();
      const nowFree = free(); if (nowFree && !wasFree) player.resume(); wasFree = nowFree;
      player.held.delete(backKey);
      if (seated && !player.flight && [...player.held].some(code => WALK.test(code))) seated = false;
      if (zoomed) {
        // The captured mouse still turns you, and you should come back facing as you were. A screen that moves or goes is followed.
        player.yaw = zoomed.yaw; player.pitch = zoomed.pitch;
        if (shown(zoomed.mesh)) look.focus = screenPose(zoomed.mesh, camera.fov, camera.aspect); else back();
      }
      if (!look.overview && !zoomed) player.update(dt);
      look.update(dt);
      if (options.view) place();
      room.ceiling.visible = !look.amount;
      showLeave(); hover(dt);
      reticle.show(player.aiming && !zoomed && !look.overview); reticle.tick(dt, container.clientHeight || 1);
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
      crew = state.roster; if (holograms.crew.open) showCrew();
      mark();
    },
    unmount() {
      stop(); observer.disconnect(); el.removeEventListener('webglcontextlost', onLost);
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); el.removeEventListener('pointermove', onMove);
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
      closeHolograms(); back();
      if (index >= 0) { const { x, z } = stationAt(index); setOverview(false); player.target = null; look.turnTo(x, z); }
      hooks.openPanel?.(id);
    },
    // Their session was just ended from the panel.
    fire(id) { fired.set(id, Date.now()); if (latest) bridge.update(latest.snapshot, { error: latest.error }); },
  };
  return bridge;
}
