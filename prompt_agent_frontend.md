# Prompt — Agent Frontend Rebuild

## Contexte

Tu es en charge du rebuild du frontend de **Cinquième Colonne**, un jeu de déduction sociale multijoueur en temps réel. Chaque joueur utilise son propre téléphone. La partie se joue en présentiel.

Le frontend est en **React / TypeScript**. Il communique avec le serveur Node.js via **Socket.io**.

---

## Principe directeur UI — "Glance & Act"

Chaque écran répond à **une seule question** et permet **une seule action**. Le téléphone ne doit jamais devenir une distraction à la table.

---

## Unité graphique centrale : la carte

Toute l'interface est construite autour d'une carte physique digitalisée.

**Comportements de la carte**
- Face cachée par défaut
- **Tap écran entier** → animation de retournement → face visible
- **Swipe sur la carte** → retournement vers la face historique (votes passés, composition des équipes, résultats des missions)
- **Long press** → overlay semi-transparent révélant les infos de rôle par-dessus la carte active — équilibre transparence/lisibilité à trouver, doit rester lisible sans masquer le contexte

**Animation de retournement**
- Retournement physique réaliste sur l'axe Y (CSS `rotateY`)
- Sobre, rapide, sans effets superflus
- Utilisée à chaque transition d'étape significative

---

## Indicateur de progression groupe

- **N points** affichés en haut de l'écran (N = nombre de joueurs)
- Point plein = joueur ayant validé l'étape
- Point outliné = joueur en attente
- Aucun nom attaché — l'ordre correspond à l'ordre de table défini lors du `TableOrder`
- Présent sur tous les écrans nécessitant une validation collective

---

## Boutons de vote

- Deux boutons disposés **verticalement**
- Position **aléatoire** à chaque affichage (haut ou bas) — empêche les habitudes et la triche par réflexe de position
- Fond noir, **symbole blanc uniquement** — aucun libellé texte
- Séparés clairement, grandes zones de tap

---

## Score

- Affiché en permanence sur la carte principale
- **Haut gauche** : `symbole_faction : score`
- **Haut droit** : `symbole_faction : score`
- Format fixe, typographie petite et discrète, toujours visible

---

## Style graphique

- Jeu de société **minimaliste**
- **Monochromatique** — noir, blanc, pas de couleur attachée aux factions
- Icônes de rôle : **petite moustache** (Nazi) / **grande moustache** (Communist)
- Typographie : sobre, lisible, caractère — pas de police système générique
- Pas de gradient, pas d'ombre portée décorative, pas d'effet superflu
- Animations : uniquement là où elles portent du sens (retournement de carte, validation groupe)

---

## Cartographie des écrans

### `PseudoEntry`
- Affiché uniquement si aucun pseudo en localStorage
- Saisie du pseudo → stocké en localStorage
- Réaffiché uniquement si retour volontaire

### `Landing`
- Deux actions : **Créer une room** / **Rejoindre une room**
- Pseudo affiché en haut, modifiable via retour vers `PseudoEntry`

