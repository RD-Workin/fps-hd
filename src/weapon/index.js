// Weapon module (IN PROGRESS — see docs/decisions/weapon.md). Viewmodel + basic shooting/reload logic.
// TODO next owner: spring anims, multi-stage reload, effects (particles/decals/tracers/explosion) in effects.js.
import * as THREE from 'three';
import { buildViewmodel } from './viewmodel.js';

const FIRE_INTERVAL = 0.1, MAG = 30, RESERVE = 90, RELOAD_T = 2.2, DMG = 30, HEAD_MULT = 3.34;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _end = new THREE.Vector3(), _mz = new THREE.Vector3();

export function createWeapon(ctx) {
  const { camera, player, events } = ctx;
  const vm = buildViewmodel();
  const root = new THREE.Group(); root.add(vm.rifle); camera.add(root);
  const BASE = new THREE.Vector3(0.115, -0.13, -0.26);
  root.position.copy(BASE); vm.rifle.rotation.y = 0.04;

  // Effects contract: no-op placeholders until effects.js is written.
  if (!ctx.effects) ctx.effects = { impact() {}, blood() {}, tracer() {}, muzzleFlash() {}, explosion() {}, smoke() {}, update() {} };

  let cooldown = 0, flashT = 0, kick = 0, bob = 0, swayX = 0, swayY = 0, reloadT = 0;
  const w = {
    name: 'NV-4', mag: MAG, magSize: MAG, reserve: RESERVE, reloading: false, reloadProgress: 0, spread: 0.004, aiming: false, bloom: 0, shotIndex: 0,
    viewmodel: vm,
    resetForRound() { this.mag = MAG; this.reserve = RESERVE; this.reloading = false; this.reloadProgress = 0; this.bloom = 0; },
    startReload() { if (this.reloading || this.mag >= MAG || this.reserve <= 0) return; this.reloading = true; reloadT = 0; },
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
      vm.muzzle.getWorldPosition(_mz);
      if (bh && (!wh || bh.distance < wh.distance)) {
        const dmg = DMG * (bh.distance > 25 ? Math.max(0.73, 1 - (bh.distance - 25) / 130) : 1) * (bh.headshot ? HEAD_MULT : 1);
        const killed = ctx.combat.applyDamage(bh.actor, dmg, player, { headshot: bh.headshot, fromPos: _o.clone() });
        ctx.effects?.blood?.(bh.point, _d); ctx.effects?.tracer?.(_mz, bh.point);
        events.emit('weapon:hit', { actor: bh.actor, headshot: !!bh.headshot, killed, point: bh.point });
      } else if (wh) {
        ctx.effects?.impact?.(wh.point, wh.normal, wh.collider.material); ctx.effects?.tracer?.(_mz, wh.point);
      } else ctx.effects?.tracer?.(_mz, _end.copy(_o).addScaledVector(_d, 300));
      const i = this.shotIndex; const pitch = 0.011 + (i < 10 ? 0.004 : 0), yaw = (i < 12 ? 0.002 : Math.sin(i * 0.45) * 0.006) + (Math.random() - 0.5) * 0.003;
      player.addRecoil(pitch, yaw);
      events.emit('weapon:fire', { origin: _o, dir: _d });
      kick = 1; flashT = 0.05; vm.flash.visible = true; vm.flash.rotation.z = Math.random() * 6.28;
      vm.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    },
    update(dt) {
      const inp = ctx.input;
      // spread
      const moving = Math.min(1, player.moveSpeed / 5.6);
      this.bloom = Math.max(0, this.bloom - dt * (inp.fireDown ? 0.01 : 0.08));
      this.spread = (0.004 + this.bloom + moving * 0.02 + (player.onGround ? 0 : 0.04)) * (inp.crouch ? 0.6 : 1);
      if (!inp.fireDown) this.shotIndex = 0;
      // reload
      if (inp.reloadPressed) this.startReload();
      if (this.reloading) {
        reloadT += dt; this.reloadProgress = Math.min(1, reloadT / RELOAD_T);
        if (reloadT >= RELOAD_T) { const n = Math.min(MAG - this.mag, this.reserve); this.mag += n; this.reserve -= n; this.reloading = false; this.reloadProgress = 0; }
      }
      // fire
      cooldown -= dt;
      if (inp.fireDown && cooldown <= 0 && !this.reloading && this.canFire()) {
        if (this.mag > 0) { this.fire(); cooldown = FIRE_INTERVAL; }
        else if (inp.firePressed) { cooldown = 0.25; this.startReload(); }
      }
      if (cooldown < -FIRE_INTERVAL) cooldown = 0;
      // simple procedural motion (placeholder for spring system)
      flashT -= dt; if (flashT <= 0) vm.flash.visible = false;
      kick = Math.max(0, kick - dt * 14);
      swayX += (-inp.mouseDX * 0.0004 - swayX) * Math.min(1, dt * 8); swayY += (inp.mouseDY * 0.0004 - swayY) * Math.min(1, dt * 8);
      if (player.onGround) bob += dt * player.moveSpeed * 1.9;
      const ba = Math.min(1, player.moveSpeed / 5.6);
      const rl = this.reloading ? Math.sin(this.reloadProgress * Math.PI) : 0;
      root.position.set(BASE.x + Math.sin(bob) * 0.008 * ba + swayX, BASE.y - Math.abs(Math.cos(bob)) * 0.006 * ba - swayY - rl * 0.05 - (inp.crouch ? 0.01 : 0), BASE.z + kick * 0.03);
      root.rotation.set(kick * 0.04 - rl * 0.25, swayX * 2, rl * 0.6 + swayX * 3);
      vm.charger.position.z = -0.12 + kick * 0.08;
      vm.mag.visible = !(this.reloading && this.reloadProgress > 0.3 && this.reloadProgress < 0.6);
    },
  };
  return w;
}
