import React from "react";
import ReactDOM from "react-dom/client";

import { registerSW } from "virtual:pwa-register";

// Polices servies par le site (pas de Google Fonts : une connexion externe de moins).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./styles.css";
import App from "./App";
import { LanguageProvider } from "./i18n";
import { PublicBoard } from "./pages/PublicBoard";
import { PrivateWindow } from "./streamer/PrivateWindow";
import { initTheme } from "./theme";

initTheme();

// Vue publique d'une room (/r/CODE/ecran?t=…) : page à part, le jeu n'est pas chargé (aucune
// reprise de place d'un joueur sur l'appareil qui l'affiche).
const board = /^\/r\/([A-Za-z0-9_-]{3,24})\/ecran\/?$/.exec(window.location.pathname);
const params = new URLSearchParams(window.location.search);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      {window.location.pathname === "/prive" ? (
        <PrivateWindow />
      ) : board !== null ? (
        <PublicBoard
          code={(board[1] as string).toUpperCase()}
          token={params.get("t") ?? ""}
          stream={params.has("stream") || params.get("fond") === "transparent"}
          transparent={params.get("fond") === "transparent"}
        />
      ) : (
        <App />
      )}
    </LanguageProvider>
  </React.StrictMode>,
);

// Nouvelle version déployée : le service worker l'active et la page se recharge.
// En pleine partie, le rechargement reprend la place du joueur (resync).
// Nouvelle version déployée : recherchée au retour sur l'app et toutes les 30 minutes (sinon une
// webapp restée ouverte garderait l'ancienne version jusqu'à sa fermeture complète).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration === undefined) return;
    const check = (): void => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    window.setInterval(check, 30 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});
