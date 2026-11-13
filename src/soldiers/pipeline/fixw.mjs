// Remove cross-leg skin influences (exporter leaks a few L/R foot weights) — runs inside compress.mjs
export function fixLegWeights(doc) {
  let fixed = 0;
  for (const n of doc.getRoot().listNodes()) {
    const skin = n.getSkin(); if (!skin) continue;
    const names = skin.listJoints().map(j => j.getName());
    const side = nm => /\.L$/.test(nm) ? 'L' : /\.R$/.test(nm) ? 'R' : null;
    const leg = nm => /thigh|shin|foot|toe/.test(nm);
    const M = n.getWorldMatrix();
    for (const p of n.getMesh().listPrimitives()) {
      const P = p.getAttribute('POSITION'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0');
      const a = [], j = [], w = [];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, a);
        const x = M[0] * a[0] + M[4] * a[1] + M[8] * a[2] + M[12], y = M[1] * a[0] + M[5] * a[1] + M[9] * a[2] + M[13];
        if (y > 0.75 || Math.abs(x) < 0.015) continue;
        const mine = x > 0 ? 'L' : 'R';
        J.getElement(i, j); W.getElement(i, w);
        let ch = false;
        for (let k = 0; k < 4; k++) { const nm = names[j[k]]; if (w[k] > 0 && leg(nm) && side(nm) && side(nm) !== mine) { w[k] = 0; ch = true; } }
        if (!ch) continue;
        const t = w[0] + w[1] + w[2] + w[3];
        if (t > 0) for (let k = 0; k < 4; k++) w[k] /= t;
        else { j[0] = names.indexOf(`DEF-${y < 0.5 ? 'shin' : 'thigh'}.${mine}`); w[0] = 1; }
        J.setElement(i, j); W.setElement(i, w); fixed++;
      }
    }
  }
  console.log('fixLegWeights', fixed);
}
