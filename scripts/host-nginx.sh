#!/usr/bin/env bash
# Configure le nginx de l'hôte (port 80) pour relayer vers la stack Docker Komintern (:8080).
# Usage : sudo bash scripts/host-nginx.sh
set -euo pipefail

SITE=/etc/nginx/sites-available/cinquieme-colonne
[[ -f "$SITE" ]] && cp "$SITE" "$SITE.bak.$(date +%Y%m%d%H%M%S)"

cat > "$SITE" <<'CONF'
# Relaie tout vers le conteneur web Komintern (:8080), qui sert le client
# et relaie lui-même /socket.io/ vers le serveur de jeu.
map $http_upgrade $komintern_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $komintern_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
CONF

ln -sf "$SITE" /etc/nginx/sites-enabled/cinquieme-colonne
nginx -t
systemctl reload nginx
echo "OK : le port 80 relaie vers Komintern (:8080)"
