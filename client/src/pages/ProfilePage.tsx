import { useEffect, useState } from "react";

import { api, ApiRequestError } from "../api";
import type { Account } from "../api";
import { PageShell } from "../components/PageShell";
import type { AccountActions, AccountState } from "../hooks/useAccount";
import { translate, useI18n } from "../i18n";
import { navigate } from "../router";
import { Achievements } from "./Achievements";
import { GameHistory } from "./GameHistory";
import { SecuritySettings } from "./SecuritySettings";
import { StatsGrid } from "./StatsGrid";

type ProfilePageProps = { account: AccountState & AccountActions; userId: string | null; setup: boolean };

export function ProfilePage({ account, userId, setup }: ProfilePageProps): JSX.Element {
  const { t, locale } = useI18n();
  const own = userId === null || userId === account.user?.id;
  const [profile, setProfile] = useState<Account | null>(own ? account.user : null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(account.user?.displayName ?? "");
  // Le compte peut finir de charger après l'ouverture de la page : on remplit le champ ensuite.
  const loadedName = account.user?.displayName ?? "";
  useEffect(() => {
    setName(loadedName);
  }, [loadedName]);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (own) {
      setProfile(account.user);
      return;
    }
    setError(null);
    api<{ profile: Account }>(`/users/${userId}/profile`)
      .then(({ profile: loaded }) => setProfile(loaded))
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : translate("common.error")));
  }, [own, userId, account.user]);

  useEffect(() => {
    // Les stats bougent à chaque fin de partie : on relit le compte à l'ouverture.
    if (own && account.status === "user") {
      void account.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own]);

  if (account.status === "loading") {
    return <PageShell title={t("profile.title")}><p>{t("common.loading")}</p></PageShell>;
  }
  if (own && account.status === "guest") {
    return (
      <PageShell title={t("profile.title")}>
        <div className="panel page-panel">
          <p>{t("profile.guestHint")}</p>
          <button type="button" onClick={() => navigate("/connexion")}>{t("common.login")}</button>
        </div>
      </PageShell>
    );
  }

  const saveName = async (): Promise<void> => {
    setSaved(null);
    setError(null);
    try {
      await account.setDisplayName(name);
      setSaved(t("profile.nameSaved"));
      if (setup) navigate("/");
    } catch (saveError) {
      setError(saveError instanceof ApiRequestError ? saveError.message : t("common.error"));
    }
  };

  return (
    <PageShell title={own ? t("profile.mine") : t("profile.of", { name: profile?.displayName ?? "…" })}>
      <div className="panel page-panel">
        {error !== null ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        {saved !== null ? <p className="form-message">{saved}</p> : null}
        {setup ? <p className="form-message">{t("profile.welcome")}</p> : null}
        {profile !== null ? (
          <>
            {own ? (
              <form className="form" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
                <label className="field">
                  <span className="field-label">{t("profile.pseudo")}</span>
                  <input required minLength={3} maxLength={20} value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <button type="submit" className="secondary" disabled={name.trim() === (profile.displayName ?? "")}>{t("profile.changeName")}</button>
              </form>
            ) : (
              <h2 className="profile-name">{profile.displayName}</h2>
            )}
            <StatsGrid stats={profile.stats} />
            <Achievements stats={profile.stats} />
            {own ? <GameHistory /> : null}
            <p className="mono">{t("profile.joined", { date: new Date(profile.createdAt).toLocaleDateString(locale) })}</p>
            {own ? (
              <>
                <p className="profile-meta">{profile.email}{profile.hasGoogle ? t("profile.linkedGoogle") : ""}</p>
                <SecuritySettings user={profile} onChanged={account.refresh} />
                <button type="button" className="secondary" onClick={() => void account.logout().then(() => navigate("/"))}>{t("profile.logout")}</button>
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => {
                    if (window.confirm(t("profile.deleteConfirm"))) {
                      void account.deleteAccount().then(() => navigate("/"));
                    }
                  }}
                >
                  {t("profile.delete")}
                </button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
