#!/usr/bin/env bash
# Déploie la production depuis main (après validation sur la version de test).
# Usage : scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git checkout main
git pull --ff-only origin main
docker compose up -d --build
docker compose ps --format '{{.Name}} {{.Status}}'
