import { useEffect, useState } from "react";

import { useI18n } from "../i18n";
import { PUSH_CHANGED_EVENT, type PushStatus, disablePush, enablePush, pushStatus } from "../push";

/** Option « Notifications » du menu : ton tour et absence, même écran verrouillé. */
export function PushToggle({ publicKey, tabIndex }: { publicKey: string; tabIndex: number }): JSX.Element | null {
  const { t } = useI18n();
  const [status, setStatus] = useState<PushStatus>(pushStatus);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const refresh = () => setStatus(pushStatus());
    window.addEventListener(PUSH_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(PUSH_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (status === "unsupported") return null;

  const toggle = async (on: boolean): Promise<void> => {
    setBusy(true);
    try {
      setStatus(on ? await enablePush(publicKey) : await disablePush());
    } catch {
      setStatus(pushStatus());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="checkbox-row">
        <input
          type="checkbox"
          tabIndex={tabIndex}
          checked={status === "on"}
          disabled={busy || status === "needs_install" || status === "denied"}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {t("menu.notifications")}
      </label>
      {status === "needs_install" ? <p className="menu-help">{t("menu.notificationsInstall")}</p> : null}
      {status === "denied" ? <p className="menu-help">{t("menu.notificationsDenied")}</p> : null}
    </>
  );
}
