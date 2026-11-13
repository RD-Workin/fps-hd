// Loadout picker shown during the round freeze: [1] assault rifle / [2] sniper. Keys 1/2 (layout independent via
// event.code), mouse wheel, left click (cycles while the pointer is locked) or a click on a card when the cursor is free.
// The choice is remembered (localStorage 'nova.weapon') and used by default every round.
const KEY = 'nova.weapon';
export function loadPref() { try { const v = localStorage.getItem(KEY); return v === 'sniper' ? 'sniper' : 'rifle'; } catch { return 'rifle'; } }
function savePref(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }

const ICON = {
  rifle: '<svg viewBox="0 0 120 34"><path d="M4 15h22l4-4h44l3 3h18v4h-8v3H76l-4 3h-8l-3 9h-8l2-9H38l-3 6H24l2-7H4z" fill="currentColor"/><rect x="40" y="6" width="16" height="5" rx="1.5" fill="currentColor"/></svg>',
  sniper: '<svg viewBox="0 0 120 34"><path d="M2 16h20l3-3h40l2 2h50v3H66l-2 3H48l-3 8h-7l2-8H30l-4 6H16l2-6H2z" fill="currentColor"/><rect x="32" y="5" width="30" height="6" rx="3" fill="currentColor"/><rect x="28" y="4" width="6" height="8" rx="2" fill="currentColor"/><rect x="60" y="4" width="6" height="8" rx="2" fill="currentColor"/></svg>',
};

export function createLoadout(ctx, defs, onPick) {
  let pref = loadPref();
  const el = document.createElement('div');
  el.className = 'nv-loadout';
  el.innerHTML = `
  <style>
    .nv-loadout { position: fixed; left: 50%; bottom: 22px; transform: translate(-50%, 12px); z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 8px;
      font-family: var(--f-ui, 'Barlow Condensed', 'Arial Narrow', sans-serif); color: #e9eef3; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; }
    .nv-loadout.on { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
    .nv-loadout .t { font-size: 12px; letter-spacing: .4em; color: rgba(233,238,243,.7); font-weight: 600; text-shadow: 0 1px 3px #000; }
    .nv-loadout .row { display: flex; gap: 10px; }
    .nv-loadout .c { position: relative; width: 168px; padding: 10px 14px 10px; background: rgba(7,12,19,.62); cursor: pointer; backdrop-filter: blur(6px);
      clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); border: 1px solid rgba(255,255,255,.08);
      transition: background .15s, box-shadow .15s; }
    .nv-loadout .c:hover { background: rgba(20,32,46,.75); }
    .nv-loadout .c.sel { background: rgba(64,217,255,.16); box-shadow: inset 0 0 0 1px rgba(64,217,255,.75); }
    .nv-loadout .k { position: absolute; top: 8px; right: 10px; font: 600 12px/18px var(--f-num, 'Rajdhani', monospace); width: 18px; text-align: center;
      border: 1px solid rgba(255,255,255,.35); border-radius: 3px; color: rgba(255,255,255,.8); }
    .nv-loadout .c.sel .k { border-color: #40d9ff; color: #40d9ff; }
    .nv-loadout svg { width: 120px; height: 34px; color: rgba(233,238,243,.85); display: block; margin: 2px 0 6px; }
    .nv-loadout .c.sel svg { color: #fff; }
    .nv-loadout .n { font-size: 18px; font-weight: 700; letter-spacing: .06em; line-height: 1; }
    .nv-loadout .d { font-size: 12px; color: rgba(233,238,243,.65); letter-spacing: .04em; margin-top: 3px; }
    .nv-loadout .h { font-size: 11px; letter-spacing: .12em; color: rgba(233,238,243,.55); text-shadow: 0 1px 3px #000; }
    @media (max-width: 1000px) { .nv-loadout { bottom: 128px; } }
    @media (max-width: 560px) { .nv-loadout .c { width: 140px; } .nv-loadout svg { width: 96px; } }
  </style>
  <div class="t">CHOIX DE L'ARME</div>
  <div class="row">${defs.map((d, i) => `<div class="c" data-id="${d.id}" data-sfx><span class="k">${i + 1}</span>${ICON[d.id] || ''}<div class="n">${d.label}</div><div class="d">${d.blurb}</div></div>`).join('')}</div>
  <div class="h">1 / 2, MOLETTE OU CLIC</div>`;
  document.body.appendChild(el); // not #hud: the HUD rewrites its own markup after we are created
  const cards = [...el.querySelectorAll('.c')];
  const ids = defs.map(d => d.id);
  let open = false;
  const pick = (id, user = true) => {
    if (!ids.includes(id)) return;
    if (user) { pref = id; savePref(id); }
    cards.forEach(c => c.classList.toggle('sel', c.dataset.id === id));
    onPick(id, user);
  };
  const can = () => open && ctx.player.alive;
  cards.forEach(c => c.addEventListener('click', e => { e.stopPropagation(); if (can()) pick(c.dataset.id); }));
  addEventListener('keydown', e => {
    if (!can() || e.repeat) return;
    const i = e.code === 'Digit1' || e.code === 'Numpad1' ? 0 : e.code === 'Digit2' || e.code === 'Numpad2' ? 1 : -1;
    if (i >= 0) pick(ids[i]);
  });
  addEventListener('wheel', e => { if (can() && ctx.input.locked) pick(ids[(ids.indexOf(pref) + (e.deltaY > 0 ? 1 : ids.length - 1)) % ids.length]); }, { passive: true });
  addEventListener('mousedown', e => { if (can() && ctx.input.locked && e.button === 0) pick(ids[(ids.indexOf(pref) + 1) % ids.length]); });
  return {
    get pref() { return pref; },
    sync(current) { cards.forEach(c => c.classList.toggle('sel', c.dataset.id === current)); },
    update() {
      const g = ctx.game;
      const want = !!(g && g.phase === 'freeze' && ctx.player.alive && !ctx.paused);
      if (want !== open) { open = want; el.classList.toggle('on', open); }
    },
  };
}
