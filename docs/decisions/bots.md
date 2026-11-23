# Bots module — decisions & status
Status: DONE (build green). Files: index.js (manager, raycast, nav), bot.js (Actor + combat AI), brain.js (objective AI),
model.js (procedural soldier), nav.js (grid A*, `node src/bots/navtest.mjs`), selftest.js (dev only).

## API (contract + extras)
- `bots.list`, `setup(roster [{name, team, ally}])`, `update(dt)`, `raycast(o, dir, max) -> {actor, distance, point, headshot}`.
- Extras: `bots.difficulty` (= DIFFICULTY, live-tunable), `bots.nav`. Bot fields: yaw, pitch, velocity, moveSpeed, ally, isBot,
  mag, reloadT, using, goal, model.root. `bot.onHit(attacker)` (called by bot shots + 'weapon:hit').
- Emits `'bot:fire' {bot, origin, hit, target}` per shot. Uses ctx.effects?.tracer/impact/blood/muzzleFlash.
- Self-test: open `?bottest`, `await window.__botSelfTest({rounds: 6, layout: true})` (adds world.md planned blocks to physics!).
  Last run: 5 rounds, 4 plants, 1 defuse, 28 kills, 0 stuck, bots.update 0.14 ms/frame.

## Model (model.js) — zero assets
- Rigid-bone hierarchy root(yaw)->fallYaw->fall->unYaw->hips->{spine->{neck, shoulders->elbows, gun->mag/muzzle}, thighs->knees}.
  Forward = -Z. 13 meshes/bot, geometries shared, ONE MeshStandardMaterial per team (canvas atlas: camo|gear|metal|accent|vest
  + ORM (G rough, B metal) + fabric normal). Team swap = material swap. castShadow on.
- Pose: 2-bone IK (arms to rifle grip/handguard, legs to procedural feet), walk/run cycle from speed & local move dir,
  crouch, aim pitch, low-ready vs shouldered, recoil kick, reload (tilt + mag out/in with left hand), death = knees buckle
  then topple away from killer + limp limbs. Corpse stays until spawn().
- Hitboxes (from bones each frame): head sphere r0.14 (headshot) + torso capsule r0.2 + 4 leg + 4 arm capsules.
- Teams: ATK tan camo + red armband/patch; DEF navy digital + blue.

## Combat AI (bot.js), DIFFICULTY
- Perception every 0.12 s: fov 110°, view 70 m, LOS eye->head/chest, hearing shots 38 m & running steps 11 m, team intel.
- Reaction 0.25–0.55 s (x0.7 if alerted). Aim turns ≤7.5 rad/s; fires only when aim error small.
- Hit = probability: 0.55 x track(0.35→1 over 1.4 s) x dist x self-move x target-move x burst-index; dmg 25 / head 60
  (x0.85 > 30 m). Bursts 3–6 @0.1 s, pause 0.25–0.6 s, mag 30, reload 2.4 s. Miss = offset ray -> physics impact.
- Engaged: A-D strafe, crouch-spray at range; health<45 or reloading -> cover point hidden from threat (≤10 m).
  Lost target -> hunt last known pos (≤6 s, limited by goal.huntRange around its anchor). Speeds run 5 / walk 2.6 / crouch 1.7.

## Objective AI (brain.js, every 0.4 s)
- ATK: random site per round (or site nearest the player carrier). Bot carrier -> point in site -> `game.actorUse` each frame
  (keeps planting if progress > 55 %). 2 escorts follow the carrier; 2 closest fetch a dropped bomb; others via a random
  route point then the site. Post-plant: guard spots with LOS to bomb.
- DEF: roles A,B,mid,A,B; hold spots near cover seeing the ATK entries (cached per site); rotate toward a site where an
  enemy was seen (12 s). Planted: closest defuses (commits if timer < defuse+1.2 s), others retake around the bomb.
- Phases: only 'live' moves/shoots; frozen respected (except while using). Paths: max 3 A* per frame, repath 2.5–4 s, stuck nudge.

## TODO / ideas
- Tune DIFFICULTY once the real map lands (hit rate ~15 % in sim); nav rebuilds when colliders.length changes. Optional: HUD ally callouts.

## 20 par équipe (intégrateur, itération 3)
- ATK : escouades de ≤ 5 (hors porteur + 2 escortes), une voie `world.nav.routes[site]` par escouade (décalage aléatoire par manche) ;
  avec ≥ 3 escouades la dernière met la pression sur l'autre site. Départs échelonnés : 1,1 s par escouade + 0,5 s par membre.
- DEF : ~20 % de rôdeurs sur les `world.nav.chokes` du milieu, le reste alterné A/B sur les `world.nav.holds` (9 par site).
- `spreadGoals` garde ≥ 2,2 m entre objectifs. Mesure 20c20 : bots 1,37 ms/image, 0,4 % du temps « bloqué en trajet ».

## Balance bench (bench2, bots only, player killed each round)
- Fixed 105/40 s: 10v10 88 % ATK, 20v20 63 %. Auto timers alone: 75 % / 69 %. Rounds end by elimination ~45 s: timers are not the cause.
- Fix: holder's advantage (holdCone/holdReact/holdPreAim), last ATK squad to other site, DEF threat radius site+24 m / 20 s window → full rotation.
- Result: 10v10 50 % ATK (60 rounds), 20v20 56 % (32 rounds, before the rotation change) then 46 % (24 rounds, after).

