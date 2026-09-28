import { useEffect, useState } from "react";

import { FactionIcon } from "../components/game/FactionIcon";
import { useI18n } from "../i18n";
import { openChannel, type PrivateMessage, type PrivateState } from "./channel";

/**
 * Fenêtre privée du mode streamer : rôle, alliés et code de la room, affichés seulement pendant
 * l'appui (souris ou Espace). Au repos, un avertissement : s'il passe en live, OBS capture tout l'écran.
 */
export function PrivateWindow(): JSX.Element {
  const { t } = useI18n();
  const [state, setState] = useState<PrivateState | null>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = `🔒 ${t("streamer.privateTitle")} · Nazi Communiste`;
    const channel = openChannel();
    if (channel === null) return undefined;
    channel.onmessage = (event: MessageEvent<PrivateMessage>) => {
      if (event.data?.type === "state") setState(event.data.state);
    };
    channel.postMessage({ type: "hello" } satisfies PrivateMessage);
    return () => channel.close();
  }, [t]);

  const hold = {
    onPointerDown: () => setShown(true),
    onPointerUp: () => setShown(false),
    onPointerLeave: () => setShown(false),
    onPointerCancel: () => setShown(false),
    onKeyDown: (event: React.KeyboardEvent) => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) {
        event.preventDefault();
        setShown(true);
      }
    },
    onKeyUp: (event: React.KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") setShown(false);
    },
    onBlur: () => setShown(false),
  };

  return (
    <main className="private-window">
      <p className="private-window__idle">{t("streamer.privateIdle")}</p>
      {state === null ? (
        <p>{t("streamer.privateWaiting")}</p>
      ) : (
        <>
          <button type="button" className="private-window__hold" aria-pressed={shown} {...hold}>
            {shown ? (
              <span className="private-window__secret" role="status">
                <strong>
                  <FactionIcon faction={state.faction} /> {state.faction === null ? t("streamer.privateNoRole") : state.roleLabel}
                </strong>
                {state.details !== "" ? <span>{state.details}</span> : null}
                {state.code !== "" ? <span className="mono">{t("streamer.privateRoom", { code: state.code })}</span> : null}
              </span>
            ) : (
              t("streamer.privateHold")
            )}
          </button>
          {state.link !== "" ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void navigator.clipboard?.writeText(state.link).then(() => setCopied(true)).catch(() => undefined)}
            >
              {copied ? t("streamer.copied") : t("streamer.copyLink")}
            </button>
          ) : null}
        </>
      )}
    </main>
  );
}
