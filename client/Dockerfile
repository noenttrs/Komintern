# syntax=docker/dockerfile:1

# ---------- build : bundle Vite ----------
FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Lint, types et tests bloquent la construction de l'image.
RUN npm run lint && npm test
# Vide = même origine (nginx relaie /socket.io/ vers le serveur)
ARG VITE_SERVER_URL=""
# Mentions légales et lien de don, écrits dans les pages prérendues (publiques de toute façon) ;
# les ARG sont des variables d'environnement pour les RUN qui suivent.
ARG LEGAL_EDITOR_NAME=""
ARG LEGAL_CONTACT_EMAIL=""
ARG DONATION_URL=""
RUN if [ -z "$VITE_SERVER_URL" ]; then unset VITE_SERVER_URL; fi && npm run build

# ---------- runtime : nginx non-root ----------
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-headers.conf /etc/nginx/komintern-headers.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 8080
