# syntax=docker/dockerfile:1
# Build context : racine du projet (docker build -f server/Dockerfile .)

# ---------- deps : dépendances complètes (build + tests) ----------
FROM node:24-slim AS deps
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci

# ---------- build : compilation TypeScript (sans les tests) ----------
FROM deps AS build
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build

# ---------- prod-deps : dépendances runtime uniquement ----------
FROM node:24-slim AS prod-deps
WORKDIR /build
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- base : Python 3.12 + binaire Node ----------
FROM python:3.12-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini libstdc++6 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=node:24-slim /usr/local/bin/node /usr/local/bin/node
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ---------- test : moteur + serveur (unitaires et e2e avec le vrai moteur) ----------
# Une image n'est produite que si toute la suite passe.
FROM base AS test
WORKDIR /app
COPY gameengine_entry.py ./
COPY gameengine ./gameengine
RUN python3 -m unittest discover -s gameengine -t .
COPY --from=deps /build/node_modules ./server/node_modules
COPY server/package.json server/tsconfig.json ./server/
COPY server/src ./server/src
WORKDIR /app/server
RUN LOG_LEVEL=silent node_modules/.bin/tsx --test 'src/**/*.test.ts' && touch /tests-passed

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PYTHON_PATH=python3 \
    ENGINE_PATH=/app/gameengine_entry.py

WORKDIR /app
COPY --from=test /tests-passed /tmp/tests-passed
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
