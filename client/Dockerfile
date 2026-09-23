# syntax=docker/dockerfile:1

# ---------- build : bundle Vite ----------
FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vide = même origine (nginx relaie /socket.io/ vers le serveur)
ARG VITE_SERVER_URL=""
RUN if [ -z "$VITE_SERVER_URL" ]; then unset VITE_SERVER_URL; fi && npm run build

# ---------- runtime : nginx non-root ----------
FROM nginxinc/nginx-unprivileged:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist /usr/share/nginx/html
EXPOSE 8080
