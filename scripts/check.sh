#!/usr/bin/env bash
# Vérification complète du projet : lint, types, tests (moteur, serveur, client), build Docker.
# Usage : scripts/check.sh [--no-docker]
set -euo pipefail

# Pas de sudo : Node vient de nvm (absent du PATH de root) et les fichiers créés
# appartiendraient à root. L'utilisateur est déjà dans le groupe docker.
if [[ "$(id -u)" -eq 0 ]]; then
  echo "Lancez ce script sans sudo : scripts/check.sh" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "Moteur Python : tests"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s gameengine -t .

step "Serveur : lint, types, tests (unitaires + e2e avec le vrai moteur)"
(cd server && npm run --silent lint && npm run --silent typecheck && LOG_LEVEL=silent npm test --silent)

step "Client : lint, types, tests"
(cd client && npm run --silent lint && npm run --silent typecheck && npm test --silent)

if [[ "${1:-}" != "--no-docker" ]]; then
  step "Docker : build des images (les tests y sont rejoués)"
  docker compose build
fi

printf '\n\033[1;32mTout est vert.\033[0m\n'
