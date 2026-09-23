import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { VoteButtons } from "../components/game/VoteButtons";
import { WaitingCard } from "../components/game/WaitingCard";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
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
              <h2>{t("proposal.choose", { size: proposal.teamSize })}</h2>
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
            <h2>{t("proposal.waiting", { name: proposal.chefId ? nameById(proposal.chefId) : t("proposal.chefFallback") })}</h2>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        actions={
          iAmChef && waitingValidationStep !== "proposal" ? (
            <button
              type="button"
              className="inline-action"
              disabled={selectedTeam.length !== proposal.teamSize || waitingValidationStep === "proposal"}
              onClick={() => {
                setWaitingValidationStep("proposal");
                proposeTeam(selectedTeam);
              }}
            >
              {t("proposal.submit")}
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
  const { t } = useI18n();
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
            <WaitingCard message={t("confidence.recorded")} />
          ) : (
            <div className="vote-phase">
              <h2>{t("confidence.title")}</h2>
              <p>{proposal.proposedTeam.map(nameById).join(", ") || t("confidence.noTeam")}</p>
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
  const { t } = useI18n();
  const confidenceDetails = Object.entries(confidence.votes)
    .map(([id, vote]) => `${nameById(id)}: ${vote === "yes" ? t("game.yes") : t("game.no")}`)
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
            <WaitingCard message={t("common.sentWaitingOthers")} />
          ) : (
            <div className="result-panel">
              <h2>{confidence.approved ? t("confidence.majorityYes") : t("confidence.majorityNo")}</h2>
              <p>{confidenceDetails || t("confidence.noVotes")}</p>
              <p>{t("common.tapNext")}</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
      />
    </main>
  );
}
