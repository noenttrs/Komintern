#!/usr/bin/env bash
# Lance l'instance de test, le relevé système et la montée en charge ; écrit tout dans loadtest/out/.
set -u
cd "$(dirname "$0")/.."
mkdir -p loadtest/out
npx tsx loadtest/server.ts > loadtest/out/server.jsonl 2> loadtest/out/server.err &
SERVER=$!
# Toujours arrêter l'instance de test, même si la montée en charge échoue (sinon elle garde le port).
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 5
( while kill -0 $SERVER 2>/dev/null; do
    py=$(ps -eo rss,args | awk '/gameengine_entry.py/ && !/awk/ {s+=$1; n++} END {printf "%d %d", n, s/1024}')
    echo "{\"t\":$(date +%s%3N),\"python\":\"$py\",\"load1\":\"$(cut -d' ' -f1 /proc/loadavg)\",\"memAvailMb\":$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)}"
    sleep 5
  done ) > loadtest/out/system.jsonl &
STAGES="${STAGES:-10,25,50,100,150,200}" STAGE_SECONDS="${STAGE_SECONDS:-60}" npx tsx loadtest/driver.ts > loadtest/out/driver.jsonl 2> loadtest/out/driver.err
kill $SERVER
echo finished >> loadtest/out/driver.jsonl
