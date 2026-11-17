# Grenades — fumigène et flash (décisions & état)
Statut : FAIT (build vert). Fichiers : `src/grenades/index.js` (inventaire, lancer, physique, détonations, cécité, overlays,
widget d'inventaire), `src/grenades/smoke.js` (rendu des nuages). Branchements : `main.js` (création + update),
`weapon/index.js` (arme rangée pendant un lancer, `weapon.redraw()`), `weapon/effects.js` (`flashbang`, `smokePop`),
`bots/bot.js` + `bots/brain.js` (vision, cécité, usage), `audio/` (sons de synthèse), `hud/` (touches, mini-carte).

## Joueur
- **G** (ou 3) : fumigène · **T** (ou 4) : flash. Maintenir = goupille + trajectoire prévue (ligne + anneau d'arrivée),
  relâcher = lancer fort (17 m/s). Clic droit maintenu au relâchement = lancer court (8,5 m/s, pour rouler / passer une porte).
- Pas de lancer pendant la préparation, la pose / le désamorçage, un rechargement ou le réarmement du fusil de précision.
- Par manche : 1 fumigène, 2 flashs (rechargés à chaque manche). Widget au-dessus des munitions (grisé quand vide).
- L'arme est rangée pendant le lancer puis ressortie (animation de dégainage).

## Physique (commune joueur / bots, aussi utilisée pour prévoir)
- Sphère r 5 cm, gravité 9,8, rebonds sur les boîtes de collision (restitution 0,42, frottement), roulement amorti au sol.
- Flash : explose 1,6 s après le lancer (en l'air ou au sol). Fumigène : se déclenche une fois immobile (max 3,2 s).

## Fumigène
- Nuage de 18 s : grossit en 1,8 s jusqu'à ~4,3 m de rayon (ellipsoïde 4,3 × 1,9 m, centre à 1,3 m du sol), s'éclaircit
  les 4 dernières s. 44 bouffées par nuage, une seule draw call pour tous les nuages (instances triées de l'arrière vers l'avant),
  bouffées raccourcies contre les murs (raycast) pour ne pas déborder à travers.
- Vision : `grenades.blocksSight(a, b)` = la ligne traverse plus de 1,7 m / densité de nuage → bloquée. Utilisé par la
  perception des bots (tête puis torse) et par la flash. Dans le nuage on voit à ~1,5 m.
- Caméra dans le nuage : voile gris plein écran selon la profondeur. Mini-carte : disque gris.

## Flash
- Intensité I = orientation × distance : face à la flash 1, de côté ~0,2–0,6, dos tourné 0,12 ; pleine jusqu'à 6 m puis
  décroît jusqu'à 38 m. Hors ligne de vue : 0 (sauf < 3,5 m, lumière réfléchie). À travers un fumigène : × 0,2.
- Joueur : blanc plein écran (tenu jusqu'à 2,6 s si I élevé) puis fondu, durée totale 0,5 + 4,4 I s ; image rémanente
  (copie de l'image rendue au moment de l'explosion, floutée, en mode écran) ; son étouffé + acouphène.
- Bots : aveugles 0,35 + 3,9 I s (15 % détournent le regard à temps : I × 0,45). Aveuglés ils ne voient plus (l'ouïe reste),
  reculent accroupis en s'éloignant de la menace, tirent à l'aveugle (précision × 0,08) s'ils avaient une cible il y a < 1,2 s,
  puis gardent une visée tremblante 1,2 s (× 0,55). Les flashs touchent aussi les alliés (toast « Flash alliée » / « Aveuglé par »).

## Bots (usage)
- Inventaire : 1 flash, fumigène pour ~55 % d'entre eux.
- Lancers calculés (`solveThrow`) : plusieurs candidats simulés avec la vraie physique, on garde celui qui arrive le plus près.
  Flash : doit exploser en vue de la cible, refusée si un allié qui regarde dans cette direction serait aveuglé ; le lanceur
  se retourne si l'explosion sera dans son champ, puis fonce sur la position flashée.
- Opportuniste (toutes les ~0,6 s) : ennemi entendu / vu il y a < 3 s, à 7–24 m, hors de vue → flash avant de jeter un œil (30 %).
  Blessé (< 50 PV) et engagé à > 10 m → fumigène entre lui et le tireur pour se replier (45 %).
- Attaque groupée (brain) : au moment où une escouade entre sur le site, un bot fume l'angle des défenseurs vus (sinon le
  fond du site vu depuis l'entrée), un autre flashe le site 0,8 s après.
- Reprise d'une bombe posée : le démineur fume la bombe si des gardes sont connus, un autre défenseur les flashe.
- Délais d'équipe : 1 fumigène / 5–6 s, 1 flash / 3,5–4 s par équipe ; 7 s entre deux lancers d'un même bot.

## Événements
`grenade:pin`, `grenade:throw {actor, kind, pos}`, `grenade:bounce {pos, kind, speed}`, `grenade:smoke {pos}`,
`grenade:flash {pos, thrower}`, `grenade:flashed {actor, amount, thrower}`, `grenade:empty {kind}`.
