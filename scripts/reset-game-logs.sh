#!/usr/bin/env bash
# Remise à zéro des logs de parties (lancement du site, ou cas de force majeure).
# À lancer uniquement sur le serveur, dans un terminal : aucune route web ni option pour le faire
# sans confirmation écrite. Une sauvegarde complète est faite juste avant.
#
# Usage : scripts/reset-game-logs.sh [--moderation] [--stats]
#   (sans option)  efface les logs de parties (nazicom_logs.games)
#   --moderation   efface aussi les dossiers de modération, leurs identités et leur journal d'audit
#   --stats        remet aussi à zéro les statistiques des comptes (victoires, défaites, camps)
# Les comptes, amitiés et sessions ne sont jamais touchés.
set -euo pipefail
cd "$(dirname "$0")/.."

moderation=false
stats=false
for arg in "$@"; do
  case "$arg" in
    --moderation) moderation=true ;;
    --stats) stats=true ;;
    *) echo "Option inconnue : $arg" >&2; exit 2 ;;
  esac
done

if [[ ! -t 0 ]]; then
  echo "Refusé : cette commande doit être lancée dans un terminal interactif (confirmation écrite)." >&2
  exit 1
fi

mongo() {
  docker compose exec -T mongo sh -c "mongosh --quiet -u root -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin --eval '$1'" < /dev/null
}

logs='db.getSiblingDB("nazicom_logs")'
echo "État actuel :"
echo "  parties enregistrées      : $(mongo "print($logs.games.countDocuments({}))")"
if $moderation; then
  echo "  dossiers de modération    : $(mongo "print($logs.moderation_cases.countDocuments({}))")"
fi
if $stats; then
  echo "  comptes (stats remises à 0) : $(mongo 'print(db.getSiblingDB("nazicom").users.countDocuments({}))')"
fi
echo
echo "Seront effacés : logs de parties$($moderation && echo ", dossiers de modération (identités et audit compris)")$($stats && echo ", statistiques des comptes")."
echo "Cette action est définitive (une sauvegarde est faite juste avant)."
phrase="EFFACER LES LOGS DE PARTIES"
read -r -p "Pour confirmer, tapez exactement « $phrase » : " answer
if [[ "$answer" != "$phrase" ]]; then
  echo "Confirmation incorrecte : rien n'a été effacé."
  exit 1
fi

echo "Sauvegarde préalable…"
scripts/backup.sh < /dev/null

mongo "$logs.games.deleteMany({})" > /dev/null
echo "Logs de parties effacés."
if $moderation; then
  mongo "$logs.moderation_cases.deleteMany({}); $logs.moderation_identities.deleteMany({}); $logs.moderation_audit.deleteMany({})" > /dev/null
  echo "Dossiers de modération effacés."
fi
if $stats; then
  mongo 'db.getSiblingDB("nazicom").users.updateMany({}, { $set: { stats: { wins: 0, losses: 0, gamesNazi: 0, gamesCommunist: 0, winsNazi: 0, winsCommunist: 0 } } })' > /dev/null
  echo "Statistiques des comptes remises à zéro."
fi
echo "$(date -Iseconds) reset-game-logs moderation=$moderation stats=$stats" >> backups/reset.log
echo "Terminé. Trace : backups/reset.log"
