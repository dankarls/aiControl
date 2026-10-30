import * as THREE from 'three';
import './bridge.css';
import { createLights } from './lights.js';
import { PALETTES, paletteFor, saveColour, savedColour } from './palettes.js';
import { createPost } from './post.js';
import { buildRoom } from './room.js';
import { createSpace } from './space.js';

export function webglAvailable() {
  // three.js needs WebGL 2; the probe's context is released straight away.
  try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch { return false; }
}

const STANDING = { x: 8, y: 1.6, z: 8.72, yaw: 0, pitch: -.07 };

export function mountBridge(container, hooks = {}, options = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = false; renderer.setClearColor(0, 1);
  const el = renderer.domElement; container.append(el);
  const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, 1, .2, 34); camera.rotation.order = 'YXZ';
  const room = buildRoom(world, still), lights = createLights(world, room.glow, still), space = createSpace(still), post = createPost(renderer);
  room.stations.forEach((station, i) => station.lamps.push({ material: space.arcs[i], gain: 2.4, vacant: new THREE.Color(0) }));
  const view = { ...STANDING, ...options.view };
  const place = () => { camera.position.set(view.x, view.y, view.z); camera.rotation.set(view.pitch, view.yaw, 0); camera.updateMatrixWorld(); };

  function repaint(palette) { room.repaint(palette); lights.repaint(palette); space.repaint(palette); }
  repaint(paletteFor(savedColour()));
  const state = options.state || { mode: 'orbit', warp: 0, offline: false };
  (options.statuses || []).forEach((status, i) => room.setStation(i, status));
  room.setMode(state); lights.setMode(state); space.setMode(state);

  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.25 : 1.5)); renderer.setSize(w, h, false);
    const drawn = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.resize(drawn.x, drawn.y); space.resize(drawn.x, drawn.y);
    camera.aspect = w / h; camera.fov = h > w ? 90 : 68; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();

  // The colour buttons on the captain's right arm.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const buttonAt = event => {
    const box = el.getBoundingClientRect(); ndc.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
    ray.setFromCamera(ndc, camera); return room.colourAt(ray);
  };
  const onClick = event => { const name = buttonAt(event); if (name) { saveColour(name); repaint(paletteFor(name)); } };
  const onHover = event => { if (event.pointerType !== 'mouse') return; const name = buttonAt(event); el.title = name ? PALETTES[name].name : ''; el.style.cursor = name ? 'pointer' : ''; };
  el.addEventListener('click', onClick); el.addEventListener('pointermove', onHover);

  let broken = false, raf = 0, last = performance.now(), T = 0;
  const stop = () => { broken = true; cancelAnimationFrame(raf); };
  const onLost = event => { event.preventDefault(); stop(); };
  el.addEventListener('webglcontextlost', onLost);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000); last = now; if (!still) T += dt;
    try {
      place();
      space.tick(dt, T); lights.tick(dt, T, space); room.tick(dt, T, camera);
      post.flash = space.flash; post.time = T; post.render(world, space.scene, camera);
    } catch (error) { console.error(error); stop(); }
  }
  raf = requestAnimationFrame(frame);

  return {
    // syncScene turns this throw into the fallback to the list.
    update() { if (broken) throw new Error('The bridge lost its graphics context'); },
    unmount() {
      cancelAnimationFrame(raf); observer.disconnect();
      for (const scene of [world, space.scene]) scene.traverse(object => {
        object.geometry?.dispose();
        for (const material of [object.material].flat()) { if (!material) continue; for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); }
      });
      post.dispose(); renderer.dispose(); el.remove();
    },
    pick() {},
    panelClosed() {},
    talkTo() {},
    fire() {},
  };
}
