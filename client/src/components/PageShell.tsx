import type { ReactNode } from "react";

import { navigate } from "../router";

/** Calque plein écran pour les pages du menu ; la partie continue en dessous. */
export function PageShell({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="page-layer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="page">
        <header className="page__header">
          <button type="button" className="secondary page__back" onClick={() => navigate("/")}>← Retour au jeu</button>
          <h1>{title}</h1>
        </header>
        <div className="page__body">{children}</div>
      </div>
    </div>
  );
}
