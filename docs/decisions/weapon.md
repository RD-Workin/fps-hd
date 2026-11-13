# Weapon module — decisions (status: DONE, 2 weapons + loadout picker, build green)
## Files
- index.js — createWeapon(ctx): WEAPONS defs, fire/reload/ADS/scope/bolt logic, spring-driven viewmodel anim; creates ctx.effects.
- viewmodel.js — NV-4 rifle + hands; exports Builder, getMaterials, makeMuzzle, addRightHand/addLeftHand, VM_PROJ.
- sniper.js — SR-8 bolt-action (bolt group + separate right hand that works it). scope.js — full-screen DOM/SVG scope overlay.
- loadout.js — freeze-time picker. effects.js — particles/tracers/decals/casings/mags/lights/explosion/shake. textures.js.
## Weapons (WEAPONS in index.js)
- rifle NV-4: auto 600 rpm, 30/90 (max 180, corpse +30), dmg 30, HS x3.34, falloff >25 m to 73 %, reload 2.1 / 2.5 s, ADS FOV 55.
- sniper SR-8: semi, bolt 0.82 s after 0.14 s settle (unscoped while cycling, rescopes if right click still held), 5/20 (max 30,
  corpse +5), dmg by bots.raycast part: head 300, torso/arms 150 (one shot), thigh 90, shin 70. Reload 2.6 / 3.3 s (+bolt if empty).
  Spread: hip 0.05 (+move), scoped 0.0005 (+move 0.03, air 0.08). Recoil 0.05 rad. Every shot is a tracer.
- Scope: ADS ramps FOV 75->40 (adsK<0.6) then overlay fades in and FOV -> 13 (scopeK = smooth(0.55,0.95,adsK)); viewmodel hidden
  when scopeK > 0.97; weapon.scoped when scopeK > 0.9. Thin black duplex reticle, 2 px dark-red centre dot, no glow.
- weapon.sensScale (read by core/player.js): rifle 1-0.3*adsK, sniper scoped 0.24.
## Loadout
- Shown during game.phase 'freeze' (player alive): keys 1/2 (event.code), mouse wheel, left click cycles, click on card if cursor free.
  Choice saved in localStorage 'nova.weapon'; resetForRound() equips the saved choice (full ammo + draw anim).
- Bots (bots/index.js assignWeapons on setup + round:start): per team 1 sniper (85 %), sometimes a 2nd (20 %). Bot.setWeapon(id),
  Bot.wstats = SNIPER | DIFFICULTY (SNIPER: 85 body / 150 head, 1 shot ~1.8 s, mag 5, reload 3 s, accurate at range, x0.7 < 8 m).
  Bot model shows a long-barrel scoped rifle (model.setWeapon). bots.raycast now returns `part`.
## Viewmodel
- Child of ctx.camera, own projection (VM_FOV 56° via VM_PROJ) + NDC z squeezed => never clips walls. vmWorld(obj) maps a
  viewmodel point into the world (tracer/casing/smoke start). Debug: weapon._base / _brot (current kit, Vector3).
- Springs: recoil, mouse sway, figure-8 bob, land dip, strafe roll, crouch cant, breathing, draw (0.55 s) on equip.
- Reload choreography on reloadProgress (audio cues 0.10 magOut / 0.52 magIn / 0.78 charge, skipped for sniper); old mag
  dropped as a world mesh. Sniper bolt: lift, back (casing ejected at 0.42), forward, lock; gun cants, right hand rides the knob.
## API (contract + extras)
- name, current ('rifle'|'sniper'), mag, magSize, reserve, reloading, reloadProgress, spread, aiming, adsK, scoped, cycling,
  sensScale, equip(id, switched), resetForRound(), startReload(), canFire(), fire(), defs, viewmodel, effects.
- Events: 'weapon:fire' {origin, dir, weapon}; 'weapon:hit' {actor, headshot, killed, point, weapon}; 'weapon:reload' {empty, weapon};
  'weapon:bolt'; 'weapon:dryfire'; 'weapon:equip' {id, name, switched}; 'weapon:ammo' {amount, from}.
- Audio (audio/): 'sniper' / 'sniperEnemy' shots, 'bolt' cycle; bot shots pick the sound from actor.weapon.
## ctx.effects
- impact, blood, tracer, muzzleFlash(pos, dir, {player}), explosion; extras smoke, casing, dropMag, shake, clear (on 'round:start').
## TODO / ideas
- HUD prompt still says "CLIC D RECHARGER" (reload is R now) — HUD owner.
