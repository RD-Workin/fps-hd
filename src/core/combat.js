// Central damage pipeline. Every hit (player or bot) goes through ctx.combat.applyDamage.
export class Combat {
  constructor(ctx) { this.ctx = ctx; }
  // target, attacker: Actor. opts: { headshot, fromPos (Vector3), weapon }
  applyDamage(target, amount, attacker, opts = {}) {
    const { ctx } = this;
    if (!target || !target.alive) return false;
    if (attacker && attacker !== target && attacker.team === target.team) return false; // no friendly fire
    target.health = Math.max(0, target.health - amount);
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
