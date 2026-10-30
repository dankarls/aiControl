import * as THREE from 'three';
import './bridge.css';

export function webglAvailable() {
  // three.js needs WebGL 2; the probe's context is released straight away.
  try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch { return false; }
}

export function mountBridge(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0x070716, 1);
  container.append(renderer.domElement);
  const resize = () => { renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false); renderer.clear(); };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  return {
    update() {},
    unmount() { observer.disconnect(); renderer.dispose(); renderer.domElement.remove(); },
    pick() {},
    panelClosed() {},
    talkTo() {},
    fire() {},
  };
}
