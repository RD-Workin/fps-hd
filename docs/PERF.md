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
- Effectifs réglables dans le menu (0–19 alliés, 1–20 adversaires) ; avertissement au-delà de 25 acteurs, « très lourd » au-delà de 33
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
