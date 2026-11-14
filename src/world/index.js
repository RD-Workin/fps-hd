// World module — "Citadelle de Port-Cassis": 10v10 terraced harbour town on 3 levels. Contract: ARCHITECTURE.md + world.md.
import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { Geo, grime, sway, groundMaterial } from './build.js';
import { BOUNDS, SPAWNS, SITES, LABELS, NAV, GX0, GZ0, GW, GH, CELL } from './layout.js';
import { createTerrain, buildTerrain } from './terrain.js';
import { buildBuildings } from './buildings.js';
import { createKit } from './props.js';
import { buildShip } from './ship.js';
import { dressZones } from './zones.js';
import { extendKit } from './kit2.js';
import { buildAtmosphere, buildDistant, buildDust, buildComposer } from './env.js';

export function createWorld(ctx) {
  const { scene, physics, renderer } = ctx;
  const Tx = buildTextures(renderer);
  const uTime = { value: 0 };
  renderer.toneMappingExposure = 1.22; // readability: bright, readable shade

  // ---------- materials (one merged mesh each) ----------
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const pbr = (t, o = {}) => std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, ...o });
  const MAT = {
    plaster: grime(pbr(Tx.plaster), { amount: 0.26 }),
    stone: grime(pbr(Tx.stone), { amount: 0.2, streak: 0.12 }),
    concrete: grime(pbr(Tx.concrete), { amount: 0.22, ground: 1.0 }),
    corr: grime(pbr(Tx.corrugated, { metalness: 0.35 }), { amount: 0.26, ground: 1.2, streak: 0.25 }),
    roof: pbr(Tx.roof),
    metal: pbr(Tx.metal, { metalness: 0.55 }),
    paint: pbr(Tx.metal, { metalness: 0.3 }),
    hull: grime(pbr(Tx.metal, { metalness: 0.45 }), { amount: 0.3, ground: 0.01, streak: 0.3, rust: 0.85 }),
    wood: pbr(Tx.crate),
    bark: pbr(Tx.bark),
    leaf: sway(std({ roughness: 0.92, emissive: 0x16240e }), uTime, { amp: 0.035, freq: 1.2, key: 'leaf', weight: '0.6' }),
    cloth: sway(std({ map: Tx.cloth, side: THREE.DoubleSide, roughness: 0.9 }), uTime, { amp: 0.06, key: 'cloth' }),
    frond: sway(std({ map: Tx.frond, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8 }), uTime, { amp: 0.12, freq: 1.4, key: 'frond', weight: 'uv.y' }),
    facade: std({ map: Tx.facade.map, normalMap: Tx.facade.normalMap, roughnessMap: Tx.facade.roughnessMap, alphaTest: 0.5, vertexColors: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    decal: std({ map: Tx.decals, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.9 }),
    glass: std({ roughness: 0.08, metalness: 0.6 }),
    glow: std({ color: 0xffffff, emissive: 0xffb860, emissiveIntensity: 3.0, roughness: 0.4 }),
  };
  const TILE = { plaster: 4, stone: 1.4, concrete: 4, corr: 2.4, roof: 2, metal: 1, paint: 1.5, hull: 3, wood: 1.2, bark: 1, leaf: 1, cloth: 1, frond: 1, facade: 1, decal: 1, glow: 1, glass: 1 };
  const G = {}; for (const k in MAT) G[k] = new Geo(TILE[k]);
  G.groundTop = new Geo(2.4);

  // ---------- colliders: physics + nav (heights relative to the local floor) ----------
  const T = createTerrain();
  const navColliders = [];
  function addSolid(box, material, o = {}) {
    if (!o.navOnly) physics.add(box, material, null);
    if (o.floor) return;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const f = T.floorAt(cx, cz);
    let h = o.navH ?? (f == null ? 12 : box.max.y - f);
    if (o.navH === 0 || (o.navH == null && box.min.y - (f ?? 0) > 1.7)) return; // overhead masses don't block walking
    navColliders.push({ box: new THREE.Box3(new THREE.Vector3(box.min.x, 0, box.min.z), new THREE.Vector3(box.max.x, Math.max(0.2, h), box.max.z)), material });
  }

  // ---------- content ----------
  buildTerrain(T, G, addSolid);
  buildBuildings(G, T, addSolid);
  const K = extendKit(createKit(G, Tx, T, physics, addSolid, scene));
  buildShip(K); dressZones(K);
  const { waterMat } = K.finish();
  buildDistant(G, scene);
  const noAO = [];
  const GB = { minX: -82, maxX: 82, minZ: -66, maxZ: 66 };
  const groundMat = groundMaterial(Tx, groundMask(T, navColliders, GB), GB);
  for (const k in G) {
    if (!G[k].p.length) continue;
    const m = G[k].mesh(k === 'groundTop' ? groundMat : MAT[k], { cast: k !== 'decal' && k !== 'glow' && k !== 'groundTop', receive: true });
    m.name = 'world_' + k; m.userData.static = true; scene.add(m);
    if (k === 'decal') { m.renderOrder = 1; noAO.push(m); }
  }
  // ground plane (level 0) + sea
  const gGeo = new Geo(2.4); const E = 160;
  gGeo.quad([-E, 0, 56], [E, 0, 56], [E, 0, -E], [-E, 0, -E], [0, 1, 0], [-E / 2.4, -56 / 2.4, E / 2.4, E / 2.4], [1, 1, 1]);
  const ground = gGeo.mesh(groundMat, { cast: false }); ground.name = 'world_ground'; ground.userData.static = true; scene.add(ground);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x2f6474, roughness: 0.1, metalness: 0.15, normalMap: Tx.sand.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) });
  seaMat.normalMap = Tx.sand.normalMap.clone(); seaMat.normalMap.repeat.set(40, 40); seaMat.normalMap.needsUpdate = true;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), seaMat); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.1, 306); sea.receiveShadow = true; sea.userData.static = true; scene.add(sea);

  // ---------- atmosphere / lights / post ----------
  const atm = buildAtmosphere(ctx);
  const dust = buildDust(scene, uTime);
  noAO.push(atm.sky, dust);
  const post = buildComposer(ctx, { noAO });
  scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) { o.updateMatrix(); o.updateMatrixWorld(true); } if (o.isMesh) o.userData.static = true; });

  // ---------- shadows: static map cached; dynamic casters (soldiers, bomb) refreshed at a capped rate on HIGH ----------
  renderer.shadowMap.autoUpdate = false;
  let shadowDirty = true, frame = 0;
  const _hidden = [];
  function renderShadowsThisFrame() {
    frame++;
    if (shadowDirty) { // static-only bake: hide dynamic casters for this one update
      scene.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.castShadow && !o.userData.static) { o.castShadow = false; _hidden.push(o); } });
      renderer.shadowMap.needsUpdate = true; shadowDirty = false; return;
    }
    if (quality === 'high' && frame % 2 === 0) renderer.shadowMap.needsUpdate = true;
  }

  // ---------- quality ----------
  let quality = 'high';
  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    const hi = quality === 'high';
    post.gtao.enabled = hi; post.bloom.enabled = hi;
    const pr = hi ? Math.min(devicePixelRatio, 1.5) : 1; // PERF.md: LOW <= 1.0, HIGH <= 1.5
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.composer.setPixelRatio(pr); post.composer.setSize(innerWidth, innerHeight);
    const sz = hi ? 4096 : 2048;
    if (atm.sun.shadow.mapSize.x !== sz) { atm.sun.shadow.mapSize.set(sz, sz); atm.sun.shadow.map?.dispose(); atm.sun.shadow.map = null; }
    dust.visible = hi; shadowDirty = true;
    world.quality = quality;
  }

  const V3 = (x, z) => new THREE.Vector3(x, T.floorAt(x, z) ?? 0, z);
  const world = {
    bounds: { ...BOUNDS },
    spawns: { ATK: SPAWNS.ATK.map(s => ({ pos: V3(s.x, s.z), yaw: s.yaw })), DEF: SPAWNS.DEF.map(s => ({ pos: V3(s.x, s.z), yaw: s.yaw })) },
    bombSites: SITES.map(s => ({ name: s.name, center: V3(s.x, s.z), radius: s.radius })),
    minimap: { labels: LABELS, colliders: navColliders, floorAt: T.floorAt },
    nav: { ...NAV, colliders: navColliders, floorAt: T.floorAt, grid: { x0: GX0, z0: GZ0, w: GW, h: GH, cell: CELL, rows: T.g.map(r => r.join('')) } },
    sun: atm.sun, quality,
    setQuality,
    update(dt) {
      uTime.value += dt;
      if (waterMat?.normalMap) waterMat.normalMap.offset.set(uTime.value * 0.02, uTime.value * 0.013);
      seaMat.normalMap.offset.set(uTime.value * 0.004, uTime.value * 0.006);
      post.grade.uniforms.uTime.value = uTime.value;
    },
    render() {
      renderShadowsThisFrame();
      post.composer.render();
      if (_hidden.length) { for (const o of _hidden) o.castShadow = true; _hidden.length = 0; }
    },
    resize(w, h) { post.composer.setSize(w, h); },
  };
  setQuality(quality);
  return world;
}

