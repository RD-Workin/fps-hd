# Décisions — challenge (revue n° 2 : main@738c9d5, 2026-11-13)

Méthode : docs + code ciblé ; build vert ; 13 manches simulées sans rendu (20c20 et 10c10, 30 i/s fixes, joueur mort) ;
captures en BASSE (SwiftShader, pas de ressenti de jeu). Revue n° 1 soldée : LOS au tir, menu défilable, clic droit = visée / R,
spectateur, ombres en cache, pixel ratio 1,5, docs audio. Classement par impact.

## 1. Bugs
- **Les attaquants gagnent presque tout : 12 manches sur 13** (20c20 : 7/7 ATK ; 10c10 : 5/6 ATK), des deux côtés après le
  changement de camp, 8 fois sur 12 par élimination. Le mode R&D perd son sens. Pistes : escouades ATK groupées par voie
  face à des DEF dispersés (9 holds par site + 20 % de rôdeurs isolés au milieu), holds peut-être trop exposés. Mesurer le taux par camp sur 50 manches.
- **Bombe lâchée : position jamais recalée au sol** (game `dropBomb` garde le y du porteur). Mort en saut, sur une caisse,
  un conteneur (spot de saut à B) ou sur le navire (hors nav) : bombe en l'air ou inaccessible, car il faut |dy| < 1,5 m et
  les bots n'atteignent ni les spots de saut ni le navire ⇒ bombe bloquée toute la manche (piste de l'intégrateur : 40→90 s).
  Non reproduit ici (9 lâchers, max 9,4 s), sans doute faute de porteur joueur. Correctif : y = `nav.floorAt`, sinon cellule
  nav marchable la plus proche.
- **Écran de gel saturé** : bannière ATTAQUE, compte à rebours caché derrière les cartes d'arme, réticule sur
  « CHOIX DE L'ARME ». Le centre de l'écran est illisible pendant 4 s. Bannière en haut, choix d'arme en bas, compte dans l'horloge.

## 2. Incohérences
- **Fidélité inégale** : soldats HD (46k tris) à côté d'un navire de débarquement en boîtes grises unies (1re image vue en ATK),
  d'un camion en cubes (roues carrées, site A) et de briques de soubassement surdimensionnées. Le décor trahit les soldats.
- Docs obsolètes : game.md (roster 5c5, TODO spectateur), hud.md (TODO spectateur), weapon.md (TODO « CLIC D » déjà corrigé),
  bots.md décrit encore le modèle procédural, README « 10c10 » alors que 20c20 est possible.
- Spectateur = alliés bots seulement : avec 0 allié (permis par le menu), retour à la caméra basse inclinée.
- Munitions sur cadavre = munitions de l'arme du joueur, quelle que soit l'arme du mort (choix acceptable, à écrire).
- Pseudos alliés empilés et illisibles quand plusieurs alliés sont alignés (capture navire).

## 3. Améliorations (visuel AAA, coût zéro)
- Passe « hero props » sur ce qui est vu en premier : navire (coque texturée, rivets, rouille, rampe), camion, conteneurs.
- Soldats : réactions aux impacts (clip Hit_Chest déjà dans le glb) ; UV refaits pour doubler la densité de texels (TODO soldiers).
- Lisibilité 20c20 : regrouper les pseudos proches, afficher seulement ceux visés ou à < 25 m.
- Killcam en cours : la limiter à 3 s et la rendre passable (clic) pour ne pas allonger la mort.

## 4. Direction proposée (ordre)
1. Équilibrage ATK/DEF avec un banc de test automatique (N manches sans rendu, % de victoires par camp, durée, cause) :
   c'est la base pour tout réglage futur des bots.
2. Correctif de la bombe (recalage au sol + point atteignable) et réorganisation de l'écran de gel.
3. Passe décor sur le navire et le site A pour atteindre le niveau des soldats ; puis killcam.
4. Mettre les docs à jour (≤ 40 lignes chacune), puisqu'elles sont la seule source de contexte entre agents.
