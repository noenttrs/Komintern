/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Nazi Communiste",
        short_name: "Nazi Communiste",
        description: "Jeu de déduction sociale : nazis contre communistes, chacun sur son téléphone.",
        lang: "fr",
        start_url: "/",
        scope: "/",
        display: "standalone",
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
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/agents\.html$/, /^\/llms\.txt$/, /^\/robots\.txt$/, /^\/sitemap\.xml$/],
        runtimeCaching: [],
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
