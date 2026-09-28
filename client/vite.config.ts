/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Enregistrement fait dans main.tsx : la page se recharge d'elle-même quand une
      // nouvelle version est déployée, au lieu de garder l'ancienne en cache.
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "Nazi Communiste",
        short_name: "Nazi Communiste",
        description: "Le jeu de bluff parfait pour vos soirées : rôles cachés, de 2 à 14 joueurs, chacun sur son téléphone.",
        lang: "fr",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["standalone"],
        categories: ["games", "entertainment"],
        // Un lien d'invitation ouvert depuis le téléphone réutilise l'app déjà ouverte.
        launch_handler: { client_mode: "navigate-existing" },
        // Captures (tests e2e) : Chrome affiche alors sa fenêtre d'installation enrichie.
        screenshots: [
          { src: "/screenshots/proposition.png", sizes: "375x667", type: "image/png", form_factor: "narrow", label: "Le chef choisit l'équipe envoyée en mission" },
          { src: "/screenshots/vote.png", sizes: "375x667", type: "image/png", form_factor: "narrow", label: "Vote de confiance : pour ou contre, en public" },
          { src: "/screenshots/mission.png", sizes: "375x667", type: "image/png", form_factor: "narrow", label: "Résultat de la mission" },
          { src: "/screenshots/accueil-large.png", sizes: "1440x900", type: "image/png", form_factor: "wide", label: "Nazi Communiste sur ordinateur" },
        ],
        shortcuts: [
          { name: "Créer une room", short_name: "Créer", url: "/?action=creer", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: "Rejoindre une room", short_name: "Rejoindre", url: "/?action=rejoindre", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: "Règles du jeu", short_name: "Règles", url: "/regles", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
        ],
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell en cache ; le jeu (Socket.IO) et l'API ne sont jamais mis en cache.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Captures du manifest : servies à la demande (fenêtre d'installation), pas mises en cache.
        globIgnores: ["**/screenshots/**"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/agents\.html$/, /^\/llms\.txt$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
        runtimeCaching: [],
        // Gestion des notifications de partie (push, clic) dans le service worker.
        importScripts: ["/push-sw.js"],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    // En dev, le serveur tourne sur :3000 (npm run dev dans server/).
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/api": { target: "http://localhost:3000" },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});
