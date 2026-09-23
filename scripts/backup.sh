#!/usr/bin/env bash
# Sauvegarde horodatée des bases Mongo (comptes, amis, stats, logs, modération).
# Usage : scripts/backup.sh [dossier]   (par défaut ./backups, ignoré par git)
# Rotation : les sauvegardes de plus de BACKUP_KEEP_DAYS jours (14 par défaut) sont supprimées.
# Copie hors machine (facultative) : si BACKUP_RCLONE_REMOTE est défini (ex. « r2:komintern-backups »),
# l'archive est aussi envoyée avec rclone.
# Restauration : docker compose exec -T mongo sh -c 'mongorestore --archive --gzip -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < fichier
set -euo pipefail
cd "$(dirname "$0")/.."
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/mongo-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose exec -T mongo sh -c 'mongodump --archive --gzip -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$file"
chmod 600 "$file"
echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"

find "$dir" -name 'mongo-*.archive.gz' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete

if [[ -n "${BACKUP_RCLONE_REMOTE:-}" ]]; then
  rclone copy "$file" "$BACKUP_RCLONE_REMOTE" && echo "Copie hors machine : $BACKUP_RCLONE_REMOTE"
fi
