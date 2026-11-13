// World module — "Opération Nova": Mediterranean / docks town at golden hour. Contract: ARCHITECTURE.md "Map contract".
import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { Geo, grime, sway, groundMaterial } from './build.js';
import { BOUNDS, SPAWNS, SITES, LABELS, NAV } from './layout.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { buildAtmosphere, buildDistant, buildDust, buildComposer } from './env.js';

export function createWorld(ctx) {
  const { scene, physics, renderer, camera } = ctx;
  const T = buildTextures(renderer);
  const uTime = { value: 0 };
  renderer.toneMappingExposure = 1.0;

  // ---------- materials (one merged mesh each) ----------
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const pbr = (t, o = {}) => std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, ...o });
  const MAT = {
    plaster: grime(pbr(T.plaster), { amount: 0.3 }),
    stone: grime(pbr(T.stone), { amount: 0.22, streak: 0.15 }),
    concrete: grime(pbr(T.concrete), { amount: 0.25, ground: 1.0 }),
    corr: grime(pbr(T.corrugated, { metalness: 0.35 }), { amount: 0.3, ground: 1.2, streak: 0.3 }),
    roof: pbr(T.roof),
    metal: pbr(T.metal, { metalness: 0.55 }),
    paint: pbr(T.metal, { metalness: 0.3 }),
    wood: pbr(T.crate),
    bark: pbr(T.bark),
    cloth: sway(std({ map: T.cloth, side: THREE.DoubleSide, roughness: 0.9 }), uTime, { amp: 0.06, key: 'cloth' }),
    frond: sway(std({ map: T.frond, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8 }), uTime, { amp: 0.12, freq: 1.4, key: 'frond', weight: 'uv.y' }),
    facade: std({ map: T.facade.map, normalMap: T.facade.normalMap, roughnessMap: T.facade.roughnessMap, alphaTest: 0.5, vertexColors: false }),
    decal: std({ map: T.decals, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.9 }),
    glass: std({ roughness: 0.08, metalness: 0.6 }),
    glow: std({ color: 0xffffff, emissive: 0xffb860, emissiveIntensity: 3.0, roughness: 0.4 }),
  };
  const TILE = { plaster: 4, stone: 2, concrete: 4, corr: 2.4, roof: 2, metal: 1, paint: 1.5, wood: 1.2, bark: 1, cloth: 1, frond: 1, facade: 1, decal: 1, glow: 1, glass: 1 };
  const G = {}; for (const k in MAT) G[k] = new Geo(TILE[k]);

  // ---------- content ----------
  buildBuildings(G, physics);
  const { waterMat } = buildProps(G, T, physics, scene, uTime);
  buildDistant(G, scene);
  const noAO = [];
  for (const k in G) {
    if (!G[k].p.length) continue;
    const m = G[k].mesh(MAT[k], { cast: k !== 'decal' && k !== 'glow', receive: true });
    m.name = 'world_' + k; scene.add(m);
    if (k === 'decal') { m.renderOrder = 1; noAO.push(m); }
  }

  // ---------- ground: pavers / sand mask + baked contact AO ----------
  const GB = { minX: -58, maxX: 58, minZ: -48, maxZ: 48 };
  const maskTex = groundMask(physics, GB);
  const gGeo = new Geo(3); const E = 140;
  gGeo.quad([-E, 0, E], [E, 0, E], [E, 0, -E], [-E, 0, -E], [0, 1, 0], [-E / 2.4, -E / 2.4, E / 2.4, E / 2.4], [1, 1, 1]);
  const ground = gGeo.mesh(groundMaterial(T, maskTex, GB), { cast: false }); ground.name = 'world_ground'; scene.add(ground);

  // ---------- atmosphere / lights / post ----------
  const atm = buildAtmosphere(ctx);
  const dust = buildDust(scene, uTime);
  noAO.push(atm.sky, dust);
  const post = buildComposer(ctx, { noAO });
  scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) { o.updateMatrix(); o.updateMatrixWorld(true); } });

  // ---------- quality ----------
  let quality = 'high';
  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    const hi = quality === 'high';
    post.gtao.enabled = hi; post.bloom.enabled = hi;
    const pr = hi ? Math.min(devicePixelRatio, 1.75) : 1;
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); post.composer.setPixelRatio(pr); post.composer.setSize(innerWidth, innerHeight);
    const sz = hi ? 4096 : 2048;
    if (atm.sun.shadow.mapSize.x !== sz) { atm.sun.shadow.mapSize.set(sz, sz); atm.sun.shadow.map?.dispose(); atm.sun.shadow.map = null; }
    dust.visible = hi;
    world.quality = quality;
  }

  const V3 = (x, z) => new THREE.Vector3(x, 0, z);
  const world = {
    bounds: { ...BOUNDS },
    spawns: { ATK: SPAWNS.ATK.map(s => ({ pos: V3(s.x, s.z), yaw: s.yaw })), DEF: SPAWNS.DEF.map(s => ({ pos: V3(s.x, s.z), yaw: s.yaw })) },
    bombSites: SITES.map(s => ({ name: s.name, center: V3(s.x, s.z), radius: s.radius })),
    minimap: { labels: LABELS },
    nav: NAV,
    sun: atm.sun, quality,
    setQuality,
    update(dt) {
      uTime.value += dt;
      if (waterMat?.normalMap) waterMat.normalMap.offset.set(uTime.value * 0.02, uTime.value * 0.013);
      post.grade.uniforms.uTime.value = uTime.value;
    },
    render() { post.composer.render(); },
    resize(w, h) { post.composer.setSize(w, h); },
  };
  setQuality(quality);
  return world;
}

