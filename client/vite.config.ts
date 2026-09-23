/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // En dev, le serveur Socket.IO tourne sur :3000 (npm run dev dans server/).
    proxy: { "/socket.io": { target: "http://localhost:3000", ws: true } },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
