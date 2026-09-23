# Règles officielles — v0.1

---

## Vue d'ensemble

Jeu de déduction sociale pour **2 à 11 joueurs** (à 2, un duel : voir plus bas), opposant deux factions secrètes sur une série de missions. La première faction à remporter **(nombre de joueurs ÷ 2, arrondi à l'inférieur) + 1** missions gagne la partie. Le format de référence est à 5 joueurs : 2 nazis, 3 communistes, 5 missions, premier à 3.

### Formats

| Joueurs | Nazis | Communistes | Victoires pour gagner | Missions (taille des équipes) |
|---|---|---|---|---|
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
- **Juste assez de missions** pour qu'un camp atteigne forcément le seuil.
- **Ouverture avec une petite équipe**, pour installer la confiance, puis alternance de petites et grandes équipes pour faire monter la tension.
- **Une équipe ne dépasse jamais le nombre de communistes** : une équipe sans nazi reste toujours possible.

À 3 joueurs, la partie est courte et repose sur le bluff : après un sabotage, le chef sait qui est le nazi, mais le troisième joueur doit choisir qui croire, et c'est lui qui départage les votes de confiance. À moins de 3 joueurs, le jeu n'est pas jouable.

---

## Les factions

### Les Nazis — une minorité (1 à 4 joueurs)
- Reçoivent **la liste complète des rôles de tous les joueurs** de la partie
- Peuvent voter **Nazi ou Communist** lors des missions
- Objectif : faire échouer les missions en glissant des votes Nazi

### Les Communistes — la majorité
- Connaissent **uniquement leur propre rôle**
- Ne connaissent **pas l'identité des autres joueurs**
- Peuvent uniquement voter **Communist** lors des missions
- Objectif : identifier les équipes fiables et faire passer les missions

---

## Mise en place

1. Distribuer les rôles **aléatoirement et secrètement**
2. Le rôle de Chef est attribué au joueur suivant dans l'ordre de roulement — voir section Rotation du Chef

---

## Structure d'une manche

Chaque manche se déroule en **3 phases** :

### Phase 1 — Proposition du Chef

Le Chef désigne les joueurs qu'il souhaite envoyer en mission, selon la taille requise par la mission en cours (voir le tableau des formats).

### Phase 2 — Vote de confiance

Chaque joueur vote **simultanément et publiquement** pour ou contre la proposition :

- **Majorité stricte de OUI** (plus de la moitié des votants) → l'équipe part en mission
- Sinon (majorité de NON **ou égalité**) → la proposition est rejetée, **le même Chef** doit formuler une **nouvelle proposition**

> Il n'y a pas de limite au nombre de re-propositions dans la version actuelle.

### Phase 3 — Exécution de la mission

Chaque membre de l'équipe soumet **secrètement** son vote :

- Les **Nazis** peuvent soumettre un vote **Nazi ou Communist** librement
- Les **Communistes** doivent obligatoirement soumettre un vote **Communist**

Les votes sont **révélés simultanément** sans attribution aux joueurs :

| Résultat | Vainqueur de la mission |
|----------|------------------------|
| Au moins 1 vote Nazi | Nazis |
| Tous les votes Communist | Communistes |

---

## Rotation du Chef

Le rôle de Chef suit un **roulement continu** qui persiste entre les parties :

- À chaque nouvelle manche (mission), le roulement avance d'un cran ; une proposition rejetée ne le fait pas avancer
- En fin de partie, le joueur qui a été Chef de la dernière manche est enregistré
- En début de partie suivante, le Chef est le joueur **immédiatement suivant** dans l'ordre de roulement

---

## Duel à 2 joueurs

À 2, pas de missions. Chacun reçoit un rôle et **ne connaît que le sien, nazi compris**. Trois situations, aussi probables l'une que l'autre : deux communistes, un de chaque camp, deux nazis. Personne ne sait dans laquelle il est.

On discute, puis chacun vote en secret et en même temps : **« Confiance »** ou **« Nazi ! »**.

| Situation | Votes | Résultat |
|---|---|---|
| 2 communistes | confiance / confiance | les deux gagnent |
| | l'un accuse | l'accusateur perd, l'autre gagne |
| | les deux accusent | personne ne gagne |
| 1 de chaque camp | le communiste accuse | le communiste gagne |
| | le nazi accuse | le nazi se démasque : le communiste gagne |
| | confiance / confiance | le nazi s'est fait accepter : le nazi gagne |
| 2 nazis | les deux accusent | victoire commune |
| | un seul accuse | celui qui a démasqué l'autre gagne |
| | confiance / confiance | les deux perdent |

Accuser a donc toujours un prix : on gagne en démasquant un nazi, on perd en accusant un communiste. Un joueur absent trop longtemps perd le duel.

---

## Fin de partie

La partie se termine dès qu'une faction atteint le **nombre de victoires requis** (3 à 5 joueurs, 4 à 6-7 joueurs, 5 à 8-9 joueurs, 6 à 10-11 joueurs) :

| Condition | Vainqueur |
|-----------|-----------|
| Seuil atteint en missions avec au moins 1 vote Nazi | Nazis |
| Seuil atteint en missions avec tous les votes Communist | Communistes |

---

> **Version** : 0.4 (formats de 3 à 11 joueurs, duel à 2)
> **Statut** : Base de travail pour le game engine
