// STUB — replaced by the HUD agent. See ARCHITECTURE.md.
export function createHud(ctx) {
  const root = document.getElementById('hud');
  root.innerHTML = '<div id="menu" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0008;pointer-events:auto;font-size:28px;cursor:pointer">Cliquer pour jouer</div>';
  const menu = root.querySelector('#menu');
  menu.onclick = () => { ctx.input.requestLock(); if (!ctx.game.started) ctx.game.start(); };
  ctx.events.on('game:paused', () => menu.style.display = 'flex');
  ctx.events.on('game:resumed', () => menu.style.display = 'none');
  return { update(dt) {} };
}
