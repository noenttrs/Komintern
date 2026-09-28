#!/usr/bin/env bash
# Déploie la version de test depuis la branche dev (dossier de travail préparé par dev-setup.sh).
# Usage : scripts/deploy-dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PROD_DIR="$PWD"
DEV_DIR="${DEV_DIR:-$PROD_DIR/../Komintern-dev}"
cd "$DEV_DIR"
git pull --ff-only origin dev 2>/dev/null || echo "(branche dev locale, pas de mise à jour distante)"
docker compose -f docker-compose.dev.yml --env-file "$PROD_DIR/.env.dev" up -d --build
docker compose -f docker-compose.dev.yml --env-file "$PROD_DIR/.env.dev" ps --format '{{.Name}} {{.Status}}'
