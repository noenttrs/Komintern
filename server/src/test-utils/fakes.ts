import type { Server } from "socket.io";

import type { BridgeLike } from "../GameSession";
import { EngineError } from "../PythonBridge";

export type EmittedEvent = { target: string; event: string; payload: unknown };

/** Remplace `io` : enregistre chaque `io.to(x).emit(event, payload)`. */
export function createIoRecorder(): { io: Server; events: EmittedEvent[]; last: (event: string) => EmittedEvent | undefined } {
  const events: EmittedEvent[] = [];
  const io = {
    to(target: string) {
      return {
        emit(event: string, payload: unknown) {
          events.push({ target, event, payload });
        },
      };
    },
  };
  return {
    io: io as unknown as Server,
    events,
    last: (event) => [...events].reverse().find((entry) => entry.event === event),
  };
}

type Handler = (args: Record<string, unknown>) => unknown;

/**
 * Faux moteur minimal et déterministe : rôles fixés à la construction, règles de base
 * (majorité stricte, un vote nazi fait gagner les nazis, premier à `winThreshold`).
 */
export class FakeBridge implements BridgeLike {
  public readonly calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  public disposed = false;
  private readonly overrides = new Map<string, Handler>();
  private players: string[] = [];
  private cursor = 0;
  private missionIndex = 0;
  private scores = { nazi: 0, communist: 0 };

  public constructor(
    public readonly roles: Record<string, "nazi" | "communist">,
    private readonly missionSizes: number[] = [2, 3, 2, 3, 3],
    private readonly winThreshold = 3,
  ) {}

  /** Remplace la réponse d'une commande (ex. pour simuler une erreur). */
  public override(command: string, handler: Handler): void {
    this.overrides.set(command, handler);
  }

  public async send(command: string, args: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    const override = this.overrides.get(command);
    if (override !== undefined) {
      return override(args);
    }
    switch (command) {
      case "start_game":
        this.players = args.player_ids as string[];
        if (Object.keys(this.roles).length === 0) {
          // Rôles non fournis : les deux premiers joueurs de l'ordre sont nazis.
          this.players.forEach((id, index) => (this.roles[id] = index < 2 ? "nazi" : "communist"));
        }
        this.cursor = args.chef_cursor as number;
        return { status: "ok", round: this.round() };
      case "get_player_view": {
        const id = args.player_id as string;
        const role = this.roles[id];
        if (role === undefined) {
          throw new EngineError("unknown player_id");
        }
        return role === "nazi" ? { ...this.roles } : { [id]: role };
      }
      case "propose_team":
        return { phase: "voting" };
      case "submit_confidence_votes": {
        const votes = Object.values(args.votes as Record<string, string>);
        const yes = votes.filter((vote) => vote === "YES").length;
        return { approved: yes * 2 > votes.length };
      }
      case "submit_mission_votes": {
        const votes = Object.values(args.votes as Record<string, string>);
        const naziVotes = votes.filter((vote) => vote === "NAZI").length;
        const winner = naziVotes > 0 ? "nazi" : "communist";
        this.scores[winner] += 1;
        this.cursor = (this.cursor + 1) % this.players.length;
        this.missionIndex += 1;
        const gameWinner = this.scores[winner] >= this.winThreshold ? winner : null;
        return {
          winner,
          votes: votes.map((vote) => vote.toLowerCase()),
          nazi_vote_count: naziVotes,
          scores: { ...this.scores },
          game_winner: gameWinner,
          next_round: gameWinner === null ? this.round() : null,
        };
      }
      case "forfeit":
        return { game_winner: args.faction === "NAZI" ? "communist" : "nazi" };
      case "end_game":
        return this.cursor;
      default:
        throw new EngineError(`unknown command: ${command}`);
    }
  }

  public dispose(): void {
    this.disposed = true;
  }

  public commands(): string[] {
    return this.calls.map((call) => call.command);
  }

  private round(): Record<string, unknown> {
    return {
      mission_index: this.missionIndex,
      chef_id: this.players[this.cursor],
      required_team_size: this.missionSizes[this.missionIndex],
      scores: { ...this.scores },
    };
  }
}

export const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
