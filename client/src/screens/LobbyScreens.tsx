import { useCallback, useState } from "react";

import { PublicRooms } from "../components/PublicRooms";
import { QrScanner } from "../components/QrScanner";
import { RoomInvite } from "../components/RoomInvite";
import { SupportBanner } from "../components/SupportBanner";
import { useI18n } from "../i18n";
import { PLAYABLE_PRESETS, type RulesetPreset } from "../types";
import { useScreen } from "./ScreenContext";

// Écrans hors partie : pseudo, accueil, création ou entrée dans une room, salle d'attente.
export function PseudoEntryScreen(): JSX.Element {
  const { inviteCode, pseudo, setPseudo, confirmPseudo } = useScreen();
  const { t } = useI18n();
  return (
    <main className="screen">
      <section className="panel">
        <h1>{t("pseudo.title")}</h1>
        {inviteCode !== null ? <p>{t("pseudo.inviteHint", { code: inviteCode })}</p> : null}
        <input value={pseudo} maxLength={20} onChange={(event) => setPseudo(event.target.value)} placeholder={t("pseudo.placeholder")} />
        <button type="button" onClick={confirmPseudo}>
          {t("common.validate")}
        </button>
      </section>
    </main>
  );
}

export function LandingScreen(): JSX.Element {
  const { pseudo, navigate } = useScreen();
  const { t } = useI18n();
  return (
    <main className="screen">
      <section className="panel">
        <SupportBanner phase="landing" />
        <p className="mono">{pseudo || t("landing.noPseudo")}</p>
        <h1>Nazi Communiste</h1>
        <button type="button" onClick={() => navigate("create_room")}>
          {t("landing.createRoom")}
        </button>
        <button type="button" onClick={() => navigate("join_room")}>{t("landing.joinRoom")}</button>
        <button type="button" className="secondary" onClick={() => navigate("pseudo_entry")}>{t("landing.editPseudo")}</button>
      </section>
    </main>
  );
}

