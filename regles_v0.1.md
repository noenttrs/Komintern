# Règles officielles — v0.1

---

## Vue d'ensemble

Jeu de déduction sociale pour **5 joueurs**, opposant deux factions secrètes sur une série de **5 missions**. La première faction à remporter **3 missions** gagne la partie.

---

## Les factions

### Les Nazis — 2 joueurs
- Reçoivent **la liste complète des rôles de tous les joueurs** de la partie
- Peuvent voter **Nazi ou Communist** lors des missions
- Objectif : faire échouer les missions en glissant des votes Nazi

### Les Communistes — 3 joueurs
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

Le Chef désigne les joueurs qu'il souhaite envoyer en mission, selon la taille requise :

| Mission | 1ère | 2ème | 3ème | 4ème | 5ème |
|---------|------|------|------|------|------|
| Nb joueurs | 2 | 3 | 2 | 3 | 3 |

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

## Fin de partie

La partie se termine dès qu'une faction atteint **3 victoires de mission** :

| Condition | Vainqueur |
|-----------|-----------|
| 3 missions avec au moins 1 vote Nazi | Nazis |
| 3 missions avec tous les votes Communist | Communistes |

---

> **Version** : 0.1
> **Statut** : Base de travail pour le game engine
