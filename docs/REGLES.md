# Règles officielles — v1.0

**Nazi Communiste** — jeu de déduction sociale en temps réel.
Règles © 2026 Komintern, publiées sous licence [Creative Commons Attribution - Pas d'utilisation commerciale - Partage dans les mêmes conditions 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr). Voir [Licence](#licence).

Ce document est la référence des règles. Le moteur Python (`gameengine/`) en est l'implémentation : en cas d'écart, c'est ce document qui fait foi et le moteur qui doit être corrigé.

---

## Sommaire

1. [Vue d'ensemble](#vue-densemble)
2. [Formats](#formats)
3. [Les factions et ce que chacun sait](#les-factions-et-ce-que-chacun-sait)
4. [Mise en place](#mise-en-place)
5. [Structure d'une manche](#structure-dune-manche)
6. [Rotation du chef](#rotation-du-chef)
7. [Pendant toute la partie](#pendant-toute-la-partie)
8. [Fin de partie et revanche](#fin-de-partie-et-revanche)
9. [Absences et abandons](#absences-et-abandons)
10. [Duel à 2 joueurs](#duel-à-2-joueurs)
11. [Règles personnalisées](#règles-personnalisées)
12. [Cas particuliers](#cas-particuliers)
13. [Glossaire](#glossaire)
14. [Historique des versions](#historique-des-versions)
15. [Licence](#licence)

---

## Vue d'ensemble

Jeu de déduction sociale pour **2 à 14 joueurs**, chacun sur son téléphone, autour d'une table (sans chat) ou à distance (avec chat).

- **De 3 à 14 joueurs** : deux factions secrètes s'affrontent sur une série de missions. Une minorité de **nazis** infiltrés, qui connaissent tous les rôles, cherche à faire échouer les missions ; une majorité de **communistes**, qui ne connaissent que leur propre rôle, cherche à les faire réussir et à démasquer les saboteurs. La première faction à remporter **(nombre de joueurs ÷ 2, arrondi à l'inférieur) + 1** missions gagne. Le format de référence est à 5 joueurs : 2 nazis, 3 communistes, 5 missions, premier à 3.
- **À 2 joueurs** : un duel de confiance, sans missions (voir [Duel à 2 joueurs](#duel-à-2-joueurs)).
- **À 1 joueur**, le jeu n'est pas jouable.

Le jeu repose sur trois tensions : **qui envoyer en mission** (le chef), **à qui faire confiance** (le vote public) et **qui a saboté** (le vote secret, dont on ne connaît que le nombre de votes nazis).

---

## Formats

### Partie classique

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
| 12 | 4 | 8 | 7 | 3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6 · 7 · 7 |
| 13 | 5 | 8 | 7 | 3 · 4 · 4 · 5 · 4 · 5 · 6 · 5 · 6 · 6 · 7 · 6 · 7 |
| 14 | 5 | 9 | 8 | 3 · 4 · 4 · 5 · 4 · 5 · 5 · 6 · 5 · 6 · 6 · 7 · 6 · 7 · 8 |

Principes de calibrage :
- **Juste assez de missions** pour qu'un camp atteigne forcément le seuil (2 × seuil − 1 missions) : jamais d'égalité, jamais de mission jouée pour rien.
- **Ouverture avec une petite équipe**, pour installer la confiance, puis alternance de petites et grandes équipes pour faire monter la tension.
- **Une équipe ne dépasse jamais le nombre de communistes** : une équipe sans nazi reste toujours possible.
- **Les nazis restent une minorité** (environ un tiers des joueurs) pour que le vote public garde son poids.

À 3 joueurs, la partie est courte et repose sur le bluff : après un sabotage, le chef sait qui est le nazi, mais le troisième joueur doit choisir qui croire, et c'est lui qui départage les votes de confiance.

### Partie rapide

Dès que la règle classique dépasse 5 missions, c'est-à-dire **à partir de 6 joueurs**, l'hôte peut choisir dans le salon une partie **rapide** : toujours **5 missions, premier camp à 3**, avec des équipes plus grandes quand on est nombreux. Le choix apparaît quand le salon atteint 6 joueurs, ou dès le départ si la room impose un nombre de joueurs de 6 ou plus. Les camps sont les mêmes qu'en classique ; seules les missions changent. En dessous de 6 joueurs, la partie classique compte déjà 5 missions au plus.

| Joueurs | Nazis | Missions (taille des équipes) |
|---|---|---|
| 6 | 2 | 2 · 3 · 3 · 4 · 4 |
| 7 | 3 | 2 · 3 · 3 · 4 · 4 |
| 8 | 3 | 3 · 4 · 4 · 5 · 5 |
| 9 | 3 | 3 · 4 · 4 · 5 · 5 |
| 10 | 4 | 3 · 4 · 4 · 5 · 5 |
| 11 | 4 | 4 · 4 · 5 · 5 · 6 |
| 12 | 4 | 4 · 5 · 5 · 6 · 6 |
| 13 | 5 | 4 · 5 · 5 · 6 · 6 |
| 14 | 5 | 5 · 5 · 6 · 6 · 7 |

En partie rapide, les équipes grandissent de mission en mission : les dernières missions, décisives, sont aussi les plus difficiles à garder sans nazi.

### Rooms libres et rooms à format imposé

Une room peut **imposer un format** (nombre exact de joueurs de 2 à 14, 2 joueurs donnant un duel, ou des [règles personnalisées](#règles-personnalisées)) : elle ne démarre qu'avec ce nombre de joueurs. Elle peut aussi **rester libre** : elle démarre alors avec le nombre de joueurs présents, de 2 à 14, et prend le format correspondant à ce nombre et à la durée choisie.

---

## Les factions et ce que chacun sait

### Les nazis — la minorité (1 à 5 joueurs)
- Reçoivent **la liste complète des rôles** de la partie (sauf en duel, et sauf réglage contraire en [règles personnalisées](#règles-personnalisées)).
- Peuvent voter **nazi ou communiste** lors des missions : ils peuvent saboter, ou s'abstenir de saboter pour gagner la confiance des autres.
- Objectif : que leur camp remporte le nombre de missions requis, en glissant des votes nazis dans les équipes.

### Les communistes — la majorité
- Connaissent **uniquement leur propre rôle**.
- Ne peuvent voter que **communiste** lors des missions : un communiste ne peut pas saboter.
- Objectif : faire réussir le nombre de missions requis, en écartant les nazis des équipes.

### Qui sait quoi, et quand

| Information | Nazi | Communiste | Moment |
|---|---|---|---|
| Son propre rôle | oui | oui | dès la distribution |
| Le rôle des autres joueurs | oui, tous | non | dès la distribution |
| L'ordre de table et le chef | oui | oui | public |
| L'équipe proposée | oui | oui | public, dès la proposition |
| Qui a déjà voté la confiance | oui | oui | public, pendant le vote |
| Le vote de confiance de chacun | oui | oui | public, une fois que tous ont voté |
| Qui a déjà voté la mission | oui | oui | public, pendant la mission |
| Le vote de mission de chacun | non | non | **jamais**, pour personne |
| Le nombre de votes nazis d'une mission | oui | oui | public, à la révélation |
| Le rôle de tous | oui | oui | à la fin de la partie, si la room annonce les nazis (option activée par défaut) |

Aucun joueur, ni l'application, ne révèle en cours de partie qui a glissé un vote nazi : le serveur mélange les votes avant de les révéler.

---

## Mise en place

1. **Salon.** Les joueurs rejoignent la room par son code, son lien ou son QR code. L'hôte peut exclure un joueur, transmettre son rôle d'hôte, choisir la durée (à partir de 6 joueurs), l'annonce des nazis à la fin et le mode sur place ou à distance.
2. **Ordre de table.** Une fois la partie lancée, chaque joueur touche sa carte **à son tour, en suivant l'ordre de la table** (par exemple dans le sens des aiguilles d'une montre, à partir de n'importe qui). Chacun reçoit ainsi son numéro d'ordre.
   - Un joueur qui a touché trop tôt ou trop tard peut **corriger sa place** (« J'ai raté mon tour ») en indiquant le bon numéro ; l'ordre se réorganise.
   - L'hôte peut **tout recommencer**.
   - Quand tout le monde a un numéro, l'ordre est **validé automatiquement après 5 secondes** (compte à rebours affiché). Toute correction relance le compte à rebours ; si tout le monde touche l'écran, l'ordre est validé tout de suite.
   - Cet ordre fixe le roulement du chef pour toute la partie. À distance, il sert simplement d'ordre de parole.
3. **Distribution des rôles**, aléatoire et secrète, selon le format. Chacun **maintient sa carte appuyée** pour voir son rôle à l'abri des regards ; relâcher la carte suffit. La partie commence quand tout le monde a vu son rôle, ou au plus tard 60 secondes après la distribution (on peut revoir son rôle à tout moment).
4. **Premier chef.** Tiré au sort à la première partie de la room ; ensuite, voir [Rotation du chef](#rotation-du-chef).

---

## Structure d'une manche

Chaque manche correspond à une mission et se déroule en **3 phases**. Les écrans de résultat passent seuls à la suite après un court compte à rebours.

### Phase 1 — Proposition du chef

Le chef désigne les joueurs qu'il envoie en mission, **exactement** le nombre requis par la mission en cours (voir les tableaux des formats).
- Il peut s'inclure dans l'équipe.
- Une équipe est composée de joueurs distincts, tous présents dans la partie.
- La discussion est libre avant et pendant la proposition : c'est le cœur du jeu.

### Phase 2 — Vote de confiance

Chaque joueur vote **simultanément** pour ou contre l'équipe proposée. On voit qui a déjà voté ; les votes de chacun sont **révélés publiquement, avec les noms, une fois que tout le monde a voté**.

- **Majorité stricte de « pour »** (plus de la moitié des votants) : l'équipe part en mission.
- Sinon (majorité de « contre » **ou égalité**) : la proposition est rejetée et **le même chef** propose une autre équipe, pour la même mission.

Il n'y a pas de limite au nombre de propositions. Les joueurs comptés absents ne votent plus et ne comptent plus dans la majorité. Le résultat reste affiché 6 secondes, puis la partie continue ; si tout le monde touche l'écran, elle continue tout de suite.

### Phase 3 — Exécution de la mission

Seuls **les membres de l'équipe** votent, **en secret** :

- Les **nazis** votent librement **nazi ou communiste**.
- Les **communistes** votent obligatoirement **communiste** (l'application ne leur propose pas d'autre choix).

On voit qui, dans l'équipe, a déjà voté. Les votes sont ensuite **révélés ensemble, mélangés** : on voit combien de votes nazis ont été glissés, jamais qui les a glissés.

| Résultat | Vainqueur de la mission |
|---|---|
| Au moins 1 vote nazi | Nazis |
| Tous les votes communistes | Communistes |

Le nombre de votes nazis est une information précieuse : deux votes nazis dans une équipe de trois en disent beaucoup plus qu'un seul. Le résultat reste affiché 8 secondes (moins si tout le monde touche l'écran) ; la manche suivante commence alors avec un nouveau chef.

---

## Rotation du chef

Le rôle de chef suit un **roulement continu**, dans l'ordre de table, qui persiste entre les parties d'une même room :

- À chaque nouvelle manche, le roulement avance d'un cran. Une proposition rejetée ne le fait pas avancer : le même chef repropose.
- En fin de partie, le chef de la dernière manche est enregistré.
- À la partie suivante, le chef est le joueur **immédiatement suivant** dans le roulement, pour que chacun ait son tour sur plusieurs parties.

---

## Pendant toute la partie

- **Revoir son rôle** : à tout moment, en maintenant sa carte appuyée. Tant que l'appui dure, et un court instant après, aucun autre bouton ne réagit : on ne peut pas envoyer une réponse par erreur en regardant son rôle.
- **Historique** : en faisant glisser la carte, chacun consulte l'historique des votes de confiance (qui a voté quoi) et des missions (équipes, nombre de votes nazis, vainqueur).
- **Score** : le nombre de missions remportées par chaque camp est toujours affiché.
- **Chat** : uniquement dans les rooms à distance. Il n'est pas censuré ; les propos graves peuvent être signalés à la modération.

---

## Fin de partie et revanche

La partie se termine dès qu'un camp atteint le **nombre de missions requis** : 2 à 3 joueurs, 3 à 4-5 joueurs, 4 à 6-7 joueurs, 5 à 8-9 joueurs, 6 à 10-11 joueurs, 7 à 12-13 joueurs, 8 à 14 joueurs ; en partie rapide, toujours 3.

Elle se termine aussi par **abandon** : quand un joueur quitte la partie, ou reste absent au-delà du délai (voir [Absences et abandons](#absences-et-abandons)), son camp perd.

À la fin, **l'écran de fin annonce les nazis** avec le vainqueur. L'hôte peut désactiver cette option (« Révéler les nazis à la fin ») à la création de la room ou dans le salon : les rôles restent alors secrets, même après la partie, ce qui permet d'enchaîner les parties sans savoir qui était qui. Pour rejouer, chaque joueur présent choisit « Rejouer » ; la revanche démarre quand tous les joueurs présents l'ont choisie. Les absents perdent leur place. Si le nombre de joueurs restant ne correspond plus au format imposé par la room, tout le monde revient au salon. Une room libre s'adapte : à 2 joueurs restants, la revanche est un duel.

---

## Absences et abandons

Recharger la page ou perdre le réseau un instant ne fait pas perdre sa place. En revanche :

- **Au salon**, un joueur déconnecté plus de 60 secondes libère sa place.
- **En partie**, un joueur déconnecté a **60 secondes** pour revenir.
  - **20 secondes avant la fin du délai**, les autres joueurs se voient proposer de **l'attendre** (fenêtre dans le jeu, et notification pour ceux qui ne regardent pas leur écran) : le délai passe alors à **5 minutes**. On peut l'attendre ainsi **3 fois au plus** par absence, pour qu'une partie ne soit jamais bloquée indéfiniment.
  - N'importe quel joueur présent peut arrêter d'attendre : il reste alors 20 secondes au joueur absent.
  - Le joueur absent est prévenu par notification s'il les a activées, et 20 secondes avant la fin du délai.
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

**Aucun vote n'est gagnant d'avance.** Pour un communiste, « Confiance » et « Nazi ! » ont exactement les mêmes chances (l'autre est nazi une fois sur deux) : tout se joue à la lecture de l'autre. Pour un nazi, accuser assure la victoire face à un autre nazi mais le fait perdre face à un communiste ; faire confiance parie sur la crédulité de l'autre.

Chacun gagne ou perd pour son compte (0, 1 ou 2 gagnants). À la fin, les deux rôles et les deux votes sont révélés. Un joueur absent au-delà du délai perd le duel.

---

## Règles personnalisées

À la création d'une room, l'hôte peut définir ses propres règles au lieu d'un format standard. Elles doivent respecter ces contraintes (vérifiées par le serveur et par le moteur) :

| Paramètre | Contrainte |
|---|---|
| Nombre de joueurs | de 3 à 14 |
| Nazis et communistes | au moins 1 de chaque, leur somme égale au nombre de joueurs |
| Nombre de missions | au moins 1, et autant de tailles d'équipe que de missions |
| Taille de chaque équipe | entre 1 et le nombre de communistes (une équipe sans nazi reste possible) |
| Victoires pour gagner | entre 1 et le nombre de missions, et **nombre de missions ≥ 2 × victoires − 1** (pas d'égalité possible) |
| Information des nazis | `full` (ils connaissent tous les rôles, comme en standard), `partial` (chaque nazi ne connaît qu'un seul autre nazi, en chaîne), `blind` (personne ne connaît d'autre rôle que le sien ; expérimental) |

Le mode `blind` n'est accepté que marqué comme expérimental : sans information, les nazis ne peuvent pas se coordonner et l'équilibre du jeu n'est pas garanti.

---

## Cas particuliers

- **Égalité au vote de confiance** : c'est un rejet ; le même chef repropose.
- **Rejets à répétition** : il n'y a pas de limite ; c'est à la table de sortir de l'impasse.
- **Le chef s'inclut dans son équipe** : c'est permis.
- **Un nazi ne sabote pas** : c'est permis et souvent utile pour gagner la confiance ; la mission est alors réussie.
- **Plusieurs nazis dans une équipe** : chacun décide seul ; il suffit d'un vote nazi pour faire échouer la mission, et le nombre de votes nazis est révélé.
- **Un joueur se trompe de place dans l'ordre de table** : il corrige sa place pendant le compte à rebours ; toute correction le relance.
- **Un joueur recharge la page ou change de téléphone** : il retrouve sa place et l'état de la partie ; avec un compte, depuis n'importe quel appareil.
- **Un joueur quitte ou disparaît** : voir [Absences et abandons](#absences-et-abandons).
- **Le nombre de joueurs change entre deux parties** : une room libre prend le format du nouveau nombre ; une room à format imposé revient au salon s'il ne correspond plus.

---

## Glossaire

- **Room** : la partie partagée, rejointe par un code, un lien ou un QR code.
- **Hôte** : le joueur qui gère le salon (démarrer, exclure, options). Le rôle passe à un autre joueur s'il part.
- **Chef** : le joueur qui propose l'équipe de la manche en cours.
- **Manche** : une mission, de la proposition au résultat.
- **Équipe** : les joueurs envoyés en mission.
- **Vote de confiance** : vote public de tous sur l'équipe proposée.
- **Vote de mission** : vote secret des membres de l'équipe.
- **Seuil** : le nombre de missions à remporter pour gagner.
- **Abandon** : fin de partie causée par le départ ou l'absence prolongée d'un joueur ; son camp perd.

---

## Historique des versions

| Version | Changements |
|---|---|
| 1.0 | Absence d'un joueur : la proposition de l'attendre n'apparaît plus qu'à 20 s de la fin du délai, avec une notification à tous les joueurs qui ne regardent pas leur écran. Moins de validations : l'ordre de table se valide seul 5 s après être complet, relâcher sa carte suffit après avoir vu son rôle, et les résultats (vote de confiance, mission) passent seuls après 6 et 8 s ; toucher l'écran accélère. |
| 0.9 | Partie rapide proposée dans le salon à partir de 6 joueurs (y compris en format imposé) ; option de room « Révéler les nazis à la fin » (activée par défaut ; désactivée, les rôles restent secrets) ; format imposé à 2 joueurs (duel) ; résultats des votes de confiance présentés en deux listes, Pour et Contre. |
| 0.8 | Règles publiées sous licence CC BY-NC-SA 4.0. Document détaillé : qui sait quoi et quand, ordre de table (correction, confirmation), révélation des votes, revoir son rôle et l'historique, limite de 3 attentes par absence, règles personnalisées, cas particuliers, glossaire. |
| 0.7 | Formats jusqu'à 14 joueurs (classique : 13 à 15 missions de 12 à 14 joueurs) ; partie rapide au choix (5 missions, premier à 3). |
| 0.6 | Duel : rôles tirés indépendamment à pile ou face (25 / 50 / 25 %) ; un communiste gagne s'il juge juste ; deux nazis qui se font confiance gagnent ensemble. Plus aucun vote gagnant d'avance. |
| 0.5 | Document refondu (`docs/REGLES.md`) : ordre de table, premier chef, votes mélangés, règles d'absence (attente jusqu'à 5 min, annulation si l'absent part avant la distribution des rôles), rejouer. |
| 0.4 | Duel à 2 joueurs. |
| 0.3 | Retour du format à 3 joueurs (1 nazi, équipes de 2, premier à 2). |
| 0.2 | Formats de 4 à 11 joueurs, seuil de victoire (joueurs ÷ 2) + 1. |
| 0.1 (révisée) | Décisions de l'audit : une égalité au vote de confiance vaut rejet, le même chef repropose, le chef ne change qu'à chaque nouvelle manche, un joueur absent fait perdre son camp. |
| 0.1 | Règles initiales, format de référence à 5 joueurs. |

---

## Licence

Les règles du jeu **Nazi Communiste** (ce document) sont © 2026 Komintern et publiées sous licence **Creative Commons Attribution - Pas d'utilisation commerciale - Partage dans les mêmes conditions 4.0 International (CC BY-NC-SA 4.0)** :
<https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr> (texte juridique : <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.fr>).

Vous pouvez partager et adapter ces règles, à condition :
- **d'en créditer l'auteur** (« Nazi Communiste, règles © Komintern, CC BY-NC-SA 4.0 ») avec un lien vers la licence, et d'indiquer si des modifications ont été faites ;
- **de ne pas en faire un usage commercial** ;
- **de partager vos adaptations sous la même licence**.

Cette licence couvre le texte des règles. Le code source du jeu est publié séparément sous licence [AGPL-3.0](../LICENSE).

> **Version** : 1.0
> **Statut** : référence du moteur (`gameengine/`), de la page Règles du site et des pages pour les agents IA.
