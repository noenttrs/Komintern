// Fenêtre de jeu → fenêtre privée : même navigateur, même origine, rien ne passe par le serveur.
export type PrivateState = {
  code: string;
  link: string;
  faction: "nazi" | "communist" | null;
  roleLabel: string;
  details: string;
};

export type PrivateMessage = { type: "state"; state: PrivateState } | { type: "hello" };

const NAME = "komintern-private";

export function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(NAME);
}
