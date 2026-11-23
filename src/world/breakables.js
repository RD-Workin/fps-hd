// Destructible boards, site fences and doors (étape 4 « murs cassables »). Each one is a small separate mesh plus one
// physics collider and one nav collider. Bullets (player and bots) chip at its HP through the 'weapon:impact' event;
// at 0 it bursts into splinters: collider removed, nav cells re-opened (bots route through the breach), minimap rebuilt
// (its static layer keys on the nav collider count). Everything is restored at each round start.
// Breakables do not cast sun shadows (the static shadow map is baked once; see shadowCache.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ax: the axis the panel runs along ('x' = spans x at z = p, 'z' = spans z at x = p); a..b its extent.
// kind: planks (boarded opening, 2.6 m), fence (site hoarding, 2.1 m), door (2.2 m).
export const BREAKABLES = [
  // Vieille-Ville (grand.js v6)
  { kind: 'planks', ax: 'z', p: -136, a: 32, b: 36 },      // Halle aux poissons, west door (from the Cour des Pêcheurs)
  { kind: 'planks', ax: 'x', p: 39, a: -122, b: -120 },    // Halle aux poissons, small south door
  { kind: 'fence', ax: 'z', p: -162, a: 30, b: 34 },       // west passage <-> Cour des Pêcheurs
  { kind: 'door', ax: 'z', p: -101, a: 6, b: 8 },          // Café du Marché, back door (east street)
  { kind: 'fence', ax: 'x', p: -19, a: -100, b: -94 },     // east lane (Notable -> Rue de l'Église)
  { kind: 'fence', ax: 'z', p: -153, a: -22, b: -14 },     // Jardins du Cloître <-> Parvis
];
const SPEC = {
  planks: { h: 2.6, t: 0.14, hp: 160, hex: 0x8a6440 },
  fence: { h: 2.1, t: 0.1, hp: 110, hex: 0x7d7a6e },
  door: { h: 2.2, t: 0.1, hp: 120, hex: 0x6d4b2e },
};

