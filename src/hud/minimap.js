// Rotating minimap. Static layer (walls/props/sites) is pre-rendered once into an offscreen canvas
// and rebuilt only if the collider set changes. Dynamic layer redrawn at ~30 Hz.
const SIZE = 220;           // CSS px
const PPM = 3.3;            // display pixels per meter (view radius ≈ 33 m)

export function createMinimap(ctx, canvas, zoneEl) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = Math.round(SIZE * dpr);
  const g = canvas.getContext('2d');
  const S = PPM * dpr;      // offscreen pixels per meter
  let off = null, offOrigin = { x: 0, z: 0 }, offW = 0, offH = 0, sig = '';
  let acc = 1, sigTimer = 0, zoneTimer = 0, lastZone = null;
  const C = SIZE / 2, R = SIZE / 2;

  function signature() {
    const cols = ctx.world?.minimap?.colliders || ctx.physics?.colliders || [];
    return cols.length + ':' + (ctx.world?.bombSites?.length || 0);
  }

  function computeBounds(cols) {
    const b = ctx.world?.bounds;
    if (b && isFinite(b.minX)) return { minX: b.minX - 8, maxX: b.maxX + 8, minZ: b.minZ - 8, maxZ: b.maxZ + 8 };
    let minX = -60, maxX = 60, minZ = -50, maxZ = 50;
    for (const c of cols) { minX = Math.min(minX, c.box.min.x); maxX = Math.max(maxX, c.box.max.x); minZ = Math.min(minZ, c.box.min.z); maxZ = Math.max(maxZ, c.box.max.z); }
    return { minX: Math.max(minX, -200) - 8, maxX: Math.min(maxX, 200) + 8, minZ: Math.max(minZ, -200) - 8, maxZ: Math.min(maxZ, 200) + 8 };
  }

  function buildStatic() {
    const cols = ctx.world?.minimap?.colliders || ctx.physics?.colliders || [];
    const bb = computeBounds(cols);
    offOrigin = { x: bb.minX, z: bb.minZ };
    offW = Math.ceil((bb.maxX - bb.minX) * S); offH = Math.ceil((bb.maxZ - bb.minZ) * S);
    off = document.createElement('canvas'); off.width = offW; off.height = offH;
    const o = off.getContext('2d');
    o.setTransform(S, 0, 0, S, -bb.minX * S, -bb.minZ * S);
    const wb = ctx.world?.bounds;
    // playable floor
    if (wb) { o.fillStyle = 'rgba(70, 110, 140, .16)'; o.fillRect(wb.minX, wb.minZ, wb.maxX - wb.minX, wb.maxZ - wb.minZ); }
    // grid (10 m)
    o.strokeStyle = 'rgba(120, 190, 230, .07)'; o.lineWidth = 1 / S;
    o.beginPath();
    for (let x = Math.ceil(bb.minX / 10) * 10; x <= bb.maxX; x += 10) { o.moveTo(x, bb.minZ); o.lineTo(x, bb.maxZ); }
    for (let z = Math.ceil(bb.minZ / 10) * 10; z <= bb.maxZ; z += 10) { o.moveTo(bb.minX, z); o.lineTo(bb.maxX, z); }
    o.stroke();
    // sites
    for (const s of ctx.world?.bombSites || []) {
      const r = s.radius || 6;
      o.fillStyle = 'rgba(255, 190, 60, .13)'; o.strokeStyle = 'rgba(255, 200, 80, .6)'; o.lineWidth = 1.4 / S;
      o.setLineDash([3 / S, 2.5 / S]);
      o.beginPath(); o.arc(s.center.x, s.center.z, r, 0, Math.PI * 2); o.fill(); o.stroke();
      o.setLineDash([]);
    }
    // obstacles: only tall-enough boxes (ignore floors / tiny steps / huge ground slabs)
    const mapArea = wb ? (wb.maxX - wb.minX) * (wb.maxZ - wb.minZ) : 1e9;
    const props = [], walls = [];
    for (const c of cols) {
      const b = c.box; if (!b) continue;
      if (b.max.y < 0.9 || b.max.y - Math.max(b.min.y, 0) < 0.6) continue;
      const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (w * d > mapArea * 0.4) continue;
      if (b.min.y > 2.2) continue; // overhead beams etc.
      (b.max.y >= 2.3 ? walls : props).push(b);
    }
    o.fillStyle = 'rgba(150, 175, 195, .42)'; o.strokeStyle = 'rgba(200, 225, 240, .55)'; o.lineWidth = 0.8 / S;
    for (const b of props) { o.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z); o.strokeRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z); }
    o.fillStyle = 'rgba(205, 228, 245, .82)';
    for (const b of walls) o.fillRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
    o.strokeStyle = 'rgba(64, 217, 255, .55)'; o.lineWidth = 1 / S;
    for (const b of walls) o.strokeRect(b.min.x, b.min.z, b.max.x - b.min.x, b.max.z - b.min.z);
  }

  function zoneName(p) {
    let best = null, bd = 1e9;
    for (const s of ctx.world?.bombSites || []) {
      const d = Math.hypot(p.x - s.center.x, p.z - s.center.z);
      if (d < (s.radius || 6) + 1.5) return 'Site ' + s.name;
    }
    for (const l of ctx.world?.minimap?.labels || []) {
      const d = Math.hypot(p.x - l.x, p.z - l.z);
      if (d < bd) { bd = d; best = l.text; }
    }
    return bd < 16 ? best : '';
  }

  function draw() {
    const p = ctx.player; if (!p) return;
    const yaw = p.yaw || 0, px = p.position.x, pz = p.position.z;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const toMini = (x, z, out) => { const dx = x - px, dz = z - pz; out.x = C + (dx * cs - dz * sn) * PPM; out.y = C + (dx * sn + dz * cs) * PPM; return out; };
    const pt = { x: 0, y: 0 };

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
    const bg = g.createRadialGradient(C, C, 10, C, C, R);
    bg.addColorStop(0, 'rgba(12, 26, 38, .82)'); bg.addColorStop(1, 'rgba(4, 9, 15, .9)');
    g.fillStyle = bg; g.fillRect(0, 0, SIZE, SIZE);

    if (off) {
      g.save();
      g.translate(C, C); g.rotate(yaw); g.scale(PPM, PPM); g.translate(-px, -pz);
      g.imageSmoothingEnabled = true;
      g.drawImage(off, offOrigin.x, offOrigin.z, offW / S, offH / S);
      g.restore();
    }
    // view cone
    const cone = g.createRadialGradient(C, C, 0, C, C, 90);
    cone.addColorStop(0, 'rgba(120, 230, 255, .28)'); cone.addColorStop(1, 'rgba(120, 230, 255, 0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(C, C); g.arc(C, C, 90, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fill();

    // site letters (upright)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of ctx.world?.bombSites || []) {
      toMini(s.center.x, s.center.z, pt);
      const dx = pt.x - C, dy = pt.y - C, d = Math.hypot(dx, dy), lim = R - 13;
      if (d > lim) { pt.x = C + dx / d * lim; pt.y = C + dy / d * lim; }
      g.fillStyle = 'rgba(20, 14, 2, .75)'; g.beginPath(); g.arc(pt.x, pt.y, 10, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffcf4d'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#ffcf4d'; g.font = '700 13px Rajdhani, "Barlow Condensed", sans-serif'; g.fillText(s.name, pt.x, pt.y + 1);
    }
    // labels
    const labels = ctx.world?.minimap?.labels;
    if (labels?.length) {
      g.font = '600 9px "Barlow Condensed", Rajdhani, sans-serif'; g.fillStyle = 'rgba(220, 235, 245, .55)';
      for (const l of labels) { toMini(l.x, l.z, pt); if (Math.hypot(pt.x - C, pt.y - C) < R - 14) g.fillText(String(l.text).toUpperCase(), pt.x, pt.y); }
    }

    // smoke clouds (src/grenades)
    for (const c of ctx.grenades?.clouds || []) {
      const dens = ctx.grenades.smokeDensity(c); if (dens <= 0.05) continue;
      toMini(c.center.x, c.center.z, pt);
      g.fillStyle = `rgba(200, 205, 210, ${(0.45 * dens).toFixed(2)})`; g.beginPath(); g.arc(pt.x, pt.y, ctx.grenades.smokeRadius(c) * PPM, 0, Math.PI * 2); g.fill();
    }
    const now = ctx.time || 0;
    const actors = ctx.actors || [];
    // enemies (only while recently firing)
    for (const a of actors) {
      if (a === p || a.team === p.team || !a.alive) continue;
      const since = now - (a.lastShotTime ?? -1e9);
      if (since < 0 || since > 2) continue;
      toMini(a.position.x, a.position.z, pt);
      if (Math.hypot(pt.x - C, pt.y - C) > R - 4) continue;
      const k = 1 - since / 2;
      g.globalAlpha = 0.35 + 0.65 * k;
      g.fillStyle = 'rgba(255, 60, 60, .35)'; g.beginPath(); g.arc(pt.x, pt.y, 4 + 5 * (1 - k), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff4a3a'; g.beginPath(); g.arc(pt.x, pt.y, 3.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
      g.globalAlpha = 1;
    }
    // allies
    for (const a of actors) {
      if (a === p || a.team !== p.team) continue;
      toMini(a.position.x, a.position.z, pt);
      const dx = pt.x - C, dy = pt.y - C, d = Math.hypot(dx, dy), lim = R - 6;
      let edge = false; if (d > lim) { pt.x = C + dx / d * lim; pt.y = C + dy / d * lim; edge = true; }
      if (!a.alive) {
        g.strokeStyle = 'rgba(140, 200, 230, .7)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(pt.x - 3, pt.y - 3); g.lineTo(pt.x + 3, pt.y + 3); g.moveTo(pt.x + 3, pt.y - 3); g.lineTo(pt.x - 3, pt.y + 3); g.stroke();
        continue;
      }
      if (typeof a.yaw === 'number' && !edge) {
        const ang = -(a.yaw - yaw); // relative heading on screen (0 = up)
        g.fillStyle = 'rgba(64, 217, 255, .35)'; g.beginPath(); g.moveTo(pt.x, pt.y);
        g.arc(pt.x, pt.y, 10, -Math.PI / 2 + ang - 0.45, -Math.PI / 2 + ang + 0.45); g.closePath(); g.fill();
      }
      g.fillStyle = edge ? 'rgba(64, 217, 255, .6)' : '#40d9ff';
      g.beginPath(); g.arc(pt.x, pt.y, edge ? 3 : 3.8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0, 20, 30, .8)'; g.lineWidth = 1; g.stroke();
    }
    // bomb
    const bomb = ctx.game?.bomb;
    if (bomb) {
      let pos = null;
      if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.position) pos = bomb.position;
      else if (bomb.state === 'planted' && bomb.site) pos = ctx.world?.bombSites?.find(s => s.name === bomb.site)?.center;
      else if (bomb.state === 'carried' && bomb.carrier && bomb.carrier !== p && bomb.carrier.team === p.team) pos = bomb.carrier.position;
      if (pos) {
        toMini(pos.x, pos.z, pt);
        const dx = pt.x - C, dy = pt.y - C, d = Math.hypot(dx, dy), lim = R - 10;
        if (d > lim) { pt.x = C + dx / d * lim; pt.y = C + dy / d * lim; }
        const planted = bomb.state === 'planted';
        const pulse = planted ? 0.5 + 0.5 * Math.sin(performance.now() / 120) : 0;
        if (planted) { g.fillStyle = `rgba(255, 40, 60, ${0.25 + 0.3 * pulse})`; g.beginPath(); g.arc(pt.x, pt.y, 9 + 4 * pulse, 0, Math.PI * 2); g.fill(); }
        const ox = bomb.state === 'carried' ? 6 : 0, oy = bomb.state === 'carried' ? -7 : 0;
        g.fillStyle = planted ? '#ff3b4a' : '#ffcf4d';
        g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1;
        g.beginPath(); g.rect(pt.x + ox - 5, pt.y + oy - 3.5, 10, 7); g.fill(); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(pt.x + ox - 3.5, pt.y + oy - 1.5, 4, 3);
      }
    }
    // capture du drapeau: both bases, both flags; a carrier is visible to everyone
    const flags = ctx.game?.mode === 'ctf' ? ctx.game.flags : null;
    if (flags) {
      for (const team of ['ATK', 'DEF']) {
        const F = flags[team]; if (!F?.base) continue;
        const ally = team === p.team, col = ally ? '#40d9ff' : '#ff5a3c';
        const clampPt = (x, z, m) => { toMini(x, z, pt); const dx = pt.x - C, dy = pt.y - C, d = Math.hypot(dx, dy), lim = R - m; if (d > lim) { pt.x = C + dx / d * lim; pt.y = C + dy / d * lim; } };
        // base pad
        clampPt(F.base.x, F.base.z, 8);
        g.strokeStyle = col; g.lineWidth = 1.5; g.globalAlpha = F.state === 'base' ? 0.9 : 0.45;
        g.beginPath(); g.arc(pt.x, pt.y, 6, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
        // flag (on the pad, on the ground or on its carrier)
        const pos = F.state === 'carried' && F.carrier ? F.carrier.position : F.position; if (!pos) continue;
        clampPt(pos.x, pos.z, 10);
        if (F.state !== 'base') {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
          g.fillStyle = ally ? `rgba(64, 217, 255, ${0.2 + 0.25 * pulse})` : `rgba(255, 80, 50, ${0.2 + 0.25 * pulse})`;
          g.beginPath(); g.arc(pt.x, pt.y, 8 + 3 * pulse, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 1; g.fillStyle = col;
        g.beginPath(); g.moveTo(pt.x - 2, pt.y + 6); g.lineTo(pt.x - 2, pt.y - 7); g.lineTo(pt.x + 6, pt.y - 4); g.lineTo(pt.x - 2, pt.y - 1); g.closePath(); g.fill(); g.stroke();
        if (F.state === 'carried' && F.carrier && F.carrier !== p) { // carrier dot, even an enemy one
          g.fillStyle = F.carrier.team === p.team ? '#40d9ff' : '#ff4a3a'; g.beginPath(); g.arc(pt.x - 2, pt.y + 6, 3, 0, Math.PI * 2); g.fill(); g.stroke();
        }
      }
    }
    g.restore();

    // player arrow
    g.save(); g.translate(C, C);
    g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(0, 30, 45, .9)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
    g.shadowColor = 'rgba(64, 217, 255, .9)'; g.shadowBlur = 8; g.fill(); g.shadowBlur = 0; g.stroke();
    g.restore();
    // inner ring
    g.strokeStyle = 'rgba(64, 217, 255, .12)'; g.lineWidth = 1;
    g.beginPath(); g.arc(C, C, R * 0.5, 0, Math.PI * 2); g.stroke();
  }

  return {
    update(dt) {
      sigTimer -= dt;
      if (!off || sigTimer <= 0) {
        sigTimer = 1;
        const s = signature();
        if (s !== sig) { sig = s; try { buildStatic(); } catch (e) { console.warn('[hud] minimap static', e); } }
      }
      acc += dt;
      if (acc >= 1 / 30) { acc = 0; draw(); }
      zoneTimer -= dt;
      if (zoneTimer <= 0 && zoneEl && ctx.player) {
        zoneTimer = 0.5;
        const z = zoneName(ctx.player.position) || '';
        if (z !== lastZone) { lastZone = z; zoneEl.textContent = z; }
      }
    },
    rebuild() { sig = ''; sigTimer = 0; },
    get yaw() { return ctx.player?.yaw || 0; },
  };
}
