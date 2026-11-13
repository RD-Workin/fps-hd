# Décisions — game

Statut : FAIT (S&D complet, self-test 64/64 OK). Fichiers : src/game/index.js, bombModel.js, selftest.js.
- Constantes (export RULES) : freeze 4 s, manche 105 s, post 5 s, pose 3 s, désamorçage 6 s, bombe 40 s,
  ramassage 1,2 m, désamorçage ≤1,6 m, souffle : mort <12 m, dégâts dégressifs jusqu'à 20 m. 4 manches gagnantes, swap après manche 3.
- Roster : joueur + Faucon, Vipère, Loup, Corbeau (ATK) vs Spectre, Cobra, Orage, Lynx, Mistral (DEF).
  bots.setup reçoit [{name, team, ally}] (ally = bonus).
- Phases : menu → freeze → live → post → … → over. En 'over' tous frozen ; HUD appelle game.restart().
- Bombe : bomb.position = copie des pieds du porteur quand 'carried' (le HUD ne doit pas la montrer aux ennemis).
  bomb.planter / bomb.defuser en plus. Pose arrête roundTimeLeft (figé) ; le HUD affiche bomb.timeLeft.
- Après victoire par élimination avec bombe posée, la bombe continue et explose en 'post' (sans effet sur le score).
- Un seul désamorceur à la fois. actorUse: compteur par frame (double appel/frame sans effet).
- Élimination ignorée pour une équipe sans aucun membre (jeu jouable avec bots stub).
- API en plus : game.restart(), rules, phaseTimeLeft, freezeTimeLeft, useAction ('plant'|'defuse'|null),
  lastResult, history[], isMatchPoint, playerTeam, isAlly(a), aliveCount(team), siteAt(pos).
- actor.stats {kills, deaths, score, plants, defuses, mvps} (kill +100, pose/désamorçage +50) ; reset à start/restart.
- Événements en plus : 'round:live' {round}, 'bomb:planting'/'bomb:defusing' {actor}, 'bomb:plantCancel'/'bomb:defuseCancel'.
  Payloads enrichis : round:end {winner, weWon, reason, mvp, round, score, matchOver}, round:start {round, playerTeam},
  bomb:dropped {position, actor}, bomb:exploded {position, site}, bomb:planted {site, actor, position}, match:end {weWon, score}.
- Explosion : ctx.effects.explosion(pos) + applyDamage(actor, dmg, null, {fromPos, explosion:true}) + trace brûlée au sol.
- Visuels : charge procédurale + LCD compte à rebours + LED rouge (clignote plus vite à la fin) + PointLight toujours présent
  (intensité 0 si caché) ; marqueur de ramassage (anneau + faisceau) ; sac sur le dos d'un bot porteur si bot.yaw existe.
- Menu : caméra orbitale lente au-dessus de la carte (rAF propre au module) tant que phase==='menu'.
- Self-test : ouvrir ?gametest puis `await window.__gameSelfTest()` → {ok, failures, log} (acteurs factices).
TODO / prochain responsable :
- HUD : libérer le pointeur (document.exitPointerLock) en 'over' pour cliquer « Rejouer » (le game ne le fait pas).
- Bots : lire actor.frozen, game.phase, bomb.state/position/site, appeler actorUse chaque frame en pose/désamorçage ; exposer bot.yaw.
- Possible : crédit des kills de l'explosion au poseur ; caméra spectateur après la mort du joueur.