// R = sand amount, G = contact AO (obstacle footprints, parapets, building bases), drawn over the whole map.
function groundMask(T, cols, GB) {
  const PPM = 6, W = Math.round((GB.maxX - GB.minX) * PPM), H = Math.round((GB.maxZ - GB.minZ) * PPM);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const rect = (g, x0, z0, x1, z1) => g.fillRect((x0 - GB.minX) * PPM, (z0 - GB.minZ) * PPM, (x1 - x0) * PPM, (z1 - z0) * PPM);
  const sand = mk(), sg = sand.getContext('2d', { willReadFrequently: true }); sg.fillStyle = '#000'; sg.fillRect(0, 0, W, H); sg.filter = 'blur(8px)';
  sg.fillStyle = "#fff"; rect(sg, -70, -52, -34, -32); rect(sg, -42, -24, -26, -16); rect(sg, -62, -32, -56, -28);
  sg.fillStyle = "#8a8a8a"; rect(sg, 34, -50, 70, -28); rect(sg, -26, -60, 26, -36); rect(sg, -68, 14, -46, 30); rect(sg, 32, 8, 62, 28);
  sg.fillStyle = "#555"; rect(sg, -74, -28, -44, 0); rect(sg, -24, -26, 24, 2);
  const ao = mk(), ag = ao.getContext('2d', { willReadFrequently: true }); ag.fillStyle = '#fff'; ag.fillRect(0, 0, W, H); ag.filter = 'blur(4px)'; ag.fillStyle = '#000';
  for (const c of cols) { const b = c.box; const e = b.max.y > 2 ? 0.12 : 0.05; rect(ag, b.min.x - e, b.min.z - e, b.max.x + e, b.max.z + e); }
  const out = mk(), og = out.getContext('2d'), od = og.createImageData(W, H), sd = sg.getImageData(0, 0, W, H).data, ad = ag.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) { od.data[i * 4] = sd[i * 4]; od.data[i * 4 + 1] = ad[i * 4]; od.data[i * 4 + 2] = 0; od.data[i * 4 + 3] = 255; }
  og.putImageData(od, 0, 0);
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.NoColorSpace; return t;
}
