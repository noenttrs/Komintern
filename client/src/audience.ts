// Mesure d'audience anonyme (sans cookie) : une page vue envoyée au serveur à chaque navigation,
// sauf si le visiteur s'y est opposé (mentions légales).
const OPT_OUT_KEY = "komintern.no_audience";

export function audienceOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "1" || navigator.doNotTrack === "1";
  } catch {
    return false;
  }
}

export function setAudienceOptOut(optOut: boolean): void {
  try {
    if (optOut) window.localStorage.setItem(OPT_OUT_KEY, "1");
    else window.localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // Stockage indisponible : rien à mémoriser.
  }
}

let lastPath: string | null = null;
// Page vue en attente : la page est préchargée en arrière-plan ou l'onglet est caché.
let pending: string | null = null;

/** Page affichée pour de vrai : ni préchargée (prerender, aperçu de lien), ni dans un onglet caché. */
function displayed(): boolean {
  return (document as Document & { prerendering?: boolean }).prerendering !== true && document.visibilityState === "visible";
}

function sendWhenDisplayed(): void {
  if (pending === null || !displayed()) return;
  const path = pending;
  pending = null;
  document.removeEventListener("prerenderingchange", sendWhenDisplayed);
  document.removeEventListener("visibilitychange", sendWhenDisplayed);
  // Navigateur piloté par un automate (Playwright, Selenium…) : signalé, pour n'être que dénombré.
  const automated = navigator.webdriver === true;
  void fetch("/api/visit", {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(automated ? { path, automated: true } : { path }),
  }).catch(() => undefined);
}

/** Compte une page vue, une fois la page réellement affichée (la dernière seulement si plusieurs attendent). */
export function recordPageView(path: string): void {
  if (path === lastPath || audienceOptedOut()) return;
  lastPath = path;
  pending = path;
  if (displayed()) {
    sendWhenDisplayed();
    return;
  }
  document.addEventListener("prerenderingchange", sendWhenDisplayed);
  document.addEventListener("visibilitychange", sendWhenDisplayed);
}
