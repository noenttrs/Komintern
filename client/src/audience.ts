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

export function recordPageView(path: string): void {
  if (path === lastPath || audienceOptedOut()) return;
  lastPath = path;
  void fetch("/api/visit", {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => undefined);
}
