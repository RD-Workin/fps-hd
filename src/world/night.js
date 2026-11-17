// "Ops de nuit": night variant of the Citadelle. Same geometry, colliders and static shadow map; only the lighting rig,
// sky and grading change, so it combines with every game mode and costs no extra loading.
//
// Lighting budget (forward renderer: every light costs on every lit fragment, and changing the NUMBER of lights
// recompiles every material). The light counts are therefore fixed for a given quality and set once when night is
// switched on (in the menu, followed by a shader warm-up):
//   - moon = the existing sun light, dimmed and tinted (same direction: the cached shadow map stays valid)
//   - N lamp slots (HIGH 8, LOW 4) of PointLights, re-assigned every few frames to the street lamps / lanterns nearest
//     to the camera, with a distance fade so a slot hand-over never pops. Every other lamp keeps its emissive bulb and
//     an additive light pool on the ground (one instanced draw call), cross-faded with its real light.
//   - flashlights (weapon/flashlight.js, bots/lamps.js) add a fixed number of SpotLights of their own.
import * as THREE from 'three';

const NIGHT = {
  exposure: 1.0, sun: 0.22, sunColor: 0x8ea6ff, hemi: 0.07, hemiSky: 0x5a6f9e, hemiGround: 0x1a1612, bounce: 0.03, env: 0.04,
  fog: 0x0b1020, fogDensity: 0.016, glow: 5.0, bloom: [0.42, 0.5, 0.7], lamp: 9, lampDist: 12, pool: 4.6,
};

