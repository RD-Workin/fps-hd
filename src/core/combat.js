// Central damage pipeline. Every hit (player or bot) goes through ctx.combat.applyDamage.
export class Combat {
  constructor(ctx) { this.ctx = ctx; this.friendlyFire = true; this.friendlyFireScale = 1; }
  // target, attacker: Actor. opts: { headshot, fromPos (Vector3), weapon }
  applyDamage(target, amount, attacker, opts = {}) {
    const { ctx } = this;
    if (!target || !target.alive) return false;
    const friendly = !!attacker && attacker !== target && attacker.team === target.team;
    if (friendly && !this.friendlyFire) return false;
    if (friendly) {
      amount *= this.friendlyFireScale;
      ctx.events.emit('friendly:fire', { attacker, target, amount });
      if (attacker.isPlayer && ctx.time - (this._ffToast || -9) > 2) { this._ffToast = ctx.time; ctx.events.emit('hud:toast', { text: `Tir allié sur ${target.name} !`, kind: 'warn' }); }
    }
    const before = target.health;
    target.health = Math.max(0, target.health - amount);
    // damage dealt to enemies (scoreboard DÉG column): only what the target actually lost, no friendly fire / self damage
    if (attacker?.stats && attacker !== target && !friendly) attacker.stats.damage = (attacker.stats.damage || 0) + (before - target.health);
    const killed = target.health <= 0;
    if (target.isPlayer) ctx.events.emit('player:damaged', { amount, fromPos: opts.fromPos || attacker?.position, attacker });
    if (killed) {
      target.alive = false;
      target.onDeath?.(attacker, opts);
      ctx.events.emit('actor:killed', { killer: attacker, victim: target, headshot: !!opts.headshot });
      if (target.isPlayer) ctx.events.emit('player:died', { killer: attacker });
    }
    return killed;
  }
}
