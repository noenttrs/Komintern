#!/usr/bin/env bash
# Vérifie les bases réelles de la stack Docker : cloisonnement Mongo, Redis, non-exposition.
# Usage : scripts/integration.sh   (la stack doit tourner : docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "ÉCHEC : $1" >&2; exit 1; }
mongo_as() { # utilisateur, mot de passe (variable du conteneur), base, script
  docker compose exec -T mongo sh -c "mongosh --quiet -u $1 -p \"\$$2\" --authenticationDatabase $3 $3 --eval '$4'"
}

echo "==> Mongo : l'utilisateur applicatif n'a aucun accès aux logs"
out=$(mongo_as app MONGO_APP_PASSWORD nazicom 'try { db.getSiblingDB("nazicom_logs").games.findOne(); print("LEAK") } catch (e) { print("DENIED") }')
[[ "$out" == *DENIED* ]] || fail "l'utilisateur app lit les logs"

echo "==> Mongo : l'utilisateur des logs ne peut ni supprimer ni lire les comptes"
out=$(mongo_as logger MONGO_LOG_PASSWORD nazicom_logs 'try { db.games.deleteMany({ _id: "__none__" }); print("CAN_DELETE") } catch (e) { print("NO_DELETE") }; try { db.getSiblingDB("nazicom").users.findOne(); print("LEAK") } catch (e) { print("DENIED") }')
[[ "$out" == *NO_DELETE* && "$out" == *DENIED* ]] || fail "droits de l'utilisateur logger trop larges : $out"

echo "==> Redis : authentification obligatoire"
out=$(docker compose exec -T redis redis-cli ping 2>&1 || true)
[[ "$out" == *NOAUTH* ]] || fail "Redis répond sans mot de passe"

echo "==> Aucun port de base de données publié sur l'hôte"
if ss -ltn | grep -qE ':(27017|6379)\b'; then fail "Mongo ou Redis écoute sur l'hôte"; fi

echo "==> Serveur : API joignable via nginx"
curl -fsS http://localhost:8080/api/config >/dev/null || fail "/api/config injoignable"

echo "Intégration OK."
