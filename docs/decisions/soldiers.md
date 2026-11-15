# Soldiers module — decisions & status
Status: DONE (build green). Files: `src/soldiers/index.js` (runtime), `pipeline/` (offline Blender/Node build, not shipped),
asset `public/assets/soldiers/soldier.glb` (6.6 MB, meshopt + KTX2) + `basis/` transcoder. Licences: assets LICENSES.md, CREDITS.md.

## Model (one model for both teams)
- CC0 Quaternius UAL skeleton (Rigify DEF-* bones) + original gear: camo uniform, high-cut helmet + NVG mount, headset,
  ballistic glasses, tan balaclava, plate carrier + 3 mag pouches, radio/medic/hydration, belt pouches, holster, knee pads,
  boots, gloves, generic 5.56 carbine (separate mag node). Team = armband colour only (both upper arms):
  `TEAM_COLORS = {ATK: 0xc8372d, DEF: 0x2f7fe0}` (material "Armband" cloned per team). Ally names = HUD's job.
- ONE material "Soldier" (2048 atlas: albedo with AO, ORM, normal) + "Armband". LODs: 46k / 14k / 3.7k tris, rifle 12k / 3k.
  `LOD_DIST = [14, 38]` m from `ctx.camera`. Skinned meshes have frustumCulled=false.

## API (drop-in for bots/model.js)
- `new SoldierModel(team, ctx)` — same fields/methods as before: root, setTeam, reset, kill(fallYawLocal), pose(s), muzzle,
  hips/spine/neck/arms[{sh,el}]/legs[{th,kn}] (hitbox proxies with the procedural -Y-along-limb convention), DIM, isHD.
- `preloadSoldiers(renderer)` optional early preload (integrator may call at boot). Until loaded (or if loading fails)
  the procedural bots model is shown and swapped in place automatically.
- bots/bot.js change: import from `../soldiers/index.js` and pass `ctx` (needed for KTX2 detectSupport + LOD camera).

## Animation
- Lower body: Idle/Walk/Jog/Sprint/Crouch clips (in place), weights from speed, shared phase (m per cycle in LOCO),
  strafe = hips twist ≤ 1.2 rad with spine counter-twist, backpedal = reversed cycle.
- Upper body procedural: aim pitch spread on 3 spine bones, rifle holder anchored to the upper chest (shouldered vs low-ready),
  recoil kick, 2-bone IK both arms, hand orientation from rifle axes + grip finger pose (Pistol_Idle frame),
  reload = rifle roll + left hand mag well → vest pouch, mag drops/hides.
- Death: Death01 clip, model yawed so the fall goes away from the killer; rifle re-parented to the right hand.

## TODO / ideas
- Atlas packing is wasteful (many small islands from the remeshed body): a hand UV unwrap would ~2x texel density.
- Perf: LOD_DIST [10, 30] m scaled by tan(fov/2) (scope keeps detail). Skinned meshes frustum-culled with a fixed
  2.3 m sphere (any pose incl. death). Shadow refresh draws LOD2, AO pre-pass LOD1 at most (`passHooks`). Pose: lazy
  chain matrices (`wm`) + one full update at the end (identical to the old per-rotation subtree updates); LOD2 and
  off-screen soldiers posed every other frame; settled corpses skipped; facade root has matrixWorldAutoUpdate=false
  (pose() keeps the soldier's matrices current, the renderer skips them). Fingers only at LOD0. `RIM_STRENGTH = 0.22` subtle team rim.
- Optional: hit reactions (Hit_Chest is in the glb). Viewer: `/src/soldiers/pipeline/viewer.html?n=4&speed=2.6`.
