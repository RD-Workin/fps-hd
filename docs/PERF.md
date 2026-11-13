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
- Ombres : carte statique mise en cache (pas de re-rendu par image), seule une petite ombre dynamique autour du joueur
- Pixel ratio : BASSE ≤ 1,0 · HAUTE ≤ 1,5 (jamais `devicePixelRatio` brut sur écran Retina/4K)
- Mémoire GPU textures ≤ 256 Mo · bundle JS ≤ 1,5 Mo (gzip ≤ 400 ko)

Toute PR qui dépasse une enveloppe le signale dans son fichier `docs/decisions/<partie>.md`.
