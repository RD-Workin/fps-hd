# Opération Nova — FPS Recherche & Destruction (navigateur)

FPS original jouable dans le navigateur : une carte, deux modes (Recherche & Destruction et Capture du drapeau, jusqu'à 20c20 contre des bots).
Three.js 0.170 + Vite 5, 100 % gratuit (code open source, assets procéduraux ou CC0/MIT).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (hébergeable tel quel)
```

Version en ligne : https://rd-workin.github.io/fps-hd/ (redéployée automatiquement à chaque push sur `main`
par `.github/workflows/pages.yml` ; activer une fois Settings > Pages > Source = « GitHub Actions »).

Contrôles : ZQSD (AZERTY) se déplacer · souris viser · clic gauche tirer · clic droit viser · R recharger · E poser/désamorcer · passer sur un cadavre = munitions ·
Espace sauter · C s'accroupir · Maj marcher · Tab scores · mort : clic/Espace allié suivant, V ou clic droit vue FPS de l'allié · M couper le son · F3 compteur de perfs · Échap pause.

Modes (au choix dans le menu) :
- Recherche & Destruction : 10 contre 10, tir allié activé, camp de départ et difficulté des ennemis (Recrue, Normal, Vétéran) au choix, changement de camp à la mi-temps.
- Capture du drapeau : un drapeau côté port, un côté citadelle ; 3 captures ou meilleur score après 10 min, en BO3 (camps
  inversés en manche 2, tirés au sort en manche 3). Réapparition 3 s qui s'allonge à chaque mort (plus fort en grandes équipes),
  remise à zéro à chaque capture de son équipe ; nombre de vies limité par manche. Réglages dans le menu.
- Zombies : vagues de zombies sortant de la mer au port, munitions illimitées, nombre d'alliés au choix (ils vous suivent et tiennent la position avec vous), difficulté qui monte par le nombre, la vitesse ou les deux. Voir [docs/decisions/zombies.md](docs/decisions/zombies.md).

## Architecture
Contrat complet : [ARCHITECTURE.md](ARCHITECTURE.md). Chaque module expose `createX(ctx)` et ne lit les autres que via `ctx`.

| Module | Dossier | Rôle |
|---|---|---|
| Socle (intégrateur) | `src/main.js`, `src/core/` | boucle, entrées, physique AABB, joueur, dégâts, bus d'événements |
| Carte | `src/world/` | map, éclairage, post-traitement, colliders, spawns, sites A/B |
| Arme | `src/weapon/` | viewmodel, tir, recul, recharge, effets (`ctx.effects`) |
| Bots | `src/bots/` | IA, navigation, animations, hitboxes |
| Mode de jeu | `src/game/` | manches, bombe, scores, changement de camp |
| HUD | `src/hud/` | menus, réticule, hitmarkers, minimap, killfeed |
| Son | `src/audio/` | synthèse Web Audio, mute (M) |

## Règles de collaboration (économie de tokens)
- Chaque partie ne modifie que son dossier (+ `public/assets/<module>/`). Le socle passe par l'intégrateur.
- Chaque partie tient `docs/decisions/<partie>.md` (≤ 40 lignes : décisions, API, constantes, TODO).
  C'est la seule source de contexte entre parties : on lit les fichiers de décisions, pas le code des autres.
- Une branche / PR par partie, `npx vite build` doit rester vert.
