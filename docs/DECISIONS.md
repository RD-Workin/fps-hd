# Chantier « Immersion R&D » — décisions partagées entre threads

Lire ce fichier (et `docs/decisions/<module>.md`) au lieu du code des autres. Branche de base du chantier :
**`claude/project-thread-h6ui6r`** (thread « Carte géante »). Les autres threads partent de cette branche et la fusionnent
régulièrement (`git fetch origin claude/project-thread-h6ui6r && git merge FETCH_HEAD`).

## Propriété des fichiers (un thread = ses fichiers ; demander par message pour le reste)
| Thread | Fichiers |
|---|---|
| Carte géante / étages / navigation (h6ui6r) | `src/world/*`, `src/bots/nav.js`, `src/bots/index.js` (`ensureNav`, `findLinks`), `src/game/index.js` (objectifs), HUD réglage « Objectifs » + minimap |
| Tactiques d'escouade (bots) | `src/bots/brain.js` (sauf `autoRoutes` et l'attribution des rôles DEF par site, déjà faits ici : les garder), `src/bots/bot.js` (comportement de combat), nouveaux fichiers `src/bots/squad*.js` |
| Perf / 40c40 | `src/soldiers/*`, `src/bots/model.js`, `src/bots/lamps.js`, `src/core/*` (budget, culling), `scripts/perf/*`, `docs/PERF.md`, `MAX_ALLIES/MAX_ENEMIES` + curseurs HUD effectifs |

## Carte (world) — « Port-Cassis, grande carte » (v5)
- Grille de cellules 2 m, x[-176,176] z[-64,56] (352 × 120 m). Centre = Citadelle v4 inchangée (x[-80,80]).
  Ouest = Vieille-Ville (ruelles 2-4 m, 3 terrasses : +3 Haute-Ville, +1,5 Marché, 0 port de pêche). Est = Gare de triage
  (quais de voyageurs +1,5, voies au sol, trains de fret, hall de gare 7 m sous plafond, entrepôts, quai de fret).
- Données : `src/world/layout.js` (Citadelle) + `src/world/grand.js` (extension : `GRAND_CARVES`, `ROOMS` → murs générés,
  `ALL_SITES`, `INSERTIONS`, `POSTS`, `OBJECTIVES`, `REGION`, labels, chokes).
- `ctx.world` (en plus du contrat ARCHITECTURE.md) :
  - `allSites` : 4 sites `{name 'D'|'A'|'B'|'C', center, radius, zone}` d'ouest en est.
  - `bombSites` / `spawns` : **ceux de la manche** (changent à chaque `setObjectives`). Toujours lire `ctx.world.bombSites`
    au moment voulu, ne pas le mettre en cache au-delà de la manche (événement `'world:objectives'`).
  - `setObjectives(set | 'AB')` → `{sites:[...], insertion:[...]}` ; appelé par le jeu avant `spawnAll` à chaque manche.
    `objectives[n]` = jeux possibles à n sites (2 : AB / DA / BC ; 3 : DAB / ABC ; 4 : DABC). `world.objective` = jeu actif.
  - `coreBounds` = Citadelle seule (mode Zombies, caméra du menu). `bounds` = grande carte.
  - `nav` : `{routes (A/B depuis le port uniquement), holds (A/B), chokes, colliders, floorAt, grid}` comme avant.
    Sites C/D : pas de holds faits main → `brain.holdSpots` les calcule.
- Spawns : ATK = insertions côtières (`ouest` port de pêche, `port` Citadelle, `est` quai de fret), DEF = postes par site
  (D Rue Haute, C Place de la Gare, A/B cour de la citadelle). Ombres ajustées à la région des sites actifs.
- Étages superposés (à venir, étape 2) : l'API `floorAt(x, z)` deviendra `floorAt(x, z, y?)` (y = hauteur courante pour
  choisir l'étage) ; le `NavGrid` gagnera des couches. Je préviendrai ici avant de changer une signature.

## Jeu (R&D)
- `game.objectiveMode` 'auto' | 'classic' | '2' | '3' | '4' (`setObjectiveMode`) ; auto : 2 sites ≤ 12 par camp, 3 ≤ 25, 4 au-delà.
- `'round:start'` porte `objective`. Temps de manche auto +15 s hors paire A/B (insertions plus loin).
- CTF / Zombies forcent `setObjectives('AB')`.

## Bots (ce que ce thread a changé dans brain.js — à conserver)
- `NavGrid.findPath(sx, sz, gx, gz, maxIter, penalty?)` : `penalty` Float32Array par cellule (coût × (1 + p)).
- `brain.autoRoutes(from, site, k=3)` : k routes A* différentes (pénalité autour des routes précédentes), waypoints ~14 m,
  en cache dans `spotCache` (vidé à chaque changement d'objectifs). `buildSquads` utilise les routes faites main si elles
  partent à < 30 m de l'escouade, sinon `autoRoutes`. Chaque escouade part de la position moyenne de ses membres.
- DEF : rôles par proximité (chaque site actif prend à tour de rôle son défenseur le plus proche), ~20 % de rôdeurs sur
  les chokes à < 70 m d'un site actif. `threat` indexé par nom de site (générique).

## Perf / 40c40 (thread « Rendre le 40c40 fluide »)
- Effectifs : `MAX_ALLIES = 39`, `MAX_ENEMIES = 40` (`game/index.js`), noms jusqu'à 40 par camp, curseurs HUD 0–39 / 1–40,
  boutons « Effectifs rapides » 5c5 / 10c10 / 20c20 / 40c40 (masqués en Zombies, qui garde 0–19 alliés).
- `src/bots/pathcache.js` : `wrapPathCache(nav)` remplace `nav.findPath` sur l'instance (mêmes arguments, `...args`
  transmis ; appels avec `penalty` jamais en cache ; `sy`/`gy` dans la clé par couche de 3 m). `nav.__pathCache.stats`
  pour le debug. `takePathBudget(mgr)` : budget en ms par image. Si vous appelez `findPath` hors de `followPath`, rien à
  changer ; un chemin renvoyé est une copie (vous pouvez le modifier).
- Soldats (`soldiers/index.js`) : la pose complète n'est plus faite à chaque image pour les soldats lointains / hors champ.
  Les hitbox (`model.hips/spine/neck/arms/legs`) restent à jour à chaque image. Ne pas lire les os du squelette
  (`model.impl.b.*`) d'un bot lointain en comptant sur une pose de l'image courante : lire `muzzle` / les hitbox.
  Un soldat hors champ à > 40 m a `root.visible = false` jusqu'à sa prochaine pose.
- Bancs : `scripts/perf/split.cjs` (bots : animation / A* / perception), `profile.cjs`, `cpu.cjs`, `passes.cjs`.
