// Landing ship moored bow-in at the quay (ATK "arrived by sea"). Visual detail + exact AABB colliders.
import * as THREE from 'three';
import { DECAL } from './textures.js';

export function buildShip(K) {
  const { G, col, mat4, addSolid, lift, scene, Truck, Stack, Crate, Barrel, GDecal } = K;
 // LANDING SHIP moored bow-in at the quay, bow doors open, ramp down onto the port (ATK "arrived by sea").
    // Hull x[-9,9] z[58,116] in the water, tank deck +0.9, stern superstructure. Outside nav bounds (bots stay on the quay).
    // Colliders: side walls x[+-7,+-9] to 7.15, tank deck / ramp steps (floor), stern block, ramp guards. Visual detail only beyond.
    const hullC = col(0x66717a), hullD = col(0x4f5960), darkC = col(0x2c3236), deckC = col(0x6a736c), redC = col(0x6e2a22), whiteC = col(0xd9d4c6), yel = col(0xd9a230);
    const Z0 = 58, Z1 = 116, D = 0.9, TOP = 7;
    const sheer = (z) => TOP + 1.3 * Math.pow(Math.max(0, (96 - z) / 38), 1.6); // deck line rises toward the bow
    // side walls: extruded side elevation (z,y) with sheer + raked bow edge, 2 m thick (inner face = collider face)
    const side = new THREE.Shape(); const pts = [[Z1, -1.1], [Z0 + 0.9, -1.1], [Z0 - 0.5, sheer(Z0)]];
    for (let z = Z0 + 2; z <= Z1; z += 4) pts.push([z, sheer(z)]); pts.push([Z1, sheer(Z1)]);
    side.moveTo(...pts[0]); for (const p of pts.slice(1)) side.lineTo(...p);
    const sideG = new THREE.ExtrudeGeometry(side, { depth: 2, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
    for (const sx of [-1, 1]) G.hull.add(sideG, mat4(sx < 0 ? -7 : 9, 0, 0, -Math.PI / 2), hullC); // local x -> world z, local z -> world -x
    // rounded stern cap + transom, boot-top band, knuckle and plate seams, fenders, portholes
    G.hull.add(new THREE.CylinderGeometry(9.12, 9.12, 8.3, 28, 1, false, -Math.PI / 2, Math.PI), mat4(0, 3.05, Z1, 0, 1, 1, 0.42), hullC);
    G.hull.add(new THREE.CylinderGeometry(9.2, 9.2, 0.7, 28, 1, false, -Math.PI / 2, Math.PI), mat4(0, -0.75, Z1, 0, 1, 1, 0.43), redC);
    for (const sx of [-1, 1]) { const a = sx * 9.12, b = sx * 9.0, x0 = Math.min(a, b), x1 = Math.max(a, b);
      G.paint.box(x0, -1.1, Z0 + 0.8, x1, -0.4, Z1, redC, 'ny py');
      G.hull.box(sx < 0 ? -9.25 : 9.0, 2.4, Z0 + 1, sx < 0 ? -9.0 : 9.25, 2.6, Z1, hullD, 'ny');                 // rubbing strake
      for (let z = Z0 + 5; z < Z1 - 1; z += 6.5) G.hull.box(x0 - 0.02, -0.4, z, x1 + 0.02, sheer(z) - 0.25, z + 0.12, hullD, 'ny py'); // frames / plate seams
      for (let z = 99; z < 115; z += 2.2) G.glass.add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12), mat4(sx * 9.14, 5.4, z, 0, 1, 1, 1, 0, Math.PI / 2), darkC);
      for (const z of [Z0 + 6, Z0 + 26, Z0 + 46]) G.wood.add(new THREE.TorusGeometry(0.42, 0.2, 8, 16), mat4(sx * 9.4, 0.3, z, Math.PI / 2), col(0x262626)); // tyre fenders
      // deck-edge railing on the walls (posts + 2 rails), white
      for (let z = Z0 + 0.6; z < 96; z += 1.6) { const y = sheer(z); G.paint.box(sx * 8.05 - 0.03, y, z, sx * 8.05 + 0.03, y + 1.05, z + 0.06, whiteC, 'ny'); }
      for (const h of [0.55, 1.05]) for (let z = Z0 + 0.6; z < 96; z += 3.2) { const y0 = sheer(z) + h, y1 = sheer(Math.min(96, z + 3.2)) + h, zm = Math.min(96, z + 3.2);
        G.paint.add(new THREE.BoxGeometry(0.05, 0.05, Math.hypot(zm - z, y1 - y0)), mat4(sx * 8.05, (y0 + y1) / 2, (z + zm) / 2, 0, 1, 1, 1, Math.atan2(-(y1 - y0), zm - z)), whiteC); }
      // bollards + mooring lines to the quay
      G.metal.add(new THREE.CylinderGeometry(0.22, 0.25, 0.5, 10), mat4(sx * 8.0, sheer(62) + 0.25, 62), darkC);
      G.metal.add(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.Matrix4().lookAt(new THREE.Vector3(sx * 8, sheer(62) + 0.4, 62), new THREE.Vector3(sx * 14, 0.2, 55.4), new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).setPosition((sx * 8 + sx * 14) / 2, (sheer(62) + 0.6) / 2, (62 + 55.4) / 2).multiply(new THREE.Matrix4().makeScale(1, Math.hypot(6, sheer(62) + 0.2, 6.6), 1)), col(0x8a7a5a));
      G.metal.add(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 10), mat4(sx * 14, 0.22, 55.0), darkC);
    }
    // tank deck: plate, tie-down rails, yellow walkway lines, inner wall ribs
    G.metal.box(-7, -1.1, Z0, 7, D, 96, deckC, 'ny', 2);
    for (let z = 62; z < 96; z += 4) G.metal.box(-6.8, D, z, 6.8, D + 0.04, z + 0.15, darkC, 'ny');
    for (const x of [-5.6, 5.4]) G.paint.box(x, D + 0.005, Z0 + 1, x + 0.2, D + 0.012, 95, yel, 'ny');
    for (const sx of [-1, 1]) for (let z = Z0 + 2; z < 96; z += 3) G.hull.box(sx < 0 ? -7 : 6.85, D, z, sx < 0 ? -6.85 : 7, sheer(z) - 0.3, z + 0.18, hullD, 'ny');
    // stern block + superstructure
    G.hull.box(-7, -1.1, 96, 7, TOP + 1, Z1, hullC, 'ny');
    G.paint.box(-7.2, TOP + 1, 95.8, 7.2, TOP + 1.25, 96.1, whiteC, 'ny');
    G.hull.box(-6, TOP + 1, 100, 6, 15, 114, whiteC, 'ny'); G.hull.box(-7.5, 15, 100, 7.5, 18, 105, whiteC, 'ny');
    G.glass.box(-7.55, 16, 99.95, 7.55, 17.2, 104, darkC, 'ny py'); G.glass.box(-6.05, 11, 100.5, 6.05, 12, 113.5, darkC, 'ny py');
    G.paint.box(-9.5, 16.2, 101, 9.5, 16.5, 104, whiteC, 'ny'); G.paint.box(-6.2, 15, 99.9, 6.2, 15.15, 114.1, darkC, 'ny');
    G.hull.box(-1.6, 15, 107, 1.6, 20.5, 111, darkC, 'ny'); G.paint.box(-1.65, 19, 106.95, 1.65, 19.6, 111.05, redC, 'ny'); // funnel + band
    G.metal.add(new THREE.CylinderGeometry(0.12, 0.18, 10, 8), mat4(0, 22, 102.2), darkC); G.metal.box(-3, 25, 102, 3, 25.15, 102.4, darkC, 'ny');
    G.metal.add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), mat4(0, 27.2, 102.2), darkC);
    for (const sx of [-1, 1]) { G.paint.add(new THREE.CylinderGeometry(0.9, 0.9, 5, 12), mat4(sx * 6.9, 12.5, 107, 0, 1, 1, 1, Math.PI / 2), col(0xe07a2a)); // lifeboats
      G.metal.box(sx * 6.3 - 0.1, 10.5, 104.5, sx * 6.3 + 0.1, 13.6, 104.7, darkC, 'ny'); G.metal.box(sx * 6.3 - 0.1, 10.5, 109.3, sx * 6.3 + 0.1, 13.6, 109.5, darkC, 'ny'); }
    // bow doors swung fully open, folded back against the bow flanks (curved shells extruded vertically)
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape(), U = 6.5, o = [], inn = [];
      for (let k = 0; k <= 12; k++) { const u = k / 12 * U, b = 1.5 * Math.sin(Math.PI * u / U); o.push([u, sx * (b + 0.3)]); inn.push([u, sx * b]); }
      sh.moveTo(...inn[0]); for (const p of o) sh.lineTo(...p); for (const p of inn.reverse()) sh.lineTo(...p);
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(sx * 9.1, -0.7, Z0 + 0.3);
      G.hull.add(new THREE.ExtrudeGeometry(sh, { depth: TOP + 0.9, bevelEnabled: false }), m, hullC);
    }
    // ramp: sloped plate (visual) over three 0.3 m steps (physics), side skirts, cleats, hinge, chains, hazard lip
    const n = [0, 4, -0.9], L = Math.hypot(...n); n[0] /= L; n[1] /= L; n[2] /= L;
    G.metal.quad([-7, D + 0.02, Z0], [7, D + 0.02, Z0], [7, 0.04, 54], [-7, 0.04, 54], n, [-7 / 1.5, 54 / 1.5, 7 / 1.5, Z0 / 1.5], [0.7, 0.72, 0.7]);
    for (let z = 54.5; z < Z0 - 0.2; z += 0.5) { const y = (z - 54) / 4 * D; G.metal.box(-6.8, y, z, 6.8, y + 0.07, z + 0.07, darkC, 'ny'); }
    for (const sx of [-1, 1]) {
      const sk = new THREE.Shape(); sk.moveTo(54, 0); sk.lineTo(Z0, 0); sk.lineTo(Z0, D + 0.35); sk.lineTo(54, 0.3); sk.lineTo(54, 0);
      G.hull.add(new THREE.ExtrudeGeometry(sk, { depth: 0.3, bevelEnabled: false }), mat4(sx < 0 ? -7 : 7.3, 0, 0, -Math.PI / 2), hullD);
      G.metal.add(new THREE.CylinderGeometry(0.04, 0.04, 1, 5), new THREE.Matrix4().lookAt(new THREE.Vector3(sx * 7.1, sheer(Z0) - 0.4, Z0 + 0.4), new THREE.Vector3(sx * 7.1, 0.4, 54.3), new THREE.Vector3(0, 1, 0)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).setPosition(sx * 7.1, (sheer(Z0) + 0.0) / 2, (Z0 + 0.4 + 54.3) / 2).multiply(new THREE.Matrix4().makeScale(1, Math.hypot(sheer(Z0) - 0.8, Z0 - 54), 1)), darkC); // ramp chain
    }
    G.metal.add(new THREE.CylinderGeometry(0.25, 0.25, 14, 12), mat4(0, D - 0.05, Z0, 0, 1, 1, 1, 0, Math.PI / 2), darkC); // hinge
    G.paint.box(-7.4, 0, 56, -7, 1.9, Z0, darkC, 'ny'); G.paint.box(7, 0, 56, 7.4, 1.9, Z0, darkC, 'ny');     // side guards over the water gap
    G.paint.box(-7.4, 1.85, 56, -7, 1.95, Z0, yel, 'ny'); G.paint.box(7, 1.85, 56, 7.4, 1.95, Z0, yel, 'ny');
    GDecal(DECAL.HAZARD, 0, 53.4, 14, 1.0, 0);
    for (let k = 0; k < 3; k++) addSolid(new THREE.Box3(new THREE.Vector3(-7, 0, 54 + k * 4 / 3), new THREE.Vector3(7, (k + 1) * 0.3, Z0)), 'metal', { floor: true });
    addSolid(new THREE.Box3(new THREE.Vector3(-7, 0, Z0), new THREE.Vector3(7, D, 96)), 'metal', { floor: true });
    for (const [x0, x1] of [[-9, -7], [7, 9]]) addSolid(new THREE.Box3(new THREE.Vector3(x0, 0, Z0), new THREE.Vector3(x1, TOP + 0.15, Z1)), 'metal');
    for (const [x0, x1] of [[-7.4, -7], [7, 7.4]]) addSolid(new THREE.Box3(new THREE.Vector3(x0, 0, 56), new THREE.Vector3(x1, 1.9, Z0)), 'metal');
    addSolid(new THREE.Box3(new THREE.Vector3(-7, 0, 96), new THREE.Vector3(7, TOP + 1, Z1)), 'metal');
    // hull number + name: canvas-painted decals on both bows and the stern (one small mesh)
    {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g2 = cv.getContext('2d');
      g2.fillStyle = 'rgba(0,0,0,0)'; g2.fillRect(0, 0, 1024, 256); g2.fillStyle = '#eceae2'; g2.font = 'bold 200px Impact, Arial Black, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('L 9014', 512, 112); g2.font = 'bold 44px Arial, sans-serif'; g2.fillText('— CORMORAN —', 512, 226);
      for (let k = 0; k < 900; k++) { g2.clearRect(Math.random() * 1024, Math.random() * 256, 1 + Math.random() * 5, 1 + Math.random() * 3); } // chipped paint
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
      const geos = []; const pl = (x, y, z, ry, w) => { const p = new THREE.PlaneGeometry(w, w / 4); p.applyMatrix4(mat4(x, y, z, ry)); geos.push(p); };
      pl(-9.14, 4.4, 75, -Math.PI / 2, 10); pl(9.14, 4.4, 75, Math.PI / 2, 10);
      const merged = new THREE.BufferGeometry(); const pos = [], uv = [], nr = [], idx = []; let o = 0;
      for (const gg of geos) { pos.push(...gg.attributes.position.array); uv.push(...gg.attributes.uv.array); nr.push(...gg.attributes.normal.array); for (const i of gg.index.array) idx.push(i + o); o += gg.attributes.position.count; }
      merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); merged.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3)); merged.setIndex(idx);
      const mesh = new THREE.Mesh(merged, m); mesh.name = 'ship_markings'; mesh.receiveShadow = true; mesh.userData.static = true; scene.add(mesh);
    }
    // cargo left in the well deck: cover for whoever walks in; oil and wear
    lift(D, () => { Truck(-3.5, 70); Stack(3.5, 66, 2); Crate(4, 78); Crate(4.9, 79, 1.0); Barrel(-5.5, 84, 0x3f6b8c); Barrel(-5, 84.8, 0x6d6f70); Stack(-3, 90, 3); Crate(4.5, 92, 1.2);
      GDecal(DECAL.OIL, 1, 74, 3, 3, 1); GDecal(DECAL.OIL, -2, 86, 2.5, 2.5, 2.2); });
  
}
