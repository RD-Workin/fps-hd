# Budget de performance (validé avec la revue Challenge)

Mesure : touche **F3** en jeu (ou `?fps` dans l'URL) → i/s, ms/image, draw calls, triangles, ms des bots, pixel ratio.

| Cible | Qualité | Résolution | Objectif |
|---|---|---|---|
| iGPU portable (Intel Iris Xe / Apple M1) | BASSE | 1080p | **60 i/s** (≤ 16,6 ms) |
| GPU milieu de gamme (GTX 1660 / RTX 3050) | HAUTE | 1080p | **60 i/s** |
| GPU haut de gamme | HAUTE | 1440p | 90+ i/s |

Enveloppes par image (HAUTE, 1080p) :
- Draw calls ≤ **400** (BASSE ≤ 250) · triangles ≤ **1,5 M** (BASSE ≤ 700 k)
- Bots ≤ **2 ms** CPU — mesuré 0,56 ms en 10c10 et 1,17 ms en 20c20 (39 bots, IA + animation, Chromium headless, Citadelle)
- Bots en 40c40 (79 bots, grande carte) ≤ **3 ms** CPU en moyenne, p95 ≤ 5 ms
- Effectifs réglables dans le menu (0–39 alliés, 1–40 adversaires, boutons 5c5 / 10c10 / 20c20 / 40c40) ; avertissement au-delà de 25 acteurs, « lourd » au-delà de 33, « grande bataille » au-delà de 60
- Post-traitement ≤ 4 ms GPU en HAUTE (AO + bloom + AA), BASSE : AA seul
- Ombres : carte statique mise en cache (pas de re-rendu par image) ; en HAUTE, rafraîchissement partiel des seules zones touchées par les ombres mobiles (voir plus bas)
- Pixel ratio : BASSE ≤ 1,0 · HAUTE ≤ 1,5 (jamais `devicePixelRatio` brut sur écran Retina/4K)
- Mémoire GPU textures ≤ 256 Mo (la copie de la carte d'ombre statique coûte 64 Mo en HAUTE, 16 Mo en BASSE) · bundle JS ≤ 1,5 Mo (gzip ≤ 400 ko)

Toute PR qui dépasse une enveloppe le signale dans son fichier `docs/decisions/<partie>.md`.

## Passe d'optimisation (nov. 2026) — lags et chutes d'i/s

Mesures : `scripts/perf/*.cjs` (Chromium headless, rendu logiciel SwiftShader : on compare les comptes, pas les ms GPU).
Vue au spawn ATK en HAUTE (pire cas : les alliés groupés à moins de 10 m), même build avant/après.

| | 10c10 avant | 10c10 après | 20c20 avant | 20c20 après |
|---|---|---|---|---|
| Triangles / image (couleur + AO + ombres) | 1 932 k | 754 k (−61 %) | 2 405 k | 1 153 k (−52 %) |
| Rafraîchissement ombres (1 image sur 2) | 808 k tri, carte 4096² effacée + monde redessiné | 138 k tri, ~1 M texels réparés | 1 055 k tri | 284 k tri |
| Bots CPU (IA + animation) | 2,22 ms | 0,84 ms (−62 %) | 4,93 ms | 1,93 ms (−61 %) |
| Physique (raycast / pas de déplacement, bench Node) | 8,1 µs / 7,6 µs | 0,7 µs / 0,9 µs | | |

Ce qui a changé (aucun réglage visuel touché ; captures avant/après identiques au grain près) :
- **Ombres** (`world/shadowCache.js`) : avant, toute la carte 4096² (monde ≈ 700 k triangles) était re-rendue une image sur
  deux → images alternativement lourdes/légères = micro-saccades. Maintenant le monde est cuit une fois ; le rafraîchissement
  ne recopie (depuis la cuisson) que les rectangles où une ombre mobile était/est, puis dessine soldats/bombe. Vérifié
  identique au texel près à un re-rendu complet (`scripts/perf/shadowcheck.cjs` : 0 texel différent sur 16,7 M).
- **Soldats** : frustum culling (ils étaient dessinés et skinnés même derrière la caméra, dans 3 passes) ; LOD 10/30 m
  (au lieu de 14/38) corrigés par le FOV (la lunette garde le détail) ; LOD2 dans la passe d'ombre, LOD1 max dans la passe AO ;
  pose : matrices recalculées seulement le long de la chaîne lue (résultat identique, testé os par os) ; soldats hors champ
  posés une image sur deux (comme les lointains) ; cadavres immobiles plus recalculés ; le renderer ne re-parcourt plus
  leurs ~130 nœuds à chaque passe.
- **AO (GTAO)** calculée à ~0,75× la résolution CSS (0,75 à pr 1, 0,5 à pr 1,5) : 1,8 à 4× moins de fragments, y compris la
  pré-passe normales/profondeur.
- **Physique** (`core/physics.js`) : grille 2D de 4 m + parcours DDA pour les rayons, sans allocation. Résultats identiques
  à l'ancien balayage (200 k rayons et 120 k pas de déplacement comparés).
- **Pathfinding** : 3 A* max par image mais arrêt dès ~2 ms passées (les longs chemins du début de manche s'empilaient).
- **Préchauffage des shaders** au menu (`renderer.compileAsync`) : plus de gel au premier tir / impact / explosion.
- **Résolution dynamique** (HAUTE, écrans HiDPI seulement) : si l'image dépasse ~20 ms pendant 2 s, le sur-échantillonnage
  baisse par pas de 0,25 (jamais sous 1,0 = résolution native) et remonte après 10 s calmes. Visible dans F3 (`px`).

## Passe 40c40 (nov. 2026) — grande bataille sur la grande carte

Bancs : `scripts/perf/cpu.cjs` (CPU par module, rendu coupé), `scripts/perf/split.cjs` (bots : animation / A* / perception
par image + pires images), `scripts/perf/profile.cjs` (profil CPU, fonctions les plus chères), `scripts/perf/passes.cjs`
(draw calls / triangles par passe). Tous : `npx vite build && npx vite preview --port 4173` puis `node scripts/perf/<x>.cjs
http://localhost:4173/ 39 40 …` (`split.cjs 39 40 20` sans URL). Grande carte (branche h6ui6r), objectifs tirés au hasard.

| 40c40, CPU des bots par image | avant | après |
|---|---|---|
| moyenne (cpu.cjs) | 5,07 ms | 2,33 ms (−54 %) |
| p95 | 14,5 ms | 4,0 ms (−72 %) |
| A* : pics sur une image | 14–17 ms | ≤ 6 ms |

Le profil montrait l'animation des soldats à ~4× le coût de l'IA (mixer + IK + ~130 matrices par soldat et par image), et
des A* traversant la carte (12 ms chacun) relancés à chaque image quand ils échouaient.
- **LOD d'animation** (`soldiers/index.js`, `POSE_RATE`) : pose complète toutes les 1 à 6 images selon la distance
  (corrigée du FOV) et la visibilité. Au-delà de 40 soldats (`CROWD`), la table « crowd » anime aussi 10–30 m à 30 Hz.
  Les soldats sont échelonnés (une pose par image et par créneau, plus de pics une image sur deux). Entre deux poses, le
  squelette suit la racine par une matrice par nœud (`carry`, vérifié identique à 1e-14 près à un recalcul complet) :
  le déplacement reste fluide à 60 i/s, seuls les membres sont animés moins souvent.
- **Squelettes gelés hors champ** : hors champ et à plus de 40 m, seules les hitbox suivent ; le soldat est masqué et
  reposé dès qu'il revient dans le champ (sphère de test = sphère de culling des maillages, 2,3 m).
- **Chemins** (`bots/pathcache.js`) : cache par cellule d'arrivée de 4 m (réutilisé si le bot voit l'un des 4 premiers
  points en ligne droite, départ à moins de 6 m), cache des échecs 2 s, budget par image en ms (1,5 ms, 8 recherches max).

### Rendu en 40c40 (même partie rejouée : `SEED=1..3 node scripts/perf/passes.cjs … 39 40 high 20`)
| draw calls / image (moyenne des 3 graines) | avant | après |
|---|---|---|
| total | 563 | 426 (−24 %) |
| rafraîchissement des ombres | 459 | 297 (−35 %) |
| passe AO | 150 | 121 |
| triangles / image | 1 685 k | 1 529 k |
Le décor seul fait ~107 draw calls (`NOSOLD=1`) : le reste, ce sont les soldats.
- **Brassard fusionné** dans le maillage du corps (3 LOD, attribut `aBand`, teinte d'équipe dans le shader) : 1 draw call et
  1 squelette de moins par soldat et par passe. Vérifié au chargement : même squelette, même texture, même bind.
- **Passes ombre / AO** : sans brassard ni chargeur ; le chargeur n'est plus dessiné au-delà de 30 m.
- **Grande bataille** (> 40 soldats) : pas d'ombre dynamique au-delà de 60 m ; les soldats visibles au-delà de 60 m sont
  dessinés par `soldiers/crowd.js` en 2 draw calls pour tous (corps + fusil instanciés, matrices des os dans une texture
  flottante, une ligne par soldat). Capture comparée : mêmes poses et couleurs, seule l'AO des silhouettes lointaines manque.

### Décor découpé en tuiles (`core/chunks.js`)
Le monde est fusionné par matériau en maillages de ~350 m (`world_stone`, `world_leaf`…) : le frustum culling ne pouvait
jamais en écarter un, donc les passes couleur et AO dessinaient toute la carte (~520 k triangles) quel que soit le regard.
Après `createWorld`, `chunkStatics(scene)` découpe chaque maillage statique de plus de 15 k triangles en tuiles de 96 m
(index par tuile, tampons de sommets partagés, donc pas de mémoire GPU en plus hors index). Rendu identique au pixel près
(7 points de vue, culling actif / coupé, 0 pixel différent). Tuiles de 48 m essayées : −22 % de triangles mais +76 % de
draw calls, donc 96 m et seuil de 15 k triangles.
| 40c40, 3 graines | avant | après |
|---|---|---|
| triangles / image | 1 549 k | 1 116 k (−28 %) |
| draw calls / image | 450 | 444 |
| triangles passe AO | 567 k | 390 k |

Décor hors carte (nov. 2026) : tout ce qui dépasse la zone jouable (+4 m) est regroupé en UN chunk par côté (N/S/E/O)
au lieu d'une tuile tous les 96 m (`opts.bounds`) : 29 → 10 chunks lointains, 76 → 57 au total. 40c40 graine 7 :
1 181 → 1 092 draw calls par image (passe couleur 806 → 761, AO 357 → 313). Au passage, 3 vignes et 2 étagères de
`grandZones.js` avaient l'axe inversé et flottaient 50 à 110 m au nord de la carte (7,8 k triangles invisibles + 2
collisions fantômes) : remises sur leurs murs (Parvis, Rue Haute, Grande Place, Café, Notable).

### Feuillage et compteur d'i/s (nov. 2026)
- Touffes de feuillage < 0,35 m (fleurs, jardinières, tas de filets) en icosaèdre 20 triangles au lieu de 80
  (`world/kit2.js`, `blob`, accord du thread carte) : décor statique 556 k → 481 k triangles (−75 k, −13 %).
- Compteur d'i/s : F3, `?fps` ou menu Réglages « Compteur d'i/s » (mémorisé). Affiche i/s moyen, « 1 % bas » et pire image
  sur les ~240 dernières images, ms/image, draw calls, triangles, ms des bots, pixel ratio, nombre d'acteurs.
  Couleur : vert ≥ 55 i/s, jaune ≥ 40, rouge en dessous.
