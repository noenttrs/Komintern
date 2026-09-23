import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
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
            <WaitingCard message="Validation envoyee, en attente des autres." />
          ) : waitingValidationStep === "replay_choice" ? (
            <WaitingCard message="Choix rejouer envoye, en attente des autres joueurs." />
          ) : (
            <div className="result-panel">
              <h2>Victoire {winner === "nazi" ? "Nazi" : "Communiste"}</h2>
              {gameOver?.reason === "forfeit" && gameOver.forfeitedBy !== null ? (
                <p>Abandon de {nameById(gameOver.forfeitedBy)}</p>
              ) : null}
              <p>Rejouer ?</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={
          <div>
            {roleOverlay}
            <p>{Object.entries(revealedRoles).map(([id, playerFaction]) => `${nameById(id)}:${playerFaction}`).join(" | ") || "Roles a venir"}</p>
            {role.faction === "nazi" ? <p>Allies nazis: {naziAllies.length > 0 ? naziAllies.join(", ") : "aucun"}</p> : null}
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
              Rejouer
            </button>
            <button
              type="button"
              className="secondary"
              disabled={waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game"}
              onClick={quitGameNow}
            >
              Quitter la game
            </button>
          </div>
        }
      />
    </main>
  );
}
