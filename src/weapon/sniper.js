// Procedural first-person bolt-action sniper rifle "SR-8 Aiguille" + gloved hands. Same conventions as viewmodel.js:
// barrel along -Z, grip at (0,-0.1,0.1), merged per material, viewmodel depth/projection patch via shared materials.
import * as THREE from 'three';
import { Builder, genericAttrs, getMaterials, makeMuzzle, addRightHand, addLeftHand } from './viewmodel.js';

export function buildSniper() {
  const M = getMaterials();
  const b = new Builder();
  const rifle = new THREE.Group(); rifle.name = 'SR-8';

  // ===== round action (steel) + chassis (cerakote) =====
  b.cyl(M.steel, 0.021, 0.021, 0.25, 0, 0.004, -0.01, 'z', 24);
  b.box(M.dark, 0.003, 0.016, 0.055, 0.021, 0.006, -0.015);                    // ejection port (right)
  b.box(M.dark, 0.004, 0.006, 0.1, 0.0205, 0.016, 0.065);                      // bolt raceway
  b.box(M.cerakote, 0.056, 0.042, 0.3, 0, -0.03, -0.005, 0, 0, 0, 0.008);      // lower chassis
  b.box(M.cerakote, 0.06, 0.02, 0.09, 0, -0.06, -0.045, 0, 0, 0, 0.005);       // magwell surround
  b.box(M.steel, 0.022, 0.006, 0.36, 0, 0.028, -0.06, 0, 0, 0, 0.001);         // top rail
  for (let i = 0; i < 26; i++) b.box(M.steel, 0.028, 0.005, 0.0055, 0, 0.033, 0.11 - i * 0.0125, 0, 0, 0, 0.0008);
  // fore-end (long, octagonal-ish) with M-LOK style slots
  b.box(M.cerakote, 0.058, 0.056, 0.4, 0, -0.008, -0.36, 0, 0, 0, 0.016);
  b.box(M.cerakote, 0.05, 0.012, 0.4, 0, 0.022, -0.36, 0, 0, 0, 0.005);
  for (let i = 0; i < 7; i++) {
    const z = -0.2 - i * 0.048;
    b.box(M.dark, 0.002, 0.008, 0.026, -0.0292, -0.01, z, 0, 0, 0, 0.0008);
    b.box(M.dark, 0.002, 0.008, 0.026, 0.0292, -0.01, z, 0, 0, 0, 0.0008);
  }
  // folded bipod under the fore-end
  b.box(M.steel, 0.03, 0.014, 0.03, 0, -0.042, -0.52, 0, 0, 0, 0.004);
  b.cyl(M.steel, 0.005, 0.005, 0.2, -0.009, -0.046, -0.42, 'z', 10);
  b.cyl(M.steel, 0.005, 0.005, 0.2, 0.009, -0.046, -0.42, 'z', 10);
  b.box(M.polymer, 0.012, 0.01, 0.022, -0.009, -0.046, -0.31, 0, 0, 0, 0.004);
  b.box(M.polymer, 0.012, 0.01, 0.022, 0.009, -0.046, -0.31, 0, 0, 0, 0.004);
  // ===== heavy fluted barrel + brake =====
  b.cyl(M.steel, 0.0145, 0.0125, 0.46, 0, 0.004, -0.79, 'z', 24);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    b.box(M.dark, 0.003, 0.003, 0.3, Math.cos(a) * 0.0128, 0.004 + Math.sin(a) * 0.0128, -0.73, 0, 0, a, 0);
  }
  b.cyl(M.steel, 0.02, 0.02, 0.075, 0, 0.004, -1.055, 'z', 24);                 // muzzle brake
  for (let i = 0; i < 3; i++) b.box(M.dark, 0.044, 0.01, 0.012, 0, 0.004, -1.035 - i * 0.02);
  b.cyl(M.dark, 0.005, 0.005, 0.003, 0, 0.004, -1.093, 'z', 12);

  // ===== scope (polymer tube, steel rings, glass) =====
  const sy = 0.078;
  for (const z of [-0.1, 0.04]) { b.box(M.steel, 0.034, 0.028, 0.02, 0, 0.044, z, 0, 0, 0, 0.003); b.cyl(M.steel, 0.022, 0.022, 0.02, 0, sy, z, 'z', 24); }
  b.cyl(M.polymer, 0.0175, 0.0175, 0.26, 0, sy, -0.03, 'z', 28);                // main tube
  b.cyl(M.polymer, 0.0185, 0.028, 0.06, 0, sy, -0.19, 'z', 28);                 // objective bell
  b.cyl(M.polymer, 0.028, 0.028, 0.05, 0, sy, -0.245, 'z', 28);
  b.cyl(M.steel, 0.029, 0.029, 0.008, 0, sy, -0.272, 'z', 28);
  b.cyl(M.polymer, 0.0185, 0.023, 0.05, 0, sy, 0.12, 'z', 28);                  // eyepiece
  b.cyl(M.dark, 0.024, 0.024, 0.03, 0, sy, 0.16, 'z', 28);
  b.cyl(M.polymer, 0.011, 0.011, 0.022, 0, sy + 0.027, -0.03, 'y', 18);          // elevation turret
  b.cyl(M.steel, 0.0115, 0.0115, 0.004, 0, sy + 0.04, -0.03, 'y', 18);
  b.cyl(M.polymer, 0.011, 0.011, 0.022, 0.027, sy, -0.03, 'x', 18);              // windage turret
  b.cyl(M.polymer, 0.009, 0.009, 0.02, -0.025, sy, -0.03, 'x', 18);              // parallax
  b.cyl(M.steel, 0.02, 0.02, 0.012, 0, sy, 0.085, 'z', 24);                      // power ring
  { const g = genericAttrs(new THREE.CircleGeometry(0.026, 28)); b.add(M.glass, g, 0, sy, -0.277); }
  { const g = genericAttrs(new THREE.CircleGeometry(0.02, 28)); b.add(M.glass, g, 0, sy, 0.176, 0, Math.PI, 0); }

  // ===== grip, trigger, stock =====
  b.box(M.steel, 0.014, 0.004, 0.07, 0, -0.072, 0.055, 0, 0, 0, 0.0015);       // trigger guard
  b.box(M.steel, 0.005, 0.02, 0.006, 0, -0.062, 0.05, 0.35, 0, 0, 0.0015);
  b.box(M.polymer, 0.034, 0.105, 0.042, 0, -0.1, 0.1, -0.32, 0, 0, 0.012);
  b.box(M.polymer, 0.038, 0.01, 0.05, 0, -0.152, 0.118, -0.32, 0, 0, 0.004);
  b.box(M.cerakote, 0.04, 0.05, 0.12, 0, -0.02, 0.2, 0, 0, 0, 0.008);           // stock hinge block
  b.box(M.polymer, 0.04, 0.03, 0.22, 0, 0.0, 0.34, 0, 0, 0, 0.008);              // skeleton top
  b.box(M.polymer, 0.04, 0.025, 0.2, 0, -0.07, 0.35, -0.12, 0, 0, 0.008);        // skeleton bottom
  b.box(M.polymer, 0.046, 0.03, 0.12, 0, 0.03, 0.36, 0, 0, 0, 0.01);             // cheek riser
  b.box(M.dark, 0.048, 0.13, 0.025, 0, -0.03, 0.46, 0, 0, 0, 0.008);             // butt pad

  b.build(rifle, { receiveShadow: true });
  // right hand is separate: it works the bolt
  const rightHand = new THREE.Group(); rightHand.name = 'rightHand';
  addRightHand(b, M);
  b.build(rightHand, { receiveShadow: true });
  rifle.add(rightHand);

  // ===== bolt (pivot on the bore axis, handle on the right) =====
  const bolt = new THREE.Group(); bolt.name = 'bolt';
  b.cyl(M.steel, 0.0095, 0.0095, 0.1, 0, 0, 0.03, 'z', 16);
  b.cyl(M.steel, 0.011, 0.011, 0.018, 0, 0, 0.09, 'z', 16);                       // shroud
  b.limb(M.steel, [0.01, 0, 0.065], [0.048, -0.022, 0.07], 0.0042);               // handle arm (down-right)
  b.sphere(M.polymer, 0.0115, 0.054, -0.026, 0.072, 1, 1, 1.15);                  // knob
  b.build(bolt);
  rifle.add(bolt); bolt.position.set(0, 0.004, 0.0);

  // ===== magazine (5 rounds, pivot at its top) =====
  const mag = new THREE.Group(); mag.name = 'mag';
  b.box(M.polymer, 0.036, 0.075, 0.085, 0, -0.035, 0, 0, 0, 0, 0.005);
  b.box(M.steel, 0.04, 0.01, 0.09, 0, -0.075, 0.002, 0, 0, 0, 0.003);
  b.box(M.dark, 0.004, 0.05, 0.008, 0.0182, -0.035, 0.02);                         // witness slot
  b.cyl(M.brass, 0.0058, 0.0058, 0.05, 0, 0.004, 0.008, 'z', 12);
  b.cyl(M.brass, 0.0055, 0.0025, 0.016, 0, 0.004, -0.025, 'z', 12);
  b.cyl(M.steel, 0.0036, 0.003, 0.016, 0, 0.004, -0.025, 'z', 10);
  b.build(mag);
  const magFresh = mag.clone();
  rifle.add(mag); mag.position.set(0, -0.052, -0.045);

  // ===== left hand on the fore-end =====
  const leftHand = new THREE.Group(); leftHand.name = 'leftHand';
  addLeftHand(b, M, -0.38);
  b.build(leftHand, { receiveShadow: true });
  rifle.add(leftHand);

  const { muzzle, flash, star } = makeMuzzle(rifle, 0.004, -1.1, 1.35);
  const eject = new THREE.Object3D(); eject.position.set(0.026, 0.008, -0.015); rifle.add(eject);
  // the scope's eye point (rifle space): used to centre ADS
  const eye = new THREE.Vector3(0, sy, 0.28);
  return { rifle, mag, magFresh, bolt, charger: null, leftHand, rightHand, muzzle, flash, star, eject, materials: M, eye };
}
