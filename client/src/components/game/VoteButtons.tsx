import { type ReactNode, useRef } from "react";

import { useI18n } from "../../i18n";
import type { ConfidenceVote, MissionVote } from "../../types";

// Nom lu par les lecteurs d'écran (les boutons n'affichent qu'une icône) et touche du clavier.
const VOTE_LABELS = { yes: "vote.yes", no: "vote.no", communist: "vote.communist", nazi: "vote.nazi" } as const;
const SHORTCUTS = { yes: "o", no: "n", communist: "c", nazi: "s" } as const;

export function VoteButtons({
  first,
  second,
  onVote,
  disabled,
  randomize,
  selectedVote,
  disabledVotes,
  split,
}: {
  first: { vote: ConfidenceVote | MissionVote; symbol: ReactNode };
  second: { vote: ConfidenceVote | MissionVote; symbol: ReactNode };
  onVote: (value: ConfidenceVote | MissionVote) => void;
  disabled?: boolean;
  randomize?: boolean;
  selectedVote?: ConfidenceVote | MissionVote | null;
  disabledVotes?: Array<ConfidenceVote | MissionVote>;
  split?: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const isSwappedRef = useRef<boolean>(randomize === true && Math.random() > 0.5);
  const order = isSwappedRef.current ? [second, first] : [first, second];
  const isDisabled = (vote: ConfidenceVote | MissionVote): boolean => disabled === true || disabledVotes?.includes(vote) === true;
  return (
    <div className={split === true ? "vote-stack vote-stack--split" : "vote-stack"}>
      <button
        type="button"
        className={selectedVote === order[0].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[0].vote)}
        aria-label={t(VOTE_LABELS[order[0].vote])}
        data-shortcut={SHORTCUTS[order[0].vote]}
        onClick={() => onVote(order[0].vote)}
      >
        {order[0].symbol}
      </button>
      <button
        type="button"
        className={selectedVote === order[1].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[1].vote)}
        aria-label={t(VOTE_LABELS[order[1].vote])}
        data-shortcut={SHORTCUTS[order[1].vote]}
        onClick={() => onVote(order[1].vote)}
      >
        {order[1].symbol}
      </button>
    </div>
  );
}
