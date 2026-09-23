import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { VoteButtons } from "../components/game/VoteButtons";
import { WaitingCard } from "../components/game/WaitingCard";
import type { ConfidenceVote } from "../types";
import { useScreen } from "./ScreenContext";

// Proposition d'équipe par le chef, vote de confiance et son résultat.
export function ProposalScreen(): JSX.Element {
  const {
    score,
    orderReference,
    orderLegend,
    frontMeta,
    roleOverlay,
    showFullHistory,
    defaultBackContent,
    expandedBackContent,
    waitingValidationStep,
    frontFooter,
    myId,
    players,
    proposal,
    nameById,
    selectedTeam,
    setSelectedTeam,
    setWaitingValidationStep,
    proposeTeam,
  } = useScreen();
  const iAmChef = myId !== null && proposal.chefId === myId;
  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={frontFooter}
        front={
          iAmChef ? (
            <div>
              <h2>Choisir equipe ({proposal.teamSize})</h2>
              <div className="team-grid">
                {players.map((player) => {
                  const selected = selectedTeam.includes(player.id);
                  return (
                    <button
                      key={player.id}
                      type="button"
                      className={selected ? "chip chip--active" : "chip"}
                      onClick={() => {
                        setSelectedTeam((current) => {
                          if (selected) {
                            return current.filter((entry) => entry !== player.id);
                          }
                          if (current.length >= proposal.teamSize) {
                            return current;
                          }
                          return [...current, player.id];
                        });
                      }}
                    >
                      {player.pseudo ?? player.id}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <h2>En attente de la proposition de {proposal.chefId ? nameById(proposal.chefId) : "Chef"}</h2>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        actions={
          iAmChef ? (
            <button
              type="button"
              className="inline-action"
              disabled={selectedTeam.length !== proposal.teamSize || waitingValidationStep === "proposal"}
              onClick={() => {
                setWaitingValidationStep("proposal");
                proposeTeam(selectedTeam);
              }}
            >
              Proposer equipe
            </button>
          ) : undefined
        }
      />
    </main>
  );
}

export function ConfidenceVoteScreen(): JSX.Element {
  const {
    score,
    orderReference,
    orderLegend,
    frontMeta,
    roleOverlay,
    showFullHistory,
    defaultBackContent,
    expandedBackContent,
    waitingValidationStep,
    missionProgressLabel,
    proposal,
    nameById,
    selectedConfidenceVote,
    setSelectedConfidenceVote,
    setWaitingValidationStep,
    sendConfidenceVote,
  } = useScreen();
  const confidenceFooter = <div><p>{missionProgressLabel}</p></div>;

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={confidenceFooter}
        front={
          waitingValidationStep === "confidence_vote" ? (
            <WaitingCard message="Vote enregistre, en attente des autres joueurs." />
          ) : (
            <div className="vote-phase">
              <h2>Vote de confiance</h2>
              <p>{proposal.proposedTeam.map(nameById).join(", ") || "Aucune equipe"}</p>
              <VoteButtons
                first={{ vote: "yes", symbol: "✓" }}
                second={{ vote: "no", symbol: "✕" }}
                onVote={(value) => {
                  if (waitingValidationStep === "confidence_vote") {
                    return;
                  }
                  const parsed = value as ConfidenceVote;
                  setSelectedConfidenceVote(parsed);
                  setWaitingValidationStep("confidence_vote");
                  sendConfidenceVote(parsed);
                }}
                disabled={waitingValidationStep === "confidence_vote"}
                selectedVote={selectedConfidenceVote}
                split
              />
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
      />
    </main>
  );
}

export function ConfidenceResultScreen(): JSX.Element {
  const {
    score,
    orderReference,
    orderLegend,
    frontMeta,
    roleOverlay,
    showFullHistory,
    defaultBackContent,
    expandedBackContent,
    waitingValidationStep,
    missionProgressLabel,
    confidence,
    nameById,
  } = useScreen();
  const confidenceDetails = Object.entries(confidence.votes)
    .map(([id, vote]) => `${nameById(id)}: ${vote === "yes" ? "Pour" : "Contre"}`)
    .join(" | ");

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={<div><p>{missionProgressLabel}</p></div>}
        front={
          waitingValidationStep === "confidence_result" ? (
            <WaitingCard message="Validation envoyee, en attente des autres." />
          ) : (
            <div className="result-panel">
              <h2>{confidence.approved ? "Majorite POUR" : "Majorite CONTRE"}</h2>
              <p>{confidenceDetails || "Aucun vote recu"}</p>
              <p>Tap pour passer a la suite.</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
      />
    </main>
  );
}
