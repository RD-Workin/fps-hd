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
  Ouest = Vieille-Ville v6 (grandes places encombrées reliées par des passages courts : port 0, Cour des Pêcheurs / Halle aux
  poissons / Cour du Four 0, Grande Place du Marché +1,5 avec halle couverte sur le site D, Parvis / Jardins / Place Haute +3). Est = Gare de triage
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
- Étages superposés (fait, `src/world/storeys.js`) : 8 maisons (`marche` angle NE de la Grande Place, `boulangerie` mitoyenne,
  `grenier` angle NO, `pecheurs`, `remparts`, `aiguillage`, `depot`, `capitainerie`), 2-3 étages + toit-terrasse, escaliers en lacets,
  fenêtres à chaque étage. v2 : cage d'escalier fermée sur le toit (`geom(h).kiosk`), mobilier par étage et encombrement des toits
  (`furnish`, placé hors escaliers / portes / fenêtres ; bloque la physique et la grille nav de l'étage ; un tenant de fenêtre
  recouvert par un meuble bas est retiré de `HOUSE_HOLDS`), maisons traversantes (Grande Place → Marché → Boulangerie → rue est).
  `skip: 'W'` = mur mitoyen fourni par la maison voisine (pas de mur ni de parapet de ce côté).
  - `world.nav.floorAt(x, z, y?)` : avec `y`, renvoie le plancher de l'étage où l'on est (sinon comme avant).
  - `world.nav.highHolds` : `{x, z, y, yaw, high: true, roof?, house}` (fenêtres d'étage + coins de toit) ;
    `world.nav.holdsHigh[site]` = ceux à < 50 m du site.
  - Nav bots : `nav.findPath(sx, sz, gx, gz, maxIter?, penalty?, sy?, gy?)` enchaîne les grilles d'étage par les escaliers
    (points `hard: true`). `isWalkable/clearance/snap/los/randomPointNear` prennent un `y` optionnel en dernier argument.
    **Un but d'étage doit porter `y`** (`goal = {x, z, y, ...}`) : bot.js passe `this.position.y` / `dest.y` et l'arrivée
    exige |Δy| < 1,5 m quand `goal.y` est défini.
  - Trajets > 60 m : A* pondéré (×1,6) et budget 150 000 itérations (traversée complète ≈ 8-17 ms, une fois, puis cache).
  - Tests : `N=9 node scripts/perf/climbtest.cjs` (un bot par maison monte au toit puis redescend), `scripts/perf/pathtest.cjs`.
- Murs cassables (fait, `src/world/breakables.js`) : planches, palissades et portes (Vieille-Ville). Collider physique
  `{box, material:'wood', breakable}` + collider nav. Les balles (joueur : `src/weapon/index.js`, bots : `bot.js`) émettent
  `events.emit('weapon:impact', {collider, point, dmg, by})` ; à 0 PV : mesh remplacé par des restes, colliders retirés,
  `bots.nav.reblock(x0, z0, x1, z1, colliders)` rouvre les cellules (et vide le cache de chemins), `'world:breach'` émis.
  Tout est restauré à `'round:start'`. Test : `scripts/perf/breachtest.cjs`.

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

## Tactiques d'escouade (thread « Organiser les bots en escouades tactiques », branche `claude/project-thread-g60da6`)
- Fichiers : `src/bots/squads.js` (nouveau), `brain.assignATK` / `pushUtility` / branche « bombe posée » d'`assignDEF`,
  `bot.js` (champ d'objectif `goal.watch` + allure `'tac'` 3,6 m/s). `autoRoutes` et les rôles DEF par proximité : inchangés.
- Lit seulement : `world.bombSites`, `world.nav.routes|holds|chokes|floorAt`, `brain.autoRoutes`, `nav.findPath|snap|randomPointNear|clearance|los`.
  Prêt pour `holds[i].high` / `world.nav.entries[site]` quand la carte les fournit (pas encore utilisés).
- `goal` (contrat brain → bot) gagne : `watch:{x,z}` (arme pointée vers ce secteur en marchant), `speed:'tac'`, `formation`.
- Attaque : équipes de 2-4 formées **par point d'insertion** (grappes à < 30 m), site principal = le plus proche du porteur
  (70 %) ; une équipe à > 110 m du site principal fait pression sur le site le plus proche et **reste en attente** à son point
  de regroupement tant que la poussée principale vit. Coût : O(membres) par tick brain + ≤ 14 échantillons nav par équipe au contact.
- Défense : `squads.retake` (regroupement avant reprise). Banc : `scripts/bots/bench.cjs`.

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
- En grande bataille (> 40 soldats), les soldats visibles à > 60 m sont dessinés par `soldiers/crowd.js` (2 draw calls pour
  tous : corps + fusil instanciés, squelettes dans une texture) et ne projettent pas d'ombre dynamique ; leurs propres
  maillages sont masqués (`model.impl.inCrowd`). Le brassard est fusionné dans le corps (attribut `aBand`).
- `src/bots/spatial.js` : grille de 4 m des acteurs, reconstruite une fois par image au début de `bots.update`.
  `mgr.near(x, z, r, cb(actor, d2))` (distance horizontale exacte) et `mgr.inBox(minX, minZ, maxX, maxZ, cb(actor))`
  (grossier : retester). Morts compris, le bot lui-même compris. `cb` qui renvoie true arrête la requête (qui renvoie true).
- `src/core/chunks.js` : `chunkStatics(scene)` appelé dans `main.js` juste après `createWorld`. Les maillages statiques
  de plus de 15 k triangles et de plus de 60 m (enfants directs de la scène, sauf `world_decal`) sont remplacés par des
  tuiles de 96 m (même nom, même matériau, `userData.chunkOf`). Carte : si vous gardez une référence à un `world_*` après
  sa création (pour le masquer, changer son matériau…), passez par le matériau ou ajoutez son nom à `CHUNK.skip`.
- Bancs : `scripts/perf/split.cjs` (bots : animation / A* / perception), `profile.cjs`, `cpu.cjs`, `passes.cjs`.
