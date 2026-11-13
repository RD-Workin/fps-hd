// STUB — replaced by the world agent. See ARCHITECTURE.md.
import * as THREE from 'three';
export function createWorld(ctx) {
  const { scene, physics, renderer, camera } = ctx;
  scene.background = new THREE.Color(0x88aacc);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.5));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 100), new THREE.MeshStandardMaterial({ color: 0x777777 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const box = (x, z, w, d, h = 3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xaa9977 }));
    m.position.set(x, h / 2, z); scene.add(m);
    physics.add(new THREE.Box3().setFromObject(m), 'concrete', m);
  };
  box(0, -45, 100, 1); box(0, 45, 100, 1); box(-50, 0, 1, 90); box(50, 0, 1, 90); box(0, 0, 8, 8); box(-20, -10, 4, 4, 1.2);
  return {
    bounds: { minX: -50, maxX: 50, minZ: -45, maxZ: 45 },
    spawns: {
      ATK: [0, 1, 2, 3, 4].map(i => ({ pos: new THREE.Vector3(-4 + i * 2, 0, 38), yaw: 0 })),
      DEF: [0, 1, 2, 3, 4].map(i => ({ pos: new THREE.Vector3(-4 + i * 2, 0, -38), yaw: Math.PI })),
    },
    bombSites: [
      { name: 'A', center: new THREE.Vector3(-30, 0, -20), radius: 6 },
      { name: 'B', center: new THREE.Vector3(30, 0, -20), radius: 6 },
    ],
    update() {},
    render() { renderer.render(scene, camera); },
    resize() {},
  };
}
