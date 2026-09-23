# Audit Komintern — 2026-09-23

Audit du moteur Python (`gameengine/`, `gameengine_entry.py`), du serveur Node (`server/src/`), du client React (`client/src/`) et de l'infra (Docker, nginx).
Chaque entrée : **id**, gravité (🔴 critique · 🟠 moyen · 🟡 mineur), emplacement d'origine, problème, correctif. `[x]` = corrigé (avec test quand c'est testable).

Décisions produit prises pendant l'audit :
- Le chef ne change **qu'à chaque nouvelle manche** (mission) ; après un rejet, le même chef repropose.
- Égalité au vote de confiance = **rejet** (majorité stricte de OUI requise).

## Moteur Python (E)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [ ] | E1 | 🔴 | `round_manager.py:65` | Égalité au vote de confiance : la manche reste en VOTING, la partie se bloque → majorité stricte, égalité = rejet. |
| [ ] | E2 | 🟠 | `round_manager.py:114` | N'importe quel sous-ensemble de votants accepté → votants attendus explicites (`voter_ids`), il faut exactement leurs votes. |
| [ ] | E3 | 🟡 | `round_manager.py:59` | Rejet : `confidence_votes` renvoyé vide → renvoyer les vrais votes + `approved`. |
| [ ] | E4 | 🔴 | `gameengine_entry.py:164` | Aucune garde de fin de partie : on peut jouer après une victoire ou `end_game` → erreur « game is over ». |
| [ ] | E5 | 🟠 | `game_manager.py:64` | `record_mission_result` sans lien avec une mission (scores falsifiables) → scores mis à jour dans `submit_mission_votes` ; `forfeit` dédié pour l'abandon AFK. |
| [ ] | E6 | 🟡 | `game_manager.py:36` | `set_turn_order` remet le curseur à 0 et laisse `chef_id` périmé → recalcul du chef, refus en cours de manche. |
| [ ] | E7 | 🟠 | `types.py:45` | Rulesets custom mal validés (nul possible, tailles 0/négatives/> joueurs, seuils ≤ 0) → validation complète. |
| [ ] | E8 | 🟠 | `constants.py` | Presets 7J–11J à placeholder `-1` : la partie démarre puis bloque → refusés à `start_game`. |
| [ ] | E9 | 🔴 | `gameengine_entry.py:78` | `start_game` non atomique : un échec laisse un état à moitié modifié → construction locale puis affectation. |
| [ ] | E10 | 🟠 | `gameengine_entry.py:75` | `chef_cursor` non borné (IndexError, index négatifs) ; booléens acceptés comme entiers → validation stricte. |
| [ ] | E11 | 🟡 | `utils.py:26` | `nazi_count` négatif → erreur obscure → couvert par E7. |
| [ ] | E12 | 🟡 | `gameengine_entry.py:215` | `ruleset_preset` + `ruleset` ensemble : custom ignoré en silence ; `PRESET_4J` absent de la table → erreur explicite, 4J ajouté. |
| [ ] | E13 | 🟠 | — | Pas de commande pour lire la manche en cours (resync impossible depuis le moteur) → `get_round_state`. |
| [ ] | E14 | 🟠 | `utils.py:15` | Hasard global non injectable, non cryptographique → `SystemRandom` par défaut, `seed` optionnel pour les tests. |
| [ ] | E15 | 🔴 | protocole | Réponses sans identifiant : une ligne parasite décale toutes les réponses → champ `id` renvoyé tel quel. |
| [ ] | E16 | 🟡 | `gameengine_entry.py:158` | Commentaire faux sur l'avancée du curseur → corrigé ; règles et docs alignées sur la rotation par manche. |
| [ ] | E17 | 🟡 | `round_manager.py:93` | Rotation basée sur `ruleset.player_count` au lieu du nombre réel de joueurs → `len(players)`. |

## Serveur Node — pont Python (P)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [ ] | P1 | 🔴 | `PythonBridge.ts:53` | Aucun timeout : un moteur figé bloque la room pour toujours → timeout par commande. |
| [ ] | P2 | 🔴 | `PythonBridge.ts:107` | Pas d'id de requête (voir E15) → correspondance stricte par id, lignes parasites loggées et ignorées. |
| [ ] | P3 | 🔴 | `PythonBridge.ts:84` | Pas de handler `error` sur stdin : EPIPE = exception non rattrapée = crash du serveur → handler + rejet propre. |
| [ ] | P4 | 🟠 | `PythonBridge.ts:37` | Mort du moteur non signalée : room bloquée → `onExit`, la session prévient la room et se retire. |
| [ ] | P5 | 🟡 | `PythonBridge.ts:59` | `kill()` SIGTERM seul → SIGKILL de secours. |
| [ ] | P6 | 🟡 | `PythonBridge.ts:88` | Buffer stdout non borné → plafond. |
| [ ] | P7 | 🟡 | `PythonBridge.ts:118` | Détails internes renvoyés aux clients → message générique, détail dans les logs. |
| [ ] | P8 | 🟡 | `index.ts:57` | `ENGINE_PATH` relatif au cwd → relatif à `__dirname`. |
| [ ] | P9 | 🟠 | — | Nombre de process Python illimité → plafond global de rooms. |

