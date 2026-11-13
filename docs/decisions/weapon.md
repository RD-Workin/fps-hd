# Weapon module — decisions (status: IN PROGRESS, works with stubs, build green)
## Files
- src/weapon/index.js — createWeapon(ctx): logic (fire/reload/spread/recoil), placeholder motion, sets no-op ctx.effects if none.
- src/weapon/viewmodel.js — procedural NV-4 rifle + gloved hands, merged per material (~12 draw calls).
- src/weapon/textures.js — procedural CanvasTextures (metal/polymer/fabric normals, camo, reticle, fx atlas, flash, decal atlas, scorch).
## Decisions
- Viewmodel = child of ctx.camera (no render hook needed). Anti wall-clip: vertex patch squeezes NDC z into [-1,-0.92]
  (`gl_Position.z = z*0.04 - 0.96*w`), so the gun is always in front yet lit by scene lights/env/shadows. castShadow=false.
  Caveat: depth-based post passes using override materials (SSAO normal/depth pass) see the gun at its true depth.
- Edge wear shader (patchViewmodel): uv attr = meters, aEdge=(u,v,faceW,faceH); cerakote chips to bare metal on edges.
- Rifle space: barrel along -Z, muzzle z=-0.705, magwell z≈-0.035, grip z≈0.1. Side charging handle LEFT (reciprocates per shot, visible).
- Parts exposed: weapon.viewmodel = {rifle, mag, magFresh, charger, leftHand, muzzle, flash, star, eject, materials, reticle}.
## API (contract + extras)
- name 'NV-4', mag, magSize 30, reserve 90, reloading, reloadProgress, spread, aiming(false), resetForRound(), update(dt)
- extras: startReload(), canFire(), fire(), bloom, shotIndex
- Events: 'weapon:fire' {origin, dir} per shot; 'weapon:hit' {actor, headshot, killed, point}. Sets player.lastShotTime.
- Fires only when player alive, !frozen and game.phase === 'live' (or no game).
## Constants
- 600 rpm (0.1 s), dmg 30, headshot x3.34 (one-tap), falloff after 25 m to min 73%; reload 2.2 s; recoil via player.addRecoil
  (pitch ~0.011-0.015/shot, yaw drift sin pattern); spread 0.004 + bloom(≤0.045) + move 0.02 + air 0.04, crouch x0.6.
## TODO (next owner)
- Tune viewmodel placement/scale: currently too big & too far right/angled (see shots/weapon_idle.png). Try BASE ~(0.09,-0.11,-0.2), ry≈0.
- Hands placement check (left hand/forearm), optic reads too dark; add slight fill/ambient for viewmodel.
- Spring-based anims (sway/inertia, bob, land dip, crouch, recoil roll), draw anim on resetForRound, multi-stage reload
  (tilt, mag drop as world mesh using vm.magFresh, insert, charger pull on empty), tactical vs empty, dry click.
- effects.js: pooled instanced particles (sparks/dust/splinters/blood/smoke), tracers, muzzle point light, casings,
  bullet-hole decals (decal atlas ready in textures.js: getFxTextures()), explosion(pos) + camera shake. Replace no-op ctx.effects.
