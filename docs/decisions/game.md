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

## Capture du drapeau (src/game/ctf.js, flagModel.js) — novembre 2026
- ctx.game est une façade (Proxy) : lectures, écritures et appels vont au mode actif. game.mode 'sd' | 'ctf', game.setMode(m)
  (immédiat au menu principal, sinon pendingMode appliqué par restart()). ctf réutilise le roster, les effectifs, le camp
  préféré et les stats kills/morts de l'objet S&D (son écouteur 'actor:killed'). S&D a resetVisuals() ; phase 'off' pendant le CTF.
- Bases : world.ctf.bases {ATK: port (0, 46), DEF: citadelle (0, -43)}, lignes world.ctf.lanes (6 polylignes port -> citadelle).
- game.flags[team] {team, state 'base'|'carried'|'dropped', carrier, position, base, returnLeft}. Toucher (1,4 m) : un ennemi
  prend, un allié renvoie un drapeau au sol. Capture à 2,4 m de sa base si son drapeau y est. Au sol 10 s puis retour.
- Porteur : actor.hasFlag, actor.speedMul = 0,8 (lu par core/player.js et bots/bot.js), visible de tous sur la minimap.
- Réapparition : 3 s + pas × (morts depuis la dernière capture de l'équipe − 1), plafond pas × 7,5. Pas auto = 2 s × n / 5
  (n = joueurs de l'équipe) → 5c5 +2 s / 15 s, 20c20 +8 s / 60 s. Vies par manche auto = max(3, round(9,5 − 0,27 n))
  (5c5 8, 10c10 7, 20c20 4). actor.ctf {lives, pen, respawnAt, out}. Équipe entièrement « out » = manche perdue.
- Manche : 3 captures ou meilleur score après 10 min ; égalité → prolongation 2 min (capture = victoire), puis vies restantes,
  éliminations, tirage. BO3 (roundsToWin 2) : camp inversé en manche 2, tiré au sort en manche 3.
- Réglages : game.settings {caps, minutes, step|null, lives|null} via setCtfSettings (menu HUD).
- Événements : 'flag:taken' {team, actor, from}, 'flag:dropped', 'flag:returned' {team, actor, auto}, 'flag:captured'
  {team, actor, weScored, caps}, 'ctf:overtime', 'ctf:out' {actor}, 'player:respawn' / 'actor:respawn' {actor}.
  round:start / round:end portent mode: 'ctf' (+ caps). stats.captures / stats.returns.
