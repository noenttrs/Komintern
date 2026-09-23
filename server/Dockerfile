# syntax=docker/dockerfile:1
# Build context : racine du projet (docker build -f server/Dockerfile .)

# ---------- deps : dépendances complètes (build) ----------
FROM node:24-slim AS deps
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci

# ---------- build : compilation TypeScript ----------
FROM deps AS build
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && rm -f dist/*.test.js

# ---------- prod-deps : dépendances runtime uniquement ----------
FROM node:24-slim AS prod-deps
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime : Python 3.12 + binaire Node ----------
FROM python:3.12-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini libstdc++6 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=node:24-slim /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    PYTHON_PATH=python3 \
    ENGINE_PATH=/app/gameengine_entry.py

WORKDIR /app
# Moteur de jeu (change rarement) puis serveur
COPY gameengine_entry.py ./
COPY gameengine ./gameengine
COPY --from=prod-deps /build/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY --from=build /build/dist ./server/dist

WORKDIR /app/server
USER app
EXPOSE 3000


ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
