// Spatial chunks for the static world (perf / 40c40, docs/PERF.md). The world module merges everything per material into
// map-wide meshes (world_stone, world_leaf…, ~350 m across): frustum culling could never skip any of them, so the colour
// pass and the AO pre-pass drew the whole map (~520 k triangles) whatever the view. Here each big static mesh is split
// into square tiles: one Mesh per (material, tile) that share the original vertex buffers (uploaded once) and only own
// an index buffer of their triangles + a tight bounding sphere. Instanced meshes are split the same way by instance.
// Done once after createWorld, before the shadow bake; nothing else changes (same materials, flags, userData).
import * as THREE from 'three';

// tile: m ; minTris: smaller meshes stay whole (a draw call costs more than their triangles)
export const CHUNK = { tile: 96, minExtent: 60, minTris: 15000, skip: new Set(['world_decal']) };

const _c = new THREE.Vector3(), _m = new THREE.Matrix4(), _b = new THREE.Box3(), _s = new THREE.Sphere();

export function chunkStatics(scene, opts = {}) {
  const tile = opts.tile ?? CHUNK.tile, stats = { meshes: 0, chunks: 0, instanced: 0 };
  const todo = [];
  scene.traverse(o => {
    if (!o.isMesh || !o.userData.static || o.isSkinnedMesh || CHUNK.skip.has(o.name) || o.parent !== scene) return;
    const g = o.geometry; if (!g.attributes.position || g.morphAttributes?.position) return;
    if (!g.boundingBox) g.computeBoundingBox();
    _b.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    if (Math.max(_b.max.x - _b.min.x, _b.max.z - _b.min.z) < CHUNK.minExtent) return;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    if (tris < (opts.minTris ?? CHUNK.minTris)) return;
    // instanced: only plain static props (no per-instance colour, not updated later, e.g. night light pools)
    if (o.isInstancedMesh ? o.count > 8 && !o.instanceColor && o.instanceMatrix.usage === THREE.StaticDrawUsage : g.groups.length === 0) todo.push(o);
  });
  for (const o of todo) {
    const parts = o.isInstancedMesh ? splitInstanced(o, tile) : splitMesh(o, tile);
    if (!parts || parts.length < 2) continue;
    const i = scene.children.indexOf(o);
    o.removeFromParent();
    for (const p of parts) {
      p.name = o.name; p.material = o.material; p.castShadow = o.castShadow; p.receiveShadow = o.receiveShadow;
      p.renderOrder = o.renderOrder; p.userData = { ...o.userData, chunkOf: o.name }; p.frustumCulled = o.frustumCulled;
      p.layers.mask = o.layers.mask; p.visible = o.visible;
      p.matrixAutoUpdate = false; p.matrix.copy(o.matrix); p.matrixWorld.copy(o.matrixWorld);
      p.onBeforeRender = o.onBeforeRender;
      scene.children.splice(i, 0, p); p.parent = scene;
    }
    stats.meshes++; stats.chunks += parts.length; if (o.isInstancedMesh) stats.instanced++;
  }
  return stats;
}

// triangles grouped by the tile of their centroid (world XZ); vertex buffers shared, one index buffer per tile
function splitMesh(o, tile) {
  const g = o.geometry, pos = g.attributes.position, idx = g.index, mw = o.matrixWorld;
  const triCount = (idx ? idx.count : pos.count) / 3;
  const v = k => (idx ? idx.getX(k) : k);
  const buckets = new Map();
  for (let t = 0; t < triCount; t++) {
    const a = v(3 * t), b = v(3 * t + 1), c = v(3 * t + 2);
    _c.set((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3).applyMatrix4(mw);
    const k = Math.floor(_c.x / tile) + ',' + Math.floor(_c.z / tile);
    let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(a, b, c);
  }
  if (buckets.size < 2) return null;
  const big = pos.count > 65535, out = [];
  for (const l of buckets.values()) {
    const ng = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) ng.setAttribute(name, attr); // shared, uploaded once
    ng.setIndex(new THREE.BufferAttribute(big ? Uint32Array.from(l) : Uint16Array.from(l), 1));
    // bounds of this tile's vertices only (computeBoundingSphere would use every vertex of the shared buffer)
    _b.makeEmpty(); for (const i of l) _b.expandByPoint(_c.fromBufferAttribute(pos, i));
    ng.boundingBox = _b.clone(); ng.boundingSphere = _b.getBoundingSphere(new THREE.Sphere());
    out.push(new THREE.Mesh(ng, o.material));
  }
  return out;
}

// instances grouped by the tile of their position; each tile gets its own InstancedMesh (same geometry and material)
function splitInstanced(o, tile) {
  const buckets = new Map();
  for (let i = 0; i < o.count; i++) {
    o.getMatrixAt(i, _m); _c.setFromMatrixPosition(_m).applyMatrix4(o.matrixWorld);
    const k = Math.floor(_c.x / tile) + ',' + Math.floor(_c.z / tile);
    let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(i);
  }
  if (buckets.size < 2) return null;
  const out = [];
  for (const l of buckets.values()) {
    const m = new THREE.InstancedMesh(o.geometry, o.material, l.length);
    l.forEach((src, j) => {
      o.getMatrixAt(src, _m); m.setMatrixAt(j, _m);
      if (o.instanceColor) { o.getColorAt(src, _tmpCol); m.setColorAt(j, _tmpCol); }
    });
    m.computeBoundingSphere();
    out.push(m);
  }
  return out;
}
const _tmpCol = new THREE.Color();
