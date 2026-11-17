// Bot actor: implements the Actor interface + combat AI (perception, human-like aim, bursts, strafing, cover,
// hunting) and executes the objective goal given by the team brain (brain.js).
import * as THREE from 'three';
import { SoldierModel, DIM } from '../soldiers/index.js';
import { SKILLS } from './skill.js';
const NORMAL = SKILLS.normal;

export const DIFFICULTY = {
  reaction: [0.25, 0.55], accuracy: 0.55, trackMin: 0.35, trackTime: 1.4, damage: 25, headDamage: 60, headshotChance: 0.1,
  fov: 110 * Math.PI / 180, view: 70, hearing: 38, stepHearing: 11, burst: [3, 6], shotInterval: 0.1, pause: [0.25, 0.6],
  mag: 30, reload: 2.4, run: 5.0, walk: 2.6, crouch: 1.7, turnRate: 7.5, falloffStart: 30,
  holdCone: 0.55, holdReact: 0.5, holdPreAim: 0.7, // holder's advantage (stationary + already facing): balance bench
};
// Sniper bots: single aimed shots, slow bolt, deadly at range, weak up close (hits: 85 body / 150 head)
export const SNIPER = {
  ...DIFFICULTY, accuracy: 0.6, damage: 85, headDamage: 150, headshotChance: 0.16, burst: [1, 1], shotInterval: 1.45, pause: [0.15, 0.5],
  mag: 5, reload: 3.0, falloffStart: 999, reaction: [0.35, 0.7],
};
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
let nextId = 1;

