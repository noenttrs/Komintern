import React from "react";
import ReactDOM from "react-dom/client";

import { registerSW } from "virtual:pwa-register";

import "./styles.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Nouvelle version déployée : le service worker l'active et la page se recharge.
// En pleine partie, le rechargement reprend la place du joueur (resync).
registerSW({ immediate: true });
