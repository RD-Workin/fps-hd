# Décisions — mode Zombie (src/game/zombie.js, src/zombies/index.js)

Statut : FAIT (build vert). Choix dans le menu « Mode de jeu » (R&D / CTF / Zombies ; le mode Zombie vit dans l'objet R&D, `sd.zmode`, la façade de createGame le présente comme `game.mode === "zombie"`) (localStorage `nova.hud.mode`), appliqué à la partie suivante si un match tourne.
## Règles
- Joueur + N bots alliés (curseur « Bots alliés », réglage séparé `zallies`, 3 par défaut) contre des vagues de zombies.
- Munitions illimitées : `game.infiniteAmmo` → weapon garde `reserve = maxReserve` (on recharge toujours). HUD affiche « ∞ ».
- Départ : préparation 4 s (choix d'arme) dans la cour de la citadelle, puis 10 s pour se placer, vague 1. Répit de 12 s entre vagues.
- Les zombies sortent de la mer au port (bord du quai z ≈ 54,6, points marchables du nav), grimpent sur le quai en 1,5 s.
- Fin de vague : les morts (joueur compris) reviennent près du joueur, tout le monde à 100 PV. Régénération 6 PV/s après 5 s sans dégât.
- Fin de partie quand plus aucun humain n'est en vie : `match:end {weWon:false, mode:'zombie', wave, kills}`.
- Difficulté (`waveSpec(w, prog, allies)`), réglage « Difficulté qui monte par » : NOMBRE (8+5w+0,5w², vitesse 6,4 m/s),
  VITESSE (10+2w, 6,2 → 10 m/s, +0,38/vague), LES DEUX (8+3,5w+0,3w², 6,2 → 9 m/s). Nombre × (0,85 + 0,15 × alliés).
  Humain : 5,6 m/s en course (bots 5) ⇒ un zombie est toujours plus rapide. PV 90 (+7/vague, max 220), coup 11 (+0,9/vague, max 28)
  toutes les 0,9 s, portée 1,2 m. Dès la vague 4, 5 % (+5 %/vague, max 30 %) de « coureurs » ×1,2. 80 zombies max en jeu, le reste arrive au fil des places libres.
## Légèreté (96 zombies en pool)
- Pas d'A* par zombie : UN champ de flux (Dijkstra à seaux, coûts entiers 2/3 + pénalité près des murs) depuis tous les humains vivants
  sur la grille nav des bots (0,5 m), y compris les liaisons de saut (le zombie fait un bond). Recalcul toutes les 0,3 s, découpé ≤ 1 ms par image.
  Chaque zombie descend le champ (3 cellules d'avance), ou fonce en ligne droite si le nav voit sa cible à < 11 m.
- Déplacement sans physique : glissement sur la grille nav gonflée + hauteur `world.nav.floorAt` (escaliers inclus). Séparation par hachage spatial 1,2 m.
- Rendu : 5 InstancedMesh (torse, tête, bras, jambes, yeux émissifs), un emplacement fixe par zombie, couleurs par instance, sans ombre.
  Pose procédurale (course voûtée, bras tendus, coup, chute) ; LOD : chaque image à l'écran < 45 m, 1 image sur 3 au-delà, 1 sur 6 hors écran.
- Pas de tir : touche = sphère tête (r 0,16, tir à la tête) + capsule corps, branchée en enveloppant `bots.raycast` (l'arme n'a pas changé).
- Mesures (SwiftShader, sans rendu) : 58 zombies 0,53 ms/image (p95 1,4), 80 zombies 0,63 ms (p95 1,7), champ de flux ≈ 3,5 ms par passe étalée.
## Alliés
- `bots.setZombieHooks({targets, goals, closeAware})` : perception limitée aux 6 zombies les plus proches (< 55 m), conscience à 360° sous 14 m ;
  le cerveau d'équipe est remplacé par `assignAllies`.
- Le joueur s'arrête (> 0,9 s) : point d'appui choisi dans 10 m autour de lui (hauteur, mur dans le dos, ligne de vue dégagée vers
  d'où vient la horde — champ de distance au port —, proximité). Les alliés s'y mettent en 1 à 2 rangs face à la horde, 1er rang accroupi,
  sans déplacement latéral en combat. Le joueur s'en éloigne de plus de 10 m : ils le suivent en colonne derrière lui.
## Étages et toits
- Les étages des maisons (capitainerie…) et les toits plats à escalier extérieur (`toit-N`) sont les « étages » de `bots/nav.js setLayers`
  (petites grilles par étage, portails d'escalier). Chaque zombie connaît son étage (`z.L`, null = grille principale).
- Un humain en hauteur tire le champ principal vers le pied de l'escalier de sa maison / son toit. Arrivé là, le zombie monte la volée
  (`z.climb` : points bas → `via` → haut, hauteur interpolée, sans physique), puis suit sur chaque étage un petit champ calculé à la demande :
  vers l'escalier qui monte, celui qui descend, ou les humains de l'étage (recalcul ≤ 4 fois/s, quelques centaines de cellules).
  Cible redescendue : il redescend par le même chemin.
- Alliés : le joueur monte (étage ou toit) → le point d'appui est choisi sur cet étage et ils le suivent par l'escalier (buts avec `y`).
  Au sol, un toit ou un étage (positions hautes de `world.nav.highHolds` + quelques points autour de l'escalier) dont l'escalier est
  à < 12 m du joueur est candidat s'il peut accueillir toute l'escouade ; le gain de hauteur (relatif au joueur, plafonné à 6 m) le favorise.

## Événements / HUD
- `round:start {mode:'zombie'}` une fois, `round:live`, `zombie:wave {wave, count, speed}`, `zombie:cleared {wave, next}`.
- HUD : barre du haut ESCOUADE / VAGUE n + zombies restants (ou compte à rebours du répit) / ZOMBIES ; minimap : points verts ;
  killfeed limité aux kills du joueur ; pas de killcam quand un zombie vous tue.
## TODO / idées
- Sons de zombies (râles, coups) dans src/audio ; variantes (gros lents, rampants) ; score par vague et record local.
