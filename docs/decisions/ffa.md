# Décisions — Mêlée générale (src/game/ffa.js)

Statut : FAIT (build vert, simulation bots seuls : 8 joueurs × 5 vies ≈ 4 min, 12 × 3 vies ≈ 3 min).
Choix « MÊLÉE GÉNÉRALE » dans le menu Mode de jeu (`game.mode === 'ffa'`, objet à part comme le CTF, branché dans la façade de createGame).
## Règles
- Le joueur + N bots (curseur « Adversaires », 1–39, 11 par défaut), chacun pour soi. Carte : la Citadelle (`world.coreBounds`, sites A/B classiques).
- Vies par joueur (1–15, 5 par défaut) : une mort coûte une vie, réapparition 4 s plus tard ; sans vie = éliminé, place = joueurs encore en lice + 1.
- Le dernier encore en lice gagne (+500 au score, `stats.mvps`). Durée max (3–30 min, 10 par défaut) : classement aux vies restantes puis aux éliminations.
- Préparation 4 s (choix d'arme) comme les autres modes. Score : +100 par élimination (écouteur commun de l'objet R&D).
- Réapparition : cellules du nav au sol reliées à la cour de la citadelle (remplissage depuis le 1er spawn DEF, ≥ 1 m des murs), on garde
  parmi 28 tirages celle la plus loin des vivants et hors de leur vue (< 45 m).
## Hostilité
- `actor.ffa = {lives, respawnAt, out, place}` sur chaque acteur pendant la mêlée. `core/teams.js` : `friends(a, b)` (même équipe ET pas de mêlée)
  / `foes(a, b)`. Utilisé par combat.js (pas de « tir allié »), bots/bot.js (perception, tir à travers un « allié », pas de partage de renseignement),
  grenades, stats R&D, assistances HUD. Le champ `team` ne sert plus qu'à l'uniforme : bots 'DEF' (tous en tenue ennemie), joueur 'ATK'
  ⇒ minimap / grande carte / sons ennemis marchent sans changement.
- Spectateur après élimination (core/player.js) : n'importe quel joueur vivant.
## Bots
- `Brain.assignFFA` : chaque bot connaît à peu près (erreur 2–10 m, 3 m quand ≤ 4 vivants) la position du joueur le plus proche et y va
  (70 %), sinon il rôde (30 m). Destination gardée 6–12 s ou jusqu'à l'arrivée. Combat et traque : bot.js inchangé. ~1 bot sur 6 en sniper.
## API / événements
- `game.settings {bots, lives, minutes}` via `setFfaSettings` ; `remaining`, `leader`, `winner`, `ranking[]` (fin de partie), `placeOf(a)`.
- `round:start {mode:'ffa'}` une fois, `round:live`, `ffa:out {actor, place}`, `player:respawn` / `actor:respawn`, `match:end {weWon, mode:'ffa', winner, place, reason}`.
- HUD : barre du haut VOUS (éliminations, vies en icônes) / EN LICE ; meneur sous l'horloge ; Tab = un seul classement (É, A, M, TÊTE, DÉG, VIES, SCORE) ;
  écran de mort avec compte à rebours ou place finale ; fin : place + éliminations, vainqueur.
## TODO / idées
- Zone qui se resserre pour les grandes parties ; protection de 1–2 s à la réapparition ; record local.