export function CreateRoomScreen(): JSX.Element {
  const {
    account,
    navigate,
    createRoom,
    roomNameDraft,
    setRoomNameDraft,
    remotePlay,
    setRemotePlay,
    publicDraft,
    setPublicDraft,
    rulesMode,
    setRulesMode,
    presetDraft,
    setPresetDraft,
    customPlayerCount,
    setCustomPlayerCount,
    customNaziCount,
    setCustomNaziCount,
    customCommunistCount,
    setCustomCommunistCount,
    customMissionSizes,
    setCustomMissionSizes,
    customMissionCount,
    setCustomMissionCount,
    customWinThreshold,
    setCustomWinThreshold,
    customInfoMode,
    setCustomInfoMode,
    customExperimental,
    setCustomExperimental,
  } = useScreen();
  const { t } = useI18n();
  const [pace, setPace] = useState<"classic" | "quick">("classic");
  return (
    <main className="screen">
      <section className="panel panel--scroll">
        <h1>{t("createRoom.title")}</h1>
        <input
          value={roomNameDraft}
          onChange={(event) => setRoomNameDraft(event.target.value.toUpperCase())}
          maxLength={24}
          placeholder={t("createRoom.namePlaceholder")}
        />

        <span className="field-label" id="play-mode-label">{t("createRoom.playModeLabel")}</span>
        <div className="segmented" role="radiogroup" aria-labelledby="play-mode-label">
          <button type="button" role="radio" aria-checked={!remotePlay} className={remotePlay ? "secondary" : ""} onClick={() => setRemotePlay(false)}>
            {t("createRoom.local")}
          </button>
          <button type="button" role="radio" aria-checked={remotePlay} className={remotePlay ? "" : "secondary"} onClick={() => setRemotePlay(true)}>
            {t("createRoom.remote")}
          </button>
        </div>
        <p className="field-hint">{remotePlay || publicDraft ? t("createRoom.chatHint") : t("createRoom.noChatHint")}</p>

        <span className="field-label" id="visibility-label">{t("createRoom.visibilityLabel")}</span>
        <div className="segmented" role="radiogroup" aria-labelledby="visibility-label">
          <button type="button" role="radio" aria-checked={!publicDraft} className={publicDraft ? "secondary" : ""} onClick={() => setPublicDraft(false)}>
            {t("createRoom.inviteOnly")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={publicDraft}
            className={publicDraft ? "" : "secondary"}
            disabled={account.status !== "user"}
            onClick={() => {
              setPublicDraft(true);
              setRemotePlay(true);
            }}
          >
            {t("createRoom.public")}
          </button>
        </div>
        {account.status !== "user" ? <p className="field-hint">{t("createRoom.publicLoginHint")}</p> : null}

        <label className="field-label">{t("createRoom.rules")}</label>
        <select value={rulesMode} onChange={(event) => setRulesMode(event.target.value as "default" | "preset" | "custom") }>
          <option value="default">{t("createRoom.rulesDefault")}</option>
          <option value="preset">{t("createRoom.rulesPreset")}</option>
          <option value="custom">{t("createRoom.rulesCustom")}</option>
        </select>

        {rulesMode === "default" ? (
          <>
            <span className="field-label" id="pace-label">{t("createRoom.paceLabel")}</span>
            <div className="segmented" role="radiogroup" aria-labelledby="pace-label">
              <button type="button" role="radio" aria-checked={pace === "classic"} className={pace === "classic" ? "" : "secondary"} onClick={() => setPace("classic")}>
                {t("createRoom.paceClassic")}
              </button>
              <button type="button" role="radio" aria-checked={pace === "quick"} className={pace === "quick" ? "" : "secondary"} onClick={() => setPace("quick")}>
                {t("createRoom.paceQuick")}
              </button>
            </div>
            <p className="field-hint">{pace === "classic" ? t("createRoom.paceClassicHint") : t("createRoom.paceQuickHint")}</p>
          </>
        ) : null}

        {rulesMode === "preset" ? (
          <select value={presetDraft} onChange={(event) => setPresetDraft(event.target.value as RulesetPreset)}>
            {PLAYABLE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {t("createRoom.presetPlayers", { count: preset.replace("PRESET_", "").replace("J", "") })}
              </option>
            ))}
          </select>
        ) : null}

        {rulesMode === "custom" ? (
          <>
            <input
              type="number"
              value={customPlayerCount}
              min={3}
              max={14}
              onChange={(event) => setCustomPlayerCount(Number(event.target.value))}
              placeholder="player_count"
            />
            <input
              type="number"
              value={customNaziCount}
              min={1}
              onChange={(event) => setCustomNaziCount(Number(event.target.value))}
              placeholder="nazi_count"
            />
            <input
              type="number"
              value={customCommunistCount}
              min={1}
              onChange={(event) => setCustomCommunistCount(Number(event.target.value))}
              placeholder="communist_count"
            />
            <input
              value={customMissionSizes}
              onChange={(event) => setCustomMissionSizes(event.target.value)}
              placeholder="mission_sizes (ex: 2,3,2,3,3)"
            />
            <input
              type="number"
              value={customMissionCount}
              min={1}
              onChange={(event) => setCustomMissionCount(Number(event.target.value))}
              placeholder="mission_count"
            />
            <input
              type="number"
              value={customWinThreshold}
              min={1}
              onChange={(event) => setCustomWinThreshold(Number(event.target.value))}
              placeholder="win_threshold"
            />
            <select value={customInfoMode} onChange={(event) => setCustomInfoMode(event.target.value as "full" | "partial" | "blind")}>
              <option value="full">full</option>
              <option value="partial">partial</option>
              <option value="blind">blind</option>
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={customExperimental}
                onChange={(event) => setCustomExperimental(event.target.checked)}
              />
              experimental
            </label>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => {
            const config =
              rulesMode === "default"
                ? null
                : rulesMode === "preset"
                ? { ruleset_preset: presetDraft }
                : {
                    ruleset: {
                      player_count: customPlayerCount,
                      nazi_count: customNaziCount,
                      communist_count: customCommunistCount,
                      mission_sizes: customMissionSizes
                        .split(",")
                        .map((entry) => Number(entry.trim()))
                        .filter((entry) => Number.isFinite(entry) && entry > 0),
                      mission_count: customMissionCount,
                      win_threshold: customWinThreshold,
                      info_mode: customInfoMode,
                      experimental: customExperimental,
                    },
                  };

            createRoom({ roomName: roomNameDraft, config, chatEnabled: remotePlay || publicDraft, isPublic: publicDraft, pace });
          }}
        >
          {t("createRoom.submit")}
        </button>
        <button type="button" className="secondary" onClick={() => navigate("landing")}>{t("common.back")}</button>
      </section>
    </main>
  );
}

export function JoinRoomScreen(): JSX.Element {
  const { account, navigate, joinRoom, joinCodeDraft, setJoinCodeDraft } = useScreen();
  const { t } = useI18n();
  const [scanning, setScanning] = useState(false);
  const onScanned = useCallback(
    (code: string) => {
      setScanning(false);
      setJoinCodeDraft(code);
      joinRoom(code);
    },
    [joinRoom, setJoinCodeDraft],
  );
  return (
    <main className="screen">
      {scanning ? <QrScanner onCode={onScanned} onClose={() => setScanning(false)} /> : null}
      <section className="panel panel--scroll">
        <h1>{t("joinRoom.title")}</h1>
        <button type="button" onClick={() => setScanning(true)}>{t("scanner.open")}</button>
        <input
          value={joinCodeDraft}
          onChange={(event) => setJoinCodeDraft(event.target.value.toUpperCase())}
          maxLength={24}
          placeholder={t("joinRoom.codePlaceholder")}
        />
        <button type="button" onClick={() => joinRoom(joinCodeDraft)}>{t("common.join")}</button>
        <PublicRooms signedIn={account.status === "user"} onJoin={joinRoom} />
        <button type="button" className="secondary" onClick={() => navigate("landing")}>{t("common.back")}</button>
      </section>
    </main>
  );
}