export class Bot {
  constructor(ctx, mgr, { name, team, ally }) {
    this.ctx = ctx; this.mgr = mgr;
    this.id = 'bot' + nextId++; this.name = name; this.team = team; this.ally = !!ally; this.isPlayer = false; this.isBot = true;
    this.alive = true; this.health = 100; this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3();
    this.radius = 0.35; this.height = 1.8; this.hasBomb = false; this.lastShotTime = -100; this.frozen = false;
    this.yaw = 0; this.pitch = 0; this.moveSpeed = 0; this.onGround = true;
    this.model = new SoldierModel(team, ctx); ctx.scene.add(this.model.root);
    this.hb = { head: new THREE.Vector3(), hips: new THREE.Vector3(), neck: new THREE.Vector3(), segs: [] };
    for (let i = 0; i < 9; i++) this.hb.segs.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.08 });
    this.percT = Math.random() * 0.12; this.resetAI();
  }
  get skill() { return this.mgr.skillFor?.(this) ?? NORMAL; }
  get wstats() { return this.weapon === 'sniper' ? SNIPER : DIFFICULTY; }
  setWeapon(id) { this.weapon = id === 'sniper' ? 'sniper' : 'rifle'; this.model.setWeapon?.(this.weapon); this.mag = this.wstats.mag; this.reloadT = -1; }
  get eyeHeight() { return this.height - 0.15; }
  getEyePosition(out = new THREE.Vector3()) { return out.copy(this.position).setY(this.position.y + this.eyeHeight); }

  resetAI() {
    this.mag = this.wstats.mag; this.reloadT = -1; this.target = null; this.targetSeenAt = -100; this.reactUntil = 0; this.trackStart = 0;
    this.lastKnown = null; this.lastKnownT = -100; this.alertT = -100; this.seen = new Map();
    this.burstLeft = 0; this.shotIdx = 0; this.nextShot = 0; this.aimHead = false;
    this.path = null; this.pathI = 0; this.pathGoal = null; this.repathT = 0; this.stuckT = 0; this.stuckPos = this.position.clone();
    this.goal = null; this.cover = null; this.coverUntil = 0; this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.crouching = false; this.crouchUntil = 0; this.using = false; this.fired = false; this.scanPhase = Math.random() * 6;
    this.aimYaw = this.yaw; this.aimPitch = 0; this.lookYaw = this.yaw; this.ready = 0.3;
  }
  spawn(pos, yaw, team) {
    if (team) this.team = team; this.model.setTeam(this.team); // always: teams flip at half-time / side choice
    this.position.copy(pos); this.velocity.set(0, 0, 0); this.yaw = this.aimYaw = this.lookYaw = yaw; this.pitch = this.aimPitch = 0;
    this.health = 100; this.alive = true; this.height = 1.8; this.hasBomb = false;
    this.resetAI(); this.model.reset(); this.model.root.visible = true;
    this.model.pose(this.poseState(0));
  }
  onDeath(killer) {
    this.using = false; this.velocity.set(0, 0, 0); this.moveSpeed = 0;
    const from = killer?.position || this.position; _a.subVectors(this.position, from); _a.y = 0;
    if (_a.lengthSq() < 1e-4) _a.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    _a.normalize().applyAxisAngle(UP, -this.yaw);
    this.model.kill(Math.atan2(_a.x, _a.z) + rand(-0.35, 0.35));
  }
  // Called when hit by an enemy (bot shots + 'weapon:hit' from the player)
  onHit(attacker) {
    if (!this.alive || !attacker) return;
    this.alertT = this.ctx.time; this.lastKnown = attacker.position.clone(); this.lastKnownT = this.ctx.time;
    if (!this.target || !this.isVisible(this.target)) { this.lookYaw = yawTo(attacker.position.x - this.position.x, attacker.position.z - this.position.z); }
    if (this.health < 45 && !this.cover) this.coverUntil = 0;
  }
  isVisible(a) { return (this.ctx.time - (this.seen.get(a) ?? -100)) < 0.3; }

  // ------------------------------------------------------------ perception
  perceive() {
    const { ctx } = this, D = DIFFICULTY, S = this.skill, t = ctx.time, eye = this.getEyePosition(_a);
    let best = null, bestScore = Infinity;
    const pool = this.mgr.targetsFor ? this.mgr.targetsFor(this) : ctx.actors; // zombie mode: nearest zombies only
    for (const e of pool) {
      if (!e.alive || e.team === this.team) continue;
      const dx = e.position.x - this.position.x, dz = e.position.z - this.position.z, d = Math.hypot(dx, dz);
      // hearing: gunshots + running footsteps
      const shotAgo = t - (e.lastShotTime ?? -100);
      const spd = e.moveSpeed ?? Math.hypot(e.velocity?.x || 0, e.velocity?.z || 0);
      if ((shotAgo < 0.25 && d < D.hearing * S.hearing) || (spd > 4 && d < D.stepHearing * S.hearing)) {
        if (!this.target || !this.isVisible(this.target)) {
          this.lastKnown = e.position.clone().add(_d.set(rand(-2, 2), 0, rand(-2, 2)).multiplyScalar(Math.min(1, d / 15)));
          this.lastKnownT = t; this.alertT = t;
        }
      }
      if (d > D.view * S.view) continue;
      const known = this.isVisible(e);
      const inFov = Math.abs(angDiff(this.aimYaw, yawTo(dx, dz))) < D.fov * S.fov / 2 || d < Math.max(2.5, this.mgr.closeAware || 0) || known;
      if (!inFov) continue;
      // LOS to head then chest
      const head = e.getEyePosition ? e.getEyePosition(_b) : _b.copy(e.position).setY(e.position.y + 1.6);
      let vis = ctx.physics.lineOfSight(eye, head);
      if (!vis) { _b.copy(e.position); _b.y += (e.height || 1.8) * 0.55; vis = ctx.physics.lineOfSight(eye, _b); }
      if (!vis) continue;
      // distant & dark: small chance to miss a target in peripheral vision
      if (!known && d > 35 * S.view && Math.random() < S.peripheralMiss) continue;
      this.seen.set(e, t);
      this.mgr.report(this.team, e);
      const score = d * (e === this.target ? 0.6 : 1) * (shotAgo < 1 ? 0.8 : 1);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best && best !== this.target) {
      const alerted = t - this.alertT < 4;
      // holder's advantage: a bot standing still that already faces the new target reacts faster and starts pre-aimed
      const fy = Math.atan2(-(best.position.x - this.position.x), -(best.position.z - this.position.z));
      let dAng = Math.abs(((fy - this.yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      const holding = this.moveSpeed < 0.8 && dAng < D.holdCone;
      this.reactUntil = t + rand(...D.reaction) * S.reaction * (alerted ? 0.7 : 1) * (this.target ? 0.6 : 1) * (holding ? S.holdReact : 1);
      this.trackStart = this.reactUntil - (holding ? D.trackTime * S.trackTime * S.holdPreAim : 0); this.target = best; this.burstLeft = 0; this.shotIdx = 0;
    }
    if (this.target) {
      if (!this.target.alive) { this.target = null; }
      else if (this.isVisible(this.target)) { this.lastKnown = this.target.position.clone(); this.lastKnownT = t; this.targetSeenAt = t; }
      else if (t - this.targetSeenAt > 3) this.target = null;
    }
    // team callouts (veteran): no contact of its own -> check the freshest nearby enemy position a teammate reported
    if (S.shareIntel && !this.target && t - this.lastKnownT > 2) {
      let bi = null, bd = 40;
      for (const [e, info] of this.mgr.intel[this.team] || []) {
        if (!e.alive || t - info.t > 1.5) continue;
        const d = Math.hypot(info.pos.x - this.position.x, info.pos.z - this.position.z); if (d < bd) { bd = d; bi = info; }
      }
      if (bi) { this.lastKnown = bi.pos.clone(); this.lastKnownT = t; this.alertT = t; }
    }
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    const { ctx } = this, t = ctx.time, game = ctx.game, D = this.wstats, S = this.skill;
    this.fired = false;
    if (!this.alive) { this.model.pose(this.poseState(dt)); this.updateHitboxes(); return; }
    const phase = game?.phase ?? 'live';
    const live = phase === 'live';
    if ((this.percT -= dt) <= 0) { this.percT = S.perceive; if (live || phase === 'post') this.perceive(); }
    if (this.reloadT >= 0) { this.reloadT += dt; if (this.reloadT >= D.reload) { this.reloadT = -1; this.mag = D.mag; } }

    const engaged = live && this.target && this.isVisible(this.target);
    const goal = this.goal;
    let speed = 0, crouch = false, dest = null, look = null, faceMove = true;

    // --- objective use (plant / defuse)
    let wantUse = live && goal?.use && this.inUseRange(goal);
    if (wantUse && engaged) {
      const prog = this.useProgress || 0, bomb = game.bomb;
      const commit = goal.kind === 'plant' ? prog > 0.55 : (bomb?.timeLeft ?? 99) < (game.rules?.DEFUSE ?? 6) + 1.2 || prog > 0.6;
      if (!commit && this.target.position.distanceTo(this.position) < 30) wantUse = false;
    }
    if (wantUse) {
      this.useProgress = game.actorUse?.(this, dt) ?? 0; this.using = this.useProgress > 0;
    } else { this.using = false; this.useProgress = 0; }

    const locked = !live || (this.frozen && !this.using) || this.using;
    if (!this.using && this.mag < D.mag && this.reloadT < 0 && (this.mag === 0 || (!engaged && this.mag < D.mag / 2 && t - this.targetSeenAt > 2))) this.reloadT = 0;

    if (!locked) {
      if (engaged) {
        const tp = this.target.position, dist = tp.distanceTo(this.position);
        look = tp;
        const needCover = (this.health < S.coverHp || (S.coverOnReload && this.reloadT >= 0)) && !goal?.noCover;
        if (needCover && t > this.coverUntil) { this.cover = this.mgr.findCover(this, tp); this.coverUntil = t + 4; }
        if (needCover && this.cover) {
          dest = this.cover; speed = D.run; faceMove = false;
          if (Math.hypot(this.cover.x - this.position.x, this.cover.z - this.position.z) < 0.6) { dest = null; crouch = true; }
        } else {
          // strafe (A-D) with random switching, crouch-spray at range
          if ((this.strafeT -= dt) <= 0) { this.strafeT = rand(0.35, 1.0); this.strafeDir = goal?.stand || Math.random() < S.standStill ? 0 : Math.random() < 0.5 ? -1 : 1; if (dist > 16 && Math.random() < S.crouchSpray) this.crouchUntil = t + rand(0.8, 2); }
          crouch = t < this.crouchUntil;
          if (!crouch && this.strafeDir) {
            const dx = tp.x - this.position.x, dz = tp.z - this.position.z, n = Math.hypot(dx, dz) || 1;
            let sx = -dz / n * this.strafeDir, sz = dx / n * this.strafeDir;
            if (dist > 28) { sx += dx / n * 0.6; sz += dz / n * 0.6; } // close distance a bit
            const nav = this.mgr.nav;
            if (nav && !nav.isWalkable(this.position.x + sx * 0.9, this.position.z + sz * 0.9)) { this.strafeDir *= -1; sx = -sx; sz = -sz; }
            dest = { x: this.position.x + sx * 2, z: this.position.z + sz * 2, direct: true }; speed = D.walk; faceMove = false;
          }
        }
      } else if (this.target && this.lastKnown && t - this.lastKnownT < S.hunt && !goal?.noHunt && this.lastKnown.distanceTo(goal?.anchor || this.position) < (goal?.huntRange ?? 25)) {
        // hunt: pre-aim and walk to the last known position
        dest = this.lastKnown; speed = D.walk; look = this.lastKnown; faceMove = false;
        if (this.lastKnown.distanceTo(this.position) < 1.5) { this.target = null; }
      } else if (goal) {
        if (!(goal.use && this.inUseRange(goal))) { dest = goal; speed = goal.speed === 'walk' ? D.walk : D.run; }
        const arrived = Math.hypot(goal.x - this.position.x, goal.z - this.position.z) < (goal.tol ?? 1.0);
        if (arrived) { dest = null; crouch = !!goal.crouch; if (goal.look) { look = goal.look; faceMove = false; } }
        if (!arrived && goal.look && Math.hypot(goal.x - this.position.x, goal.z - this.position.z) < 6) { look = goal.look; faceMove = false; }
        if (t - this.alertT < 3 && this.lastKnown) { look = this.lastKnown; faceMove = false; }
      }
    }
    if (locked && this.using) crouch = true;

    // --- movement
    const want = _c.set(0, 0, 0);
    if (dest && !locked) {
      const wp = dest.direct ? dest : this.followPath(dest);
      if (wp) {
        want.set(wp.x - this.position.x, 0, wp.z - this.position.z);
        const jump = wp.jump === 'up'; if (jump) crouch = false; // ledge shortcut: full speed, jump as soon as the feet touch
        const l = want.length(); if (l > 0.05) want.multiplyScalar((jump ? D.run : crouch ? D.crouch : speed) / l); else want.set(0, 0, 0);
        if (jump && this.onGround && l > 0.3) { this.velocity.y = 7.2; this.velocity.x = want.x; this.velocity.z = want.z; }
        this.jumpWp = wp.jump ? wp : null;
      }
      // separation from nearby actors
      for (const o of this.ctx.actors) {
        if (o === this || !o.alive) continue;
        const dx = this.position.x - o.position.x, dz = this.position.z - o.position.z, d2 = dx * dx + dz * dz;
        if (d2 < 1.1 && d2 > 1e-4) { const f = (1.05 - Math.sqrt(d2)) * 4; want.x += dx * f; want.z += dz * f; }
      }
    }
    const acc = 1 - Math.exp(-dt * 10);
    this.velocity.x += (want.x - this.velocity.x) * acc; this.velocity.z += (want.z - this.velocity.z) * acc;
    if (locked) { this.velocity.x = this.velocity.z = 0; }
    this.onGround = ctx.physics.moveActor(this.position, this.velocity, dt, this.radius, this.height).onGround;
    this.moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.crouching = crouch; this.height += ((crouch ? 1.3 : 1.8) - this.height) * (1 - Math.exp(-dt * 10));
    // stuck detection
    if (dest && !locked) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) { if (this.stuckPos.distanceTo(this.position) < 0.35) { if (this.jumpWp?.link) this.jumpWp.link.cost += 30; this.path = null; this.repathT = 0; if (!dest.direct) this.position.x += rand(-0.05, 0.05); this.strafeDir *= -1; } this.stuckT = 0; this.stuckPos.copy(this.position); }
    }

    // --- look / aim
    let wantYaw = this.aimYaw, wantPitch = 0;
    const eye = this.getEyePosition(_a);
    const scan = Math.sin(t * 0.55 + this.scanPhase) * 0.4;
    if (engaged || look) {
      const p = engaged ? this.aimPoint(_b) : _b.set(look.x, (look.y ?? 0) + 1.3, look.z);
      wantYaw = yawTo(p.x - eye.x, p.z - eye.z); wantPitch = Math.atan2(p.y - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z));
      if (!engaged && !dest && !this.using) wantYaw += scan * 0.8; // hold an angle: scan around it
    } else if (faceMove && this.moveSpeed > 0.5) {
      wantYaw = yawTo(this.velocity.x, this.velocity.z); this.lookYaw = wantYaw;
    } else if (!locked) wantYaw = this.lookYaw + scan;
    const turn = D.turnRate * S.turnRate * dt * (engaged ? 1 : 0.7);
    const dy = angDiff(this.aimYaw, wantYaw); this.aimYaw += THREE.MathUtils.clamp(dy * Math.min(1, dt * 9), -turn, turn);
    this.aimPitch += THREE.MathUtils.clamp((wantPitch - this.aimPitch) * Math.min(1, dt * 8), -turn, turn);
    this.yaw = this.aimYaw;
    this.pitch = this.aimPitch;
    this.ready += ((engaged || (look && !faceMove) || this.using ? 1 : t - this.alertT < 5 ? 0.8 : 0.25) - this.ready) * Math.min(1, dt * 5);

    // --- fire
    if (engaged && !locked && this.reloadT < 0) this.tryFire(Math.abs(dy), eye);

    this.model.pose(this.poseState(dt));
    this.updateHitboxes();
  }

  inUseRange(goal) {
    const game = this.ctx.game, b = game?.bomb; if (!b) return false;
    if (goal.kind === 'plant') return this.hasBomb && !!game.siteAt?.(this.position) && Math.hypot(goal.x - this.position.x, goal.z - this.position.z) < 1.2;
    if (goal.kind === 'defuse') return b.state === 'planted' && b.position && Math.hypot(b.position.x - this.position.x, b.position.z - this.position.z) < 1.2;
    return false;
  }

  aimPoint(out) {
    const tg = this.target, h = tg.height || 1.8;
    if (this.aimHead && tg.getEyePosition) tg.getEyePosition(out); else out.copy(tg.position).setY(tg.position.y + h * 0.68);
    return out;
  }

  // true if a living teammate stands between `from` and `to` (within ~0.55 m of the line)
  allyInLine(from, to) {
    const dx = to.x - from.x, dz = to.z - from.z, len2 = dx * dx + dz * dz; if (len2 < 1e-4) return false;
    for (const a of this.ctx.actors) {
      if (a === this || a === this.target || !a.alive || a.team !== this.team) continue;
      const px = a.position.x - from.x, pz = a.position.z - from.z;
      const u = (px * dx + pz * dz) / len2; if (u <= 0.02 || u >= 0.98) continue;
      const ex = px - u * dx, ez = pz - u * dz; if (ex * ex + ez * ez < 0.3) return true;
    }
    return false;
  }

  tryFire(aimErr, eye) {
    const D = this.wstats, S = this.skill, t = this.ctx.time, tg = this.target, sniper = this.weapon === 'sniper';
    if (t < this.reactUntil || t < this.nextShot || this.mag <= 0) return;
    const dist = tg.position.distanceTo(this.position);
    if (aimErr > (0.1 + 0.6 / Math.max(2, dist)) * S.aimTol) return; // still turning onto the target
    if (this.burstLeft <= 0) { this.burstLeft = Math.round(rand(...D.burst) + (dist < 10 && !sniper ? 3 : 0)); this.shotIdx = 0; this.aimHead = Math.random() < D.headshotChance * S.headshot * 2.5; }
    // probability-based hit model
    const tMin = Math.min(0.9, D.trackMin * S.trackMin), track = tMin + (1 - tMin) * THREE.MathUtils.clamp((t - this.trackStart) / (D.trackTime * S.trackTime), 0, 1);
    const distF = sniper ? THREE.MathUtils.clamp(1.1 - dist / 120, 0.5, 1.05) * (dist < 8 ? 0.7 : 1) : THREE.MathUtils.clamp(1.15 - dist / 55, 0.3, 1.1);
    const moveF = this.moveSpeed > 3 ? 0.55 : this.moveSpeed > 1 ? 0.8 : this.crouching ? 1.15 : 1;
    const ts = tg.moveSpeed ?? 0; const tMoveF = ts > 4 ? 0.75 : ts > 2 ? 0.88 : 1;
    const burstF = Math.max(0.6, 1 - this.shotIdx * 0.07);
    const p = THREE.MathUtils.clamp(D.accuracy * S.accuracy * track * distF * moveF * tMoveF * burstF, 0.03, 0.92);
    const hit = Math.random() < p;
    const head = hit && this.aimHead && Math.random() < 0.5 + track * 0.3 && Math.random() < 0.45;
    const muzzle = this.model.muzzle.getWorldPosition(_d);
    const aimP = this.aimPoint(_b);
    if (this.allyInLine(eye, aimP)) { this.nextShot = t + 0.25; return; } // friendly fire is on: don't shoot through teammates
    const fx = this.ctx.effects;
    let end;
    if (hit) {
      end = head ? aimP : aimP.clone().add(_c.set(rand(-0.15, 0.15), rand(-0.25, 0.15), rand(-0.15, 0.15)));
      // Re-check line of sight at fire time: a shot into cover hits the cover, not the target.
      const toEnd = _c.subVectors(end, eye); const len = toEnd.length(); toEnd.divideScalar(len);
      const blocker = this.ctx.physics.raycast(eye, toEnd, len - 0.05);
      if (blocker) {
        end = blocker.point;
        fx?.impact?.(blocker.point, blocker.normal, blocker.collider?.material || 'concrete');
        fx?.tracer?.(muzzle.clone(), end.clone());
        fx?.muzzleFlash?.(muzzle.clone(), _c.subVectors(end, muzzle).normalize().clone());
        this.ctx.events.emit('bot:fire', { bot: this, origin: muzzle.clone(), hit: false, target: tg });
        this.mag--; this.lastShotTime = t; this.fired = true; this.shotIdx++; this.burstLeft--;
        this.nextShot = t + D.shotInterval * rand(0.95, 1.15) + (this.burstLeft <= 0 ? rand(...D.pause) * S.pause * (dist < 10 ? 0.5 : 1) : 0);
        return;
      }
      const dmg = (head ? D.headDamage : D.damage) * (dist > D.falloffStart ? 0.85 : 1);
      const dir = _c.subVectors(end, eye).normalize();
      this.ctx.combat.applyDamage(tg, dmg, this, { headshot: head, fromPos: eye.clone() });
      tg.onHit?.(this);
      fx?.blood?.(end.clone(), dir.clone());
    } else {
      const dir = _c.subVectors(aimP, eye).normalize();
      const side = _b.crossVectors(dir, UP).normalize(), spread = rand(0.35, 1.1) / Math.max(4, dist) * (Math.random() < 0.5 ? -1 : 1);
      dir.addScaledVector(side, spread).addScaledVector(UP, rand(-0.6, 0.9) / Math.max(4, dist)).normalize();
      const hitW = this.ctx.physics.raycast(eye, dir, 200);
      end = hitW ? hitW.point : eye.clone().addScaledVector(dir, 120);
      if (hitW) fx?.impact?.(hitW.point, hitW.normal, hitW.collider?.material || 'concrete');
    }
    fx?.tracer?.(muzzle.clone(), end.clone ? end.clone() : end);
    fx?.muzzleFlash?.(muzzle.clone(), _c.subVectors(end, muzzle).normalize().clone());
    this.ctx.events.emit('bot:fire', { bot: this, origin: muzzle.clone(), hit, target: tg });
    this.mag--; this.lastShotTime = t; this.fired = true; this.shotIdx++; this.burstLeft--;
    this.nextShot = t + D.shotInterval * rand(0.95, 1.15) + (this.burstLeft <= 0 ? rand(...D.pause) * S.pause * (dist < 10 ? 0.5 : 1) : 0);
  }

  // follow an A* path toward dest; returns the next waypoint {x,z}
  followPath(dest) {
    const nav = this.mgr.nav; if (!nav) return dest;
    const t = this.ctx.time;
    const changed = !this.pathGoal || Math.hypot(this.pathGoal.x - dest.x, this.pathGoal.z - dest.z) > 1.2;
    if ((changed || !this.path || t > this.repathT) && this.mgr.takePathBudget()) {
      const tp = performance.now(); this.path = nav.findPath(this.position.x, this.position.z, dest.x, dest.z); this.pathI = 0; this.mgr.pathSpent += performance.now() - tp;
      this.pathGoal = { x: dest.x, z: dest.z }; this.repathT = t + rand(2.5, 4);
    }
    if (!this.path || !this.path.length) return changed ? null : dest;
    while (this.pathI < this.path.length - 1 && Math.hypot(this.path[this.pathI].x - this.position.x, this.path[this.pathI].z - this.position.z) < 0.45) this.pathI++;
    const wp = this.path[this.pathI];
    if (this.pathI === this.path.length - 1 && Math.hypot(wp.x - this.position.x, wp.z - this.position.z) < 0.25) return null;
    return wp;
  }

  poseState(dt) {
    _d.copy(this.velocity).setY(0).applyAxisAngle(UP, -this.yaw); const l = _d.length() || 1;
    return {
      dt, pos: this.position, yaw: this.yaw, pitch: this.pitch, speed: this.moveSpeed, moveX: _d.x / l, moveZ: _d.z / l,
      crouch: this.crouching ? 1 : 0, ready: this.ready, reload: this.reloadT >= 0 ? this.reloadT / this.wstats.reload : -1,
      headYaw: 0, fired: this.fired,
    };
  }

  // world-space hitboxes from the animated bones
  updateHitboxes() {
    const m = this.model, hb = this.hb, s = hb.segs;
    m.neck.localToWorld(hb.head.set(0, 0.13, 0));
    hb.hips.setFromMatrixPosition(m.hips.matrixWorld); m.spine.localToWorld(hb.neck.set(0, 0.45, 0));
    s[0].a.copy(hb.hips); s[0].b.copy(hb.neck); s[0].r = 0.2;
    let k = 1;
    for (const l of m.legs) {
      s[k].a.setFromMatrixPosition(l.th.matrixWorld); s[k].b.setFromMatrixPosition(l.kn.matrixWorld); s[k].r = 0.095; k++;
      s[k].a.copy(s[k - 1].b); l.kn.localToWorld(s[k].b.set(0, -DIM.shinLen - 0.04, -0.04)); s[k].r = 0.085; k++;
    }
    for (const a of m.arms) {
      s[k].a.setFromMatrixPosition(a.sh.matrixWorld); s[k].b.setFromMatrixPosition(a.el.matrixWorld); s[k].r = 0.07; k++;
      s[k].a.copy(s[k - 1].b); a.el.localToWorld(s[k].b.set(0, -DIM.foreLen - 0.05, 0)); s[k].r = 0.06; k++;
    }
  }

  dispose() { this.ctx.scene.remove(this.model.root); }
}
