import { useEffect, useRef, useState } from "react";

import { navigate } from "../router";

type MenuProps = {
  signedIn: boolean;
  displayName: string | null;
  isAdmin?: boolean;
  pendingRequests: number;
  install: { canPrompt: boolean; isIos: boolean; installed: boolean; install: () => Promise<void> };
};

/** Menu refermable : tiroir latéral, fermé par défaut, par-dessus le jeu sans l'interrompre. */
export function Menu({ signedIn, displayName, isAdmin = false, pendingRequests, install }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    drawerRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && drawerRef.current !== null) {
        // Focus piégé dans le tiroir tant qu'il est ouvert.
        const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>("button, a")];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (path: string): void => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="menu-toggle"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
        {!open && pendingRequests > 0 ? <span className="menu-badge">{pendingRequests}</span> : null}
      </button>
      {open ? <div className="menu-backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
      <nav
        id="main-menu"
        ref={drawerRef}
        className={open ? "menu-drawer menu-drawer--open" : "menu-drawer"}
        aria-label="Menu principal"
        aria-hidden={!open}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mono">{signedIn ? displayName ?? "Compte" : "Invité"}</p>
        <button type="button" onClick={() => go("/")} tabIndex={open ? 0 : -1}>Jouer</button>
        <button type="button" onClick={() => go("/regles")} tabIndex={open ? 0 : -1}>Règles du jeu</button>
        {signedIn ? (
          <>
            <button type="button" onClick={() => go("/profil")} tabIndex={open ? 0 : -1}>Profil</button>
            <button type="button" onClick={() => go("/amis")} tabIndex={open ? 0 : -1}>
              Amis{pendingRequests > 0 ? ` (${pendingRequests})` : ""}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => go("/connexion")} tabIndex={open ? 0 : -1}>Se connecter</button>
        )}
        {isAdmin ? <button type="button" onClick={() => go("/admin")} tabIndex={open ? 0 : -1}>Administration</button> : null}
        <button type="button" className="menu-support" onClick={() => go("/soutenir")} tabIndex={open ? 0 : -1}>♥ Soutenir le projet</button>
        {!install.installed && (install.canPrompt || install.isIos) ? (
          <button
            type="button"
            className="secondary"
            tabIndex={open ? 0 : -1}
            onClick={() => (install.canPrompt ? void install.install() : setShowIosHelp((current) => !current))}
          >
            Installer l'application
          </button>
        ) : null}
        {showIosHelp ? <p className="menu-help">Sur iPhone : bouton Partager, puis « Sur l'écran d'accueil ».</p> : null}
        <div className="menu-footer">
          <button type="button" className="secondary" onClick={() => go("/a-propos")} tabIndex={open ? 0 : -1}>À propos</button>
          <button type="button" className="secondary" onClick={() => go("/contact")} tabIndex={open ? 0 : -1}>Contact</button>
          <button type="button" className="secondary" onClick={() => go("/mentions-legales")} tabIndex={open ? 0 : -1}>Mentions légales</button>
        </div>
      </nav>
    </>
  );
}