## Carte v4 (itération 4)
- Liaisons de saut (`nav.setLinks`, `findLinks` dans index.js) : balayage de la grille pour deux cellules praticables séparées
  par un rebord (1 à 4 cellules, écart de sol 0,5 à 1,55 m), un candidat tous les 2 m, validé par simulation physique
  (course + saut pour monter, marche pour descendre, 3 départs décalés). 30 liaisons sur la Citadelle v4. A* les traverse
  (coût = longueur + 6 cellules en montée, + 2 en descente) ; le chemin garde les deux bouts (`hard`), le second marqué
  `jump`. Le bot court et saute dès qu'il touche le sol ; s'il reste bloqué, la liaison prend +30 de coût.
- Assaut groupé : chaque escouade se regroupe à son point d'attente (dernier point de route à plus de 18 m du site),
  accroupie, arme vers le site, et entre quand 70 % sont là, ou après 7 s, ou au premier contact, ou s'il reste < 45 s.
  Le porteur attend avec la première escouade et entre 1,2 s après elle.
- Défense, lecture de la poussée : si au moins 30 % de l'équipe adverse (3 minimum) est vue du côté d'un site
  (plus proche de ce site de 18 m au moins, à moins de 62 m), le site devient « chaud » et la rotation part tout de suite.
- Profil 10v10 (swiftshader) : 2,1 à 3,5 ms/image dont ~2,1 ms de pose des modèles, 0,25 ms de perception,
  0,2 ms de déplacement, 0,07 ms de chemins. Les colliders de la carte ne sont pas le poste dominant.
- Banc : `/tmp` uniquement (non versionné) : parties bots seuls, joueur éliminé à chaque manche, dt 1/30.

## Difficulté (skill.js)
- `SKILLS` {easy RECRUE, normal NORMAL, veteran VÉTÉRAN} : multiplicateurs/valeurs appliqués par-dessus DIFFICULTY/SNIPER.
  `normal` = valeurs d'avant (banc équilibré). S'applique à l'équipe adverse du joueur (suit le changement de camp) ;
  les alliés jouent toujours `normal`. API : `bots.setSkill(level)`, `bots.skill`, `mgr.skillFor(bot)` / `skillForTeam(team)`.
- Visée : précision, chance de tête, temps d'ajustement (track), vitesse de rotation, tolérance avant de tirer, pauses de rafale.
- Réaction / perception : temps de réaction, période de perception (0,2 / 0,12 / 0,09 s), portée de vue, champ, ouïe,
  chance de rater une cible en périphérie, avantage du tenant d'angle.
- Décisions / tactique : PV de repli à couvert (25 / 45 / 60), couvert pendant la recharge (pas en recrue), recrue parfois
  immobile en duel et moins accroupie, durée de traque (3 / 6 / 9 s) ; vétéran : appels d'équipe (pré-vise la dernière
  position ennemie signalée par un coéquipier < 40 m). ATK recrue : pas de regroupement avant l'assaut ;
  DEF : rotation plus lente/rapide (fenêtre 10 / 20 / 25 s, seuil 45 / 30 / 20 %, rayon de menace 14 / 24 / 30 m).
- HUD : réglage « Difficulté des ennemis » (localStorage `nova.hud.skill`), appliqué en direct.
## Capture du drapeau (brain.assignCTF) — rôles dynamiques (v2)
- Rôles recalculés à chaque tick sur les bots VIVANTS : jamais que des défenseurs. Part de défense 20 % (30 % si on mène,
  10 % si on est mené ; dernières 2 min / prolongation : 10 %, 0 % si mené), 0 avec ≤ 2 bots ou si notre drapeau n'est pas
  à la base, toujours ≥ 1 attaquant. Garde de 35-60 s puis le défenseur passe à l'attaque, relevé par l'attaquant le plus proche.
- Défense mobile : interception des ennemis vus à < 40 m du drapeau (intel), sinon patrouille entre les points du socle
  (guardAround) et des lignes à 16-30 m (laneHolds), 3-7 s de guet par point, huntRange 30.
- Attaquants : lignes attribuées par binômes, à tour de rôle (toutes les lignes servent, personne ne part seul).
- Priorités : porteur bot → base (goal.push) ; 2 plus proches → drapeau au sol ; porteur ennemi traqué (défenseurs + bots à
  < 35 m, moitié de l'équipe) ; escorte ≤ 6 bots à < 25 m de notre porteur. Impasse (les deux drapeaux pris) : 2 gardes
  autour de notre porteur caché, tout le reste chasse le porteur adverse.

## Ops de nuit (lamps.js)
- Perception (`nightSight`) quand `world.night` : un ennemi non éclairé n'est remarqué qu'à 16 m (× `nightView` :
  0,8 / 1 / 1,2) ; dans la flaque d'un lampadaire jusqu'à 45 m ; dans le faisceau de la propre lampe du bot (cône 0,3 rad)
  jusqu'à 30 m ; lampe allumée ou tir (flash de bouche, 0,5 s) : portée normale. Une lampe braquée sur le bot (< 45 m,
  cône 0,4) le fait repérer même hors de son champ de vision. Cible dans le noir : réaction × 1,25 et 30 % de chances
  par tick de la rater au-delà de 8 m tant qu'elle n'a pas été vue. L'ouïe ne change pas.
- Discipline de lampe (`skill.lamp`) : RECRUE toujours allumée ; NORMAL éteinte à l'arrêt (> 2 s hors combat) ;
  VÉTÉRAN éteinte à l'arrêt (> 0,8 s), en marche lente / traque, et en tenant un angle long en combat (> 18 m).
- Rendu : faisceau = cône additif coupé au premier mur (raycast) + reflet de lentille fort quand la lampe vise la
  caméra, 2 draw calls instanciés pour tous les bots. Les 3 lampes les plus proches de la caméra (BASSE : 1) ont un vrai
  SpotLight (nombre fixe la nuit). `actor._lit` (0..1, éclairage des lampadaires) recalculé à 10 Hz.
