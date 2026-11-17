// Ops de nuit, bot side: weapon lights (when a bot switches its lamp on/off), their visible beams, and the night
// perception rules used by Bot.perceive().
//
// Rendering budget: every bot beam is a fake volume (additive cone, clipped at the first wall) + a lens glare, two
// instanced draw calls for all bots. Only the few lamps nearest to the camera get a real SpotLight (HIGH 3, LOW 1,
// fixed count while night is on so no shader recompiles).
import * as THREE from 'three';
import { RIM_K } from './model.js';

// Night perception (meters). Applied on top of the skill's view/fov.
export const NIGHT_SIGHT = {
  dark: 16,        // an unlit enemy is noticed up to this distance (moonlight silhouettes), x skill.nightView
  lit: 45,         // standing in a street-lamp pool
  beam: 30,        // inside the observer's own flashlight beam (cone half-angle `beamCone`)
  beamCone: 0.3,
  dazzle: 45,      // an enemy pointing a lit lamp at the observer is seen even outside the field of view
  dazzleCone: 0.4,
  flash: 0.5,      // s: a muzzle flash reveals the shooter for this long (full view range)
  darkReact: 1.25, // reaction time x for a target that is not lit
  darkMiss: 0.3,   // chance per perception tick to overlook an unlit target beyond 8 m that wasn't seen yet
};
const BEAM = { len: 10, radius: 1.6, slotsHigh: 3, slotsLow: 1, spotAngle: 0.32, spotDist: 24, spotI: 45 };

export const aimYawOf = a => (a.isBot ? a.aimYaw : a.yaw) ?? 0;
export const aimPitchOf = a => (a.isBot ? a.aimPitch : a.pitch) ?? 0;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// How far `obs` can notice `e` tonight, and whether it bypasses the field of view. Returns {range, dazzle, lit}.
export function nightSight(obs, e, d, dx, dz, t, S) {
  const N = NIGHT_SIGHT, shotAgo = t - (e.lastShotTime ?? -100);
  if (e.lampOn || shotAgo < N.flash) {
    // a lit lamp or a muzzle flash gives the position away from far; a lamp pointed at me even from behind my fov
    const dazzle = e.lampOn && d < N.dazzle && Math.abs(angDiff(aimYawOf(e), yawTo(-dx, -dz))) < N.dazzleCone;
    return { range: Infinity, dazzle, lit: true };
  }
  let range = N.dark * (S.nightView ?? 1), lit = false;
  if (e._lit > 0.05) { range = Math.max(range, N.lit * e._lit); lit = e._lit > 0.4; }
  if (obs.lampOn && d < N.beam && Math.abs(angDiff(obs.aimYaw, yawTo(dx, dz))) < N.beamCone) { range = Math.max(range, N.beam); lit = true; }
  return { range, dazzle: false, lit };
}

