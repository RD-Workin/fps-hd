// Room clearing for attacker fire-teams (squads.js): a house with storeys (world.nav.storeys) that holds an enemy, or
// that overlooks the team's target site, gets cleared by a pair before the team moves on.
//
// Drill: the pair stacks on both sides of the door (crouched, weapons on the doorway); entry: the point button-hooks to
// the far corner, the second takes the near corner, each covering the other's dead angle; then floor by floor: the
// point climbs while the second covers the stair top from below, the second joins, the point checks the far corner of
// the new floor... up to the roof. The rest of the team holds outside, weapons on the windows. Each step ends when both
// are in place, or after 7 s; the whole clearing is dropped after 50 s or when the pair is down.
// Cost: a handful of comparisons per team and brain tick; plans are built once per (house, door).
import { SH } from '../world/storeys.js';
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class HouseClear {
  constructor(squads) { this.squads = squads; this.cache = null; }
  get claimed() { return (this.brain.plan.claimed ||= new Map()); } // per round (brain.plan is rebuilt at each round)
  get brain() { return this.squads.brain; }

  houses() {
    const st = this.brain.ctx.world?.nav?.storeys;
    if (!st?.length) return [];
    if (this.cache && this.cache.src === st) return this.cache.list;
    const list = st.map(s => {
      const h = s.house, box = { x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1 };
      const top = h.roof ? h.floors : h.floors - 1, F = k => h.base + k * SH;
      const doors = (h.doors || []).map(([side, c]) => {
        const o = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side], wallX = side === 'W' ? h.x0 : side === 'E' ? h.x1 : c, wallZ = side === 'N' ? h.z0 : side === 'S' ? h.z1 : c;
        const tx = o[1] !== 0 ? 1 : 0, tz = o[0] !== 0 ? 1 : 0; // along the wall
        return { side, c: { x: wallX, z: wallZ }, o, t: { x: tx, z: tz } };
      });
      return { id: h.id, h, box, top, F, doors, portals: s.portals || [], c: { x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2 } };
    });
    this.cache = { src: st, list };
    return list;
  }
  inside(H, p, pad = 0.3) { return p.x > H.box.x0 - pad && p.x < H.box.x1 + pad && p.z > H.box.z0 - pad && p.z < H.box.z1 + pad; }

  // a house worth clearing for this team: enemy seen in it (8 s), or one of the windows/roofs that see its target site
  pick(t, point, now) {
    const B = this.brain;
    let best = null, bd = 40;
    for (const H of this.houses()) {
      const d = hd(H.c, point.position); if (d > bd || this.claimed.has(H.id) || this.inside(H, point.position, 0)) continue;
      let why = null;
      for (const [e, i] of B.mgr.intel.ATK) if (e.alive && now - i.t < 8 && this.inside(H, i.pos)) { why = 'contact'; break; }
      if (!why && B.highSpots(t.site.name).some(s => this.inside(H, s))) why = 'overwatch';
      if (why) { best = { H, why }; bd = d; }
    }
    return best;
  }

  // ordered steps [{a: point goal, b: second goal}] for a house entered by door D
  plan(H, D) {
    const P = (x, z, y, look) => ({ x, z, y, look });
    const out = { x: D.c.x + D.o[0] * 1.6, z: D.c.z + D.o[1] * 1.6 }, inn = { x: D.c.x - D.o[0] * 1.3, z: D.c.z - D.o[1] * 1.3 };
    const y0 = H.F(0), dc = { x: D.c.x, y: y0, z: D.c.z };
    const steps = [];
    // stack on both sides of the door
    steps.push({ a: P(out.x + D.t.x * 1.1, out.z + D.t.z * 1.1, y0, dc), b: P(out.x - D.t.x * 1.1, out.z - D.t.z * 1.1, y0, dc), crouch: true });
    // entry: button-hook to the two corners on the door wall's far side (each one watches across the room)
    const inset = 1.0, cs = [[H.box.x0 + inset, H.box.z0 + inset], [H.box.x1 - inset, H.box.z0 + inset], [H.box.x0 + inset, H.box.z1 - inset], [H.box.x1 - inset, H.box.z1 - inset]]
      .map(([x, z]) => ({ x, z })).sort((p, q) => hd(q, inn) - hd(p, inn));
    const far = cs[0], near = cs[1];
    steps.push({ a: P(far.x, far.z, y0, { x: near.x, y: y0, z: near.z }), b: P(near.x, near.z, y0, { x: far.x, y: y0, z: far.z }) });
    // floor by floor up the stair: the point climbs, the second covers the top from the bottom, then joins
    for (const pt of [...H.portals].sort((p, q) => p.k - q.k)) {
      const yb = H.F(pt.k), yt = H.F(pt.k + 1), topLook = { x: pt.top.x, y: yt, z: pt.top.z };
      steps.push({ a: P(pt.top.x, pt.top.z, yt, { x: H.c.x, y: yt, z: H.c.z }), b: P(pt.bottom.x, pt.bottom.z, yb, topLook) });
      const fc = cs.map(c => ({ ...c })).sort((p, q) => hd(q, pt.top) - hd(p, pt.top))[0];
      steps.push({ a: P(fc.x, fc.z, yt, { x: pt.top.x, y: yt, z: pt.top.z }), b: P(pt.top.x, pt.top.z, yt, { x: fc.x, y: yt, z: fc.z }) });
    }
    return steps;
  }

  // per tick, called by squads.teamGoals while the team moves or stages. Returns true when the team is busy clearing.
  update(t, m, carrier, now) {
    const pair = m.filter(b => b !== carrier);
    if (!t.clear) {
      if (pair.length < 3 || now < (t.clearCool ?? 0)) return false; // keep at least one outside + never with a lone pair
      const pk = this.pick(t, pair[0], now); if (!pk) return false;
      const D = [...pk.H.doors].sort((a, b) => hd(a.c, pair[0].position) - hd(b.c, pair[0].position))[0]; if (!D) return false;
      this.claimed.set(pk.H.id, t);
      t.clear = { H: pk.H, D, steps: this.plan(pk.H, D), i: 0, at: now, stepAt: now, a: pair[0], b: pair[1], why: pk.why };
    }
    const C = t.clear;
    const done = (ok) => {
      // a house cleared for its view of the site: the pair member closest to the best window / roof spot stays up there
      // as the team's marksman (overwatch over the execute, then over the planted bomb); only with 4+ alive members
      if (ok && C.why === 'overwatch' && m.length >= 4) {
        const sp = this.brain.highSpots(t.site.name).find(s => this.inside(C.H, s));
        const who = sp && [C.a, C.b].filter(b => b.alive).sort((p, q) => hd(p.position, sp) - hd(q.position, sp))[0];
        if (who) { this.brain.plan.ow ||= new Map(); this.brain.plan.ow.set(who, { ...sp, site: t.site.name }); }
      }
      t.clear = null; t.clearCool = now + 10; return false;
    };
    if (!C.a.alive && !C.b.alive) return done(false);
    if (now - C.at > 50) return done(false);
    if (C.i >= C.steps.length) return done(true);
    const S = C.steps[C.i], A = C.a.alive ? C.a : C.b, Bb = C.a.alive && C.b.alive ? C.b : null;
    const at = (b, g) => hd(b.position, g) < 1.6 && Math.abs(b.position.y - g.y) < 1.5;
    if ((at(A, S.a) && (!Bb || at(Bb, S.b))) || now - C.stepAt > 7) { C.i++; C.stepAt = now; if (C.i >= C.steps.length) return done(true); }
    const S2 = C.steps[C.i];
    const goal = (g, run) => ({ x: g.x, z: g.z, y: g.y, tol: 0.9, speed: run ? 'run' : 'tac', look: g.look, watch: g.look, crouch: !!S2.crouch, exact: true, noHunt: false, anchor: g, huntRange: 6 });
    A.goal = goal(S2.a, C.i === 0);
    if (Bb) Bb.goal = goal(S2.b, C.i === 0);
    // the others hold outside, 7-9 m off the door, weapons on the house (windows / roof)
    const outside = m.filter(b => b !== C.a && b !== C.b && b !== carrier);
    const D = C.D, base = { x: D.c.x + D.o[0] * 8, z: D.c.z + D.o[1] * 8 }, nav = this.squads.nav;
    outside.forEach((b, i) => {
      const s = nav.snap(base.x + D.t.x * (i % 2 ? -3 : 3) * (1 + (i >> 1)), base.z + D.t.z * (i % 2 ? -3 : 3) * (1 + (i >> 1))) || base;
      const look = { x: C.H.c.x, y: C.H.F(Math.min(C.H.top, 1)), z: C.H.c.z };
      b.goal = { x: s.x, z: s.z, tol: 1.5, speed: 'tac', look, watch: look, crouch: true, exact: true, anchor: s, huntRange: 10 };
    });
    if (carrier && carrier.alive) { const s = nav.snap(base.x, base.z) || base; carrier.goal = { x: s.x, z: s.z, tol: 1.5, speed: 'tac', crouch: true, noHunt: true, exact: true, formation: true, look: C.H.c }; }
    return true;
  }
}
