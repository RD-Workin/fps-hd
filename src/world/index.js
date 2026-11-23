// World module — "Citadelle de Port-Cassis": 10v10 terraced harbour town on 3 levels. Contract: ARCHITECTURE.md + world.md.
import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { Geo, grime, sway, groundMaterial, col } from './build.js';
import { BOUNDS, CORE_BOUNDS, SPAWNS, LABELS, NAV, CTF, GX0, GZ0, GW, GH, CELL } from './layout.js';
import { ALL_SITES, INSERTIONS, POSTS, OBJECTIVES, REGION } from './grand.js';
import { createTerrain, buildTerrain } from './terrain.js';
import { buildBuildings } from './buildings.js';
import { createKit } from './props.js';
import { buildShip } from './ship.js';
import { dressZones } from './zones.js';
import { dressGrand } from './grandZones.js';
import { extendKit } from './kit2.js';
import { buildAtmosphere, buildDistant, buildDust, buildComposer } from './env.js';
import { createShadowCache } from './shadowCache.js';
import { buildStoreys, storeyFloorAt, HOUSE_HOLDS } from './storeys.js';
import { createNight } from './night.js';

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
    if (o.floor || o.noNav) return;
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const f = T.floorAt(cx, cz);
    let h = o.navH ?? (f == null ? 12 : box.max.y - f);
    if (o.navH === 0 || (o.navH == null && box.min.y - (f ?? 0) > 1.7)) return; // overhead masses don't block walking
    navColliders.push({ box: new THREE.Box3(new THREE.Vector3(box.min.x, 0, box.min.z), new THREE.Vector3(box.max.x, Math.max(0.2, h), box.max.z)), material });
  }

  // ---------- content ----------
  buildTerrain(T, G, addSolid);
  buildBuildings(G, T, addSolid);
  const B3 = a => new THREE.Box3(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(a[3], a[4], a[5]));
  const storeyNav = buildStoreys(G, addSolid, B3, col);
  // floor under (x, z): with a height y, the storey of a multi-storey house the actor stands on (else the terrain)
  const floorAt = (x, z, y) => storeyFloorAt(x, z, y) ?? T.floorAt(x, z);
  const K = extendKit(createKit(G, Tx, T, physics, addSolid, scene));
  buildShip(K); dressZones(K); dressGrand(K);
  const { waterMat } = K.finish();
  buildDistant(G, scene);
  const noAO = [];
  const GB = { minX: -178, maxX: 178, minZ: -66, maxZ: 66 };
  const groundMat = groundMaterial(Tx, groundMask(T, navColliders, GB), GB);
  for (const k in G) {
    if (!G[k].p.length) continue;
    const m = G[k].mesh(k === 'groundTop' ? groundMat : MAT[k], { cast: k !== 'decal' && k !== 'glow' && k !== 'groundTop', receive: true });
    m.name = 'world_' + k; m.userData.static = true; scene.add(m);
    if (k === 'decal') { m.renderOrder = 1; noAO.push(m); }
  }
  // ground plane (level 0) + sea
  const gGeo = new Geo(2.4); const E = 300;
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
  const night = createNight(ctx, { atm, dust, post, glowMat: MAT.glow, lights: K.lights, floorAt: T.floorAt, noAO });
  scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) { o.updateMatrix(); o.updateMatrixWorld(true); } if (o.isMesh) o.userData.static = true; });

  // ---------- shadows: static map cached; dynamic casters (soldiers, bomb) composited over it at a capped rate on HIGH ----------
  // The world (~700 k shadow triangles) is rendered into the 4096 map ONCE (and on quality change). On HIGH, every 2nd
  // frame only the texels that moving casters touched are restored from a copy of that bake, then soldiers/bomb are drawn
  // on top (shadowCache.js). Before: the whole map was cleared and re-rendered every other frame (alternating heavy/light
  // frames = micro-stutter). LOW never refreshes (static shadows only).
  renderer.shadowMap.autoUpdate = false;
  const SH = createShadowCache(renderer, atm.sun, scene);
  let shadowDirty = true, frame = 0;
  function renderShadowsThisFrame() {
    frame++;
    if (shadowDirty) { SH.beginBake(); shadowDirty = false; return; }
    if (quality === 'high' && frame % 2 === 0) SH.beginDynamic();
  }

  // ---------- quality ----------
  let quality = 'high', maxPR = 1;
  function applyPixelRatio(pr) {
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
    post.composer.setPixelRatio(pr); post.composer.setSize(innerWidth, innerHeight);
  }
  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    const hi = quality === 'high';
    post.gtao.enabled = hi; post.bloom.enabled = hi;
    maxPR = hi ? Math.min(devicePixelRatio, 1.5) : 1; // PERF.md: LOW <= 1.0, HIGH <= 1.5
    DR.reset(maxPR); applyPixelRatio(maxPR);
    const sz = hi ? 4096 : 2048;
    if (atm.sun.shadow.mapSize.x !== sz) { atm.sun.shadow.mapSize.set(sz, sz); atm.sun.shadow.map?.dispose(); atm.sun.shadow.map = null; }
    SH.reset(); dust.visible = night.dustVisible(hi); shadowDirty = true;
    if (night.on) night.set(true, quality); // lamp light slots follow the quality (4 / 8)
    world.quality = quality;
  }
  // ---------- dynamic resolution (HIGH on HiDPI screens only): never below 1.0 (native CSS resolution) ----------
  // When the frame time stays above ~20 ms the supersampling is lowered by 0.25 steps, and raised back after a long calm
  // stretch (with a back-off so it does not oscillate). Resizes are rare: each step re-allocates the post-process targets.
  const DR = {
    pr: 1, acc: 0, n: 0, calm: 0, block: 0,
    reset(pr) { this.pr = pr; this.acc = 0; this.n = 0; this.calm = 0; this.block = 0; },
    tick(dt) {
      if (quality !== 'high' || maxPR <= 1 || ctx.paused) { this.acc = 0; this.n = 0; return; }
      this.acc += dt; this.n++; this.block = Math.max(0, this.block - dt);
      if (this.acc < 2) return;
      const ms = this.acc / this.n * 1000; this.acc = 0; this.n = 0;
      if (ms > 20 && this.pr > 1) { this.pr = Math.max(1, this.pr - 0.25); this.calm = 0; this.block = 30; applyPixelRatio(this.pr); }
      else if (ms < 17.5 && this.pr < maxPR && this.block <= 0) { if ((this.calm += 2) >= 10) { this.pr = Math.min(maxPR, this.pr + 0.25); this.calm = 0; applyPixelRatio(this.pr); } }
      else this.calm = 0;
    },
  };

  const V3 = (x, z) => new THREE.Vector3(x, T.floorAt(x, z) ?? 0, z);
  const toSpawn = s => ({ pos: V3(s.x, s.z), yaw: s.yaw });
  const allSites = ALL_SITES.map(s => ({ name: s.name, center: V3(s.x, s.z), radius: s.radius, zone: s.zone }));
  // ---------- objectives (Recherche & Destruction on the grand map) ----------
  // Each round activates 2 to 4 of the sites D A B C (adjacent ones); world.bombSites / world.spawns follow, so the game,
  // the bots and the HUD only ever see the active sites. ATK land on the coast in front of them, DEF start on their posts.
  function interleave(lists) { const out = [], n = Math.max(...lists.map(l => l.length)); for (let i = 0; i < n; i++) for (const l of lists) if (l[i]) out.push(l[i]); return out; }
  let objective = null;
  function setObjectives(o) {
    const set = typeof o === 'string' ? OBJECTIVES[2].find(x => x.sites.join('') === o) : o;
    objective = set || OBJECTIVES[2][0];
    world.bombSites = objective.sites.map(n => allSites.find(s => s.name === n));
    const atk = interleave(objective.insertion.map(k => INSERTIONS[k] || SPAWNS.ATK));
    const classic = objective.sites.length === 2 && objective.sites.includes('A') && objective.sites.includes('B');
    const def = classic ? SPAWNS.DEF : interleave(objective.sites.map(n => POSTS[n] || SPAWNS.DEF.filter(p => (n === 'A' ? p.x < -8 : p.x > -8))));
    world.spawns = { ATK: atk.map(toSpawn), DEF: def.map(toSpawn) };
    const xs = objective.sites.flatMap(n => REGION[n]);
    atm.fitShadow(Math.min(...xs) - 3, Math.max(...xs) + 3, -67, 59); shadowDirty = true;
    world.objective = { sites: [...objective.sites], insertion: [...objective.insertion] };
    ctx.events?.emit?.('world:objectives', world.objective);
    return world.objective;
  }
  const world = {
    bounds: { ...BOUNDS },
    coreBounds: { ...CORE_BOUNDS },
    spawns: { ATK: SPAWNS.ATK.map(toSpawn), DEF: SPAWNS.DEF.map(toSpawn) },
    bombSites: allSites.filter(s => s.name === 'A' || s.name === 'B'),
    allSites, objectives: OBJECTIVES, objective: { sites: ['A', 'B'], insertion: ['port'] },
    setObjectives,
    ctf: { bases: { ATK: V3(...CTF.bases.ATK), DEF: V3(...CTF.bases.DEF) }, lanes: CTF.lanes }, // Capture du drapeau
    minimap: { labels: LABELS, colliders: navColliders, floorAt },
    // storeys: per house {house, layers:[{k, y, rect, blocks}], portals:[{k, bottom, top}]} (bots/nav.js setLayers)
    // highHolds: window / roof positions {x, z, y, yaw, high, roof?, house} ; holdsHigh[site] = those within 50 m of a site
    nav: { ...NAV, colliders: navColliders, floorAt, storeys: storeyNav, highHolds: HOUSE_HOLDS,
      holdsHigh: Object.fromEntries(ALL_SITES.map(s => [s.name, HOUSE_HOLDS.filter(h => Math.hypot(h.x - s.x, h.z - s.z) < 50)])), grid: { x0: GX0, z0: GZ0, w: GW, h: GH, cell: CELL, rows: T.g.map(r => r.join('')) } },
    sun: atm.sun, quality, post, shadows: SH, // post / shadows: debug & perf bench access
    setQuality,
    // Ops de nuit: night lighting variant (see night.js). Changing it changes the light count -> shaders recompile:
    // call from the menu (main.js warms the shaders up again on 'world:night').
    get night() { return night.on; },
    nightRig: night,
    noAO, // transparent / fake-volume meshes other modules add (flashlight beams) must stay out of the AO pre-pass
    setNight(on) { night.set(on, quality); dust.visible = night.dustVisible(quality === 'high'); return night.on; },
    litAt: (p) => night.litAt(p),
    update(dt) {
      night.update(dt);
      uTime.value += dt;
      if (waterMat?.normalMap) waterMat.normalMap.offset.set(uTime.value * 0.02, uTime.value * 0.013);
      seaMat.normalMap.offset.set(uTime.value * 0.004, uTime.value * 0.006);
      post.grade.uniforms.uTime.value = uTime.value;
    },
    render(dt) {
      if (dt) DR.tick(dt);
      renderShadowsThisFrame();
      post.composer.render();
      SH.end();
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
