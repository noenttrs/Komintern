# Règles officielles — v0.6

Référence des règles de **Nazi Communiste**. Le moteur Python (`gameengine/`) en est l'implémentation : en cas d'écart, c'est ce document qui fait foi et le moteur qui doit être corrigé.

---

## Vue d'ensemble

Jeu de déduction sociale pour **2 à 11 joueurs**, chacun sur son téléphone, autour d'une table ou à distance.

- **De 3 à 11 joueurs** : deux factions secrètes s'affrontent sur une série de missions. La première à remporter **(nombre de joueurs ÷ 2, arrondi à l'inférieur) + 1** missions gagne. Le format de référence est à 5 joueurs : 2 nazis, 3 communistes, 5 missions, premier à 3.
- **À 2 joueurs** : un duel de confiance, sans missions (voir [Duel à 2 joueurs](#duel-à-2-joueurs)).
- **À 1 joueur**, le jeu n'est pas jouable.

### Formats

| Joueurs | Nazis | Communistes | Victoires pour gagner | Missions (taille des équipes) |
|---|---|---|---|---|
| 2 | — | — | — | duel, sans missions |
| 3 | 1 | 2 | 2 | 2 · 2 · 2 |
| 4 | 1 | 3 | 3 | 2 · 3 · 2 · 3 · 3 |
| 5 | 2 | 3 | 3 | 2 · 3 · 2 · 3 · 3 |
| 6 | 2 | 4 | 4 | 2 · 3 · 3 · 4 · 3 · 4 · 4 |
| 7 | 3 | 4 | 4 | 2 · 3 · 3 · 4 · 3 · 4 · 4 |
| 8 | 3 | 5 | 5 | 3 · 3 · 4 · 4 · 3 · 4 · 5 · 4 · 5 |
| 9 | 3 | 6 | 5 | 3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 6 |
| 10 | 4 | 6 | 6 | 3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6 |
| 11 | 4 | 7 | 6 | 3 · 4 · 4 · 5 · 4 · 5 · 6 · 5 · 6 · 6 · 7 |

Principes de calibrage :
- **Juste assez de missions** pour qu'un camp atteigne forcément le seuil (2 × seuil − 1), donc jamais d'égalité.
- **Ouverture avec une petite équipe**, pour installer la confiance, puis alternance de petites et grandes équipes pour faire monter la tension.
- **Une équipe ne dépasse jamais le nombre de communistes** : une équipe sans nazi reste toujours possible.

À 3 joueurs, la partie est courte et repose sur le bluff : après un sabotage, le chef sait qui est le nazi, mais le troisième joueur doit choisir qui croire, et c'est lui qui départage les votes de confiance.

Une room peut imposer un format (nombre exact de joueurs) ou rester libre : elle démarre alors avec le nombre de joueurs présents, de 2 à 11, et prend le format correspondant.

---

## Les factions

### Les nazis — la minorité (1 à 4 joueurs)
- Reçoivent **la liste complète des rôles** de la partie (sauf en duel).
- Peuvent voter **nazi ou communiste** lors des missions.
- Objectif : faire échouer les missions en glissant des votes nazis.

### Les communistes — la majorité
- Connaissent **uniquement leur propre rôle**.
- Peuvent uniquement voter **communiste** lors des missions.
- Objectif : identifier les équipes fiables et faire réussir les missions.

---

## Mise en place

1. **Ordre de table** : chaque joueur touche sa carte à son tour pour prendre sa place dans l'ordre de la table, puis tout le monde confirme. Cet ordre fixe le roulement du chef.
2. **Distribution des rôles**, aléatoire et secrète. Chacun maintient sa carte appuyée pour voir son rôle, puis confirme.
3. **Premier chef** : tiré au sort à la première partie de la room ; ensuite, voir [Rotation du chef](#rotation-du-chef).

---

## Structure d'une manche

Chaque manche (une mission) se déroule en **3 phases**.

### Phase 1 — Proposition du chef

Le chef désigne les joueurs qu'il envoie en mission, selon la taille requise par la mission en cours (voir le tableau des formats). Il peut s'inclure dans l'équipe.

### Phase 2 — Vote de confiance

Chaque joueur vote **simultanément et publiquement** pour ou contre la proposition :

- **Majorité stricte de « pour »** (plus de la moitié des votants) : l'équipe part en mission.
- Sinon (majorité de « contre » **ou égalité**) : la proposition est rejetée et **le même chef** propose une autre équipe.

Il n'y a pas de limite au nombre de propositions. Les joueurs comptés absents ne votent plus et ne comptent plus dans la majorité.

### Phase 3 — Exécution de la mission

Chaque membre de l'équipe vote **en secret** :

- Les **nazis** votent librement **nazi ou communiste**.
- Les **communistes** votent obligatoirement **communiste**.

Les votes sont **révélés ensemble, mélangés** : on voit combien de votes nazis ont été glissés, jamais qui les a glissés.

| Résultat | Vainqueur de la mission |
|---|---|
| Au moins 1 vote nazi | Nazis |
| Tous les votes communistes | Communistes |

---

## Rotation du chef

Le rôle de chef suit un **roulement continu**, dans l'ordre de table, qui persiste entre les parties d'une même room :

- À chaque nouvelle manche, le roulement avance d'un cran. Une proposition rejetée ne le fait pas avancer.
- En fin de partie, le chef de la dernière manche est enregistré.
- À la partie suivante, le chef est le joueur **immédiatement suivant** dans le roulement.

---

## Fin de partie

La partie se termine dès qu'un camp atteint le **nombre de missions requis** : 2 à 3 joueurs, 3 à 4-5 joueurs, 4 à 6-7 joueurs, 5 à 8-9 joueurs, 6 à 10-11 joueurs.

Elle se termine aussi par **abandon** : quand un joueur quitte la partie, ou reste absent au-delà du délai (voir ci-dessous), son camp perd.

À la fin, tous les rôles sont révélés. Pour rejouer, chaque joueur présent choisit « Rejouer » ; les absents perdent leur place. Si le nombre de joueurs restant ne correspond plus au format imposé par la room, tout le monde revient au salon.

---

## Absences

Recharger la page ou perdre le réseau un instant ne fait pas perdre sa place. En revanche :

- **Au salon**, un joueur déconnecté plus de 60 secondes libère sa place.
- **En partie**, un joueur déconnecté a **60 secondes** pour revenir. Les autres joueurs peuvent choisir de **l'attendre** : le délai passe alors à **5 minutes**, renouvelable, et n'importe quel joueur présent peut arrêter d'attendre (il reste alors 20 secondes). Le joueur absent est prévenu par notification s'il les a activées, et 20 secondes avant la fin du délai.
- **À la fin du délai** :
  - avant la distribution des rôles, la partie est **annulée** et la room revient au salon, sans le joueur absent ;
  - après la distribution des rôles, **son camp perd** la partie (abandon) ;
  - en duel, **l'autre joueur gagne**.
- **Quitter volontairement** une partie en cours vaut abandon immédiat.

---

## Duel à 2 joueurs

À 2, pas de missions. **Chaque rôle est tiré indépendamment à pile ou face** : 25 % de chances d'avoir deux communistes, 25 % deux nazis, 50 % un de chaque. Chacun **ne connaît que son propre rôle, nazi compris**, et ce rôle ne dit rien de celui de l'autre.

On discute, sans limite de temps, puis chacun vote **en secret et en même temps** : **« Confiance »** ou **« Nazi ! »**. On voit que l'autre a voté, jamais ce qu'il a voté avant le résultat.

- **Un communiste gagne s'il juge juste** : confiance à un communiste, « Nazi ! » face à un nazi.
- **Un nazi face à un communiste gagne s'il se fait accepter** (les deux font confiance). S'il accuse un communiste, il se démasque et perd.
- **Deux nazis** : celui qui accuse a trouvé l'autre et gagne ; s'ils s'accusent ou se font confiance tous les deux, ils gagnent ensemble.

| Situation (probabilité) | Votes | Résultat |
|---|---|---|
| 2 communistes (25 %) | confiance / confiance | les deux gagnent |
| | l'un accuse | l'accusateur perd, l'autre gagne |
| | les deux accusent | personne ne gagne |
| 1 de chaque camp (50 %) | le communiste accuse | le communiste gagne |
| | confiance / confiance | le nazi s'est fait accepter : le nazi gagne |
| | le communiste fait confiance, le nazi accuse | le nazi se démasque, le communiste a mal jugé : personne ne gagne |
| 2 nazis (25 %) | un seul accuse | celui qui accuse gagne |
| | les deux accusent, ou les deux font confiance | victoire commune |

**Aucun vote n'est gagnant d'avance.** Pour un communiste, « Confiance » et « Nazi ! » ont exactement les mêmes chances (l'autre est nazi une fois sur deux) : tout se joue à la lecture de l'autre. Pour un nazi, accuser assure la victoire face à un autre nazi mais le fait perdre face à un communiste ; faire confiance parie sur la crédulité de l'autre. Chacun gagne ou perd pour son compte (0, 1 ou 2 gagnants). À la fin, les deux rôles et les deux votes sont révélés.

---|---|---|
| 2 communistes | confiance / confiance | les deux gagnent |
| | l'un accuse | l'accusateur perd, l'autre gagne |
| | les deux accusent | personne ne gagne |
| 1 de chaque camp | le communiste accuse | le communiste gagne |
| | le nazi accuse | le nazi se démasque : le communiste gagne |
| | confiance / confiance | le nazi s'est fait accepter : le nazi gagne |
| 2 nazis | les deux accusent | victoire commune |
| | un seul accuse | celui qui a démasqué l'autre gagne |
| | confiance / confiance | les deux perdent |

Accuser a toujours un prix : on gagne en démasquant un nazi, on perd en accusant un communiste. Chacun gagne ou perd pour son compte (0, 1 ou 2 gagnants). À la fin, les deux rôles et les deux votes sont révélés.

---

## Historique des versions

| Version | Changements |
|---|---|
| 0.6 | Duel : rôles tirés indépendamment à pile ou face (25 / 50 / 25 %) ; un communiste gagne s'il juge juste ; deux nazis qui se font confiance gagnent ensemble. Plus aucun vote gagnant d'avance. |
| 0.5 | Document refondu (`docs/REGLES.md`) : ordre de table, premier chef, votes mélangés, règles d'absence (attente jusqu'à 5 min, annulation si l'absent part avant la distribution des rôles), rejouer. |
| 0.4 | Duel à 2 joueurs. |
| 0.3 | Retour du format à 3 joueurs (1 nazi, équipes de 2, premier à 2). |
| 0.2 | Formats de 4 à 11 joueurs, seuil de victoire (joueurs ÷ 2) + 1. |
| 0.1 (révisée) | Décisions de l'audit : une égalité au vote de confiance vaut rejet, le même chef repropose, le chef ne change qu'à chaque nouvelle manche, un joueur absent fait perdre son camp. |
| 0.1 | Règles initiales, format de référence à 5 joueurs. |

---

> **Version** : 0.6
> **Statut** : référence du moteur (`gameengine/`), de la page Règles du site et des pages pour les agents IA.