// R = sand amount (yards, spawn, long routes), G = contact AO from collider footprints.
function groundMask(physics, GB) {
  const PPM = 8, W = Math.round((GB.maxX - GB.minX) * PPM), H = Math.round((GB.maxZ - GB.minZ) * PPM);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const rect = (g, x0, z0, x1, z1) => g.fillRect((x0 - GB.minX) * PPM, (z0 - GB.minZ) * PPM, (x1 - x0) * PPM, (z1 - z0) * PPM);
  const sand = mk(), sg = sand.getContext('2d'); sg.fillStyle = '#000'; sg.fillRect(0, 0, W, H); sg.filter = 'blur(10px)';
  sg.fillStyle = '#fff'; rect(sg, -54, -36, -18, -8); rect(sg, 18, -36, 54, -8); rect(sg, -14, -44, 14, -29); // yards + DEF spawn
  sg.fillStyle = '#999'; rect(sg, -54, -8, -47, 28); rect(sg, 47, -8, 54, 28); rect(sg, -18, -36, -14, -28); rect(sg, 14, -36, 18, -28);
  sg.fillStyle = '#555'; rect(sg, -54, 28, -30, 38); rect(sg, 30, 28, 54, 38);
  const ao = mk(), ag = ao.getContext('2d'); ag.fillStyle = '#fff'; ag.fillRect(0, 0, W, H); ag.filter = 'blur(5px)'; ag.fillStyle = '#000';
  for (const c of physics.colliders) { const b = c.box; if (b.min.y > 0.1 || b.max.y < 0.3) continue; const e = b.max.y > 2 ? 0.12 : 0.05; rect(ag, b.min.x - e, b.min.z - e, b.max.x + e, b.max.z + e); }
  const out = mk(), og = out.getContext('2d'), od = og.createImageData(W, H), sd = sg.getImageData(0, 0, W, H).data, ad = ag.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) { od.data[i * 4] = sd[i * 4]; od.data[i * 4 + 1] = ad[i * 4]; od.data[i * 4 + 2] = 0; od.data[i * 4 + 3] = 255; }
  og.putImageData(od, 0, 0);
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.NoColorSpace; t.flipY = true; return t;
}
