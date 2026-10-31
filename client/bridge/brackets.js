// Targeting brackets: four lit corners round whatever you're aimed at, on the sight's plane, so they take the room's glow.
import * as THREE from 'three';

const AWAY = .5, ARM = 12, THICK = 2, OUT = 6, NEAR_SLICE = 1e-4;
const clamp = value => THREE.MathUtils.clamp(value, -1, 1);

export const boxCorners = object => {
  const { min, max } = new THREE.Box3().setFromObject(object), out = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

// The corners' extent on screen, from -1 to 1 each way; null if none of it is in view. A box that reaches behind you is cut at the near
// plane, as a point behind the camera projects to the wrong side. The camera's matrices should be up to date.
export function bracketsFor(corners, camera) {
  const near = -camera.near - NEAR_SLICE, local = corners.map(corner => corner.clone().applyMatrix4(camera.matrixWorldInverse));
  const ahead = local.filter(({ z }) => z <= near); if (!ahead.length) return null;
  const points = [...ahead];
  for (const from of ahead) for (const to of local) if (to.z > near) points.push(from.clone().lerp(to, (near - from.z) / (to.z - from.z)));
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const point of points) {
    point.applyMatrix4(camera.projectionMatrix);
    left = Math.min(left, point.x); right = Math.max(right, point.x); bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
  }
  if (left > 1 || right < -1 || bottom > 1 || top < -1) return null;
  return { left: clamp(left), right: clamp(right), bottom: clamp(bottom), top: clamp(top) };
}

export function createBrackets(camera) {
  const group = new THREE.Group(); group.position.z = -AWAY; group.visible = false; group.renderOrder = 19; camera.add(group);
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), plane = new THREE.PlaneGeometry(1, 1);
  // A corner's two arms, each [which way across, which way up].
  const arms = [[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(corner => [true, false].map(along => { const mesh = new THREE.Mesh(plane, material); mesh.renderOrder = 19; group.add(mesh); return { mesh, corner, along }; }));
  let corners = null;
    return {
    // Also called a few times a second with the same thing, as a figure's pose changes its outline.
    aim(object) { corners = object && boxCorners(object); },
    paint(colour) { material.color.set(colour); },
    tick(height) {
      camera.updateMatrixWorld();
      const out = corners && bracketsFor(corners, camera); group.visible = !!out; if (!out) return;
      const halfY = AWAY * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), halfX = halfY * camera.aspect, px = 2 * halfY / height;
      for (const { mesh, corner: [cx, cy], along } of arms) {
        const x = (cx < 0 ? out.left : out.right) * halfX + cx * OUT * px, y = (cy < 0 ? out.bottom : out.top) * halfY + cy * OUT * px;
        mesh.scale.set(along ? ARM * px : THICK * px, along ? THICK * px : ARM * px, 1);
        mesh.position.set(x - (along ? cx * (ARM - THICK) / 2 * px : 0), y - (along ? 0 : cy * (ARM - THICK) / 2 * px), 0);
      }
    },
  };
}
