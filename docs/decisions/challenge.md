# Décisions — challenge (revue du build intégré main@52a4c13, 2026-11-13)

Méthode : lecture README/ARCHITECTURE/décisions + code ciblé ; build vert ; `?gametest` 64/64 OK ; partie lancée en
Chromium headless (SwiftShader, qualité BASSE, ~2 i/s donc pas de ressenti de jeu), captures spawns, sites A/B, mid.
Classement par impact décroissant. Constats déjà connus de l'intégrateur non répétés (bannière/compte à rebours, label SPAWN ATK, HAUTE sans GPU).

## 1. Bugs
- **Tirs des bots à travers la couverture** (bots/bot.js `tryFire`) : le touché est un tirage de probabilité ; la ligne de vue
  n'est vérifiée qu'à la perception (toutes les 0,12 s, tête OU torse). Joueur accroupi derrière un muret, tête visible :
  il prend des balles « au corps » (25) à travers le muret, traceur et sang inclus. Re-tester `lineOfSight(eye, end)` au tir.
- **Menu coupé sur petit écran** (hud.css l.288) : `.nv-menu` = flex `align-items:center` + `overflow:auto` ⇒ le haut est
  inatteignable. À 960×540, titre hors écran, footer sur le panneau commandes, réglages (qualité/sensi/volume) invisibles.
  Correctif : `align-items: safe center` ou `margin:auto` sur `.nv-menu-in`.
- **Pixel ratio incohérent** : main.js fixe `min(dpr, 2)`, world plafonne à 1,75 en HAUTE ; ombre 4096 recalculée chaque frame.
  Sur écran 4K/Retina c'est l'essentiel du coût « HAUTE ». Plafonner via une résolution de rendu (ex. 0,67–1×) réglable.

## 2. Incohérences
- **Clic droit = recharger** alors que la référence visée (shooters militaires AAA) = clic droit visée (ADS), R = recharger.
  L'arme porte une optique inutilisable et `weapon.aiming` est câblé (vitesse ×0,8) mais toujours `false` : code mort.
- **Mort du joueur = écran figé jusqu'à 2 min 25** (manche 1:45 + bombe 40 s) : pas de caméra spectateur (TODO game/hud).
  C'est le moment le plus long d'une partie solo contre 9 bots ; c'est là qu'on décroche.
- Docs : ARCHITECTURE.md dit encore « No audio » ; le menu nomme la carte « Vieille Ville », les docs « Opération Nova »
  (nom du jeu ? de la carte ?). Trancher et aligner.
- Échelle des textures : briques du soubassement visiblement surdimensionnées vs pavés fins au sol (estimation à l’œil, site A).
- Bots : `DIFFICULTY` réglé sur la carte stub (TODO bots.md) ; jamais recalibré sur la vraie carte.

## 3. Améliorations (visuel AAA, coût zéro)
- Personnages : priorité absolue (modèles actuels = blocs, tête-sphère noire, cf. capture spawn DEF). Le thread HD en cours
  doit livrer aussi des animations (marche, visée, mort) et un LOD, sinon le gain est perdu en mouvement.
- Viewmodel : l'optique ronde paraît creuse et sombre ; un vrai réticule d'optique (lentille + point rouge) suffirait.
- Lumière : sondes/lightmap baked pour les rues à l'ombre (aujourd'hui hemi 0,35 plat) ; ombres statiques mises en cache
  (autoUpdate off) + petite ombre dynamique autour du joueur = qualité HAUTE plus belle et moins chère.
- Feedback : impacts visibles sur les bots (chocs/flinch), caméra de kill (killcam courte) et indicateur de son ennemi.

## 4. Direction proposée (ordre)
1. Correctifs rapides : LOS au tir des bots, menu scrollable, R/clic droit (ADS minimal : FOV 75→55, sensi ×0,7, spread ×0,4).
2. Spectateur à la mort (cycle alliés vivants, Espace/clic) — débloque le rythme d'une partie.
3. Intégrer les soldats HD, puis recalibrer `DIFFICULTY` en conditions réelles (benchmark : taux de touche, TTK, durée de manche).
4. Budget perf explicite (60 i/s sur iGPU 1080p en BASSE, 60 i/s GPU milieu de gamme en HAUTE) + compteur FPS en debug.
5. Ensuite seulement : 2ᵉ arme (pistolet), grenades, économie légère — le cœur 1 arme/1 carte doit d'abord être irréprochable.
