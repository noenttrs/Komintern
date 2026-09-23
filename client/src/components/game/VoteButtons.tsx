import { type ReactNode, useRef } from "react";

import type { ConfidenceVote, MissionVote } from "../../types";

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
  const isSwappedRef = useRef<boolean>(randomize === true && Math.random() > 0.5);
  const order = isSwappedRef.current ? [second, first] : [first, second];
  const isDisabled = (vote: ConfidenceVote | MissionVote): boolean => disabled === true || disabledVotes?.includes(vote) === true;
  return (
    <div className={split === true ? "vote-stack vote-stack--split" : "vote-stack"}>
      <button
        type="button"
        className={selectedVote === order[0].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[0].vote)}
        onClick={() => onVote(order[0].vote)}
      >
        {order[0].symbol}
      </button>
      <button
        type="button"
        className={selectedVote === order[1].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[1].vote)}
        onClick={() => onVote(order[1].vote)}
      >
        {order[1].symbol}
      </button>
    </div>
  );
}
