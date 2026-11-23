// Whole-map view of the minimap (N cycles: close minimap → wide minimap → whole map → close): north up, the full map
// fitted in a panel at the minimap's place. Static layer (walls, props, floor) is rendered
// once per collider set into an offscreen canvas; the dynamic layer (sites, allies, bomb, smokes, flags, enemies heard
// firing) is redrawn at ~20 Hz while the map is open. Only what the player's team knows is shown.
const ALLY = '#40d9ff', ENEMY = '#ff4a3a', GOLD = '#ffcf4d';

export function createBigMap(ctx, root) {
  const el = document.createElement('div');
  el.className = 'nv-bigmap';
  el.innerHTML = `<div class="nv-bm-head"><b>CARTE</b><span class="nv-bm-obj"></span></div><canvas></canvas>
    <div class="nv-bm-leg"><i class="me"></i>Vous<i class="al"></i>Alliés<i class="en"></i>Ennemi repéré (tir)<i class="si"></i>Site visé<i class="bo"></i>Bombe<span>N : revenir à la minimap</span></div>`;
  root.appendChild(el);
  const cv = el.querySelector('canvas'), g = cv.getContext('2d'), objEl = el.querySelector('.nv-bm-obj');
  let open = false, acc = 1, sig = '', off = null, bb = null, W = 0, H = 0, dpr = 1;
  const SS = 4; // offscreen pixels per meter

  let hold = false; // shown (set by the HUD's N cycle)

  const cols = () => ctx.world?.minimap?.colliders || ctx.physics?.colliders || [];
  function bounds() {
    const b = ctx.game?.mode === 'zombie' || ctx.game?.mode === 'ctf' ? (ctx.world?.coreBounds || ctx.world?.bounds) : ctx.world?.bounds;
    return b && isFinite(b.minX) ? { minX: b.minX - 4, maxX: b.maxX + 4, minZ: b.minZ - 4, maxZ: b.maxZ + 4 } : { minX: -60, maxX: 60, minZ: -50, maxZ: 50 };
  }
  function buildStatic() {
    bb = bounds();
    off = document.createElement('canvas');
    off.width = Math.ceil((bb.maxX - bb.minX) * SS); off.height = Math.ceil((bb.maxZ - bb.minZ) * SS);
    const o = off.getContext('2d');
    o.setTransform(SS, 0, 0, SS, -bb.minX * SS, -bb.minZ * SS);
    o.fillStyle = 'rgba(70, 110, 140, .18)'; o.fillRect(bb.minX, bb.minZ, bb.maxX - bb.minX, bb.maxZ - bb.minZ);
    o.strokeStyle = 'rgba(120, 190, 230, .08)'; o.lineWidth = 1 / SS; o.beginPath();
    for (let x = Math.ceil(bb.minX / 10) * 10; x <= bb.maxX; x += 10) { o.moveTo(x, bb.minZ); o.lineTo(x, bb.maxZ); }
    for (let z = Math.ceil(bb.minZ / 10) * 10; z <= bb.maxZ; z += 10) { o.moveTo(bb.minX, z); o.lineTo(bb.maxX, z); }
    o.stroke();
    const props = [], walls = [], area = (bb.maxX - bb.minX) * (bb.maxZ - bb.minZ);
    for (const c of cols()) {
      const b = c.box; if (!b) continue;
      if (b.max.y < 0.9 || b.max.y - Math.max(b.min.y, 0) < 0.6 || b.min.y > 2.2) continue;
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z; if (w * d > area * 0.4) continue;
      if (b.max.x < bb.minX || b.min.x > bb.maxX || b.max.z < bb.minZ || b.min.z > bb.maxZ) continue;
      (b.max.y >= 2.3 ? walls : props).push(b);
    }
    o.fillStyle = 'rgba(120, 145, 165, .38)';
    for (const b of props) o.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
    o.fillStyle = 'rgba(150, 178, 200, .55)';
    for (const b of walls) o.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
    o.strokeStyle = 'rgba(64, 217, 255, .35)'; o.lineWidth = 0.6 / SS;
    for (const b of walls) o.strokeRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
    // multi-storey houses: hatched outline (enterable, several floors)
    for (const h of ctx.world?.nav?.storeys || []) {
      const r = h.house; if (!r) continue;
      o.fillStyle = 'rgba(255, 207, 77, .10)'; o.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
      o.strokeStyle = 'rgba(255, 207, 77, .55)'; o.lineWidth = 1.2 / SS; o.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  }

  function draw() {
    const p = ctx.player; if (!p || !off) return;
    if (cv.width !== Math.round(cv.getBoundingClientRect().width * dpr)) resize();
    const bw = bb.maxX - bb.minX, bh = bb.maxZ - bb.minZ, k = Math.min(W / bw, H / bh);
    const ox = (W - bw * k) / 2 - bb.minX * k, oz = (H - bh * k) / 2 - bb.minZ * k;
    const X = x => ox + x * k, Y = z => oz + z * k;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, X(bb.minX), Y(bb.minZ), bw * k, bh * k);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.max(10, Math.min(15, k * 4.2));
    // zone labels
    g.font = `600 ${fs * 0.8}px "Barlow Condensed", Rajdhani, sans-serif`; g.fillStyle = 'rgba(220, 235, 245, .6)';
    for (const l of ctx.world?.minimap?.labels || []) if (l.x > bb.minX && l.x < bb.maxX && l.z > bb.minZ && l.z < bb.maxZ) g.fillText(String(l.text).toUpperCase(), X(l.x), Y(l.z));
    // sites: active ones bright, others dimmed
    const active = new Set((ctx.world?.bombSites || []).map(s => s.name));
    const sites = ctx.game?.mode === 'ctf' || ctx.game?.mode === 'zombie' ? [] : (ctx.world?.allSites || ctx.world?.bombSites || []);
    for (const s of sites) {
      const on = active.has(s.name), r = (s.radius || 6) * k;
      g.globalAlpha = on ? 1 : 0.35;
      g.fillStyle = on ? 'rgba(255, 190, 60, .2)' : 'rgba(255, 190, 60, .06)'; g.strokeStyle = GOLD; g.lineWidth = on ? 2 : 1;
      g.setLineDash([5, 4]); g.beginPath(); g.arc(X(s.center.x), Y(s.center.z), r, 0, Math.PI * 2); g.fill(); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(20, 14, 2, .85)'; g.beginPath(); g.arc(X(s.center.x), Y(s.center.z), fs * 1.1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
      g.fillStyle = GOLD; g.font = `700 ${fs * 1.3}px Rajdhani, "Barlow Condensed", sans-serif`; g.fillText(s.name, X(s.center.x), Y(s.center.z) + 1);
      g.globalAlpha = 1;
    }
    // smokes
    for (const c of ctx.grenades?.clouds || []) {
      const d = ctx.grenades.smokeDensity(c); if (d <= 0.05) continue;
      g.fillStyle = `rgba(200, 205, 210, ${(0.5 * d).toFixed(2)})`; g.beginPath(); g.arc(X(c.center.x), Y(c.center.z), ctx.grenades.smokeRadius(c) * k, 0, Math.PI * 2); g.fill();
    }
    const now = ctx.time || 0, actors = ctx.actors || [];
    // enemies heard firing in the last 3 s
    for (const a of actors) {
      if (a === p || a.team === p.team || !a.alive) continue;
      const since = now - (a.lastShotTime ?? -1e9); if (since < 0 || since > 3) continue;
      g.globalAlpha = 1 - since / 3.5;
      g.fillStyle = 'rgba(255, 60, 60, .3)'; g.beginPath(); g.arc(X(a.position.x), Y(a.position.z), 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = ENEMY; g.beginPath(); g.arc(X(a.position.x), Y(a.position.z), 4.5, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    // zombies
    const zs = ctx.game?.mode === 'zombie' ? ctx.game.zombie?.horde?.dots?.() : null;
    if (zs?.length) { g.fillStyle = '#9be35a'; for (const z of zs) { g.beginPath(); g.arc(X(z.position.x), Y(z.position.z), 3, 0, Math.PI * 2); g.fill(); } }
    // allies: heading cone, dot, name; dead = cross
    g.font = `600 ${fs * 0.78}px "Barlow Condensed", Rajdhani, sans-serif`;
    const named = [];
    for (const a of actors) {
      if (a === p || a.team !== p.team) continue;
      const x = X(a.position.x), y = Y(a.position.z);
      if (!a.alive) { g.strokeStyle = 'rgba(140, 200, 230, .7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); continue; }
      if (typeof a.yaw === 'number') { g.fillStyle = 'rgba(64, 217, 255, .3)'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, 16, -Math.PI / 2 - a.yaw - 0.45, -Math.PI / 2 - a.yaw + 0.45); g.closePath(); g.fill(); }
      g.fillStyle = ALLY; g.strokeStyle = 'rgba(0, 20, 30, .85)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      if (a.position.y > (ctx.world?.nav?.floorAt?.(a.position.x, a.position.z) ?? 0) + 2) { g.strokeStyle = GOLD; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke(); } // upstairs / on a roof
      if (a.name && !named.some(q => Math.abs(q[0] - x) < 46 && Math.abs(q[1] - y) < 12)) { named.push([x, y]); g.fillStyle = 'rgba(200, 240, 255, .85)'; g.fillText(a.name, x, y - 11); } // no overlapping names
    }
    // bomb
    const bomb = ctx.game?.bomb;
    if (bomb && ctx.game?.mode !== 'ctf' && ctx.game?.mode !== 'zombie') {
      let pos = null;
      if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.position) pos = bomb.position;
      else if (bomb.state === 'planted' && bomb.site) pos = ctx.world?.bombSites?.find(s => s.name === bomb.site)?.center;
      else if (bomb.state === 'carried' && bomb.carrier && bomb.carrier.team === p.team) pos = bomb.carrier.position;
      if (pos) {
        const x = X(pos.x) + (bomb.state === 'carried' ? 9 : 0), y = Y(pos.z) - (bomb.state === 'carried' ? 9 : 0), planted = bomb.state === 'planted';
        if (planted) { const q = 0.5 + 0.5 * Math.sin(performance.now() / 120); g.fillStyle = `rgba(255, 40, 60, ${0.25 + 0.3 * q})`; g.beginPath(); g.arc(x, y, 12 + 5 * q, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = planted ? '#ff3b4a' : GOLD; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 1.2;
        g.beginPath(); g.rect(x - 7, y - 5, 14, 10); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 5, y - 2, 5, 4);
      }
    }
    // CTF flags and bases
    const flags = ctx.game?.mode === 'ctf' ? ctx.game.flags : null;
    if (flags) for (const team of ['ATK', 'DEF']) {
      const F = flags[team]; if (!F?.base) continue;
      const col = team === p.team ? ALLY : '#ff5a3c';
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(X(F.base.x), Y(F.base.z), 9, 0, Math.PI * 2); g.stroke();
      const pos = F.state === 'carried' && F.carrier ? F.carrier.position : F.position; if (!pos) continue;
      const x = X(pos.x), y = Y(pos.z);
      g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 3, y + 9); g.lineTo(x - 3, y - 10); g.lineTo(x + 9, y - 6); g.lineTo(x - 3, y - 2); g.closePath(); g.fill(); g.stroke();
    }
    // player arrow
    g.save(); g.translate(X(p.position.x), Y(p.position.z)); g.rotate(-(p.yaw || 0));
    g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0, 30, 45, .9)'; g.lineWidth = 1.5; g.shadowColor = 'rgba(64, 217, 255, .9)'; g.shadowBlur = 10;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.shadowBlur = 0; g.stroke();
    g.restore();
  }

  function objectiveText() {
    const p = ctx.player, mode = ctx.game?.mode;
    if (mode === 'ctf') return 'Capture du drapeau';
    if (mode === 'zombie') return 'Survie';
    const names = (ctx.world?.bombSites || []).map(s => s.name);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' ou ' + names[names.length - 1] : names[0] || '';
    const b = ctx.game?.bomb;
    if (b?.state === 'planted') return `Bombe posée sur le site ${b.site || ''}` + (p?.team === 'DEF' ? ' — désamorcez-la' : ' — défendez-la');
    return p?.team === 'DEF' ? `Défendre les sites ${list}` : `Poser la bombe sur le site ${list}`;
  }

  return {
    update(dt) {
      const want = hold && !ctx.paused && ctx.game?.phase !== 'menu' && !!ctx.player;
      if (want !== open) { open = want; el.classList.toggle('on', open); if (open) { const b = bounds(); cv.style.aspectRatio = `${b.maxX - b.minX} / ${b.maxZ - b.minZ}`; resize(); acc = 1; } }
      if (!open) return;
      const s = cols().length + ':' + (ctx.game?.mode || '') + ':' + (ctx.world?.bounds?.maxX || 0);
      if (s !== sig || !off) { sig = s; try { buildStatic(); } catch (e) { console.warn('[hud] bigmap static', e); } }
      acc += dt;
      if (acc >= 1 / 20) { acc = 0; objEl.textContent = objectiveText(); draw(); }
    },
    get open() { return open; },
    show(v) { hold = !!v; },
  };
}
