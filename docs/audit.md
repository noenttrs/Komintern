# Audit Komintern — 2026-09-23

Audit du moteur Python (`gameengine/`, `gameengine_entry.py`), du serveur Node (`server/src/`), du client React (`client/src/`) et de l'infra (Docker, nginx).
**État : tous les points sont corrigés** (commits du 2026-09-23). Chaque entrée : **id**, gravité (🔴 critique · 🟠 moyen · 🟡 mineur), emplacement d'origine, problème, correctif. `[x]` = corrigé (avec test quand c'est testable).

Décisions produit prises pendant l'audit :
- Le chef ne change **qu'à chaque nouvelle manche** (mission) ; après un rejet, le même chef repropose.
- Égalité au vote de confiance = **rejet** (majorité stricte de OUI requise).

## Moteur Python (E)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | E1 | 🔴 | `round_manager.py:65` | Égalité au vote de confiance : la manche reste en VOTING, la partie se bloque → majorité stricte, égalité = rejet. |
| [x] | E2 | 🟠 | `round_manager.py:114` | N'importe quel sous-ensemble de votants accepté → votants attendus explicites (`voter_ids`), il faut exactement leurs votes. |
| [x] | E3 | 🟡 | `round_manager.py:59` | Rejet : `confidence_votes` renvoyé vide → renvoyer les vrais votes + `approved`. |
| [x] | E4 | 🔴 | `gameengine_entry.py:164` | Aucune garde de fin de partie : on peut jouer après une victoire ou `end_game` → erreur « game is over ». |
| [x] | E5 | 🟠 | `game_manager.py:64` | `record_mission_result` sans lien avec une mission (scores falsifiables) → scores mis à jour dans `submit_mission_votes` ; `forfeit` dédié pour l'abandon AFK. |
| [x] | E6 | 🟡 | `game_manager.py:36` | `set_turn_order` remet le curseur à 0 et laisse `chef_id` périmé → recalcul du chef, refus en cours de manche. |
| [x] | E7 | 🟠 | `types.py:45` | Rulesets custom mal validés (nul possible, tailles 0/négatives/> joueurs, seuils ≤ 0) → validation complète. |
| [x] | E8 | 🟠 | `constants.py` | Presets 7J–11J à placeholder `-1` : la partie démarre puis bloque → refusés à `start_game`. |
| [x] | E9 | 🔴 | `gameengine_entry.py:78` | `start_game` non atomique : un échec laisse un état à moitié modifié → construction locale puis affectation. |
| [x] | E10 | 🟠 | `gameengine_entry.py:75` | `chef_cursor` non borné (IndexError, index négatifs) ; booléens acceptés comme entiers → validation stricte. |
| [x] | E11 | 🟡 | `utils.py:26` | `nazi_count` négatif → erreur obscure → couvert par E7. |
| [x] | E12 | 🟡 | `gameengine_entry.py:215` | `ruleset_preset` + `ruleset` ensemble : custom ignoré en silence ; `PRESET_4J` absent de la table → erreur explicite, 4J ajouté. |
| [x] | E13 | 🟠 | — | Pas de commande pour lire la manche en cours (resync impossible depuis le moteur) → `get_round_state`. |
| [x] | E14 | 🟠 | `utils.py:15` | Hasard global non injectable, non cryptographique → `SystemRandom` par défaut, `seed` optionnel pour les tests. |
| [x] | E15 | 🔴 | protocole | Réponses sans identifiant : une ligne parasite décale toutes les réponses → champ `id` renvoyé tel quel. |
| [x] | E16 | 🟡 | `gameengine_entry.py:158` | Commentaire faux sur l'avancée du curseur → corrigé ; règles et docs alignées sur la rotation par manche. |
| [x] | E17 | 🟡 | `round_manager.py:93` | Rotation basée sur `ruleset.player_count` au lieu du nombre réel de joueurs → `len(players)`. |

