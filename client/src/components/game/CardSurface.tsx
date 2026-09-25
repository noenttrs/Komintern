import { type ReactNode, useEffect, useRef, useState } from "react";

import { useI18n } from "../../i18n";

// Appui long (révélation du rôle) : prioritaire sur tout le reste. Tant qu'il dure, et un court
// instant après, aucun clic n'est transmis (bouton touché avec un autre doigt, doigt relâché sur
// un bouton, tap global de confirmation) : pas de réponse envoyée par erreur.
const HOLD_RELEASE_GUARD_MS = 350;
let holdActive = false;
let holdEndedAt = 0;

export function isHoldGuardActive(now = Date.now()): boolean {
  return holdActive || now - holdEndedAt < HOLD_RELEASE_GUARD_MS;
}

function startHold(): void {
  holdActive = true;
}

function endHold(): void {
  if (!holdActive) return;
  holdActive = false;
  holdEndedAt = Date.now();
}

/** Réservé aux tests. */
export function resetHoldGuard(): void {
  holdActive = false;
  holdEndedAt = 0;
}

if (typeof document !== "undefined") {
  // Phase de capture sur document : passe avant React et avant les écouteurs de window.
  document.addEventListener(
    "click",
    (event) => {
      if (isHoldGuardActive()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
}

export function CardSurface({
  scoreLeft,
  scoreCenter,
  scoreRight,
  meta,
  footer,
  front,
  back,
  overlay,
  onOverlayShown,
  onOverlayHidden,
  actions,
}: {
  scoreLeft: ReactNode;
  scoreCenter?: ReactNode;
  scoreRight: ReactNode;
  meta?: JSX.Element;
  footer?: JSX.Element;
  front: JSX.Element;
  back?: JSX.Element;
  overlay?: JSX.Element;
  onOverlayShown?: () => void;
  /** Doigt relevé après avoir affiché le calque (le joueur a fini de regarder). */
  onOverlayHidden?: () => void;
  actions?: JSX.Element;
}): JSX.Element {
  const { t } = useI18n();
  const [history, setHistory] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  // Doigt qui a lancé l'appui long : les autres doigts ne le relancent ni ne l'arrêtent.
  const holdPointer = useRef<number | null>(null);

  const clearTimer = (): void => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const releasePointer = (): void => {
    holdPointer.current = null;
    pointerStartX.current = null;
    clearTimer();
    endHold();
    if (showOverlay) onOverlayHidden?.();
    setShowOverlay(false);
  };

  // Écran quitté en plein appui long : on ne laisse pas la garde active.
  useEffect(() => () => endHold(), []);

  const showBack = history && back !== undefined;

  return (
    <section
      className="card-zone"
      onPointerDown={(event) => {
        if (holdPointer.current !== null) {
          return;
        }
        holdPointer.current = event.pointerId;
        pointerStartX.current = event.clientX;
        clearTimer();
        longPressTimer.current = window.setTimeout(() => {
          longPressTimer.current = null;
          if (overlay === undefined) return;
          startHold();
          setShowOverlay(true);
          onOverlayShown?.();
        }, 360);
      }}
      onPointerMove={(event) => {
        if (pointerStartX.current === null || event.pointerId !== holdPointer.current) {
          return;
        }
        const delta = event.clientX - pointerStartX.current;
        if (Math.abs(delta) > 45 && back !== undefined) {
          if (delta < 0) {
            setHistory(true);
          } else {
            setHistory(false);
          }
          pointerStartX.current = null;
          clearTimer();
        }
      }}
      onPointerUp={(event) => {
        if (event.pointerId !== holdPointer.current) return;
        releasePointer();
      }}
      onPointerCancel={(event) => {
        if (event.pointerId !== holdPointer.current) return;
        releasePointer();
      }}
    >
      <header className="score-line" aria-label={t("game.score")}>
        <span>{scoreLeft}</span>
        <span>{scoreCenter}</span>
        <span>{scoreRight}</span>
      </header>

      <div className="card">
        <div className={showBack ? "card__inner card__inner--flipped" : "card__inner"}>
          <div className="card__face card__face--flat card__face--front">
            {meta ? <div className="card__meta">{meta}</div> : null}
            <div className="card__content">{front}</div>
            {footer ? <div className="card__footer">{footer}</div> : null}
            {actions ? <div className="card__actions">{actions}</div> : null}
          </div>
          {back ? (
            <div className="card__face card__face--flat card__face--back">
              {meta ? <div className="card__meta">{meta}</div> : null}
              <div className="card__content">{back}</div>
              {footer ? <div className="card__footer">{footer}</div> : null}
              {actions ? <div className="card__actions">{actions}</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      {showOverlay && overlay ? <div className="card-overlay">{overlay}</div> : null}
    </section>
  );
}
