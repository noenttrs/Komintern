import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
import { useScreen } from "./ScreenContext";

// Début de partie : ordre de table puis révélation du rôle.
export function TableOrderScreen(): JSX.Element {
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
    players,
    isHost,
    myOrderIndex,
    allOrderChosen,
    showOrderAdjustInput,
    setShowOrderAdjustInput,
    tableOrderAdjustPosition,
    setTableOrderAdjustPosition,
    adjustTableOrder,
    resetTableOrder,
  } = useScreen();
  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={frontFooter}
        front={
          waitingValidationStep === "table_order" ? (
            <WaitingCard message="En attente des autres joueurs pour confirmer l'ordre de table." />
          ) : (
            <>
              <h2>
                {myOrderIndex === -1
                  ? "Tap pour prendre votre numero d'ordre"
                  : `Votre numero d'ordre: ${myOrderIndex + 1}`}
              </h2>
              <p>Progression: {orderReference.length > 0 ? orderLegend : "..."}</p>
              <p>
                {allOrderChosen
                  ? "Tap pour passer a la suite (confirmation collective)"
                  : "En attente des joueurs selon l'ordre de table."}
              </p>
            </>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        actions={
          myOrderIndex !== -1 ? (
            <div className="vote-stack">
              {allOrderChosen ? (
                <button
                  type="button"
                  className="inline-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowOrderAdjustInput((current) => !current);
                  }}
                >
                  J'ai rate pardon
                </button>
              ) : null}
              {allOrderChosen && showOrderAdjustInput ? (
                <>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, players.length)}
                    value={tableOrderAdjustPosition}
                    onChange={(event) => setTableOrderAdjustPosition(Number(event.target.value))}
                  />
                  <button
                    type="button"
                    className="inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      adjustTableOrder(tableOrderAdjustPosition);
                      setShowOrderAdjustInput(false);
                    }}
                  >
                    Valider correction
                  </button>
                </>
              ) : null}
              {isHost ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetTableOrder();
                  }}
                >
                  Revenir en arriere
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />
    </main>
  );
}

export function RoleRevealScreen(): JSX.Element {
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
    hasRevealedRoleOnce,
    setHasRevealedRoleOnce,
    setWaitingValidationStep,
    confirmRole,
  } = useScreen();
  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={scoreChip("communist", score.communist)}
        scoreRight={scoreChip("nazi", score.nazi)}
        scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
        meta={frontMeta}
        footer={frontFooter}
        front={
          waitingValidationStep === "role_reveal" ? (
            <WaitingCard message="En attente des autres joueurs." />
          ) : (
            <div>
              <h2>Maintenez pour voir votre role</h2>
              <p>Puis appuyez sur "C'est bon".</p>
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        onOverlayShown={() => {
          if (!hasRevealedRoleOnce) {
            setHasRevealedRoleOnce(true);
          }
        }}
        actions={
          hasRevealedRoleOnce ? (
            <button
              type="button"
              className="inline-action"
              onClick={() => {
                setWaitingValidationStep("role_reveal");
                confirmRole();
              }}
            >
              C'est bon
            </button>
          ) : undefined
        }
      />
    </main>
  );
}