## Serveur Node — pont Python (P)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | P1 | 🔴 | `PythonBridge.ts:53` | Aucun timeout : un moteur figé bloque la room pour toujours → timeout par commande. |
| [x] | P2 | 🔴 | `PythonBridge.ts:107` | Pas d'id de requête (voir E15) → correspondance stricte par id, lignes parasites loggées et ignorées. |
| [x] | P3 | 🔴 | `PythonBridge.ts:84` | Pas de handler `error` sur stdin : EPIPE = exception non rattrapée = crash du serveur → handler + rejet propre. |
| [x] | P4 | 🟠 | `PythonBridge.ts:37` | Mort du moteur non signalée : room bloquée → `onExit`, la session prévient la room et se retire. |
| [x] | P5 | 🟡 | `PythonBridge.ts:59` | `kill()` SIGTERM seul → SIGKILL de secours. |
| [x] | P6 | 🟡 | `PythonBridge.ts:88` | Buffer stdout non borné → plafond. |
| [x] | P7 | 🟡 | `PythonBridge.ts:118` | Détails internes renvoyés aux clients → message générique, détail dans les logs. |
| [x] | P8 | 🟡 | `index.ts:57` | `ENGINE_PATH` relatif au cwd → relatif à `__dirname`. |
| [x] | P9 | 🟠 | — | Nombre de process Python illimité → plafond global de rooms. |