export function createBreakables(ctx, { T, navColliders, Tx }) {
  const { scene, physics, events } = ctx;
  const mat = new THREE.MeshStandardMaterial({ map: Tx.crate.map, normalMap: Tx.crate.normalMap, roughnessMap: Tx.crate.roughnessMap, vertexColors: true });
  const metal = new THREE.MeshStandardMaterial({ map: Tx.corrugated?.map, normalMap: Tx.corrugated?.normalMap, metalness: 0.35, vertexColors: true });
  const list = [];
  const box = (geos, x0, y0, z0, x1, y1, z1, hex) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const c = new THREE.Color(hex), n = g.attributes.position.count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geos.push(g);
  };
  for (const d of BREAKABLES) {
    const S = SPEC[d.kind], alongX = d.ax === 'x', mid = (d.a + d.b) / 2;
    const Y = T.floorAt(alongX ? mid : d.p + 0.6, alongX ? d.p + 0.6 : mid) ?? T.floorAt(alongX ? mid : d.p, alongX ? d.p : mid) ?? 0;
    const R = (a, b, y0, y1, w0, w1) => (alongX ? [a, y0, d.p + w0, b, y1, d.p + w1] : [d.p + w0, y0, a, d.p + w1, y1, b]);
    const geos = [], t = S.t;
    if (d.kind === 'planks') { // uneven horizontal boards nailed over the opening + two battens
      for (let y = Y + 0.1, k = 0; y < Y + S.h - 0.1; y += 0.34, k++) { const s = (k % 3) * 0.06; box(geos, ...R(d.a - 0.1 + s, d.b + 0.1 - s, y, y + 0.28, -t / 2, t / 2), 0x8a6440 + (k % 2) * 0x0a0806); }
      for (const u of [d.a + 0.35, d.b - 0.35]) box(geos, ...R(u - 0.07, u + 0.07, Y, Y + S.h, t / 2, t / 2 + 0.05), 0x5b3f26);
    } else if (d.kind === 'door') { // plank door + frame
      box(geos, ...R(d.a + 0.05, d.b - 0.05, Y, Y + S.h, -t / 2, t / 2), S.hex);
      for (const y of [Y + 0.4, Y + S.h - 0.5]) box(geos, ...R(d.a + 0.1, d.b - 0.1, y, y + 0.12, t / 2, t / 2 + 0.04), 0x4a3320);
    } else { // site hoarding: posts + painted panels
      box(geos, ...R(d.a, d.b, Y, Y + S.h, -t / 2, t / 2), 0x9aa08a);
      for (let u = d.a; u <= d.b + 0.01; u += Math.max(1, (d.b - d.a) / Math.round(d.b - d.a))) box(geos, ...R(u - 0.05, u + 0.05, Y, Y + S.h + 0.1, -0.1, 0.1), 0x4e5448);
      box(geos, ...R(d.a, d.b, Y + 0.9, Y + 1.2, t / 2, t / 2 + 0.01), 0xd9b23a);
    }
    // what is left after the burst: splintered stubs along the bottom and a board hanging from one batten
    const rem = [];
    for (let u = d.a + 0.15; u < d.b - 0.1; u += 0.32 + Math.random() * 0.2) box(rem, ...R(u, u + 0.12 + Math.random() * 0.1, Y, Y + 0.08 + Math.random() * 0.26, -t / 2, t / 2), d.kind === 'fence' ? 0x4e5448 : 0x6d4b2e);
    if (d.kind !== 'door') { const u = d.a + 0.1; box(rem, ...R(u, u + 0.22, Y + S.h - 1.3, Y + S.h - 0.1, -t / 2, t / 2), d.kind === 'fence' ? 0x9aa08a : 0x8a6440); }
    const remMesh = new THREE.Mesh(mergeGeometries(rem, false), d.kind === 'fence' ? metal : mat); rem.forEach(g => g.dispose());
    remMesh.visible = false; remMesh.receiveShadow = true; scene.add(remMesh);
    const geo = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(geo, d.kind === 'fence' ? metal : mat); mesh.castShadow = false; mesh.receiveShadow = true;
    scene.add(mesh);
    const bb = R(d.a, d.b, Y, Y + S.h, -t / 2 - 0.02, t / 2 + 0.02);
    const b3 = new THREE.Box3(new THREE.Vector3(bb[0], bb[1], bb[2]), new THREE.Vector3(bb[3], bb[4], bb[5]));
    const phys = { box: b3, material: 'wood', mesh: null };
    const nav = { box: new THREE.Box3(new THREE.Vector3(bb[0], 0, bb[2]), new THREE.Vector3(bb[3], S.h, bb[5])), material: 'wood' };
    const B = { ...d, Y, mesh, remMesh, phys, nav, hp: S.hp, max: S.hp, broken: false, b3 };
    phys.breakable = B;
    list.push(B);
  }

  function attach(B) {
    if (!physics.colliders.includes(B.phys)) physics.colliders.push(B.phys);
    if (!navColliders.includes(B.nav)) navColliders.push(B.nav);
  }
  function detach(B) {
    let i = physics.colliders.indexOf(B.phys); if (i >= 0) physics.colliders.splice(i, 1);
    i = navColliders.indexOf(B.nav); if (i >= 0) navColliders.splice(i, 1);
  }
  const reNav = (B) => {
    const n = ctx.bots?.nav, b = B.b3; if (!n?.reblock) return;
    try { n.reblock(b.min.x - 1, b.min.z - 1, b.max.x + 1, b.max.z + 1, navColliders); } catch (e) { console.warn('[breakables] nav', e); }
    n.clearPathCache?.();
  };
  const _p = new THREE.Vector3(), _n = new THREE.Vector3();
  function burst(B) {
    B.broken = true; B.mesh.visible = false; B.remMesh.visible = true; detach(B); reNav(B);
    const fx = ctx.effects, b = B.b3, alongX = B.ax === 'x';
    if (fx?.impact) for (let k = 0; k < 10; k++) {
      _p.set(b.min.x + Math.random() * (b.max.x - b.min.x), b.min.y + 0.2 + Math.random() * (b.max.y - b.min.y - 0.4), b.min.z + Math.random() * (b.max.z - b.min.z));
      _n.set(alongX ? 0 : (Math.random() < 0.5 ? -1 : 1), 0.2, alongX ? (Math.random() < 0.5 ? -1 : 1) : 0).normalize();
      fx.impact(_p.clone(), _n.clone(), 'wood');
    }
    events?.emit?.('world:breach', { kind: B.kind, x: (b.min.x + b.max.x) / 2, z: (b.min.z + b.max.z) / 2 });
  }
  function restore() {
    for (const B of list) {
      B.hp = B.max; B.mesh.visible = true; B.remMesh.visible = false;
      if (B.broken) { B.broken = false; attach(B); reNav(B); }
    }
  }
  for (const B of list) attach(B);

  events?.on?.('weapon:impact', (e) => {
    const B = e?.collider?.breakable; if (!B || B.broken) return;
    B.hp -= e.dmg ?? 25;
    if (B.hp <= 0) burst(B);
  });
  events?.on?.('round:start', restore);
  return { list, restore, hit: (B, dmg) => { if (!B.broken) { B.hp -= dmg; if (B.hp <= 0) burst(B); } } };
}
