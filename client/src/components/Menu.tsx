import { useEffect, useRef, useState } from "react";

import type { AlertSettings } from "../hooks/useTurnAlerts";
import { useI18n } from "../i18n";
import { navigate } from "../router";

type MenuProps = {
  signedIn: boolean;
  displayName: string | null;
  isAdmin?: boolean;
  pendingRequests: number;
  alerts?: { settings: AlertSettings; update: (settings: AlertSettings) => void };
  install: { canPrompt: boolean; isIos: boolean; installed: boolean; install: () => Promise<void> };
};

/** Menu refermable : tiroir latéral, fermé par défaut, par-dessus le jeu sans l'interrompre. */
export function Menu({ signedIn, displayName, isAdmin = false, pendingRequests, alerts, install }: MenuProps): JSX.Element {
  const { t, lang, setLang } = useI18n();
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
        aria-label={open ? t("menu.close") : t("menu.open")}
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
        aria-label={t("menu.label")}
        aria-hidden={!open}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="mono">{signedIn ? displayName ?? t("menu.account") : t("menu.guest")}</p>
        <button type="button" onClick={() => go("/")} tabIndex={open ? 0 : -1}>{t("menu.play")}</button>
        <button type="button" onClick={() => go("/regles")} tabIndex={open ? 0 : -1}>{t("menu.rules")}</button>
        {signedIn ? (
          <>
            <button type="button" onClick={() => go("/profil")} tabIndex={open ? 0 : -1}>{t("menu.profile")}</button>
            <button type="button" onClick={() => go("/amis")} tabIndex={open ? 0 : -1}>
              {t("menu.friends")}{pendingRequests > 0 ? ` (${pendingRequests})` : ""}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => go("/connexion")} tabIndex={open ? 0 : -1}>{t("menu.login")}</button>
        )}
        {isAdmin ? <button type="button" onClick={() => go("/admin")} tabIndex={open ? 0 : -1}>{t("menu.admin")}</button> : null}
        <button type="button" className="menu-support" onClick={() => go("/soutenir")} tabIndex={open ? 0 : -1}>{t("menu.support")}</button>
        {!install.installed && (install.canPrompt || install.isIos) ? (
          <button
            type="button"
            className="secondary"
            tabIndex={open ? 0 : -1}
            onClick={() => (install.canPrompt ? void install.install() : setShowIosHelp((current) => !current))}
          >
            {t("menu.install")}
          </button>
        ) : null}
        {showIosHelp ? <p className="menu-help">{t("menu.iosHelp")}</p> : null}
        {alerts !== undefined ? (
          <div className="menu-toggles">
            <label className="checkbox-row">
              <input
                type="checkbox"
                tabIndex={open ? 0 : -1}
                checked={alerts.settings.vibration}
                onChange={(event) => alerts.update({ ...alerts.settings, vibration: event.target.checked })}
              />
              {t("menu.vibration")}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                tabIndex={open ? 0 : -1}
                checked={alerts.settings.sound}
                onChange={(event) => alerts.update({ ...alerts.settings, sound: event.target.checked })}
              />
              {t("menu.sound")}
            </label>
          </div>
        ) : null}
        <div className="segmented menu-lang" role="group" aria-label={t("menu.language")}>
          {(["fr", "en"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              lang={entry}
              className={lang === entry ? "" : "secondary"}
              aria-pressed={lang === entry}
              tabIndex={open ? 0 : -1}
              onClick={() => setLang(entry)}
            >
              {entry.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="menu-footer">
          <button type="button" className="secondary" onClick={() => go("/a-propos")} tabIndex={open ? 0 : -1}>{t("menu.about")}</button>
          <button type="button" className="secondary" onClick={() => go("/contact")} tabIndex={open ? 0 : -1}>{t("menu.contact")}</button>
          <button type="button" className="secondary" onClick={() => go("/mentions-legales")} tabIndex={open ? 0 : -1}>{t("menu.legal")}</button>
        </div>
      </nav>
    </>
  );
}
