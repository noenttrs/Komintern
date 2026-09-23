# Prompt — Agent Backend Rebuild

## Contexte

Tu es en charge du rebuild de la couche serveur de **Cinquième Colonne**, un jeu de déduction sociale multijoueur en temps réel.

Stack : **Node.js + Socket.io + Express**. Le serveur communique avec le game engine Python via bridge local. L'état des rooms est stocké dans **Redis**. Les comptes utilisateurs sont dans **PostgreSQL** — hors scope pour cette itération.

Le document de référence absolu pour la logique du jeu est `regles_v0.1.md`. Le serveur ne réimplémente pas la logique métier — il orchestre le flux, filtre l'information, et relaie vers le game engine Python.

## Mode opératoire attendu

- Lis d'abord `regles_v0.1.md`, `prompt_agent_frontend.md`, puis le code serveur existant avant de modifier quoi que ce soit.
- Considère ce document comme le contrat fonctionnel à respecter; si le code actuel diverge, aligne le code sur ce contrat.
- Ne déplace pas la logique de jeu dans Node.js: toute décision métier reste côté game engine Python.
- Ajoute ou actualise les tests unitaires sur la logique de session, de synchronisation groupe, de bridge et de reprise après déconnexion.
- Ne rajoute pas d'authentification par token signé ni de couche compte utilisateur dans cette itération.

---

## Responsabilités du serveur

```
[Client React/TS]
      │ Socket.io
      ▼
[Node.js — Gateway]
  - Gestion des rooms et sessions
  - Orchestration du UX flow (state machine des écrans)
  - Filtrage de l'information par joueur
  - Synchronisation groupe (tracking des validations collectives)
  - Relay vers le game engine Python
      │ Bridge local (socket Unix ou HTTP local)
      ▼
[Python — Game Engine]
  - Logique pure du jeu
```

---

## Corrections critiques à intégrer dans le rebuild

Les points suivants sont issus d'un audit de la version précédente. Ils doivent être résolus nativement dans le rebuild, pas patchés après.

**1. Startup transactionnel**
Le statut de la room et l'enregistrement de la session ne doivent changer qu'après confirmation de démarrage réussie du bridge Python. En cas d'échec, rollback complet du statut de la room.

**2. Stderr Python → log stream**
Le stderr du process Python est traité comme un flux de log, jamais comme une erreur fatale. Seul un exit du process ou une erreur de protocole explicite déclenche un rejet des requêtes en vol.

**3. Bridge disposal garanti**
À chaque suppression de room ou de session, un appel dispose explicite tue le process Python associé. Aucune fuite de process possible.

**4. Politique mid-game leave**
Un joueur ne peut pas quitter une partie en cours. En cas de déconnexion, le joueur est marqué AFK. Un timeout de 60 secondes sans reconnexion déclenche un forfait automatique de sa faction. La logique de complétion des votes ne doit jamais attendre indéfiniment un joueur AFK.

**5. Reconnexion**
Un joueur déconnecté peut revenir dans sa room pendant la durée du timeout AFK. À la reconnexion, il reçoit un `resync` complet de l'état courant de la partie.

**6. Standardisation des payloads**
Un seul format de payload pour chaque type d'événement, sans variation selon le code path. Définir un schéma explicite par événement et le valider avant émission.

**7. Validation des champs bridge**
Toute réponse du game engine Python est validée (champs requis + types) avant d'être utilisée. Une réponse malformée lève une erreur explicite, pas un crash silencieux.

---

## UX Flow — State machine des écrans

Le serveur orchestre la progression entre les états suivants. La transition entre états n'est déclenchée que lorsque les conditions de synchronisation groupe sont remplies.

```
LOBBY
  └─ WaitingRoom → démarrage host
GAME
  ├─ TableOrder          ← sync groupe : tous ont tapé
  ├─ RoleReveal          ← sync groupe : tous ont confirmé
  ├─ [boucle de manche]
  │    ├─ MissionProposal    ← Chef seul déclenche
  │    ├─ ConfidenceVote     ← sync groupe : tous ont voté
  │    ├─ ConfidenceResult   ← sync groupe : tous ont confirmé
  │    │    └─ si NON → retour MissionProposal (Chef suivant)
  │    ├─ MissionExecution   ← sync groupe : membres équipe ont voté
  │    └─ MissionResult      ← sync groupe : tous ont confirmé
  └─ EndGame             ← sync groupe : tous ont confirmé → RolesRevealed
REPLAY
  └─ ReplayWaiting       ← host relance ou dissout
```

