#!/usr/bin/env bash
# Sauvegarde horodatée des bases Mongo (comptes, amis, stats, logs, modération).
# Usage : scripts/backup.sh [dossier]   (par défaut ./backups, ignoré par git)
# Restauration : docker compose exec -T mongo sh -c 'mongorestore --archive --gzip -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < fichier
set -euo pipefail
cd "$(dirname "$0")/.."
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/mongo-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T mongo sh -c 'mongodump --archive --gzip -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$file"
chmod 600 "$file"
echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"
