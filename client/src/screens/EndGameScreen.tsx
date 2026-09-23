import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
import { useI18n } from "../i18n";
import { useScreen } from "./ScreenContext";

// Fin de partie et choix de rejouer (end_game puis replay_waiting).
export function EndGameScreen(): JSX.Element {
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
    phase,
    gameOver,
    winner,
    role,
    revealedRoles,
    naziAllies,
    nameById,
    setWaitingValidationStep,
    setQueuedReplayChoice,
    confirmEndGame,
    sendReplayChoice,
  } = useScreen();
  const { t } = useI18n();
  const sendReplayNow = (): void => {
    if (waitingValidationStep === "replay_choice") {
      return;
    }

    if (phase === "end_game") {
      if (waitingValidationStep === "end_game") {
        return;
      }
      setQueuedReplayChoice("replay");
      setWaitingValidationStep("end_game");
      confirmEndGame();
      return;
    }

    setQueuedReplayChoice(null);
    setWaitingValidationStep("replay_choice");
    sendReplayChoice("replay");
  };

  const quitGameNow = (): void => {
    if (waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game") {
      return;
    }
    setQueuedReplayChoice(null);
    setWaitingValidationStep("replay_choice");
    sendReplayChoice("quit");
  };

  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={frontFooter}
        front={
          waitingValidationStep === "end_game" ? (
            <WaitingCard message={t("common.sentWaitingOthers")} />
          ) : waitingValidationStep === "replay_choice" ? (
            <WaitingCard message={t("endGame.replaySent")} />
          ) : (
            <div className="result-panel">
              <h2>{winner === "nazi" ? t("mission.victoryNazi") : t("mission.victoryCommunist")}</h2>
              {gameOver?.reason === "forfeit" && gameOver.forfeitedBy !== null ? (
                <p>{t("endGame.forfeit", { name: nameById(gameOver.forfeitedBy) })}</p>
              ) : null}
              <p>{t("endGame.replayQuestion")}</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={
          <div>
            {roleOverlay}
            <p>{Object.entries(revealedRoles).map(([id, playerFaction]) => `${nameById(id)}:${playerFaction}`).join(" | ") || t("endGame.rolesPending")}</p>
            {role.faction === "nazi" ? <p>{t("endGame.naziAllies", { names: naziAllies.length > 0 ? naziAllies.join(", ") : t("common.none") })}</p> : null}
          </div>
        }
        actions={
          <div className="vote-stack">
            <button
              type="button"
              className="vote-btn"
              disabled={waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game"}
              onClick={sendReplayNow}
            >
              {t("endGame.replay")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game"}
              onClick={quitGameNow}
            >
              {t("endGame.quit")}
            </button>
          </div>
        }
      />
    </main>
  );
}
