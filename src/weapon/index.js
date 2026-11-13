// Weapon module — see docs/decisions/weapon.md. Logic (fire/reload/spread/recoil) + spring-driven viewmodel animation.
import * as THREE from 'three';
import { buildViewmodel, VM_PROJ } from './viewmodel.js';
import { createEffects } from './effects.js';

const FIRE_INTERVAL = 0.1, MAG = 30, RESERVE = 90, DMG = 30, HEAD_MULT = 3.34;
const VM_FOV = 56;
const RELOAD_TAC = 2.1, RELOAD_EMPTY = 2.5, DRAW_T = 0.55;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _end = new THREE.Vector3(), _mz = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

// damped spring on a Vector3 (semi-implicit Euler, sub-stepped for stability)
class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); this.t = new THREE.Vector3(); }
  impulse(x, y, z) { this.v.x += x; this.v.y += y; this.v.z += z; }
  update(dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v.x += (-this.k * (this.x.x - this.t.x) - this.c * this.v.x) * h;
      this.v.y += (-this.k * (this.x.y - this.t.y) - this.c * this.v.y) * h;
      this.v.z += (-this.k * (this.x.z - this.t.z) - this.c * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
  }
  reset() { this.x.set(0, 0, 0); this.v.set(0, 0, 0); this.t.set(0, 0, 0); }
}

// Reload choreography (fractions of reload time; audio cues at 0.10 magOut, 0.52 magIn, 0.78 charge)
// returns gun offsets {px,py,pz, rx,ry,rz} and left-hand offsets {hx,hy,hz, hrx,hry,hrz}
const MAGHAND = [-0.012, -0.175, 0.33]; // left hand offset (rifle space) when holding the bottom of a seated mag
function reloadPose(t, out) {
  // gun: tilt right & up to present the magwell, then cant left for the charging handle, back to rest
  const tilt = smooth(0.0, 0.12, t) * (1 - smooth(0.5, 0.62, t));
  const cant = smooth(0.56, 0.66, t) * (1 - smooth(0.84, 0.98, t));
  const seat = Math.exp(-Math.pow((t - 0.53) / 0.025, 2)), rack = Math.exp(-Math.pow((t - 0.79) / 0.02, 2));
  out.px = -0.06 * tilt + 0.02 * cant; out.py = 0.05 * tilt - 0.01 * cant + 0.012 * seat; out.pz = 0.03 * tilt - 0.008 * rack;
  out.rx = 0.32 * tilt + 0.05 * cant + 0.06 * seat - 0.03 * rack; out.ry = 0.12 * tilt - 0.15 * cant; out.rz = -0.45 * tilt + 0.3 * cant + 0.03 * rack;
  // left hand path
  let hx = 0, hy = 0, hz = 0, hrx = 0, hry = 0, hrz = 0, fresh = 0;
  const toMag = smooth(0.02, 0.1, t), away = smooth(0.12, 0.26, t), back = smooth(0.28, 0.44, t), ins = smooth(0.44, 0.52, t);
  const toCh = smooth(0.56, 0.66, t), pull = smooth(0.7, 0.77, t), home = smooth(0.8, 0.95, t);
  // reach the old mag
  hx = MAGHAND[0] * toMag; hy = MAGHAND[1] * toMag; hz = MAGHAND[2] * toMag; hrx = 0.3 * toMag; hrz = -0.4 * toMag;
  // pull it out & go to the pouch (off-screen, down-left)
  hx += -0.12 * away * (1 - back); hy += -0.25 * away * (1 - back); hz += 0.05 * away * (1 - back); hrz += -0.6 * away * (1 - back);
  // back under the magwell with the fresh mag (offset a bit low), then insert
  hy += -0.06 * back * (1 - ins);
  fresh = back > 0 && t < 0.53 ? 1 : 0;
  // to the charging handle (left side of the receiver), pull back, release
  if (t > 0.54) {
    const k = toCh * (1 - home);
    hx = lerp(MAGHAND[0], -0.075, toCh) * (1 - home); hy = lerp(MAGHAND[1], 0.02, toCh) * (1 - home); hz = lerp(MAGHAND[2], 0.235 + 0.075 * pull * (1 - smooth(0.77, 0.8, t)), toCh) * (1 - home);
    hrx = lerp(0.3, -0.2, toCh) * (1 - home); hry = 0.5 * k; hrz = lerp(-0.4, 0.9, toCh) * (1 - home);
  }
  out.hx = hx; out.hy = hy; out.hz = hz; out.hrx = hrx; out.hry = hry; out.hrz = hrz; out.fresh = fresh;
  out.magOut = t >= 0.1 && t < 0.53; // seated mag hidden (dropped) until the new one is seated
  out.charger = pull * (1 - smooth(0.77, 0.8, t));
  return out;
}

