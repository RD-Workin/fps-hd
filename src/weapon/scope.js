// Full-screen sniper scope overlay (DOM + SVG, no assets). Thin black duplex reticle, tiny center dot,
// soft lens edge, black outside the tube. setK(0..1) fades it in; setKick(x) nudges it on recoil.
export function createScope() {
  const el = document.createElement('div');
  el.className = 'nv-scope';
  el.innerHTML = `
  <style>
    .nv-scope { position: fixed; inset: 0; pointer-events: none; z-index: 5; opacity: 0; display: none; }
    .nv-scope .lens { position: absolute; left: 50%; top: 50%; width: 92vmin; height: 92vmin; transform: translate(-50%, -50%); border-radius: 50%;
      box-shadow: 0 0 0 200vmax #000, inset 0 0 6vmin 2vmin rgba(0,0,0,.92), inset 0 0 1.2vmin .4vmin rgba(0,0,0,1);
      background: radial-gradient(circle at 50% 50%, rgba(160,200,255,0) 62%, rgba(40,70,110,.10) 82%, rgba(0,0,0,.35) 100%); }
    .nv-scope svg { position: absolute; left: 50%; top: 50%; width: 92vmin; height: 92vmin; transform: translate(-50%, -50%); overflow: visible; }
    .nv-scope .glint { position: absolute; left: 50%; top: 50%; width: 92vmin; height: 92vmin; transform: translate(-50%, -50%); border-radius: 50%;
      background: radial-gradient(ellipse 40% 22% at 30% 22%, rgba(255,255,255,.05), rgba(255,255,255,0) 70%); }
  </style>
  <div class="lens"></div>
  <svg viewBox="-500 -500 1000 1000" shape-rendering="geometricPrecision">
    <g stroke="#050505" fill="none">
      <!-- thick outer posts (duplex) -->
      <path d="M-500 0 H-170 M170 0 H500 M0 170 V500" stroke-width="7"/>
      <path d="M0 -500 V-170" stroke-width="7"/>
      <!-- fine centre cross -->
      <path d="M-170 0 H-6 M6 0 H170 M0 -170 V-6 M0 6 V170" stroke-width="1.6"/>
      <!-- small mil marks -->
      ${[-4, -3, -2, -1, 1, 2, 3, 4].map(i => `<path d="M${i * 38} -5 V5 M-5 ${i * 38} H5" stroke-width="1.4"/>`).join('')}
      ${[1, 2, 3].map(i => `<path d="M-14 ${i * 38 + 19} H14" stroke-width="1.1"/>`).join('')}
    </g>
    <circle r="2.1" fill="#b3161a"/>
  </svg>
  <div class="glint"></div>`;
  document.body.appendChild(el);
  let shown = false;
  return {
    el,
    setK(k) {
      const on = k > 0.001;
      if (on !== shown) { el.style.display = on ? 'block' : 'none'; shown = on; }
      if (on) el.style.opacity = String(Math.min(1, k));
    },
    setKick(x, y) { if (shown) el.style.transform = x || y ? `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` : ''; },
  };
}
