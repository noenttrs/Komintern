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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
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
