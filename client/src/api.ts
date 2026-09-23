// Appels HTTP vers /api : cookie de session httpOnly, erreurs traduites en français.

export class ApiRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(translateApiError(code));
    this.name = "ApiRequestError";
  }
}

const API_ERRORS: Record<string, string> = {
  invalid_email: "Adresse email invalide.",
  weak_password: "Le mot de passe doit faire au moins 10 caractères.",
  invalid_display_name: "Pseudo invalide : 3 à 20 caractères.",
  email_taken: "Un compte existe déjà avec cet email.",
  display_name_taken: "Ce pseudo est déjà pris.",
  invalid_credentials: "Email ou mot de passe incorrect.",
  email_not_verified: "Email pas encore validé : un nouveau code vient de t'être envoyé.",
  invalid_code: "Code incorrect.",
  code_expired: "Code expiré, demandes-en un nouveau.",
  code_too_many_attempts: "Trop d'essais : demande un nouveau code.",
  code_cooldown: "Un code vient d'être envoyé, attends une minute avant d'en redemander un.",
  too_many_requests: "Trop de tentatives, réessaie dans quelques minutes.",
  banned: "Ce compte est suspendu.",
  google_email_not_verified: "Ton email Google n'est pas vérifié.",
  unauthorized: "Connecte-toi pour accéder à cette page.",
  forbidden: "Ce profil n'est visible que par ses amis.",
  not_found: "Introuvable.",
  user_not_found: "Aucun joueur avec ce pseudo.",
  cannot_friend_self: "Tu ne peux pas t'ajouter toi-même.",
  request_not_found: "Cette demande n'existe plus.",
  bad_origin: "Requête refusée.",
  invalid_input: "Données invalides.",
  unavailable: "Service momentanément indisponible, réessaie plus tard.",
  network: "Connexion au serveur impossible.",
  invalid_contact: "Sujet (120 caractères max) et message (10 à 5000 caractères) requis.",
  invalid_totp: "Code de double authentification incorrect.",
  totp_required: "Double authentification requise.",
  admin_password_only: "Ce compte se connecte uniquement par mot de passe.",
};

export function translateApiError(code: string): string {
  return API_ERRORS[code] ?? "Une erreur est survenue.";
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError(0, "network");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
  if (!response.ok) {
    throw new ApiRequestError(response.status, payload.error?.code ?? "unavailable");
  }
  return payload as T;
}

export type Stats = { wins: number; losses: number; gamesNazi: number; gamesCommunist: number; winsNazi?: number; winsCommunist?: number };

export type Account = {
  id: string;
  displayName: string | null;
  createdAt: string;
  stats: Stats;
  email?: string | null;
  hasPassword?: boolean;
  hasGoogle?: boolean;
  isAdmin?: boolean;
};

export type PublicConfig = {
  googleEnabled: boolean;
  emailDelivery: boolean;
  legal: { editorName: string; contactEmail: string };
  donationUrl: string;
};

export type PresenceStatus = "online" | "in_game" | "offline";

export type FriendsView = {
  friends: Array<{ userId: string; displayName: string; status: PresenceStatus }>;
  incoming: Array<{ userId: string; displayName: string; createdAt: string }>;
  outgoing: Array<{ userId: string; displayName: string; createdAt: string }>;
};