export function createWeapon(ctx) {
  const { camera, player, events } = ctx;
  const vm = buildViewmodel();
  const root = new THREE.Group(); root.add(vm.rifle); camera.add(root);
  const BASE = new THREE.Vector3(0.15, -0.13, -0.36), BROT = new THREE.Vector3(0, 0.04, 0);
  // ADS: optic centre (rifle space y=0.068) on the view axis, rear lens ~11 cm from the eye
  const ADS = new THREE.Vector3(0, -0.068, -0.135), FOV_HIP = camera.fov, FOV_ADS = 55;
  root.position.copy(BASE);
  // fresh mag rides with the left hand during the reload
  vm.rifle.add(vm.magFresh); vm.magFresh.visible = false;
  const MAG_REST = vm.mag.position.clone(), PALM = new THREE.Vector3(0, -0.045, -0.36);
  // optic reads too dark: tiny emissive lift on viewmodel materials so the gun keeps detail in shade
  for (const k of ['cerakote', 'polymer', 'glove', 'sleeve', 'steel']) { const m = vm.materials[k]; if (m?.emissive) { m.emissive.setRGB(0.018, 0.017, 0.016); } }

  // viewmodel has its own projection (less stretched); vmWorld() maps a viewmodel point to where it appears in the world
  const vmCam = new THREE.PerspectiveCamera(VM_FOV, camera.aspect, 0.01, 10), _inv = new THREE.Matrix4();
  let fovK = 1;
  const syncProj = () => {
    if (vmCam.aspect !== camera.aspect) { vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix(); }
    VM_PROJ.value.copy(vmCam.projectionMatrix);
    fovK = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(VM_FOV) / 2);
  };
  vmCam.updateProjectionMatrix(); syncProj();
  const vmWorld = (obj, out) => {
    camera.updateMatrixWorld(); obj.getWorldPosition(out);
    out.applyMatrix4(_inv.copy(camera.matrixWorld).invert()); out.x *= fovK; out.y *= fovK;
    return out.applyMatrix4(camera.matrixWorld);
  };

  const looted = new Set(); const CORPSE_AMMO = 30, MAX_RESERVE = 180;
  events.on('round:start', () => looted.clear());
  const effects = createEffects(ctx);
  ctx.effects = effects;

  // springs: position (m) and rotation (rad) offsets of the whole viewmodel
  const pos = new Spring(240, 22), rot = new Spring(220, 18), sway = new Spring(120, 16), land = new Spring(160, 14);
  let cooldown = 0, flashT = 0, flashF = 0, reloadT = 0, reloadDur = RELOAD_TAC, emptyReload = false, drawT = 1, bobT = 0, bobAmp = 0, breathe = 0;
  let wasGround = true, lastVy = 0, fireHeat = 0, smokeT = 0, dryT = 0, chargerKick = 0, lastTriggerT = 0;
  const pose = {};

  const w = {
    name: 'NV-4', mag: MAG, magSize: MAG, reserve: RESERVE, reloading: false, reloadProgress: 0, spread: 0.004, aiming: false, adsK: 0, bloom: 0, shotIndex: 0,
    viewmodel: vm, effects, emptyReload: false, _base: BASE, _brot: BROT,
    resetForRound() {
      this.mag = MAG; this.reserve = RESERVE; this.reloading = false; this.reloadProgress = 0; this.bloom = 0; this.shotIndex = 0;
      drawT = 0; pos.reset(); rot.reset(); vm.mag.visible = true; vm.magFresh.visible = false; fireHeat = 0;
    },
    startReload() {
      if (this.reloading || this.mag >= MAG || this.reserve <= 0 || !player.alive) return;
      this.reloading = true; reloadT = 0; emptyReload = this.mag === 0; this.emptyReload = emptyReload;
      reloadDur = emptyReload ? RELOAD_EMPTY : RELOAD_TAC; this._dropped = false;
      events.emit('weapon:reload', { empty: emptyReload });
    },
    canFire() {
      const ph = ctx.game?.phase;
      return player.alive && !player.frozen && (ph === undefined || ph === 'live');
    },
    fire() {
      this.mag--; this.shotIndex++; player.lastShotTime = ctx.time;
      this.bloom = Math.min(0.045, this.bloom + 0.006);
      camera.getWorldPosition(_o); player.getForward(_d);
      const s = this.spread; _d.x += (Math.random() - 0.5) * 2 * s; _d.y += (Math.random() - 0.5) * 2 * s; _d.z += (Math.random() - 0.5) * 2 * s; _d.normalize();
      const wh = ctx.physics.raycast(_o, _d, 300), bh = ctx.bots?.raycast?.(_o, _d, 300);
      vmWorld(vm.muzzle, _mz);
      const tracer = this.shotIndex % 2 === 1; // every other round is a tracer
      if (bh && (!wh || bh.distance < wh.distance)) {
        const dmg = DMG * (bh.distance > 25 ? Math.max(0.73, 1 - (bh.distance - 25) / 130) : 1) * (bh.headshot ? HEAD_MULT : 1);
        const killed = ctx.combat.applyDamage(bh.actor, dmg, player, { headshot: bh.headshot, fromPos: _o.clone() });
        ctx.effects?.blood?.(bh.point, _d); if (tracer) ctx.effects?.tracer?.(_mz, bh.point);
        events.emit('weapon:hit', { actor: bh.actor, headshot: !!bh.headshot, killed, point: bh.point });
      } else if (wh) {
        ctx.effects?.impact?.(wh.point, wh.normal, wh.collider.material); if (tracer) ctx.effects?.tracer?.(_mz, wh.point);
      } else if (tracer) ctx.effects?.tracer?.(_mz, _end.copy(_o).addScaledVector(_d, 300));
      const i = this.shotIndex; const pitch = 0.011 + (i < 10 ? 0.004 : 0), yaw = (i < 12 ? 0.002 : Math.sin(i * 0.45) * 0.006) + (Math.random() - 0.5) * 0.003;
      player.addRecoil(pitch * (1 - 0.25 * this.adsK), yaw * (1 - 0.35 * this.adsK));
      events.emit('weapon:fire', { origin: _o.clone(), dir: _d.clone() });
      // viewmodel kick: back + up, random roll/yaw, stronger on the first shots
      const f = i < 3 ? 1.25 : 1;
      pos.impulse((Math.random() - 0.5) * 0.12, 0.18 * f, 0.95 * f);
      rot.impulse(1.6 * f + Math.random() * 0.4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.6);
      chargerKick = 1; fireHeat = Math.min(1, fireHeat + 0.06);
      // muzzle flash: randomized star + side cones + light
      flashT = 0.045; flashF = 1; vm.flash.visible = true; vm.flash.rotation.z = Math.random() * 6.28;
      const fs = 1.3 + Math.random() * 0.6; vm.flash.scale.set(fs, fs, 1 + Math.random() * 0.9);
      vm.star.visible = Math.random() > 0.15;
      ctx.effects?.muzzleFlash?.(_mz, _d, { player: true });
      ctx.effects?.shake?.(0.12, 0.06);
      // ejected casing (world space, to the right and up)
      vmWorld(vm.eject, _v); _q.setFromRotationMatrix(camera.matrixWorld);
      const right = _end.set(1, 0, 0).applyQuaternion(_q), up = _o.set(0, 1, 0).applyQuaternion(_q);
      const cv = right.multiplyScalar(2.2 + Math.random() * 0.8).addScaledVector(up, 1.6 + Math.random() * 0.6).add(player.velocity);
      ctx.effects?.casing?.(_v, cv, _q);
    },
    update(dt) {
      const inp = ctx.input;
      syncProj();
      // spread
      const moving = Math.min(1, player.moveSpeed / 5.6);
      this.bloom = Math.max(0, this.bloom - dt * (inp.fireDown ? 0.01 : 0.08));
      // aim down sights (right click held)
      this.aiming = !!inp.aimDown && player.alive && !this.reloading && drawT > 0.6;
      this.adsK += ((this.aiming ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);
      if (this.adsK < 0.001) this.adsK = 0;
      const fov = FOV_HIP + (FOV_ADS - FOV_HIP) * this.adsK;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      this.spread = (0.004 + this.bloom + moving * 0.02 + (player.onGround ? 0 : 0.04)) * (inp.crouch ? 0.6 : 1) * (1 - 0.6 * this.adsK);
      if (!inp.fireDown) this.shotIndex = 0;
      // ammo from corpses: walk over a dead soldier to take his spare magazine
      if (player.alive && this.reserve < MAX_RESERVE) {
        for (const a of ctx.actors) {
          if (a.alive || a.isPlayer || looted.has(a)) continue;
          const dx = a.position.x - player.position.x, dz = a.position.z - player.position.z;
          if (dx * dx + dz * dz > 1.6 * 1.6 || Math.abs(a.position.y - player.position.y) > 1.2) continue;
          looted.add(a);
          const n = Math.min(CORPSE_AMMO, MAX_RESERVE - this.reserve); this.reserve += n;
          events.emit('weapon:ammo', { amount: n, from: a });
          events.emit('hud:toast', { text: `+${n} munitions (${a.name})` });
          break;
        }
      }
      // reload
      if (inp.reloadPressed) this.startReload();
      if (this.reloading) {
        if (!player.alive) { this.reloading = false; this.reloadProgress = 0; }
        else {
          reloadT += dt; this.reloadProgress = Math.min(1, reloadT / reloadDur);
          if (!this._dropped && this.reloadProgress >= 0.1) { // old mag falls to the ground
            this._dropped = true; vm.magFresh.visible = false;
            _q.setFromRotationMatrix(camera.matrixWorld);
            ctx.effects?.dropMag?.(vm.mag, vmWorld(vm.mag, new THREE.Vector3()), _v.set(-0.4, -1.2, 0).applyQuaternion(_q).add(player.velocity));
          }
          if (reloadT >= reloadDur) { const n = Math.min(MAG - this.mag, this.reserve); this.mag += n; this.reserve -= n; this.reloading = false; this.reloadProgress = 0; }
        }
      }
      // fire
      cooldown -= dt;
      if (inp.fireDown && cooldown <= 0 && !this.reloading && drawT > 0.6 && this.canFire()) {
        if (this.mag > 0) { this.fire(); cooldown = FIRE_INTERVAL; }
        else if (inp.firePressed) { cooldown = 0.25; dryT = 1; events.emit('weapon:dryfire'); this.startReload(); }
      }
      if (cooldown < -FIRE_INTERVAL) cooldown = 0;
      this.animate(dt, inp);
    },
    animate(dt, inp) {
      if (dt <= 0) return;
      flashT -= dt; flashF--; if (flashT <= 0 && flashF < 0) vm.flash.visible = false; // always shown >= 1 rendered frame
      drawT = Math.min(1, drawT + dt / DRAW_T);
      // muzzle smoke after sustained fire
      fireHeat = Math.max(0, fireHeat - dt * (inp.fireDown ? 0.05 : 0.22));
      smokeT -= dt;
      if (fireHeat > 0.25 && !inp.fireDown && smokeT <= 0) { smokeT = 0.07; vmWorld(vm.muzzle, _mz); ctx.effects?.smoke?.(_mz, { alpha: 0.12 * fireHeat }); }
      // look sway (lag behind the camera)
      const mx = THREE.MathUtils.clamp(inp.mouseDX, -60, 60), my = THREE.MathUtils.clamp(inp.mouseDY, -60, 60);
      sway.t.set(-mx * 0.00045, my * 0.00045, 0); sway.update(dt);
      // movement bob: figure-8 synced with player.headBob, amplitude eases with speed
      const speed = player.alive && player.onGround ? Math.min(1, player.moveSpeed / 5.6) : 0;
      bobAmp += (speed - bobAmp) * Math.min(1, dt * 6); bobT = player.headBob;
      breathe += dt;
      // land dip
      if (!wasGround && player.onGround) land.impulse(0, Math.max(-1.6, Math.min(-0.3, lastVy * 0.12)), 0);
      wasGround = player.onGround; lastVy = player.velocity.y; land.update(dt);
      // strafe tilt (lateral speed in view space)
      const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      const lateral = player.velocity.x * cy - player.velocity.z * sy;
      const crouch = inp.crouch ? 1 : 0;
      // recoil springs
      pos.update(dt); rot.update(dt);
      chargerKick = Math.max(0, chargerKick - dt * 22); dryT = Math.max(0, dryT - dt * 6);
      // reload pose
      const r = this.reloading ? reloadPose(this.reloadProgress, pose) : null;
      const draw = 1 - smooth(0, 1, drawT);
      const airborne = player.onGround ? 0 : 1;
      root.position.set(
        BASE.x + Math.sin(bobT) * 0.011 * bobAmp + sway.x.x * 1.4 + pos.x.x * 0.01 + (r ? r.px : 0) - crouch * 0.008,
        BASE.y - Math.abs(Math.cos(bobT)) * 0.009 * bobAmp + Math.sin(breathe * 1.6) * 0.0015 - sway.x.y + pos.x.y * 0.01 + land.x.y * 0.02 + airborne * 0.006 + (r ? r.py : 0) - draw * 0.18 - crouch * 0.006,
        BASE.z + pos.x.z * 0.035 + (r ? r.pz : 0) + bobAmp * 0.006);
      root.rotation.set(
        BROT.x + rot.x.x * 0.03 + sway.x.y * 2.2 + land.x.y * 0.04 + Math.sin(breathe * 1.6) * 0.004 + (r ? r.rx : 0) - draw * 0.9 - dryT * 0.02,
        BROT.y + rot.x.y * 0.02 + sway.x.x * 2.6 + Math.sin(bobT * 0.5) * 0.008 * bobAmp + (r ? r.ry : 0) + draw * 0.4,
        BROT.z + rot.x.z * 0.02 + sway.x.x * 3.2 - lateral * 0.012 + Math.sin(bobT * 0.5) * 0.012 * bobAmp + (r ? r.rz : 0) + draw * 0.35 + crouch * 0.06);
      // charging handle: reciprocates on each shot, pulled during reload
      vm.charger.position.z = -0.12 + chargerKick * 0.075 + (r ? r.charger * 0.075 : 0);
      // left hand + magazines
      if (r) {
        // rotate the hand about its palm, not the rifle origin
        vm.leftHand.rotation.set(r.hrx, r.hry, r.hrz); _q.setFromEuler(vm.leftHand.rotation);
        vm.leftHand.position.copy(PALM).applyQuaternion(_q).negate().add(PALM).add(_v.set(r.hx, r.hy, r.hz));
        vm.mag.visible = !r.magOut;
        vm.magFresh.visible = r.fresh === 1;
        if (vm.magFresh.visible) vm.magFresh.position.set(MAG_REST.x + r.hx - MAGHAND[0], MAG_REST.y + r.hy - MAGHAND[1], MAG_REST.z + r.hz - MAGHAND[2]), vm.magFresh.rotation.copy(vm.mag.rotation);
      } else {
        vm.leftHand.position.set(0, 0, 0); vm.leftHand.rotation.set(0, 0, 0);
        vm.mag.visible = true; vm.magFresh.visible = false; vm.mag.position.copy(MAG_REST);
      }
      if (this.adsK > 0) { // blend toward the sight picture, keep a little of the motion
        const k = this.adsK, m = 1 - 0.8 * k;
        root.position.x = ADS.x + (root.position.x - BASE.x) * m + (BASE.x - ADS.x) * (1 - k);
        root.position.y = ADS.y + (root.position.y - BASE.y) * m + (BASE.y - ADS.y) * (1 - k);
        root.position.z = ADS.z + (root.position.z - BASE.z) * m + (BASE.z - ADS.z) * (1 - k);
        root.rotation.x = (root.rotation.x - BROT.x) * m + BROT.x * (1 - k);
        root.rotation.y = (root.rotation.y - BROT.y) * m + BROT.y * (1 - k);
        root.rotation.z = (root.rotation.z - BROT.z) * m + BROT.z * (1 - k);
      }
      root.visible = player.alive;
    },
  };
  return w;
}