export function createNight(ctx, { atm, dust, post, glowMat, lights, floorAt, noAO }) {
  const { scene, renderer, camera } = ctx;
  const day = {
    exposure: renderer.toneMappingExposure, sun: atm.sun.intensity, sunColor: atm.sun.color.clone(), hemi: atm.hemi.intensity,
    hemiSky: atm.hemi.color.clone(), hemiGround: atm.hemi.groundColor.clone(), bounce: atm.bounce?.intensity ?? 0,
    env: scene.environmentIntensity, fog: scene.fog.color.clone(), fogDensity: scene.fog.density, glow: glowMat.emissiveIntensity,
    bloom: [post.bloom.strength, post.bloom.radius, post.bloom.threshold],
  };
  // fixtures: one bulb per lamp / lantern (drop near-duplicates)
  const lamps = [];
  for (const l of lights) if (lamps.every(o => Math.hypot(o.x - l.x, o.z - l.z) > 1.2 || Math.abs(o.y - l.y) > 1)) {
    const f = l.floor ?? floorAt?.(l.x, l.z) ?? (l.y - 3);
    lamps.push({ x: l.x, y: l.y, z: l.z, floor: Math.min(f, l.y - 1), real: 0, d: 0 });
  }

  // ---------- night sky dome: gradient, stars, moon (one draw call, no fog) ----------
  const moonDir = atm.sunDir.clone();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: moonDir } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uMoon; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.0);
        vec3 c = mix(vec3(0.045, 0.06, 0.11), vec3(0.008, 0.012, 0.03), pow(y, 0.6));
        c += vec3(0.07, 0.05, 0.035) * exp(-y * 14.0) * 0.6;                     // faint town glow on the horizon
        vec3 g = floor(d * 260.0); float s = h(g); float st = step(0.9965, s) * smoothstep(0.02, 0.25, y);
        c += vec3(0.75, 0.8, 1.0) * st * (0.4 + 0.6 * h(g + 3.1));
        float m = dot(d, normalize(uMoon));
        c += vec3(0.85, 0.9, 1.0) * smoothstep(0.99955, 0.9997, m) * 1.6;         // moon disc
        c += vec3(0.25, 0.3, 0.45) * pow(max(m, 0.0), 300.0) * 0.6 + vec3(0.06, 0.07, 0.1) * pow(max(m, 0.0), 12.0);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; sky.visible = false; scene.add(sky); noAO.push(sky);

  // ---------- ground light pools under every lamp (additive, instanced) ----------
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  const poolGeo = new THREE.PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  const pools = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({
    map: poolTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: true,
  }), Math.max(1, lamps.length));
  const M = new THREE.Matrix4(), POOL_C = new THREE.Color(0xffa860), tmpC = new THREE.Color();
  lamps.forEach((l, i) => {
    const r = NIGHT.pool * Math.min(1.25, Math.max(0.7, (l.y - l.floor) / 3.6));
    pools.setMatrixAt(i, M.makeScale(r * 2, 1, r * 2).setPosition(l.x, l.floor + 0.03, l.z));
    pools.setColorAt(i, tmpC.copy(POOL_C).multiplyScalar(0.3));
  });
  pools.count = lamps.length; pools.frustumCulled = false; pools.visible = false; pools.renderOrder = 2; scene.add(pools); noAO.push(pools);

  // ---------- real lamp lights: fixed pool of slots re-assigned to the nearest fixtures ----------
  let slots = [], slotN = 0;
  function makeSlots(n) {
    for (const s of slots) scene.remove(s.light);
    slots = []; slotN = n;
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffb469, 0, NIGHT.lampDist, 2); light.castShadow = false;
      scene.add(light); slots.push({ light, lamp: null });
    }
  }

  const n = {
    on: false, lamps,
    // 0..1: how much a world position is lit by the fixtures (used by bot perception)
    litAt(p) {
      if (!this.on) return 1;
      let best = 0;
      for (const l of lamps) {
        const dy = p.y - l.floor; if (dy < -1 || dy > 4.5) continue;
        const d = Math.hypot(p.x - l.x, p.z - l.z); if (d < 8) best = Math.max(best, 1 - Math.max(0, d - 3) / 5);
      }
      return best;
    },
    set(on, quality = 'high') {
      on = !!on; const want = on ? (quality === 'low' ? 4 : 8) : 0;
      if (want !== slotN) makeSlots(want);
      if (on === this.on) return;
      this.on = on;
      const P = on ? NIGHT : day;
      renderer.toneMappingExposure = P.exposure;
      atm.sun.intensity = P.sun; atm.sun.color.set(P.sunColor);
      atm.hemi.intensity = P.hemi; atm.hemi.color.set(P.hemiSky); atm.hemi.groundColor.set(P.hemiGround);
      if (atm.bounce) atm.bounce.intensity = P.bounce;
      scene.environmentIntensity = on ? NIGHT.env : day.env;
      scene.fog.color.set(P.fog); scene.fog.density = P.fogDensity;
      glowMat.emissiveIntensity = P.glow;
      [post.bloom.strength, post.bloom.radius, post.bloom.threshold] = P.bloom;
      atm.sky.visible = !on; sky.visible = on; pools.visible = on;
      if (post.grade.uniforms.uNight) post.grade.uniforms.uNight.value = on ? 1 : 0;
      ctx.events?.emit?.('world:night', { on });
    },
    // the dust motes are warm sunlit specks: hidden at night
    dustVisible(hi) { return hi && !this.on; },
    t: 0,
    update(dt) {
      if (!this.on || !slotN) return;
      if ((this.t -= dt) > 0) return; this.t = 0.1; // ~10 Hz is plenty: lights fade, positions are static
      const cp = camera.getWorldPosition(_cp);
      for (const l of lamps) l.d = Math.hypot(l.x - cp.x, l.z - cp.z) + Math.abs(l.y - 2 - cp.y) * 0.5;
      const order = lamps.slice().sort((a, b) => a.d - b.d);
      const cut = order[slotN]?.d ?? 1e9; // the first lamp that does NOT get a light
      const chosen = new Set(order.slice(0, slotN));
      // keep lamps on their slot when still chosen (no flicker), give free slots to the new ones
      const free = [];
      for (const s of slots) { if (s.lamp && chosen.has(s.lamp)) chosen.delete(s.lamp); else { s.lamp = null; free.push(s); } }
      for (const l of chosen) { const s = free.pop(); if (!s) break; s.lamp = l; }
      for (const l of lamps) l.real = 0;
      for (const s of slots) {
        const l = s.lamp; if (!l) { s.light.intensity = 0; continue; }
        const f = THREE.MathUtils.clamp((cut - l.d) / 6, 0, 1); // fade out before the hand-over
        l.real = f; s.light.position.set(l.x, l.y - 0.15, l.z); s.light.intensity = NIGHT.lamp * f;
      }
      for (let i = 0; i < lamps.length; i++) pools.setColorAt(i, tmpC.copy(POOL_C).multiplyScalar(0.32 * (1 - lamps[i].real * 0.75)));
      pools.instanceColor.needsUpdate = true;
    },
  };
  return n;
}
const _cp = new THREE.Vector3();
