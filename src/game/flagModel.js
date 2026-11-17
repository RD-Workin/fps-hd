// Capture du drapeau — procedural flags (pole + waving cloth), base pads and beacons. Colors are relative to the
// player: our flag cyan-blue, the enemy flag red (same code as the HUD and minimap).
import * as THREE from 'three';

const ALLY = new THREE.Color('#2fb8f0'), ENEMY = new THREE.Color('#ff4a32');
const CW = 1.15, CH = 0.72, SX = 12, SY = 6; // cloth size (m) and segments

function makeFlag() {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.85, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.5, 8), metal);
  pole.position.y = 1.25; pole.castShadow = true; root.add(pole);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), metal); knob.position.y = 2.52; root.add(knob);
  const geo = new THREE.PlaneGeometry(CW, CH, SX, SY); geo.translate(CW / 2, 0, 0);
  const clothMat = new THREE.MeshStandardMaterial({ color: ALLY, roughness: 0.85, side: THREE.DoubleSide, emissive: ALLY, emissiveIntensity: 0.25 });
  const cloth = new THREE.Mesh(geo, clothMat); cloth.position.set(0.03, 2.1, 0); cloth.castShadow = true; root.add(cloth);
  const base = geo.attributes.position.array.slice();
  return { root, cloth, clothMat, base, phase: Math.random() * 6 };
}

function makePad() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: ALLY, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.4, 48), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), mat); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.03; g.add(inner);
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0x5b5f66, roughness: 0.8 }));
  stone.position.y = 0.06; stone.receiveShadow = true; g.add(stone);
  return { root: g, mat };
}

function makeBeam() {
  const mat = new THREE.MeshBasicMaterial({ color: ALLY, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 26, 12, 1, true), mat); m.position.y = 13; m.renderOrder = 2;
  const g = new THREE.Group(); g.add(m); return { root: g, mat };
}

function makeDropRing() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const geo = new THREE.RingGeometry(0.85, 1.0, 48, 1, 0, Math.PI * 2);
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.05;
  return { mesh: m, mat };
}

export function createFlagVisuals(ctx) {
  const scene = ctx.scene;
  const parts = {};
  for (const team of ['ATK', 'DEF']) {
    const flag = makeFlag(), pad = makePad(), beam = makeBeam(), drop = makeDropRing();
    for (const o of [flag.root, pad.root, beam.root, drop.mesh]) { o.visible = false; scene.add(o); }
    parts[team] = { flag, pad, beam, drop, ally: null };
  }
  let t = 0;
  const v = new THREE.Vector3();

  function wave(f, speed) {
    const pos = f.cloth.geometry.attributes.position, a = pos.array, b = f.base;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i], y = b[i + 1], k = x / CW;
      a[i + 2] = Math.sin(t * speed + f.phase - x * 5.2 + y * 1.3) * 0.13 * k + Math.sin(t * speed * 1.7 - x * 9) * 0.035 * k;
      a[i + 1] = y - k * k * 0.08;
    }
    pos.needsUpdate = true; f.cloth.geometry.computeVertexNormals();
  }

  return {
    hide() { for (const p of Object.values(parts)) for (const o of [p.flag.root, p.pad.root, p.beam.root, p.drop.mesh]) o.visible = false; },
    update(dt, game) {
      t += dt;
      const flags = game?.flags; if (!flags) return;
      const myTeam = ctx.player?.team;
      for (const team of ['ATK', 'DEF']) {
        const P = parts[team], F = flags[team]; if (!F?.base) continue;
        const ally = team === myTeam;
        if (P.ally !== ally) {
          P.ally = ally; const c = ally ? ALLY : ENEMY;
          P.flag.clothMat.color.copy(c); P.flag.clothMat.emissive.copy(c); P.pad.mat.color.copy(c); P.beam.mat.color.copy(c);
        }
        P.pad.root.position.copy(F.base); P.pad.root.visible = true;
        P.pad.mat.opacity = F.state === 'base' ? 0.55 : 0.2 + 0.15 * Math.sin(t * 4);
        const fr = P.flag.root;
        fr.visible = true;
        if (F.state === 'carried' && F.carrier) {
          const c = F.carrier, yaw = c.yaw || 0;
          // on the carrier's back, leaning back; hidden in the player's own first-person view
          v.set(Math.sin(yaw) * 0.28, (c.height || 1.8) * 0.55, Math.cos(yaw) * 0.28);
          fr.position.copy(c.position).add(v); fr.rotation.set(-0.25, yaw + Math.PI / 2, 0, 'YXZ'); fr.scale.setScalar(0.62);
          fr.visible = !c.isPlayer || !c.alive;
        } else if (F.position) {
          fr.position.copy(F.position); fr.rotation.set(0, t * 0.35 + (team === 'ATK' ? 0 : 2), F.state === 'dropped' ? 0.35 : 0); fr.scale.setScalar(1);
        }
        wave(P.flag, F.state === 'carried' ? 9 : 5);
        // beam: always on the flag (helps to find it across the map)
        const bp = F.state === 'carried' && F.carrier ? F.carrier.position : F.position;
        P.beam.root.visible = !!bp && !(F.state === 'carried' && F.carrier?.isPlayer);
        if (bp) P.beam.root.position.copy(bp);
        P.beam.mat.opacity = F.state === 'base' ? 0.1 : 0.18 + 0.08 * Math.sin(t * 6);
        // dropped: shrinking ring = time left before it goes back to base
        const d = P.drop;
        d.mesh.visible = F.state === 'dropped' && !!F.position;
        if (d.mesh.visible) {
          d.mesh.position.copy(F.position); d.mesh.position.y += 0.05;
          const k = Math.max(1, Math.ceil((F.returnLeft ?? 0) / (game.rules?.RETURN_T || 10) * 40)); // 40 steps
          if (d.k !== k) { d.k = k; d.mesh.geometry.dispose(); d.mesh.geometry = new THREE.RingGeometry(0.85, 1.0, 40, 1, Math.PI / 2, Math.PI * 2 * k / 40); }
          d.mat.color.copy(ally ? ALLY : ENEMY);
        }
      }
    },
  };
}
