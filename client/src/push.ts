// Notifications Web Push : abonnement du navigateur, lié au siège du joueur dans sa room.
// Le choix est mémorisé localement ; l'abonnement lui-même est renvoyé au serveur à chaque room.

const STORAGE_KEY = "komintern.push";
export const PUSH_CHANGED_EVENT = "komintern:push-changed";

export type PushStatus = "unsupported" | "needs_install" | "denied" | "off" | "on";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function wanted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "on");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite.
  }
  window.dispatchEvent(new Event(PUSH_CHANGED_EVENT));
}

export function pushStatus(): PushStatus {
  if (!supported()) return isIos() && !isStandalone() ? "needs_install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return wanted() && Notification.permission === "granted" ? "on" : "off";
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob((base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** À appeler depuis un geste de l'utilisateur (iOS l'exige pour demander l'autorisation). */
export async function enablePush(publicKey: string): Promise<PushStatus> {
  if (!supported()) return pushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return pushStatus();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing === null) {
    await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
  }
  remember(true);
  return pushStatus();
}

export async function disablePush(): Promise<PushStatus> {
  remember(false);
  if (supported()) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (await registration.pushManager.getSubscription())?.unsubscribe();
    } catch {
      // Déjà désabonné.
    }
  }
  return pushStatus();
}

/** Abonnement à envoyer au serveur, ou null si les notifications sont coupées. */
export async function currentSubscription(lang: string): Promise<(PushSubscriptionJSON & { lang: string }) | null> {
  if (pushStatus() !== "on") return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription === null ? null : { ...subscription.toJSON(), lang };
  } catch {
    return null;
  }
}
