import webpush from "web-push";

import { log } from "../logger";
import type { PlayerNotification } from "../RoomManager";
import type { PushSubscriptionData } from "../types";

// Notifications Web Push (VAPID). Le contenu reste neutre : jamais de rôle ni de vote.

/** Services de push des navigateurs : le serveur ne poste jamais vers une autre adresse. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

export function parsePushSubscription(raw: unknown): PushSubscriptionData {
  const value = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; lang?: unknown } | null;
  if (typeof value !== "object" || value === null || typeof value.endpoint !== "string" || value.endpoint.length > 1_000) {
    throw new Error("invalid push subscription");
  }
  let url: URL;
  try {
    url = new URL(value.endpoint);
  } catch {
    throw new Error("invalid push subscription");
  }
  if (url.protocol !== "https:" || url.port !== "" || !PUSH_HOSTS.some((host) => host.test(url.hostname))) {
    throw new Error("unsupported push service");
  }
  const { p256dh, auth } = value.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || !BASE64URL.test(p256dh) || !BASE64URL.test(auth) || p256dh.length > 200 || auth.length > 100) {
    throw new Error("invalid push subscription");
  }
  return { endpoint: url.href, keys: { p256dh, auth }, lang: value.lang === "en" ? "en" : "fr" };
}

const TEXTS = {
  fr: {
    proposal: "À toi de proposer une équipe.",
    vote: "Vote de confiance : à toi de voter.",
    mission: "Tu es en mission : à toi de jouer.",
    warning: (seconds: number) => `Tu es déconnecté : reviens dans ${seconds} s, sinon ton camp perd la partie.`,
    warningOthers: (name: string, seconds: number) => `${name} est déconnecté et sera compté absent dans ${seconds} s. Ouvre le jeu pour l'attendre.`,
    hold: (by: string) => `${by} et les autres t'attendent : reviens dans la partie.`,
  },
  en: {
    proposal: "Your turn to pick a team.",
    vote: "Confidence vote: your turn to vote.",
    mission: "You're on the mission: your turn to play.",
    warning: (seconds: number) => `You're disconnected: come back within ${seconds} s or your side loses.`,
    warningOthers: (name: string, seconds: number) => `${name} is disconnected and will count as gone in ${seconds} s. Open the game to wait for them.`,
    hold: (by: string) => `${by} and the others are waiting for you: come back to the game.`,
  },
};

export function notificationText(notification: PlayerNotification, lang: "fr" | "en"): string {
  const texts = TEXTS[lang];
  switch (notification.kind) {
    case "proposal":
      return texts.proposal;
    case "vote":
      return texts.vote;
    case "mission":
      return texts.mission;
    case "absence_warning":
      return texts.warning(notification.secondsLeft);
    case "absence_warning_others":
      return texts.warningOthers(notification.name, notification.secondsLeft);
    case "absence_hold":
      return texts.hold(notification.by);
  }
}

export type PushSender = (subscription: PushSubscriptionData, payload: string, ttlSeconds: number) => Promise<void>;

export class PushService {
  public readonly publicKey: string | undefined;
  private readonly sender: PushSender | undefined;

  public constructor(vapid?: { publicKey: string; privateKey: string; subject: string }, sender?: PushSender) {
    this.publicKey = vapid?.publicKey;
    if (sender !== undefined) {
      this.sender = sender;
    } else if (vapid !== undefined) {
      const details = { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
      this.sender = async (subscription, payload, ttlSeconds) => {
        await webpush.sendNotification(subscription, payload, { vapidDetails: details, TTL: ttlSeconds, urgency: "high", timeout: 5_000 });
      };
    }
  }

  public get enabled(): boolean {
    return this.sender !== undefined;
  }

  /** Envoie la notification ; renvoie false si l'abonnement n'existe plus (à oublier). */
  public async send(subscription: PushSubscriptionData, roomCode: string, notification: PlayerNotification): Promise<boolean> {
    if (this.sender === undefined) return true;
    const payload = JSON.stringify({
      title: "Nazi Communiste",
      body: notificationText(notification, subscription.lang),
      // Une seule notification par room : la suivante remplace la précédente.
      tag: `room-${roomCode}`,
      url: `/r/${roomCode}`,
    });
    // Une notification de tour périmée n'a plus d'intérêt : durée de vie courte.
    // Une alerte d'absence ne sert plus à rien après la fin du compte à rebours.
    const ttl = notification.kind === "absence_hold" ? 300 : notification.kind === "absence_warning_others" ? 20 : 60;
    try {
      await this.sender(subscription, payload, ttl);
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return false;
      log.warn("push notification failed", { status, message: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }
}
