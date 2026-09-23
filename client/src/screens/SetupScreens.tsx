import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
import { useI18n } from "../i18n";
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
  const { t } = useI18n();
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
            <WaitingCard message={t("tableOrder.waitingConfirm")} />
          ) : (
            <>
              <h2>
                {myOrderIndex === -1
                  ? t("tableOrder.tap")
                  : t("tableOrder.yourNumber", { number: myOrderIndex + 1 })}
              </h2>
              <p>{t("tableOrder.progress")} {orderReference.length > 0 ? orderLegend : "..."}</p>
              <p>
                {allOrderChosen
                  ? t("tableOrder.allChosen")
                  : t("tableOrder.waitingOrder")}
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
                  {t("tableOrder.missed")}
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
                    {t("tableOrder.validateFix")}
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
                  {t("tableOrder.undo")}
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
  const { t } = useI18n();
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
            <WaitingCard message={t("roleReveal.waiting")} />
          ) : (
            <div>
              <h2>{t("roleReveal.hold")}</h2>
              <p>{t("roleReveal.then")}</p>
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
              {t("roleReveal.ok")}
            </button>
          ) : undefined
        }
      />
    </main>
  );
}
