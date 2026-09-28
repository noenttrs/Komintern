#!/usr/bin/env bash
# Prépare la version de test, une fois : dossier de travail de la branche dev, utilisateurs Mongo
# dédiés (droits limités aux bases nazicom_dev*) et fichier .env.dev (secrets de la version de test).
# Usage : scripts/dev-setup.sh   (depuis le dossier de production)
set -euo pipefail
cd "$(dirname "$0")/.."
PROD_DIR="$PWD"
DEV_DIR="${DEV_DIR:-$PROD_DIR/../Komintern-dev}"
ENV_DEV="$PROD_DIR/.env.dev"

# 1. Dossier de travail sur la branche dev (créée depuis main si elle n'existe pas).
if [[ ! -d "$DEV_DIR" ]]; then
  if git show-ref --verify --quiet refs/heads/dev; then git worktree add "$DEV_DIR" dev; else git worktree add -b dev "$DEV_DIR" main; fi
fi

# 2. .env.dev : secrets partagés repris de .env, mots de passe Mongo propres à la version de test.
value() { grep -E "^$1=" "$PROD_DIR/.env" | head -1 | cut -d= -f2-; }
if [[ ! -f "$ENV_DEV" ]]; then
  umask 077
  {
    echo "# Version de test (dev.fascismwontget.me) — généré par scripts/dev-setup.sh, jamais versionné."
    echo "PUBLIC_URL=https://dev.fascismwontget.me"
    echo "MONGO_APP_DEV_PASSWORD=$(openssl rand -hex 24)"
    echo "MONGO_LOG_DEV_PASSWORD=$(openssl rand -hex 24)"
    for key in REDIS_PASSWORD RESEND_API_KEY EMAIL_FROM GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY LEGAL_EDITOR_NAME LEGAL_CONTACT_EMAIL DONATION_URL TEST_ROOM_PREFIX; do
      echo "$key=$(value "$key")"
    done
  } > "$ENV_DEV"
  echo "Créé : $ENV_DEV"
fi
APP_PW=$(grep -E "^MONGO_APP_DEV_PASSWORD=" "$ENV_DEV" | cut -d= -f2-)
LOG_PW=$(grep -E "^MONGO_LOG_DEV_PASSWORD=" "$ENV_DEV" | cut -d= -f2-)

# 3. Utilisateurs Mongo de la version de test (mêmes droits que ceux de la production, sur ses bases).
docker compose exec -T -e APP_PW="$APP_PW" -e LOG_PW="$LOG_PW" mongo sh -c 'mongosh --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "
const app = db.getSiblingDB(\"nazicom_dev\");
if (app.getUser(\"app_dev\") === null) app.createUser({ user: \"app_dev\", pwd: process.env.APP_PW, roles: [{ role: \"readWrite\", db: \"nazicom_dev\" }] });
const logs = db.getSiblingDB(\"nazicom_dev_logs\");
if (logs.getRole(\"logWriter\") === null) logs.createRole({ role: \"logWriter\", privileges: [{ resource: { db: \"nazicom_dev_logs\", collection: \"\" }, actions: [\"find\", \"insert\", \"update\", \"createIndex\", \"listIndexes\", \"listCollections\", \"createCollection\"] }], roles: [] });
if (logs.getUser(\"logger_dev\") === null) logs.createUser({ user: \"logger_dev\", pwd: process.env.LOG_PW, roles: [{ role: \"logWriter\", db: \"nazicom_dev_logs\" }] });
print(\"utilisateurs Mongo de la version de test : prêts\");
"'
echo "Ensuite : scripts/deploy-dev.sh"
