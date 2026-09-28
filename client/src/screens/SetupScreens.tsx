import { useState } from "react";

import { AutoAdvance } from "../components/game/AutoAdvance";
import { CardSurface } from "../components/game/CardSurface";
import { scoreChip } from "../components/game/FactionIcon";
import { WaitingCard } from "../components/game/WaitingCard";
import { useI18n } from "../i18n";
import { DuelHeader, DuelRulesPanel } from "./DuelScreens";
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
    setTableOrder,
    pauseTableOrder,
    tableOrderTap,
    tableOrder,
    nameById,
    autoAdvanceAt,
  } = useScreen();
  const { t } = useI18n();
  const [editing, setEditing] = useState<string[] | null>(null);
  const kept = tableOrder.kept === true && allOrderChosen;
  const move = (index: number, delta: number) =>
    setEditing((current) => {
      if (current === null) return current;
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target] as string, next[index] as string];
      return next;
    });
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
            <>
              <WaitingCard message={t("tableOrder.waitingConfirm")} />
              <AutoAdvance deadline={autoAdvanceAt} />
            </>
          ) : (
            <div className="table-order">
              <h2>{myOrderIndex === -1 ? t("tableOrder.title") : t("tableOrder.yourNumber", { number: myOrderIndex + 1 })}</h2>
              <p className="table-order__intro">{kept ? t("tableOrder.keptIntro") : t("tableOrder.intro")}</p>
              {editing !== null ? (
                <ol className="order-editor" aria-label={t("tableOrder.listLabel")}>
                  {editing.map((id, index) => (
                    <li key={id}>
                      <span>{index + 1}. {nameById(id)}</span>
                      <button type="button" className="secondary" disabled={index === 0} aria-label={t("tableOrder.moveUp", { name: nameById(id) })} onClick={() => move(index, -1)}>↑</button>
                      <button type="button" className="secondary" disabled={index === editing.length - 1} aria-label={t("tableOrder.moveDown", { name: nameById(id) })} onClick={() => move(index, 1)}>↓</button>
                    </li>
                  ))}
                </ol>
              ) : tableOrder.order.length > 0 ? (
                <ol className="table-order__list" aria-label={t("tableOrder.listLabel")}>
                  {tableOrder.order.map((id) => (
                    <li key={id} className={myOrderIndex !== -1 && tableOrder.order[myOrderIndex] === id ? "table-order__me" : undefined}>{nameById(id)}</li>
                  ))}
                </ol>
              ) : null}
              {myOrderIndex === -1 ? <p className="table-order__call">{t("tableOrder.tap")}</p> : null}
              {!allOrderChosen ? (
                <p className="table-order__missing">{t("tableOrder.missing", { count: players.length - tableOrder.order.length })}</p>
              ) : editing === null && autoAdvanceAt !== null ? (
                <AutoAdvance deadline={autoAdvanceAt} hint={t("tableOrder.autoHint")} />
              ) : editing === null ? (
                <p>{t("tableOrder.allChosen")}</p>
              ) : null}
            </div>
          )
        }
        back={showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        actions={
          editing !== null ? (
            <div className="vote-stack">
              <button
                type="button"
                className="inline-action"
                onClick={(event) => {
                  event.stopPropagation();
                  setTableOrder(editing);
                  setEditing(null);
                }}
              >
                {t("tableOrder.saveOrder")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  // Annuler relance le compte à rebours sur l'ordre inchangé.
                  setTableOrder(tableOrder.order);
                  setEditing(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : myOrderIndex === -1 ? (
            // Clavier et lecteurs d'écran : prendre sa place sans toucher la carte.
            <button type="button" className="sr-only-focusable" onClick={() => tableOrderTap()}>
              {t("announce.takeSeat")}
            </button>
          ) : myOrderIndex !== -1 ? (
            <div className="vote-stack">
              {kept ? (
                <button
                  type="button"
                  className="inline-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetTableOrder();
                  }}
                >
                  {t("tableOrder.change")}
                </button>
              ) : allOrderChosen ? (
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
              {allOrderChosen && showOrderAdjustInput && !kept ? (
                <>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, players.length)}
                    value={tableOrderAdjustPosition}
                    aria-label={t("tableOrder.missed")}
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
              {isHost && allOrderChosen ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    pauseTableOrder();
                    setEditing([...tableOrder.order]);
                  }}
                >
                  {t("tableOrder.reorder")}
                </button>
              ) : null}
              {isHost && !kept ? (
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
    gameMeta,
  } = useScreen();
  const { t } = useI18n();
  const duel = gameMeta.mode === "duel";
  return (
    <main className="game-screen">
      <CardSurface
        scoreLeft={duel ? <DuelHeader /> : scoreChip("communist", score.communist)}
        scoreRight={duel ? <span className="score-chip">{t("duel.players")}</span> : scoreChip("nazi", score.nazi)}
        scoreCenter={duel ? undefined : orderReference.length > 0 ? orderLegend : "..."}
        meta={duel ? <div><p>{t("duel.intro")}</p></div> : frontMeta}
        footer={duel ? undefined : frontFooter}
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
        back={duel ? <DuelRulesPanel /> : showFullHistory ? expandedBackContent : defaultBackContent}
        overlay={roleOverlay}
        onOverlayShown={() => {
          if (!hasRevealedRoleOnce) {
            setHasRevealedRoleOnce(true);
          }
        }}
        // Avoir vu son rôle suffit : la validation part quand on relâche la carte (pas avant,
        // sinon le dernier joueur verrait l'écran changer sous son doigt).
        onOverlayHidden={() => {
          if (waitingValidationStep !== "role_reveal") {
            setWaitingValidationStep("role_reveal");
            confirmRole();
          }
        }}
      />
    </main>
  );
}
