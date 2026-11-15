// Spectator first-person view: while dead, the player can switch from the over-the-shoulder spectator camera
// (core/player.js updateSpectator) to the spectated teammate's own eyes, with its weapon (NV-4 / SR-8 viewmodel),
// its aim, ADS / sniper scope while it engages, recoil and muzzle flash on each of its shots, gun lowered while it
// reloads. V or right click toggles the view (choice remembered), left click / Space still cycles teammates.
// Runs inside hud.update BEFORE the name tags are projected, so they use the camera that will be rendered.
import { WEAPONS } from '../weapon/index.js';
import { createFpView } from './fpview.js';

const STORE = 'nv-spec-view';

export function createSpecView(ctx, hudRoot, { esc, ICONS }) {
  if (!ctx.THREE) return { update() {}, active: false, target: null, mode: 'tps' };
  let mode = 'tps';
  try { if (localStorage.getItem(STORE) === 'fps') mode = 'fps'; } catch { /* storage blocked */ }
  const rig = createFpView(ctx, hudRoot);
  let S = null, cur = null, hidden = null, toggle = false, aimHeld = false;

  // ---------------------------------------------------------------- UI
  const el = document.createElement('div');
  el.className = 'nv-spv';
  el.innerHTML = `<div class="xh"></div>
    <div class="card"><div class="k">VUE DE</div><div class="who"></div>
      <div class="hp"><i></i></div><div class="row"></div></div>
    <div class="keys"><span><kbd>CLIC</kbd> / <kbd>ESPACE</kbd> ALLIÉ SUIVANT</span><span><kbd>V</kbd> / <kbd>CLIC DROIT</kbd> VUE 3E PERSONNE</span></div>`;
  hudRoot.querySelector('.nv-game')?.appendChild(el);
  const whoEl = el.querySelector('.who'), hpEl = el.querySelector('.hp i'), rowEl = el.querySelector('.row');
  let lastRow = '';

  addEventListener('keydown', e => {
    if (e.code === 'KeyV' && !e.repeat && !ctx.player?.alive && ctx.player?.spectating && !ctx.paused) toggle = true;
  });
  ctx.events.on('bot:fire', ({ bot } = {}) => { if (S && bot && bot === cur) rig.fire(S); });

  function acquire(a) {
    cur = a;
    const wid = a.weapon === 'sniper' ? 'sniper' : 'rifle';
    S = rig.newState(wid); rig.show(S);
    const m = a.model?.root; // the teammate's own body would fill the screen
    if (m) { hidden = { m, v: m.visible }; m.visible = false; }
    whoEl.textContent = a.name || 'Allié';
    lastRow = '';
    el.classList.add('on'); hudRoot.classList.add('is-specfps');
  }
  function release() {
    if (!cur) return;
    if (hidden) { hidden.m.visible = hidden.v; hidden = null; }
    rig.hide(S);
    S = null; cur = null;
    el.classList.remove('on', 'ads'); hudRoot.classList.remove('is-specfps');
    if (ctx.player) ctx.player._specSnap = true; // the shoulder camera snaps back instead of sliding from the eyes
  }
  ctx.events.on('round:start', release);
  ctx.events.on('match:end', release);

  const k = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, h: 1.8, spd: 0 };

  return {
    get active() { return !!cur; },
    get target() { return cur; },
    get mode() { return mode; },
    update(dt, { killcam = false } = {}) {
      if (ctx.paused) return; // camera keeps its last frame
      const p = ctx.player, input = ctx.input;
      const aim = !!input?.aimDown, aimPressed = aim && !aimHeld; aimHeld = aim;
      const a = p && !p.alive ? p.spectating : null;
      if ((toggle || aimPressed) && a && !killcam) {
        mode = mode === 'fps' ? 'tps' : 'fps';
        try { localStorage.setItem(STORE, mode); } catch { /* storage blocked */ }
      }
      toggle = false;
      const on = !!a && a.alive && mode === 'fps' && !killcam && ctx.game?.phase !== 'over';
      if (!on) { release(); return; }
      if (a !== cur) { release(); acquire(a); }
      const wid = a.weapon === 'sniper' ? 'sniper' : 'rifle';
      if (wid !== S.wid) { rig.hide(S); S = rig.newState(wid); rig.show(S); }
      if (hidden) hidden.m.visible = false;

      k.x = a.position.x; k.y = a.position.y; k.z = a.position.z;
      k.yaw = a.yaw ?? 0; k.pitch = a.aimPitch ?? a.pitch ?? 0; k.h = a.height || 1.8; k.spd = a.moveSpeed ?? 0;
      const t = ctx.time ?? 0;
      const engaged = !a.using && ((t - (a.lastShotTime ?? -100) < 0.45) || (!!a.target?.alive && (a.isVisible ? a.isVisible(a.target) : false)));
      const reload = a.reloadT >= 0 && a.wstats?.reload ? a.reloadT / a.wstats.reload : -1;
      rig.drive(S, k, engaged, dt, reload);
      el.classList.toggle('ads', S.ads > 0.5);

      // card: health + weapon / ammo
      hpEl.style.transform = `scaleX(${Math.max(0, Math.min(1, (a.health ?? 100) / 100)).toFixed(3)})`;
      hpEl.classList.toggle('low', (a.health ?? 100) < 35);
      const def = WEAPONS[wid], mag = a.mag ?? def?.magSize ?? 0, size = a.wstats?.mag ?? def?.magSize ?? 0;
      const row = `${wid}|${mag}|${size}|${reload >= 0}|${Math.round(a.health ?? 100)}|${!!a.hasBomb}`;
      if (row !== lastRow) {
        lastRow = row;
        rowEl.innerHTML = `<span>${ICONS.rifle}<b>${esc(def?.name || 'NV-4')}</b></span>` +
          `<span>${reload >= 0 ? '<b class="rl">RECHARGE…</b>' : `<b>${mag}</b>/${size}`}</span>` +
          `<span>${ICONS.cross}<b>${Math.max(0, Math.round(a.health ?? 100))}</b></span>` +
          (a.hasBomb ? `<span class="bomb">${ICONS.bomb}<b>BOMBE</b></span>` : '');
      }
    },
  };
}