---

## Synchronisation groupe

Le serveur maintient pour chaque étape un **set de validations** : l'ensemble des joueurs ayant confirmé. La transition ne se déclenche que lorsque `validations.size === room.playerCount` (ou `equipeSize` pour `MissionExecution`).

Les joueurs AFK sont exclus du décompte après leur timeout.

---

## Filtrage de l'information par joueur

Le serveur ne relaie jamais l'état brut du game engine au client. Il appelle `getPlayerView(playerId)` pour chaque joueur et n'émet que ce que ce joueur a le droit de voir.

Règles d'exposition par rôle :

| Information | Nazi | Communist |
|---|---|---|
| Son propre rôle | ✅ | ✅ |
| Rôles de tous les joueurs | ✅ | ❌ |
| Nombre exact de votes Nazi par mission | ✅ | ✅ |
| Attribution nominative des votes de mission | ❌ | ❌ |
| Résultat complet du vote de confiance | ✅ | ✅ |

---

## Contrat Socket.io — événements

### Reçus par le serveur

| Événement | Émetteur | Payload |
|---|---|---|
| `set_pseudo` | tout joueur | `{ pseudo: string }` |
| `create_room` | host | `{ ruleset: Ruleset }` |
| `join_room` | joueur | `{ code: string }` |
| `table_order_tap` | joueur | — |
| `role_confirmed` | joueur | — |
| `propose_team` | Chef | `{ team: playerId[] }` |
| `confidence_vote` | joueur | `{ vote: 'yes' \| 'no' }` |
| `confidence_result_confirmed` | joueur | — |
| `mission_vote` | membre équipe | `{ vote: 'nazi' \| 'communist' }` |
| `mission_result_confirmed` | joueur | — |
| `end_game_confirmed` | joueur | — |
| `replay_choice` | joueur | `{ choice: 'replay' \| 'quit' }` |

### Émis par le serveur

| Événement | Destinataire | Payload |
|---|---|---|
| `room_updated` | tous | `{ players: Player[], code: string }` |
| `game_started` | tous | — |
| `table_order_updated` | tous | `{ taps: number }` |
| `role_assigned` | joueur individuel | `{ role: Role, roleMap?: RoleMap }` |
| `proposal_phase` | tous | `{ chef: playerId, missionSize: number, missionIndex: number }` |
| `confidence_phase` | tous | — |
| `confidence_revealed` | tous | `{ votes: { playerId, vote }[], result: 'yes' \| 'no' }` |
| `mission_phase` | membres équipe | — |
| `mission_revealed` | tous | `{ naziVotes: number, result: 'nazi' \| 'communist', scores: Scores }` |
| `game_over` | tous | `{ winner: Faction }` |
| `roles_revealed` | tous | `{ roleMap: RoleMap }` |
| `player_afk` | tous | `{ playerId }` |
| `resync` | joueur reconnecté | état complet filtré |
| `error` | joueur concerné | `{ code: string, message: string }` |

---

## Gestion des erreurs

Toute action invalide (vote hors phase, proposition invalide, action non autorisée) retourne un événement `error` explicite au joueur concerné. Les erreurs ne sont jamais silencieuses.

---

## Sécurité — priorités v1

- CORS restreint par variable d'environnement (`ALLOWED_ORIGINS`)
- Rate limiting sur les événements Socket.io (connexions et actions)
- Validation de l'identité du joueur sur chaque action (le `playerId` doit correspondre à la session Socket.io)
- Aucun état sensible exposé dans les logs en production

> L'authentification par token signé est prévue pour une itération ultérieure.

---

## Contraintes techniques

- Node.js + Socket.io + Express
- Redis pour l'état des rooms (TTL sur inactivité)
- Docker Compose sur homelab
- Le serveur est **sans logique métier jeu** — tout passe par le game engine Python
- Suite de tests unitaires obligatoire sur la logique de session et de synchronisation groupe
- Les schémas de payloads doivent être définis explicitement par événement et validés avant émission ou consommation

---

> Référence règles : `regles_v0.1.md` — version 0.1
> Référence game engine : `prompt_agent_gameengine.md`
> Référence frontend : `prompt_agent_frontend.md`