## Serveur Node — connexions et rooms (C, L, V, S)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | C1 | 🔴 | `RoomManager.ts:368,450` | `void session.handleRosterChange()` : un rejet non rattrapé tue le serveur → await + catch + log. |
| [x] | C2 | 🔴 | `RoomManager.ts:380` | La déconnexion de l'ancien socket efface le mapping du nouveau (rechargement) → le joueur est marqué AFK alors qu'il est connecté → suppression conditionnelle. |
| [x] | C3 | 🔴 | `index.ts:170` | Vol de siège : `join_room` accepte n'importe quel `playerId` (diffusé à tous) et renvoie le rôle de la victime → reconnexion uniquement par `playerUid` secret, jamais diffusé. |
| [x] | C4 | 🔴 | `RoomManager.ts:128` | Joins acceptés pendant l'ordre de table/révélation : quorums impossibles → refus dès que la room n'est plus en attente. |
| [x] | L1 | 🔴 | `RoomManager.ts:360` | Rooms (et process Python) jamais supprimées quand tout le monde ferme l'onglet → suppression après délai de grâce. |
| [x] | L2 | 🟠 | `index.ts:163` | `join_room` sur un code inconnu crée une room → erreur « room introuvable ». |
| [x] | L3 | 🟡 | `RoomManager.ts:362` | `persistedCursor` jamais nettoyé → supprimé avec la room. |
| [x] | L4 | 🟠 | `index.ts:136` | Rejoindre une 2e room laisse le siège de la 1re → on quitte d'abord l'ancienne. |
| [x] | V1 | 🟠 | `index.ts:165` | Code de room non typé ni normalisé au join (« abc » ≠ « ABC ») → normalisation + regex. |
| [x] | V2 | 🟠 | `index.ts:100` | Pseudo sans longueur max (jusqu'à 1 Mo diffusé) → 1–20 caractères, sans caractères de contrôle. |
| [x] | V3 | 🟡 | `index.ts:131` | Payload absent → TypeError ; types non vérifiés → validateur par événement. |
| [x] | V4 | 🟠 | `rulesets.ts:160` | Rulesets custom mal validés (cf. E7) → même validation côté serveur. |
| [x] | V5 | 🟠 | `rulesets.ts:21` | Presets placeholder démarrables (cf. E8) → refusés. |
| [x] | V6 | 🟠 | `RoomManager.ts:250` | Un non-hôte peut écraser le ruleset avant le contrôle d'hôte → contrôle d'abord. |
| [x] | V7 | 🟡 | `index.ts:275` | Contenu de `team` non typé → validé. |
| [x] | S1 | 🟠 | `RoomManager.ts:299` | Double `start_game` : deux sessions, un process Python orphelin → verrou. |
| [x] | S2 | 🟡 | `index.ts:348` | `replay_choice: quit` ne prévient personne → `room_updated` diffusé. |
| [x] | S3 | 🟠 | `events.ts:40` | `PLAYER_LEFT` = même nom que `room_updated` avec un autre payload → événement `player_left` distinct + `room_updated` complet. |
| [x] | S4 | 🟠 | `RoomManager.ts:224` | Rejouer après un départ : room inutilisable → retour au lobby. |
| [x] | S5 | 🟡 | — | Pas de réattribution de l'hôte à la déconnexion → réattribuée. |
| [x] | S6 | 🟠 | `GameSession.ts:587` | `handleAfkForfeit` jamais appelé : un AFK bloque la partie → abandon de sa faction après 60 s. |
| [x] | S7 | 🟡 | `RoomManager.ts:446` | `player_afk` sans `room_updated` → diffusé. |

## Serveur Node — logique de partie (G)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | G1 | 🔴 | `GameSession.ts:419` | Égalité au vote : serveur et moteur désynchronisés, partie bloquée → résultat explicite `approved` du moteur. |
| [x] | G2 | 🔴 | `GameSession.ts:255` | Ré-entrance entre les awaits (double confirmation → rôles retirés, votes envoyés deux fois) → file d'actions sérialisée par session. |
| [x] | G3 | 🟠 | `GameSession.ts:393` | Votes d'un joueur passé AFK comptés dans le quorum → quorum sur les votants actifs. |
| [x] | G4 | 🟠 | `GameSession.ts:413` | État modifié avant l'await, pas de rollback → appliqué après succès du moteur. |
| [x] | G5 | 🟠 | `GameSession.ts:736` | Chef AFK ou parti : personne ne peut proposer → abandon AFK (S6) termine la partie. |
| [x] | G6 | 🟡 | `GameSession.ts:894` | Résultat de mission du resync = faction en tête, pas la dernière mission → corrigé. |
| [x] | G7 | 🟡 | `GameSession.ts:1017` | Deux chemins de fin de mission divergents → dédupliqués. |
| [x] | G8 | 🟠 | `GameSession.ts:714` | Échec de `end_game` : session jamais libérée → libérée dans tous les cas. |
| [x] | G9 | 🟡 | `GameSession.ts:278` | Curseur de chef sauvegardé jamais utilisé, README faux → docs alignées. |
| [x] | G10 | 🟡 | `GameSession.ts:486` | Votes de mission invalides ignorés en silence → erreur explicite. |
| [x] | G11 | 🟡 | `GameSession.ts:333` | Émission possible après dispose → gardé. |

## Serveur Node — transversal (X)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | X1 | 🔴 | `index.ts` | Aucun handler `uncaughtException`/`unhandledRejection` → log + exit(1), relance par Docker. |
| [x] | X2 | 🟠 | `index.ts:461` | Erreurs des handlers jamais loggées côté serveur → log systématique. |
| [x] | X3 | 🟡 | `index.ts:80` | Rate limit silencieux ; env NaN désactive la limite → erreur au client, valeurs par défaut. |
| [x] | X4 | 🟡 | `index.ts:58` | CORS non appliqué aux WebSockets → `allowRequest` vérifie `Origin`. |
| [x] | X5 | 🟡 | `index.ts:405` | Arrêt : timers AFK non vidés, process Python non attendus, exit 0 forcé → corrigé. |

## Client React (K)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | K1 | 🔴 | `App.tsx:540` | Early return avant un `useEffect` (Rules of Hooks) : crash en passant paysage → portrait → early return après les hooks. |
| [x] | K2 | 🔴 | `useGameSocket.ts:236` | Quand un joueur part, tous les autres prennent son id comme `myId` → `myId` jamais écrasé par un `room_updated`. |
| [x] | K3 | 🟠 | `App.tsx:193` | Gagnant de mission recalculé côté client → `result` du serveur. |
| [x] | K4 | 🟠 | `useGameSocket.ts:494` | Resync incomplet (confiance, équipe, ordre de table, « déjà voté », historiques) → resync complet. |
| [x] | K5 | 🔴 | `useGameSocket.ts:201` | Actions bufferisées envoyées avant le rejoin → rejetées → file d'attente vidée après confirmation du rejoin. |
| [x] | K6 | 🔴 | `App.tsx` | Erreurs invisibles sur les écrans de jeu, carte « en attente » permanente → bandeau d'erreur partout, attente annulée. |
| [x] | K7 | 🟠 | `useGameSocket.ts:666` | Create/join optimistes : code sauvegardé avant confirmation (rejoin dans la room d'un autre) → après confirmation seulement. |
| [x] | K8 | 🟠 | `useGameSocket.ts:783` | « Quitter » laisse le joueur bloqué → réinitialisation complète. |
| [x] | K9 | 🟡 | `useGameSocket.ts:312` | Dépendances d'effets incomplètes, listeners recréés à chaque phase → refs. |
| [x] | K10 | 🟡 | `App.tsx:276` | `selectedTeam` jamais remis à zéro, double clic possible → corrigé. |
| [x] | K11 | 🟡 | `useGameSocket.ts:301` | `join_room` en double au montage → un seul. |
| [x] | K12 | 🟡 | — | Aucun état de connexion affiché → bandeau. |
| [x] | K13 | 🟡 | `socket.ts:8` | `VITE_SERVER_URL=""` → `io("")` → `||`. |
| [x] | K14 | 🟡 | `index.html:5` | `user-scalable=no` (accessibilité), polices non chargées, pas de favicon → corrigé. |

## Infra (I)

| | id | grav. | emplacement | problème → correctif |
|---|---|---|---|---|
| [x] | I1 | 🔴 | `docker-compose.yml` | `unless-stopped` → `restart: always` (Docker est déjà activé au boot). |
| [x] | I2 | 🔴 | `nginx.conf:6` | Upstream résolu une seule fois : 502 après redémarrage du serveur → `resolver 127.0.0.11` + variable. |
| [x] | I3 | 🟠 | `nginx.conf` | Pas d'en-têtes de sécurité, `server_tokens` actif, pas de gzip, double `Cache-Control` → corrigé. |
| [x] | I4 | 🟡 | `Dockerfile` | Tests jamais exécutés au build → tests bloquants dans le build. |
| [x] | I5 | 🟡 | — | Pas de git, pas de lint, pas de CI → git, ESLint, `scripts/check.sh`. |
| [x] | I6 | 🟡 | `client/dist`, `server/dist` | Builds locaux périmés → supprimés (ignorés par git). |

## Système de test mis en place

| Couche | Outil | Tests | Commande |
|---|---|---|---|
| Moteur Python | unittest (stdlib) | 41 (règles, validation, protocole stdio) | `python3 -m unittest discover -s gameengine -t .` |
| Serveur | node:test + tsx | 44 (unitaires + e2e avec le vrai moteur et 5 clients socket.io) | `cd server && npm test` |
| Client | Vitest + Testing Library | 22 (parsers, reducer, hook, écrans) | `cd client && npm test` |
| Lint / types | ESLint (typescript-eslint, react-hooks), tsc strict | — | `npm run lint && npm run typecheck` |

`scripts/check.sh` lance tout, puis `docker compose build` : les images Docker ne se construisent
que si les tests passent.

## Vérification finale

- Stack Docker reconstruite et redéployée : deux conteneurs healthy, en-têtes de sécurité servis.
- Relance automatique vérifiée : process Node tué dans le conteneur → redémarrage par Docker,
  nginx retrouve le serveur sans être relancé.
- Partie complète à 5 joueurs jouée contre la stack déployée via nginx (rejet → même chef,
  4 missions, rechargement en plein vote avec restauration du « déjà voté », fin de partie,
  revanche), sans aucune erreur dans les logs.
- Test dans un vrai navigateur (claude-in-chrome) non effectué : extension non connectée dans
  cette session.

---

# v2 — comptes, amis, logs, modération (2026-09-23)

Nouvelles surfaces introduites et mesures prises :

| Risque | Mesure |
|---|---|
| Vol de mots de passe | argon2id (paramètres OWASP), jamais stockés en clair ; temps de réponse identique pour un email inconnu. |
| Brute force (connexion, codes) | Limites Redis par IP et par email ; codes à 6 chiffres stockés hachés, 15 min, 5 essais, renvoi limité à 1/min. |
| Énumération des comptes | « Mot de passe oublié » répond toujours pareil. L'inscription indique un email déjà pris (compromis UX assumé). |
| Vol de session | Id opaque de 256 bits, cookie `HttpOnly; Secure; SameSite=Lax`, expiration glissante de 30 jours, révocation globale au changement de mot de passe et à la suppression du compte. |
| CSRF | SameSite=Lax + contrôle de l'`Origin` sur toute requête qui modifie des données. |
| Prise de compte via Google | PKCE + `state` ; l'`id_token` est vérifié (signature JWKS, émetteur, audience, email vérifié). Un compte jamais validé qui porte le même email perd son mot de passe quand le vrai propriétaire se connecte. |
| Fuite des logs | Deux utilisateurs Mongo cloisonnés : `app` n'a aucun accès aux logs, `logger` ne peut rien supprimer et ne voit pas les comptes. Aucune route n'expose les logs. Vérifié par `scripts/integration.sh`. |
| Exposition des bases | Mongo et Redis sans port publié, authentification obligatoire, secrets dans `.env` (ignoré par git, droits 600). |
| Vie privée des stats | Profil visible seulement par soi et ses amis acceptés ; l'email n'est jamais montré aux amis. |
| Harcèlement dans le chat | Filtre de termes (masquage), signalements, dossiers pseudonymisés avec levée d'identité tracée, bannissement ; limites de débit sur le chat, les signalements et les invitations. |
| XSS via le chat | Texte rendu comme texte React, caractères de contrôle et bidi retirés côté serveur, 200 caractères max. |
| Rétention (RGPD) | Logs anonymisés à 12 mois (tâche quotidienne), suppression de compte en libre-service, politique décrite sur `/mentions-legales`. |
| Indisponibilité de Mongo/Redis | Les parties invitées continuent ; l'API répond 503 et les comptes reviennent tout seuls avec la base. |
| Adapter Redis de Socket.IO | Désactivé par défaut (`SOCKET_REDIS_ADAPTER`) : sans multi-instance, il n'apporte rien et une panne Redis ne doit jamais couper les parties. |

Tests ajoutés : 15 unitaires côté serveur (comptes, filtre, logs, anonymisation, pseudonymisation), un e2e complet (API, cookies, amis, présence, invitation, chat modéré, signalement, partie avec des comptes, stats, suppression de compte), 7 côté client (menu, chat, pages, routeur), et des tests visuels Playwright en 6 tailles d'écran plus un test PWA.


---

# v3 — ouverture au public (2026-09-23)

| Sujet | Mesure |
|---|---|
| Fiabilité | CI GitHub Actions (moteur, serveur, client, images Docker), `/api/health` pour la surveillance, sauvegardes quotidiennes avec rotation. |
| Formats 4 à 11 joueurs | Seuil de victoire (joueurs ÷ 2) + 1, juste assez de missions, équipes jamais plus grandes que le nombre de communistes (validé côté moteur et serveur). |
| Rooms publiques | Réservées aux comptes (bannissements efficaces), chat toujours actif, liste limitée aux rooms au salon et non pleines. |
| Contrôles de l'hôte | Exclusion définitive de la room (secret de reconnexion et compte bloqués), transfert d'hôte, changement de mode, uniquement au salon. |
| Double authentification joueurs | TOTP facultatif, défi de connexion à usage unique (5 min), codes non rejouables, 5 essais / 15 min, aussi après Google. |
| Changement d'email | Mot de passe actuel exigé, code envoyé à la nouvelle adresse, ancienne adresse prévenue. |
| Mesure d'audience | Sans cookie ni tiers : HyperLogLog d'empreintes salées (sel quotidien en mémoire uniquement), chemins normalisés sans identifiants, robots ignorés, Do Not Track et opposition respectés. |
| Bugs corrigés trouvés par les tests de bout en bout | Stats perdues quand tout le monde quittait depuis l'écran de fin (enregistrement dès que le vainqueur est connu, parties abandonnées tracées comme annulées) ; lien d'invitation parfois ignoré pour un joueur connecté (demande d'entrée renvoyée à la connexion au lieu du tampon Socket.IO) ; salle d'attente et carte débordant de l'écran sur petits téléphones. |

---

# v4 — notifications, absences, nouveaux formats (2026-09-23)

| Sujet | Mesure |
|---|---|
| Notifications Web Push | Clés VAPID, abonnement gardé en mémoire le temps de la room seulement, envoi limité aux services de push des navigateurs (Apple, Google, Mozilla, Microsoft) pour éviter toute requête du serveur vers une adresse arbitraire, texte neutre qui ne révèle jamais de rôle. Envoyées uniquement aux joueurs dont l'écran est caché ou déconnectés. |
| Absences en partie | Compte à rebours de 60 s, attente de 5 min au choix des autres joueurs, avertissement 20 s avant l'abandon. Retour par la notification dans un onglet neuf : le dernier siège est retrouvé (secret gardé 6 h dans le navigateur). |
| Bugs corrigés | Un joueur absent avant la distribution des rôles restait dans l'ordre des chefs et pouvait bloquer la partie : elle est désormais annulée (retour au salon). Un joueur revenant après la fin d'une partie recevait une erreur : la room l'accueille de nouveau. |
| Formats | Retour du format à 3 joueurs ; duel à 2 joueurs (règles : `docs/REGLES.md` v0.4 puis v0.5), implémenté dans le moteur Python comme les missions. |
| Client | Traduction anglaise, bannière de soutien Ko-fi (stockage local uniquement, aucun traceur ni script tiers). |

Tests : moteur 48, serveur 84, client 70, Playwright 11 (dont absence avec attente et retour, et duel avec revanche).

---

# v5 — audit de sécurité (2026-09-23)

Relecture complète (comptes et API, temps réel et fuites d'information, bases de données, client, infrastructure) et corrections :

| Gravité | Problème | Correction |
|---|---|---|
| Haute | À l'inscription, un compte en attente de validation pouvait recevoir un autre mot de passe par quiconque connaissait l'email ; la victime validait ensuite le compte de l'attaquant. | Rien n'est écrit sur un compte avant la validation : l'inscription en attente vit dans Redis, liée à un cookie `HttpOnly; SameSite=Strict` que seul le navigateur qui s'inscrit détient. |
| Haute | Codes email (validation, réinitialisation) : la limite de 5 essais se contournait par des requêtes simultanées et en redemandant un code chaque minute. | Compteurs atomiques (`INCR`), budget de 20 essais par email et par 24 h même en redemandant des codes, limite par IP sur les routes à code. |
| Haute | Un même socket pouvait occuper plusieurs sièges d'une room ; les sièges fantômes ne se déconnectaient jamais et bloquaient la room, puis toutes les rooms du serveur. | Un socket n'occupe qu'un siège : un second join reprend le premier. |
| Moyenne | Limites de débit par IP contournables en falsifiant les en-têtes d'IP quand le site était joint sans passer par Cloudflare. | Port web publié sur la boucle locale uniquement, `X-Forwarded-For` n'accepte plus la chaîne du client, limite de connexion par email indépendante de l'IP. |
| Moyenne | Connexion Google : l'état OAuth n'était pas lié au navigateur (« login CSRF »). | Cookie d'état `HttpOnly` vérifié au retour de Google. |
| Moyenne | Aucune limite par client : quelques centaines de sockets suffisaient à remplir le serveur ; codes de room courts (16 millions) devinables. | 30 connexions simultanées par IP, 60 créations de room par heure et par IP, 20 codes inexistants par IP sur 10 min ; codes de 8 caractères sur 32 (sans 0/O, 1/I). |
| Moyenne | Bibliothèques Socket.IO et `ws` vulnérables (déni de service, fuite de mémoire). | Mises à jour (`npm audit` : 0 vulnérabilité en production). |
| Basse | Un bannissement ne coupait pas les sessions ouvertes. | Sessions supprimées et sockets du compte déconnectés au bannissement. |
| Basse | Mise en attente d'un absent renouvelable sans fin ; pseudos usurpables ; un dossier de modération par message signalé. | 3 mises en attente par absence au plus, pseudo unique dans la room et pseudo du compte non modifiable, un dossier par joueur et par room toutes les 10 min. |
| Info | CSP `connect-src` ouverte à tout hôte WebSocket, pas de HSTS. | `connect-src` limité au site, HSTS (1 an) et `Cross-Origin-Opener-Policy` ; `nosniff` sur l'API ; Socket.IO n'accepte que l'origine du site. |

Vérifié sans problème : aucune fuite de rôle ou de vote secret (émissions, resync, duel), aucun secret de reconnexion ni userId diffusé, pas d'injection d'opérateurs Mongo, utilisateurs Mongo cloisonnés, bases non exposées, pas de secret dans l'historique Git, sessions et mots de passe (argon2id), TOTP, CSRF par contrôle de l'`Origin`, push limité aux services des navigateurs, aucun rendu HTML de texte utilisateur.

Limites assumées : un invité exclu peut revenir avec une nouvelle identité (bloquer l'IP exclurait aussi ses voisins de table sur le même Wi-Fi) ; la double authentification se bloque 15 min après 5 codes faux, y compris pour le propriétaire si son mot de passe est connu d'un tiers (il doit alors le changer).

---

# v6 — modération sans censure et rôle modérateur (2026-09-23)

| Sujet | Choix |
|---|---|
| Liberté d'expression | Plus aucun masquage dans le chat : un terme signalé ouvre seulement un dossier pseudonymisé, vérifié à la main. |
| Liste des termes | Rangée par catégorie (racisme, antisémitisme, homophobie, validisme, menaces, incitation au suicide, harcèlement sexuel) ; coordonnées personnelles (téléphone, email) détectées à part. Le vocabulaire du jeu et les insultes courantes entre amis ne sont pas signalés, pour ne pas noyer les modérateurs. |
| Rôle modérateur | Nommé par l'admin depuis le panel. Double authentification obligatoire. Accès limité aux signalements, comptes et parties anonymes ; bannissements de 30 jours au plus ; ne peut sanctionner ni l'admin ni un autre modérateur. Chaque action (consultation, levée d'anonymat, avertissement, bannissement, nomination) est tracée avec son auteur. |

---

# v7 — panel de modération séparé (2026-09-23)

| Sujet | Choix |
|---|---|
| Séparation | Panel de modération (`/moderation`, modérateurs et admin) distinct du panel admin (admin seul). |
| Anonymat | Le modérateur ne voit que « Joueur A, B… », le type de participant (compte ou invité), le nombre de sanctions déjà reçues et une éventuelle restriction en cours. Il ne peut plus lever l'anonymat. |
| Application | Le modérateur choisit une conséquence par pseudonyme ; le serveur retrouve la personne et l'applique (avertissement, mute 1 h / 24 h, ban du chat 7 / 30 j), et prévient le joueur. Les invités ne peuvent pas recevoir de sanction durable. |
| Ban définitif | Seulement sur demande d'un modérateur, décidée par l'admin avec accès au dossier et à la personne ; sessions fermées tout de suite. L'admin peut abroger un ban définitif et lever toutes les sanctions d'un compte. |
| Traçabilité | Chaque action est inscrite au journal du dossier ou du compte, avec son auteur. |

---

# Test de charge (2026-09-23)

Instance de test isolée (vrai moteur Python, stockage en mémoire) sur la machine de prod : i7-6820HQ, 4 cœurs / 8 threads, 15 Go de RAM (dont ~7 Go libres, le reste occupé par d'autres services). Parties à 5 joueurs jouées par des robots, chacun avec sa propre IP, 400 ms de réflexion en moyenne entre deux actions (environ 140 fois plus vite que des humains). Scripts : `server/loadtest/`.

| Parties simultanées | Joueurs | Actions / s | Latence p50 / p95 / p99 | CPU du serveur Node | RAM Node | RAM moteur Python |
|---|---|---|---|---|---|---|
| 10 | 50 | 95 | 3 / 4 / 6 ms | ~8 % d'un cœur | 166 Mo | 145 Mo |
| 50 | 250 | 476 | 2 / 4 / 12 ms | ~20 % | 147 Mo | 0,7 Go |
| 100 | 500 | 952 | 1 / 6 / 15 ms | ~30 % | 240 Mo | 1,4 Go |
| 150 | 750 | 1 433 | 1 / 9 / 22 ms | ~35 % | 265 Mo | 2,1 Go |
| 200 | 1 000 | 1 894 | 1 / 20 / 53 ms | ~45 % | 285 Mo | 2,8 Go |

Aucune erreur. Le coût principal est la **mémoire du moteur** : un processus Python par partie, environ 14 Mo chacun. Le processeur est loin d'être saturé, d'autant que des humains jouent beaucoup moins vite que ces robots. Plafond actuel : `MAX_ROOMS=200` (réglable) et la RAM libre de la machine (environ 400 parties au maximum). Non mesuré ici : MongoDB et Redis (écritures en fin de partie seulement), la connexion internet de la machine et le tunnel Cloudflare.

## Moteur partagé (2026-09-24)

Avant : un process Python par partie (~14 Mo chacun, surtout l'interpréteur), soit 2,8 Go pour
200 parties. Désormais `EnginePool` répartit les parties sur `ENGINE_WORKERS` process (4 par
défaut) ; chaque requête porte l'identifiant de sa partie (`session`) et l'état de chaque partie
reste isolé dans son propre `EngineBridge`. Un crash n'interrompt que les parties du process
concerné ; un process sans partie s'arrête au bout d'une minute.

Même protocole que ci-dessus (robots ~140 fois plus rapides que des humains) :

| Parties simultanées | Joueurs | Actions / s | Latence p50 / p95 / p99 | CPU Node | RAM Node | RAM Python (total) |
|---|---|---|---|---|---|---|
| 100 | 500 | 950 | 2 / 4 / 6 ms | ~25 % | 190 Mo | 59 Mo |
| 200 | 1 000 | 1 906 | 1 / 4 / 7 ms | ~45 % | 280 Mo | 59 Mo |
| 400 | 2 000 | 3 820 | 1 / 5 / 10 ms | ~55 % | 350 Mo | 60 Mo |
| 600 | 3 000 | 5 732 | 1 / 6 / 10 ms | ~73 % | 430 Mo | 60 Mo |

Zéro erreur à tous les paliers. La RAM n'est plus la limite (≈ 0,6 Mo par partie côté Node) ;
la prochaine limite est un cœur de CPU pour Node, loin d'être atteinte au rythme d'humains.
`MAX_ROOMS` passe de 200 à 1 000 par défaut.
