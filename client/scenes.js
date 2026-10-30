// The themes that replace the list with a 3D scene, each downloaded only once it is chosen.
const table = {
  office: { name: 'Office', load: () => import('./office/office.js').then(module => ({ webglAvailable: module.webglAvailable, mount: module.mountOffice })) },
  bridge: { name: 'Bridge', load: () => import('./bridge/bridge.js').then(module => ({ webglAvailable: module.webglAvailable, mount: module.mountBridge })) },
};
export const sceneFor = look => table[look] || null;
// What to do given the look mounted now and the one wanted (null without a scene). A colour option of the same look keeps its scene.
export function sceneAction(mounted, look, list) {
  const wanted = list ? null : look;
  if (!mounted) return wanted ? 'mount' : 'none';
  if (!wanted) return 'unmount';
  return mounted === wanted ? 'keep' : 'swap';
}
