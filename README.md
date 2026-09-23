# Nazi Communiste

Jeu de déduction sociale en ligne : une minorité de nazis contre une majorité de communistes, chacun sur son téléphone.
En ligne sur **https://fascismwontget.me**. Règles : [`regles_v0.1.md`](regles_v0.1.md).

## Architecture

```
navigateur ──HTTPS──▶ Cloudflare ──tunnel──▶ cloudflared ──▶ web (nginx, client React/PWA)
                                                              ├─ /socket.io ─▶ server (Node, Socket.IO) ─▶ moteur Python (1 process / partie)
                                                              └─ /api ───────▶ server (Express)
                                                                                 ├─ MongoDB : comptes, amis, stats (utilisateur `app`)
                                                                                 │            logs de parties, modération (utilisateur `logger`)
                                                                                 └─ Redis   : sessions, codes email, présence, limites de débit
```

- `gameengine/`, `gameengine_entry.py` : règles du jeu (Python, NDJSON sur stdin/stdout).
- `server/` : parties en temps réel, API des comptes, modération. Voir [`server/README.md`](server/README.md).
- `client/` : interface React (menu refermable, pages profil, amis, chat), installable en web app.
- `infra/mongo-init.js` : création des deux utilisateurs Mongo cloisonnés, au premier démarrage.
- Les parties en cours vivent en mémoire. Tout le reste est dans MongoDB, dans le volume Docker `mongo-data`.

Une seule instance du serveur suffit pour plusieurs centaines de parties simultanées (`MAX_ROOMS`, 200 par défaut). Le jour où il en faudra plusieurs :
- `SOCKET_REDIS_ADAPTER=true` partage les diffusions Socket.IO ;
- il restera à router chaque room vers l'instance qui l'héberge, par exemple avec un routage collant par code de room.

## Mise en route

```bash
cp .env.example .env        # puis remplir : mots de passe (openssl rand -hex 24), PUBLIC_URL, etc.
docker compose up -d --build
```

Tous les conteneurs redémarrent automatiquement (`restart: always`). MongoDB et Redis ne publient aucun port sur l'hôte.

### Emails (Resend)

Sans clé, les codes de validation sont écrits dans les logs du serveur (`docker compose logs server`) : pratique pour tester, pas pour le public.

1. Crée un compte sur https://resend.com, puis va dans **Domains** et clique sur **Add domain** : `fascismwontget.me`.
2. Ajoute dans Cloudflare, onglet DNS, les enregistrements affichés par Resend (MX, SPF en TXT, DKIM en TXT), **en « DNS only »** (nuage gris).
3. Une fois le domaine vérifié : dans **API Keys**, crée une clé (accès « Sending »), puis dans `.env` :
   `RESEND_API_KEY=re_...` et `EMAIL_FROM="Nazi Communiste <noreply@fascismwontget.me>"`.
4. `docker compose up -d server`

### Connexion Google

1. Sur https://console.cloud.google.com, crée un projet, puis va dans **APIs & Services** et **OAuth consent screen** : type « External », nom « Nazi Communiste », email de contact, scopes `openid`, `email`, `profile`.
2. Toujours dans **APIs & Services**, ouvre **Credentials**, clique sur **Create credentials** puis **OAuth client ID** et choisis le type « Web application » :
   - Authorized JavaScript origins : `https://fascismwontget.me`
   - Authorized redirect URIs : `https://fascismwontget.me/api/auth/google/callback`
3. Dans `.env` : `GOOGLE_CLIENT_ID=...` et `GOOGLE_CLIENT_SECRET=...`, puis `docker compose up -d server`.
4. Publie l'écran de consentement (« Publish app ») pour ouvrir la connexion à tous.

### Mentions légales

Renseigne `LEGAL_EDITOR_NAME` et `LEGAL_CONTACT_EMAIL` dans `.env`. Tant qu'ils sont vides, la page `/mentions-legales` affiche un avertissement.

## Modération

Deux déclencheurs ouvrent un dossier **pseudonymisé** (« Joueur A, B… ») :
- un message du chat contenant un terme de `server/moderation/flagged-words.txt` (le message est diffusé masqué) ;
- un signalement de joueur (⚑ sur un message).

Le lien avec les personnes est stocké à part, et chaque consultation est tracée. Les dossiers se traitent en ligne de commande, uniquement depuis le serveur :

```bash
docker compose exec server node dist/moderation/cli.js list open
docker compose exec server node dist/moderation/cli.js show <caseId>      # conversation pseudonymisée
docker compose exec server node dist/moderation/cli.js reveal <caseId>    # identités (tracé)
docker compose exec server node dist/moderation/cli.js resolve <caseId> avertissement envoyé
docker compose exec server node dist/moderation/cli.js ban <userId> 7     # 0 = lever
```

Les logs de parties sont conservés sans limite de durée. Ils sont anonymisés au bout de 12 mois (`LOG_ANONYMIZE_AFTER_DAYS`), sauf ceux liés à un dossier ouvert.

## Sauvegardes

```bash
scripts/backup.sh            # backups/mongo-AAAAMMJJ-HHMMSS.archive.gz (ignoré par git)
```

Pour restaurer :

```bash
docker compose exec -T mongo sh -c 'mongorestore --archive --gzip -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < fichier
```

## Tests

```bash
scripts/check.sh             # tout : lint, types, tests moteur, serveur, client, build Docker, intégration
scripts/check.sh --no-docker # sans Docker
scripts/integration.sh       # cloisonnement Mongo, Redis, ports (stack lancée)
# Captures responsive et PWA contre le site en ligne (Playwright dans Docker, sans dépendances système) :
cd client && docker run --rm --network host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble npx playwright test
```

Les images Docker ne se construisent que si les tests passent.