export function WaitingRoomScreen(): JSX.Element {
  const {
    account,
    roomCode,
    myId,
    players,
    minPlayers,
    targetPlayerCount,
    isHost,
    canStart,
    flexibleRoom,
    isPublic,
    pace,
    setPace,
    chatEnabled,
    setPublicRoom,
    setChatMode,
    transferHost,
    kickPlayer,
    startGame,
    leaveRoom,
  } = useScreen();
  const { t } = useI18n();
  return (
    <main className="screen">
      <section className="panel panel--scroll">
        <SupportBanner phase="waiting_room" />
        <RoomInvite code={roomCode} />
        <h1>{t("waiting.title")}</h1>
        <p className="mono">
          {isPublic ? t("waiting.publicPrefix") : ""}
          {chatEnabled ? t("waiting.remoteChat") : t("waiting.localNoChat")}
        </p>
        {isHost && account.status === "user" ? (
          <label className="checkbox-row">
            <input type="checkbox" checked={isPublic} onChange={(event) => setPublicRoom(event.target.checked)} />
            {t("waiting.publicToggle")}
          </label>
        ) : null}
        <p className="mono">
          {flexibleRoom
            ? t("waiting.playersFlexible", { count: players.length, min: minPlayers, max: targetPlayerCount })
            : t("waiting.playersFixed", { count: players.length, max: targetPlayerCount })}
        </p>
        {flexibleRoom ? (
          isHost ? (
            <div className="segmented" role="radiogroup" aria-label={t("createRoom.paceLabel")}>
              <button type="button" role="radio" aria-checked={pace === "classic"} className={pace === "classic" ? "" : "secondary"} onClick={() => setPace("classic")}>
                {t("createRoom.paceClassic")}
              </button>
              <button type="button" role="radio" aria-checked={pace === "quick"} className={pace === "quick" ? "" : "secondary"} onClick={() => setPace("quick")}>
                {t("createRoom.paceQuick")}
              </button>
            </div>
          ) : (
            <p className="mono">{pace === "quick" ? t("createRoom.paceQuick") : t("createRoom.paceClassic")}</p>
          )
        ) : null}
        {isHost ? (
          <div className="segmented" role="radiogroup" aria-label={t("waiting.modeLabel")}>
            <button type="button" role="radio" aria-checked={!chatEnabled} className={chatEnabled ? "secondary" : ""} onClick={() => setChatMode(false)}>
              {t("createRoom.local")}
            </button>
            <button type="button" role="radio" aria-checked={chatEnabled} className={chatEnabled ? "" : "secondary"} onClick={() => setChatMode(true)}>
              {t("createRoom.remote")}
            </button>
          </div>
        ) : null}
        <ul className="plain-list lobby-players">
          {players.map((player) => (
            <li key={player.id} className="lobby-player">
              <span className="lobby-player__name">
                {player.pseudo ?? player.id} {player.isHost ? t("waiting.host") : ""} {player.isConnected === false ? t("waiting.disconnected") : ""}
              </span>
              {isHost && player.id !== myId ? (
                <>
                  <button
                    type="button"
                    className="secondary icon-button"
                    title={t("waiting.giveHostTitle")}
                    aria-label={t("waiting.giveHostLabel", { name: player.pseudo ?? t("waiting.thisPlayer") })}
                    onClick={() => {
                      if (window.confirm(t("waiting.giveHostConfirm", { name: player.pseudo ?? t("waiting.thisPlayer") }))) transferHost(player.id);
                    }}
                  >
                    ♔
                  </button>
                  <button
                    type="button"
                    className="secondary icon-button"
                    title={t("waiting.kickTitle")}
                    aria-label={t("waiting.kickLabel", { name: player.pseudo ?? t("waiting.thisPlayer") })}
                    onClick={() => {
                      if (window.confirm(t("waiting.kickConfirm", { name: player.pseudo ?? t("waiting.thisPlayer") }))) kickPlayer(player.id);
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="lobby-actions">
          {isHost ? (
            <button type="button" disabled={!canStart} onClick={startGame}>
              {canStart
                ? t("waiting.start", { count: players.length })
                : t("waiting.waitingMin", { count: players.length, min: minPlayers })}
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={leaveRoom}>
            {t("waiting.leave")}
          </button>
        </div>
      </section>
    </main>
  );
}
