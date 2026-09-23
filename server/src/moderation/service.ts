import type { GameLogStore, ModerationCase, ModerationIdentity } from "../store/gamelog";
import { newLogId, pseudonymFor } from "../store/gamelog";

export type CaseMessage = { playerId: string; userId: string | null; pseudo: string; text: string; at: number; flagged: boolean };
export type Participant = { playerId: string; userId: string | null; pseudo: string };

const MESSAGE_WINDOW = 30;

/**
 * Dossiers de modération : la conversation est pseudonymisée (« Joueur A, B… ») et la
 * correspondance avec les personnes est rangée à part, consultable seulement pour un recours.
 */
export class ModerationService {
  public constructor(private readonly store: GameLogStore) {}

  public async openCase(input: {
    trigger: { type: "flagged_word"; words: string[]; categories?: string[] } | { type: "report"; reporter: Participant; reason: string };
    roomCode: string;
    gameId: string | null;
    messages: CaseMessage[];
    involved: Participant[];
  }): Promise<string> {
    const pseudonyms = new Map<string, ModerationIdentity>();
    const pseudonymOf = (participant: Participant): string => {
      const existing = pseudonyms.get(participant.playerId);
      if (existing !== undefined) {
        return existing.pseudonym;
      }
      const identity = { pseudonym: pseudonymFor(pseudonyms.size), ...participant };
      pseudonyms.set(participant.playerId, identity);
      return identity.pseudonym;
    };

    const window = input.messages.slice(-MESSAGE_WINDOW);
    const messages = window.map((message) => ({
      pseudonym: pseudonymOf(message),
      text: replaceNames(message.text, [...window, ...input.involved]),
      at: new Date(message.at),
      flagged: message.flagged,
    }));
    input.involved.forEach(pseudonymOf);

    const trigger: ModerationCase["trigger"] =
      input.trigger.type === "report"
        ? { type: "report", reporter: pseudonymOf(input.trigger.reporter), reason: input.trigger.reason }
        : input.trigger;

    const id = newLogId("case");
    await this.store.createCase(
      { id, createdAt: new Date(), status: "open", trigger, roomCode: input.roomCode, gameId: input.gameId, messages, resolvedAt: null, resolution: null },
      [...pseudonyms.values()],
    );
    return id;
  }
}

/** Retire aussi les pseudos cités dans le texte des messages. */
function replaceNames(text: string, people: Array<{ pseudo: string }>): string {
  let result = text;
  for (const { pseudo } of people) {
    if (pseudo.length >= 3) {
      result = result.split(pseudo).join("[joueur]");
    }
  }
  return result;
}
