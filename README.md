# Opération Nova — FPS Recherche & Destruction (navigateur)

FPS original jouable dans le navigateur : une carte, un mode (Recherche & Destruction, 5v5 contre des bots).
Three.js 0.170 + Vite 5, 100 % gratuit (code open source, assets procéduraux ou CC0/MIT).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ (hébergeable tel quel)
```

Contrôles : ZQSD (AZERTY) se déplacer · souris viser · clic gauche tirer · clic droit recharger · E poser/désamorcer ·
Espace sauter · C s'accroupir · Maj marcher · Tab scores · M couper le son · Échap pause.

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
