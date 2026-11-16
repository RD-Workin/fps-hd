// First-person "through someone else's eyes" rig, shared by the killcam (replay through the killer's eyes) and the
// spectator FPS view (live view through a living teammate's eyes). Each user creates its own rig (own viewmodel
// instances on the camera + own scope overlay), so the two never fight over the same meshes on a transition frame.
// The rig drives the camera (position, aim, FOV, bob, recoil) and a viewmodel of the actor's weapon (NV-4 / SR-8,
// same procedural models as the player's) with ADS / sniper scope while it engages.
import { buildViewmodel } from '../weapon/viewmodel.js';
import { buildSniper } from '../weapon/sniper.js';
import { WEAPONS } from '../weapon/index.js';
import { createScope } from '../weapon/scope.js';

export const FOV = 75, VM_FOV = 56, SCOPE_FOV = 20; // VM_FOV mirrors weapon/index.js (viewmodel projection)

export function createFpView(ctx, hudRoot) {
  const THREE = ctx.THREE;
  const vmRoot = new THREE.Group(); vmRoot.visible = false; ctx.camera.add(vmRoot);
  const mInv = new THREE.Matrix4();
  let kits = null, scope = null;

  // viewmodels built on first use (shared materials, own geometry)
  function getKits() {
    if (kits) return kits;
    kits = {};
    for (const [id, build] of [['rifle', buildViewmodel], ['sniper', buildSniper]]) {
      try {
        const vm = build(); vm.rifle.visible = false; vmRoot.add(vm.rifle);
        if (vm.magFresh) vm.magFresh.visible = false;
        kits[id] = { vm, def: WEAPONS[id] };
      } catch (e) { console.warn('[fpview] viewmodel', id, e); }
    }
    try { scope = createScope(); scope.el.style.zIndex = 'auto'; hudRoot.parentNode?.insertBefore(scope.el, hudRoot); } catch { scope = null; }
    return kits;
  }

  // viewmodel point -> where it appears in the world (the viewmodel has its own projection, see weapon/index.js)
  function vmWorld(obj, out) {
    const cam = ctx.camera;
    cam.updateMatrixWorld(); obj.getWorldPosition(out);
    out.applyMatrix4(mInv.copy(cam.matrixWorld).invert());
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(VM_FOV) / 2);
    out.x *= k; out.y *= k;
    return out.applyMatrix4(cam.matrixWorld);
  }

  // per-view state (killcam replay or one spectated teammate)
  const newState = wid => ({ wid, kit: getKits()[wid] || null, ads: 0, kick: 0, kickYaw: 0, vmKick: 0, flashF: 0, bob: 0, bobAmp: 0, dip: 0, scoped: false });
  function show(S) { if (S?.kit) { S.kit.vm.rifle.visible = true; S.kit.vm.flash.visible = false; vmRoot.visible = true; } }
  function hide(S) {
    if (S?.kit) { S.kit.vm.rifle.visible = false; S.kit.vm.flash.visible = false; }
    vmRoot.visible = false; scope?.setK(0);
    const cam = ctx.camera;
    if (cam.fov !== FOV) { cam.fov = FOV; cam.updateProjectionMatrix(); } // weapon.update owns the fov again from the next frame
  }

  // k: {x, y, z (feet), yaw, pitch, h (height), spd}; engaged: aiming target 0/1; reload: -1 or 0..1 (gun lowered)
  function drive(S, k, engaged, dt, reload = -1) {
    const cam = ctx.camera;
    const eh = Math.max(1.0, (k.h || 1.8) - 0.15);
    S.bobAmp += (Math.min(1, k.spd / 5) - S.bobAmp) * Math.min(1, dt * 6);
    S.bob += dt * (4 + k.spd * 1.6);
    S.kick *= Math.exp(-dt * 9); S.kickYaw *= Math.exp(-dt * 9); S.vmKick *= Math.exp(-dt * 16);
    S.ads += ((engaged && reload < 0 ? 1 : 0) - S.ads) * Math.min(1, dt * 10);
    S.dip += ((reload >= 0 ? Math.sin(Math.PI * Math.min(1, reload)) : 0) - S.dip) * Math.min(1, dt * 10);
    const sniper = S.wid === 'sniper', scopeK = sniper ? Math.min(1, Math.max(0, (S.ads - 0.55) / 0.4)) : 0;
    cam.position.set(k.x, k.y + eh + Math.sin(S.bob * 2) * 0.022 * S.bobAmp * (1 - S.ads), k.z);
    cam.up.set(0, 1, 0);
    cam.rotation.set(k.pitch + S.kick, k.yaw + S.kickYaw, 0, 'YXZ');
    const def = S.kit?.def || WEAPONS[S.wid];
    let fov = FOV + ((def?.adsFov ?? FOV) - FOV) * (sniper ? Math.min(1, S.ads / 0.6) : S.ads);
    if (sniper) fov += (SCOPE_FOV - fov) * scopeK;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    scope?.setK(scopeK);
    // viewmodel: hip pose -> sight picture while engaging, bob while moving, kick on each shot, lowered while reloading
    if (S.kit) {
      const vm = S.kit.vm, B = def.base, R = def.brot, A = def.ads, a = S.ads, m = 1 - a, d = S.dip;
      vmRoot.visible = scopeK < 0.97;
      const bx = Math.sin(S.bob) * 0.011 * S.bobAmp * m, by = -Math.abs(Math.cos(S.bob)) * 0.009 * S.bobAmp * m;
      vmRoot.position.set(B[0] + (A[0] - B[0]) * a + bx, B[1] + (A[1] - B[1]) * a + by - d * 0.09, B[2] + (A[2] - B[2]) * a + S.vmKick * 0.035);
      vmRoot.rotation.set(R[0] * m + S.vmKick * 0.05 * m - d * 0.35, R[1] * m + Math.sin(S.bob * 0.5) * 0.008 * S.bobAmp * m, R[2] * m + d * 0.5);
      if (vm.flash.visible && --S.flashF < 0) vm.flash.visible = false;
    }
    S.scoped = sniper && !vmRoot.visible;
    return scopeK;
  }

  // muzzle flash on the viewmodel + camera / gun recoil for one shot
  function fire(S) {
    const vm = S.kit?.vm, sniper = S.wid === 'sniper';
    if (vm && !S.scoped) { vm.flash.visible = true; vm.flash.rotation.z = Math.random() * 6.28; vm.star.visible = Math.random() > 0.15; S.flashF = 2; }
    S.kick += sniper ? 0.05 : 0.012; S.kickYaw += (Math.random() - 0.5) * (sniper ? 0.01 : 0.006); S.vmKick = Math.min(1.5, S.vmKick + (sniper ? 1.4 : 0.8));
  }

  return { vmRoot, getKits, vmWorld, newState, show, hide, drive, fire, get scope() { return scope; } };
}