export function createBotLamps(ctx, mgr) {
  const { scene, camera } = ctx;
  const MAXN = 64;
  // beam: cone with the apex at the origin, opening toward -z, unit length / radius (scaled per instance)
  const coneG = new THREE.ConeGeometry(1, 1, 18, 1, true); coneG.translate(0, -0.5, 0); coneG.rotateX(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uFog: { value: 0.016 } },
    vertexShader: `varying float vT, vEdge, vFog; varying vec3 vC; uniform float uFog;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv;
        vT = -position.z; vC = instanceColor;
        vec3 n = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        vFog = exp(-uFog * uFog * dot(mv.xyz, mv.xyz) * 1.2); }`,
    fragmentShader: `varying float vT, vEdge, vFog; varying vec3 vC;
      void main(){ float a = pow(1.0 - clamp(vT, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.08, vT) * pow(vEdge, 1.5);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * a * 0.13 * vC.r * vFog, 1.0); }`,
  });
  const beams = new THREE.InstancedMesh(coneG, beamMat, MAXN);
  // glare: camera-facing quad at the lens, bright when the lamp points at the camera
  const quadG = new THREE.PlaneGeometry(1, 1);
  const glareMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; varying float vK;
      void main(){
        vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 dir = -normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        vec3 toCam = normalize(cameraPosition - c); float f = max(dot(dir, toCam), 0.0);
        float dist = length(cameraPosition - c);
        vK = (0.35 + pow(f, 5.0) * 3.0) * instanceColor.r;
        float size = (0.16 + pow(f, 3.0) * 0.9) * (1.0 + dist * 0.04);
        vec4 mv = viewMatrix * vec4(c, 1.0); mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv; vUv = uv; }`,
    fragmentShader: `varying vec2 vUv; varying float vK;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * vK, 1.0); }`,
  });
  const glares = new THREE.InstancedMesh(quadG, glareMat, MAXN);
  for (const m of [beams, glares]) {
    m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = false; m.visible = false; m.renderOrder = 3;
    m.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(m); ctx.world?.noAO?.push(m);
  }

  // real light for the few nearest lamps
  let spots = [], spotQ = null;
  const makeSpots = (n) => {
    for (const s of spots) { scene.remove(s); scene.remove(s.target); }
    spots = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.SpotLight(0xfff0d8, 0, BEAM.spotDist, BEAM.spotAngle, 0.6, 1.7); s.castShadow = false;
      scene.add(s); scene.add(s.target); spots.push(s);
    }
  };

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), O = new THREE.Vector3(), D = new THREE.Vector3(), C = new THREE.Color(), cp = new THREE.Vector3();
  const FWD = new THREE.Vector3(0, 0, -1);
  let night = false, litT = 0;

  const L = {
    get night() { return night; },
    setNight(on) {
      night = !!on; beams.visible = glares.visible = night;
      makeSpots(night ? (ctx.world?.quality === 'low' ? BEAM.slotsLow : BEAM.slotsHigh) : 0);
      spotQ = ctx.world?.quality;
      RIM_K.value = night ? 0.08 : 1; // the readability rim is emissive: it would make every soldier glow in the dark
      for (const b of mgr.list) b.lampOn = false;
      if (ctx.player) ctx.player._lit = 1;
    },
    // lamp discipline per skill: 0 = always on, 1 = off when holding still, 2 = also off when sneaking (walking)
    decide(b, dt) {
      if (!night || !b.alive) { b.lampOn = false; b._stillT = 0; return; }
      // Zombies: no point hiding from a horde, lamps stay on
      const disc = ctx.game?.mode === 'zombie' ? 0 : b.skill?.lamp ?? 1, engaged = b.target && b.isVisible(b.target);
      b._stillT = b.moveSpeed < 0.8 ? (b._stillT || 0) + dt : 0;
      let on = true;
      if (disc >= 1 && b._stillT > (disc >= 2 ? 0.8 : 2) && !engaged) on = false;
      if (disc >= 2 && !engaged && b.moveSpeed > 0.8 && b.moveSpeed < 3.5) on = false; // walking / hunting: lights out
      if (disc >= 2 && engaged && b.target.position.distanceTo(b.position) > 18 && b._stillT > 0.3) on = false; // holding a long angle
      b.lampOn = on;
    },
    update(dt) {
      if (!night) return;
      if (ctx.world?.quality !== spotQ) L.setNight(true);
      // how lit every actor stands (street lamps), 10 Hz
      if ((litT -= dt) <= 0) { litT = 0.1; for (const a of ctx.actors) if (a.alive) a._lit = ctx.world?.litAt?.(O.copy(a.position).setY(a.position.y + 1.2)) ?? 0; }
      let n = 0; camera.getWorldPosition(cp);
      const cands = [];
      for (const b of mgr.list) {
        mgr.lamps.decide(b, dt);
        if (!b.lampOn || n >= MAXN) continue;
        b.model.muzzle?.getWorldPosition ? b.model.muzzle.getWorldPosition(O) : b.getEyePosition(O);
        const y = b.aimYaw, p = b.aimPitch || 0;
        D.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
        O.addScaledVector(D, -0.05);
        const hit = ctx.physics.raycast(O, D, BEAM.len);
        const len = hit ? Math.max(0.3, hit.distance) : BEAM.len, r = BEAM.radius * len / BEAM.len;
        Q.setFromUnitVectors(FWD, D);
        M.compose(O, Q, S3.set(r, r, len)); beams.setMatrixAt(n, M); glares.setMatrixAt(n, M);
        // a beam cut short by a wall keeps its full brightness per meter
        C.setScalar(1); beams.setColorAt(n, C); glares.setColorAt(n, C);
        const dc = O.distanceTo(cp);
        if (dc < 50) cands.push({ dc, o: O.clone(), d: D.clone() });
        n++;
      }
      beams.count = glares.count = n;
      beams.instanceMatrix.needsUpdate = glares.instanceMatrix.needsUpdate = true;
      if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
      if (glares.instanceColor) glares.instanceColor.needsUpdate = true;
      cands.sort((a, b) => a.dc - b.dc);
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i], c = cands[i];
        if (!c) { s.intensity = 0; continue; }
        s.position.copy(c.o); s.target.position.copy(c.o).addScaledVector(c.d, 10); s.target.updateMatrixWorld();
        s.intensity = BEAM.spotI * THREE.MathUtils.clamp((50 - c.dc) / 10, 0, 1);
      }
    },
  };
  return L;
}
