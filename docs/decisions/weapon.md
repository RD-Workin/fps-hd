# Weapon module — decisions (status: DONE, build green; tuning welcome)
## Files
- index.js — createWeapon(ctx): fire/reload/spread/recoil + spring-driven viewmodel animation; creates ctx.effects.
- effects.js — createEffects(ctx): particles, tracers, decals, casings, dropped mags, lights, explosion, camera shake.
- viewmodel.js — procedural NV-4 rifle + gloved hands (~12 draw calls). textures.js — procedural textures + FX atlases.
## Decisions
- Viewmodel = child of ctx.camera, own projection (VM_FOV 56° via shared uniform VM_PROJ) + NDC z squeezed to [-1,-0.92]
  => never clips walls, less fisheye. vmWorld(obj) maps a viewmodel point to where it appears in the world (tracer/casing/smoke start).
- Pose: BASE (0.15,-0.13,-0.36), yaw 0.04. Debug hooks: weapon._base / weapon._brot (Vector3) live-editable.
- Springs (pos, rot, sway, land): recoil impulses per shot (stronger first 3), mouse sway lag, figure-8 bob synced to
  player.headBob, land dip from fall speed, strafe roll, crouch cant, breathing idle, draw anim (0.55 s) on resetForRound.
- Reload = choreography on reloadProgress (audio cues 0.10 magOut / 0.52 magIn / 0.78 charge): tilt to show magwell, left hand
  grabs mag, old mag dropped as world mesh (lies on floor 10 s), fresh mag (vm.magFresh) rides with hand, seat jolt,
  cant + left hand racks the side charger, return. Tactical 2.1 s, empty 2.5 s. Left hand rotates around PALM.
- Muzzle flash: randomized scale/rotation, star skipped 15 %, shown >= 1 rendered frame; point light; muzzle smoke after bursts.
- Tracer every other round (420 m/s streak). Casing per shot (instanced brass, bounce at y=0, fade after 6 s).
## API (contract + extras)
- name 'NV-4', mag, magSize 30, reserve 90, reloading, reloadProgress, spread, aiming(false), resetForRound(), update(dt)
- extras: startReload(), canFire(), fire(), bloom, shotIndex, emptyReload, viewmodel, effects
- Events: 'weapon:fire' {origin, dir}; 'weapon:hit' {actor, headshot, killed, point}; 'weapon:reload' {empty}; 'weapon:dryfire'.
- No fire when dead / frozen / game.phase !== 'live' / during the first 60 % of the draw.
## ctx.effects
- impact(point, normal, material) — decal (atlas tile per material) + dust + chips/splinters + sparks (metal) / glints (glass).
- blood(point, dir) — mist + droplets + splatter decal on the wall/floor behind (raycast 2.5 m).
- tracer(from, to), muzzleFlash(pos, dir, {player}) (bots: glow + spike + light), explosion(pos) (fireball, smoke column
  ~6 s, dust ring, embers, 900-intensity light, distance-based shake).
- extras: smoke(pos,{size,alpha}), casing(pos,vel,quat), dropMag(src, at, vel), shake(amount, dur), clear() (auto on 'round:start').
- Particles: 2 instanced pools (additive 900 + alpha 900), atlas tiles 0 glow / 1-2 smoke / 3 streak, fog-aware, frozen when paused.
- Decals: 4 InstancedMesh x72 (concrete/metal+glass/wood/dirt) + blood x24, ring buffers. 3 PointLights always in scene (no recompiles).
## Constants
- 600 rpm, dmg 30, headshot x3.34, falloff after 25 m to 73 %; recoil via player.addRecoil (pitch ~0.011-0.015/shot, sin yaw drift);
  spread 0.004 + bloom(<=0.045) + move 0.02 + air 0.04, crouch x0.6.
## TODO / ideas
- Optic/gun look dark under the stub world (hemi light only): re-check with the real world lighting.
- Viewmodel is not in shadow passes; depth-based post (SSAO) sees it at true depth.
