import { type ReactNode, useRef, useState } from "react";

import { useI18n } from "../../i18n";

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
  actions?: JSX.Element;
}): JSX.Element {
  const { t } = useI18n();
  const [history, setHistory] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const clearTimer = (): void => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const showBack = history && back !== undefined;

  return (
    <section
      className="card-zone"
      onPointerDown={(event) => {
        pointerStartX.current = event.clientX;
        clearTimer();
        longPressTimer.current = window.setTimeout(() => {
          setShowOverlay(true);
          onOverlayShown?.();
          longPressTimer.current = null;
        }, 360);
      }}
      onPointerMove={(event) => {
        if (pointerStartX.current === null) {
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
      onPointerUp={() => {
        pointerStartX.current = null;
        clearTimer();
        setShowOverlay(false);
      }}
      onPointerCancel={() => {
        pointerStartX.current = null;
        clearTimer();
        setShowOverlay(false);
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