## Serveur Node — connexions et rooms (C, L, V, S)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [ ] | C1 | 🔴 | `RoomManager.ts:368,450` | `void session.handleRosterChange()` : un rejet non rattrapé tue le serveur → await + catch + log. |
| [ ] | C2 | 🔴 | `RoomManager.ts:380` | La déconnexion de l'ancien socket efface le mapping du nouveau (rechargement) → le joueur est marqué AFK alors qu'il est connecté → suppression conditionnelle. |
| [ ] | C3 | 🔴 | `index.ts:170` | Vol de siège : `join_room` accepte n'importe quel `playerId` (diffusé à tous) et renvoie le rôle de la victime → reconnexion uniquement par `playerUid` secret, jamais diffusé. |
| [ ] | C4 | 🔴 | `RoomManager.ts:128` | Joins acceptés pendant l'ordre de table/révélation : quorums impossibles → refus dès que la room n'est plus en attente. |
| [ ] | L1 | 🔴 | `RoomManager.ts:360` | Rooms (et process Python) jamais supprimées quand tout le monde ferme l'onglet → suppression après délai de grâce. |
| [ ] | L2 | 🟠 | `index.ts:163` | `join_room` sur un code inconnu crée une room → erreur « room introuvable ». |
| [ ] | L3 | 🟡 | `RoomManager.ts:362` | `persistedCursor` jamais nettoyé → supprimé avec la room. |
| [ ] | L4 | 🟠 | `index.ts:136` | Rejoindre une 2e room laisse le siège de la 1re → on quitte d'abord l'ancienne. |
| [ ] | V1 | 🟠 | `index.ts:165` | Code de room non typé ni normalisé au join (« abc » ≠ « ABC ») → normalisation + regex. |
| [ ] | V2 | 🟠 | `index.ts:100` | Pseudo sans longueur max (jusqu'à 1 Mo diffusé) → 1–20 caractères, sans caractères de contrôle. |
| [ ] | V3 | 🟡 | `index.ts:131` | Payload absent → TypeError ; types non vérifiés → validateur par événement. |
| [ ] | V4 | 🟠 | `rulesets.ts:160` | Rulesets custom mal validés (cf. E7) → même validation côté serveur. |
| [ ] | V5 | 🟠 | `rulesets.ts:21` | Presets placeholder démarrables (cf. E8) → refusés. |
| [ ] | V6 | 🟠 | `RoomManager.ts:250` | Un non-hôte peut écraser le ruleset avant le contrôle d'hôte → contrôle d'abord. |
| [ ] | V7 | 🟡 | `index.ts:275` | Contenu de `team` non typé → validé. |
| [ ] | S1 | 🟠 | `RoomManager.ts:299` | Double `start_game` : deux sessions, un process Python orphelin → verrou. |
| [ ] | S2 | 🟡 | `index.ts:348` | `replay_choice: quit` ne prévient personne → `room_updated` diffusé. |
| [ ] | S3 | 🟠 | `events.ts:40` | `PLAYER_LEFT` = même nom que `room_updated` avec un autre payload → événement `player_left` distinct + `room_updated` complet. |
| [ ] | S4 | 🟠 | `RoomManager.ts:224` | Rejouer après un départ : room inutilisable → retour au lobby. |
| [ ] | S5 | 🟡 | — | Pas de réattribution de l'hôte à la déconnexion → réattribuée. |
| [ ] | S6 | 🟠 | `GameSession.ts:587` | `handleAfkForfeit` jamais appelé : un AFK bloque la partie → abandon de sa faction après 60 s. |
| [ ] | S7 | 🟡 | `RoomManager.ts:446` | `player_afk` sans `room_updated` → diffusé. |

## Serveur Node — logique de partie (G)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [ ] | G1 | 🔴 | `GameSession.ts:419` | Égalité au vote : serveur et moteur désynchronisés, partie bloquée → résultat explicite `approved` du moteur. |
| [ ] | G2 | 🔴 | `GameSession.ts:255` | Ré-entrance entre les awaits (double confirmation → rôles retirés, votes envoyés deux fois) → file d'actions sérialisée par session. |
| [ ] | G3 | 🟠 | `GameSession.ts:393` | Votes d'un joueur passé AFK comptés dans le quorum → quorum sur les votants actifs. |
| [ ] | G4 | 🟠 | `GameSession.ts:413` | État modifié avant l'await, pas de rollback → appliqué après succès du moteur. |
| [ ] | G5 | 🟠 | `GameSession.ts:736` | Chef AFK ou parti : personne ne peut proposer → abandon AFK (S6) termine la partie. |
| [ ] | G6 | 🟡 | `GameSession.ts:894` | Résultat de mission du resync = faction en tête, pas la dernière mission → corrigé. |
| [ ] | G7 | 🟡 | `GameSession.ts:1017` | Deux chemins de fin de mission divergents → dédupliqués. |
| [ ] | G8 | 🟠 | `GameSession.ts:714` | Échec de `end_game` : session jamais libérée → libérée dans tous les cas. |
| [ ] | G9 | 🟡 | `GameSession.ts:278` | Curseur de chef sauvegardé jamais utilisé, README faux → docs alignées. |
| [ ] | G10 | 🟡 | `GameSession.ts:486` | Votes de mission invalides ignorés en silence → erreur explicite. |
| [ ] | G11 | 🟡 | `GameSession.ts:333` | Émission possible après dispose → gardé. |

## Serveur Node — transversal (X)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | X1 | 🔴 | `index.ts` | Aucun handler `uncaughtException`/`unhandledRejection` → log + exit(1), relance par Docker. |
| [ ] | X2 | 🟠 | `index.ts:461` | Erreurs des handlers jamais loggées côté serveur → log systématique. |
| [ ] | X3 | 🟡 | `index.ts:80` | Rate limit silencieux ; env NaN désactive la limite → erreur au client, valeurs par défaut. |
| [ ] | X4 | 🟡 | `index.ts:58` | CORS non appliqué aux WebSockets → `allowRequest` vérifie `Origin`. |
| [ ] | X5 | 🟡 | `index.ts:405` | Arrêt : timers AFK non vidés, process Python non attendus, exit 0 forcé → corrigé. |

## Client React (K)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [ ] | K1 | 🔴 | `App.tsx:540` | Early return avant un `useEffect` (Rules of Hooks) : crash en passant paysage → portrait → early return après les hooks. |
| [ ] | K2 | 🔴 | `useGameSocket.ts:236` | Quand un joueur part, tous les autres prennent son id comme `myId` → `myId` jamais écrasé par un `room_updated`. |
| [ ] | K3 | 🟠 | `App.tsx:193` | Gagnant de mission recalculé côté client → `result` du serveur. |
| [ ] | K4 | 🟠 | `useGameSocket.ts:494` | Resync incomplet (confiance, équipe, ordre de table, « déjà voté », historiques) → resync complet. |
| [ ] | K5 | 🔴 | `useGameSocket.ts:201` | Actions bufferisées envoyées avant le rejoin → rejetées → file d'attente vidée après confirmation du rejoin. |
| [ ] | K6 | 🔴 | `App.tsx` | Erreurs invisibles sur les écrans de jeu, carte « en attente » permanente → bandeau d'erreur partout, attente annulée. |
| [ ] | K7 | 🟠 | `useGameSocket.ts:666` | Create/join optimistes : code sauvegardé avant confirmation (rejoin dans la room d'un autre) → après confirmation seulement. |
| [ ] | K8 | 🟠 | `useGameSocket.ts:783` | « Quitter » laisse le joueur bloqué → réinitialisation complète. |
| [ ] | K9 | 🟡 | `useGameSocket.ts:312` | Dépendances d'effets incomplètes, listeners recréés à chaque phase → refs. |
| [ ] | K10 | 🟡 | `App.tsx:276` | `selectedTeam` jamais remis à zéro, double clic possible → corrigé. |
| [ ] | K11 | 🟡 | `useGameSocket.ts:301` | `join_room` en double au montage → un seul. |
| [ ] | K12 | 🟡 | — | Aucun état de connexion affiché → bandeau. |
| [ ] | K13 | 🟡 | `socket.ts:8` | `VITE_SERVER_URL=""` → `io("")` → `||`. |
| [ ] | K14 | 🟡 | `index.html:5` | `user-scalable=no` (accessibilité), polices non chargées, pas de favicon → corrigé. |

## Infra (I)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | I1 | 🔴 | `docker-compose.yml` | `unless-stopped` → `restart: always` (Docker est déjà activé au boot). |
| [x] | I2 | 🔴 | `nginx.conf:6` | Upstream résolu une seule fois : 502 après redémarrage du serveur → `resolver 127.0.0.11` + variable. |
| [ ] | I3 | 🟠 | `nginx.conf` | Pas d'en-têtes de sécurité, `server_tokens` actif, pas de gzip, double `Cache-Control` → corrigé. |
| [ ] | I4 | 🟡 | `Dockerfile` | Tests jamais exécutés au build → tests bloquants dans le build. |
| [ ] | I5 | 🟡 | — | Pas de git, pas de lint, pas de CI → git, ESLint, `scripts/check.sh`. |
| [ ] | I6 | 🟡 | `client/dist`, `server/dist` | Builds locaux périmés → supprimés (ignorés par git). |
