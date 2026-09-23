import type { UIPhase } from "../../types";

export function isGamePhaseUi(phase: UIPhase): boolean {
  return !["pseudo_entry", "landing", "create_room", "join_room", "waiting_room"].includes(phase);
}

/** Étape de validation correspondant à un écran, pour restaurer « déjà validé » au resync. */
export function stepForPhase(phase: UIPhase): string | null {
  const steps: Partial<Record<UIPhase, string>> = {
    table_order: "table_order",
    role_reveal: "role_reveal",
    confidence_vote: "confidence_vote",
    confidence_result: "confidence_result",
    mission_execution: "mission_vote",
    mission_result: "mission_result",
    end_game: "end_game",
  };
  return steps[phase] ?? null;
}

export function formatMissionVotes(naziVoteCount: number, teamSize: number): string {
  const naziVotes = Math.max(0, naziVoteCount);
  const communistVotes = Math.max(0, teamSize - naziVotes);
  return `vote : nazi:${naziVotes} communist:${communistVotes}`;
}