### `CreateRoom`
- Sélection preset (5j uniquement actif — les autres grisés jusqu'à définition des tailles de mission)
- Accès mode custom (configurations symétriques, paramètres avancés)
- Génération du code room → bascule `WaitingRoom`

### `JoinRoom`
- Saisie du code room
- Bascule `WaitingRoom`

### `WaitingRoom`
- Code room affiché en permanence (copiable)
- Liste des joueurs connectés
- Bouton démarrer visible **uniquement pour le host**
- Pas de bouton démarrer avant que le nombre minimum de joueurs soit atteint

### `TableOrder`
- Chaque joueur tape l'écran à tour de rôle pour définir l'ordre de table IRL
- Un chiffre s'incrémente de 1 à N à chaque tap
- Cet ordre définit l'ordre des points de progression et le roulement du Chef
- ⚠️ Synchronisation groupe requise — tous les joueurs doivent avoir tapé

### `RoleReveal`
- Carte face cachée
- Tap écran entier → retournement → rôle révélé (icône moustache + faction)
- Les Nazis voient une deuxième carte : liste complète des rôles de la partie
- ⚠️ Synchronisation groupe requise — tous doivent confirmer avant d'avancer

### `MissionProposal`
- Le Chef voit les contrôles de sélection d'équipe
- Les autres joueurs voient un écran d'attente
- Le Chef seul déclenche l'avance — pas de synchronisation groupe

### `ConfidenceVote`
- Boutons de vote (Pour / Contre) — disposition verticale aléatoire, symbole uniquement
- Chaque joueur vote sans voir le vote des autres
- ⚠️ Synchronisation groupe requise — tous doivent avoir voté avant révélation

### `ConfidenceResult`
- Résultat complet : qui a voté quoi, décompte, majorité atteinte ou non
- Si NON → retour `MissionProposal` avec Chef suivant dans le roulement
- Si OUI → avance vers `MissionExecution`
- ⚠️ Synchronisation groupe requise — tous doivent confirmer avant d'avancer

### `MissionExecution`
- Membres de l'équipe : boutons de vote (Nazi / Communist) — disposition verticale aléatoire, symbole uniquement
- Joueurs hors équipe : écran d'attente
- ⚠️ Synchronisation groupe requise — tous les membres de l'équipe doivent avoir voté

### `MissionResult`
- Nombre exact de votes Nazi révélé
- Score mis à jour haut gauche / haut droit
- Animation de retournement de carte
- ⚠️ Synchronisation groupe requise — tous doivent confirmer avant la manche suivante

### `EndGame`
- Faction victorieuse affichée — carte face cachée
- ⚠️ Synchronisation groupe requise — tous doivent valider avant la révélation
- Tap collectif → retournement → révélation complète des rôles de tous les joueurs

### `ReplayWaiting`
- Chaque joueur indique Rejouer ou Quitter
- Le host relance une fois les choix visibles
- Points de progression affichés (N joueurs ayant répondu)

---

## Contrat Socket.io — événements attendus du serveur

Le frontend écoute et émet les événements suivants. Ne pas modifier les noms d'événements sans synchronisation avec l'agent backend.

**Émis par le client**
- `set_pseudo` — pseudo du joueur
- `create_room` — création de room avec ruleset
- `join_room` — rejoindre via code
- `table_order_tap` — tap de l'étape TableOrder
- `role_confirmed` — joueur a vu son rôle
- `propose_team` — Chef soumet une équipe
- `confidence_vote` — vote Pour/Contre
- `confidence_result_confirmed` — joueur a vu le résultat
- `mission_vote` — vote mission (Nazi/Communist)
- `mission_result_confirmed` — joueur a vu le résultat de mission
- `end_game_confirmed` — joueur a vu les rôles finaux
- `replay_choice` — Rejouer / Quitter

**Écouté par le client**
- `room_updated` — mise à jour de la liste des joueurs
- `game_started` — démarrage de la partie
- `table_order_updated` — état courant des taps
- `role_assigned` — rôle du joueur + info faction selon rôle
- `proposal_phase` — infos de la phase proposition (qui est Chef, taille d'équipe)
- `confidence_phase` — ouverture du vote de confiance
- `confidence_revealed` — résultat complet du vote de confiance
- `mission_phase` — ouverture de l'exécution de mission
- `mission_revealed` — résultat de mission (nombre de votes Nazi, score)
- `game_over` — faction victorieuse
- `roles_revealed` — liste complète des rôles

---

## Contraintes techniques

- React / TypeScript
- Socket.io client
- Pas de librairie UI générique (pas de MUI, pas de Chakra) — composants maison uniquement
- Mobile-first — toute l'interface est conçue pour un écran de téléphone tenu à la verticale
- Pas de scroll sur les écrans de jeu — tout doit tenir dans le viewport

---

> Référence règles : `regles_v0.1.md` — version 0.1
> Référence architecture : `prompt_agent_gameengine.md`
