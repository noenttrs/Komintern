import { PublicRooms } from "../components/PublicRooms";
import { RoomInvite } from "../components/RoomInvite";
import { PLAYABLE_PRESETS, type RulesetPreset } from "../types";
import { useScreen } from "./ScreenContext";

// Écrans hors partie : pseudo, accueil, création ou entrée dans une room, salle d'attente.
export function PseudoEntryScreen(): JSX.Element {
  const { inviteCode, pseudo, setPseudo, confirmPseudo } = useScreen();
  return (
    <main className="screen">
      <section className="panel">
        <h1>Pseudo</h1>
        {inviteCode !== null ? <p>Choisis un pseudo pour rejoindre la room {inviteCode}.</p> : null}
        <input value={pseudo} maxLength={20} onChange={(event) => setPseudo(event.target.value)} placeholder="Votre pseudo" />
        <button type="button" onClick={confirmPseudo}>
          Valider
        </button>
      </section>
    </main>
  );
}

export function LandingScreen(): JSX.Element {
  const { pseudo, navigate } = useScreen();
  return (
    <main className="screen">
      <section className="panel">
        <p className="mono">{pseudo || "Sans pseudo"}</p>
        <h1>Nazi Communiste</h1>
        <button type="button" onClick={() => navigate("create_room")}>
          Creer une room
        </button>
        <button type="button" onClick={() => navigate("join_room")}>Rejoindre une room</button>
        <button type="button" className="secondary" onClick={() => navigate("pseudo_entry")}>Modifier pseudo</button>
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
  return (
    <main className="screen">
      <section className="panel panel--scroll">
        <h1>Creation room</h1>
        <input
          value={roomNameDraft}
          onChange={(event) => setRoomNameDraft(event.target.value.toUpperCase())}
          maxLength={24}
          placeholder="Nom de room (optionnel)"
        />

        <span className="field-label" id="play-mode-label">Où jouez-vous ?</span>
        <div className="segmented" role="radiogroup" aria-labelledby="play-mode-label">
          <button type="button" role="radio" aria-checked={!remotePlay} className={remotePlay ? "secondary" : ""} onClick={() => setRemotePlay(false)}>
            Sur place
          </button>
          <button type="button" role="radio" aria-checked={remotePlay} className={remotePlay ? "" : "secondary"} onClick={() => setRemotePlay(true)}>
            À distance
          </button>
        </div>
        <p className="field-hint">{remotePlay || publicDraft ? "Un chat est disponible pendant la partie." : "Pas de chat : tout se dit autour de la table."}</p>

        <span className="field-label" id="visibility-label">Qui peut rejoindre ?</span>
        <div className="segmented" role="radiogroup" aria-labelledby="visibility-label">
          <button type="button" role="radio" aria-checked={!publicDraft} className={publicDraft ? "secondary" : ""} onClick={() => setPublicDraft(false)}>
            Sur invitation
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
            Publique
          </button>
        </div>
        {account.status !== "user" ? <p className="field-hint">Connecte-toi pour créer une partie publique, ouverte à tous.</p> : null}

        <label className="field-label">Regles</label>
        <select value={rulesMode} onChange={(event) => setRulesMode(event.target.value as "default" | "preset" | "custom") }>
          <option value="default">Standard (de 4 à 11 joueurs)</option>
          <option value="preset">Nombre de joueurs fixe</option>
          <option value="custom">Règles personnalisées</option>
        </select>

        {rulesMode === "preset" ? (
          <select value={presetDraft} onChange={(event) => setPresetDraft(event.target.value as RulesetPreset)}>
            {PLAYABLE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset.replace("PRESET_", "").replace("J", " joueurs")}
              </option>
            ))}
          </select>
        ) : null}

        {rulesMode === "custom" ? (
          <>
            <input
              type="number"
              value={customPlayerCount}
              min={4}
              max={11}
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

            createRoom({ roomName: roomNameDraft, config, chatEnabled: remotePlay || publicDraft, isPublic: publicDraft });
          }}
        >
          Creer
        </button>
        <button type="button" className="secondary" onClick={() => navigate("landing")}>Retour</button>
      </section>
    </main>
  );
}

export function JoinRoomScreen(): JSX.Element {
  const { account, navigate, joinRoom, joinCodeDraft, setJoinCodeDraft } = useScreen();
  return (
    <main className="screen">
      <section className="panel panel--scroll">
        <h1>Rejoindre room</h1>
        <input
          value={joinCodeDraft}
          onChange={(event) => setJoinCodeDraft(event.target.value.toUpperCase())}
          maxLength={24}
          placeholder="Code room"
        />
        <button type="button" onClick={() => joinRoom(joinCodeDraft)}>Rejoindre</button>
        <PublicRooms signedIn={account.status === "user"} onJoin={joinRoom} />
        <button type="button" className="secondary" onClick={() => navigate("landing")}>Retour</button>
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
    chatEnabled,
    setPublicRoom,
    setChatMode,
    transferHost,
    kickPlayer,
    startGame,
    leaveRoom,
  } = useScreen();
  return (
    <main className="screen">
      <section className="panel panel--scroll">
        <RoomInvite code={roomCode} />
        <h1>Salle d attente</h1>
        <p className="mono">
          {isPublic ? "Partie publique · " : ""}
          {chatEnabled ? "à distance · chat activé" : "sur place · sans chat"}
        </p>
        {isHost && account.status === "user" ? (
          <label className="checkbox-row">
            <input type="checkbox" checked={isPublic} onChange={(event) => setPublicRoom(event.target.checked)} />
            Partie publique (listée, comptes uniquement)
          </label>
        ) : null}
        <p className="mono">
          {flexibleRoom ? `${players.length} joueurs · de ${minPlayers} à ${targetPlayerCount}` : `${players.length} / ${targetPlayerCount} joueurs`}
        </p>
        {isHost ? (
          <div className="segmented" role="radiogroup" aria-label="Mode de jeu">
            <button type="button" role="radio" aria-checked={!chatEnabled} className={chatEnabled ? "secondary" : ""} onClick={() => setChatMode(false)}>
              Sur place
            </button>
            <button type="button" role="radio" aria-checked={chatEnabled} className={chatEnabled ? "" : "secondary"} onClick={() => setChatMode(true)}>
              À distance
            </button>
          </div>
        ) : null}
        <ul className="plain-list lobby-players">
          {players.map((player) => (
            <li key={player.id} className="lobby-player">
              <span className="lobby-player__name">
                {player.pseudo ?? player.id} {player.isHost ? "(hôte)" : ""} {player.isConnected === false ? "(déconnecté)" : ""}
              </span>
              {isHost && player.id !== myId ? (
                <>
                  <button
                    type="button"
                    className="secondary icon-button"
                    title="Donner le rôle d'hôte"
                    aria-label={`Donner le rôle d'hôte à ${player.pseudo ?? "ce joueur"}`}
                    onClick={() => {
                      if (window.confirm(`Donner le rôle d'hôte à ${player.pseudo ?? "ce joueur"} ?`)) transferHost(player.id);
                    }}
                  >
                    ♔
                  </button>
                  <button
                    type="button"
                    className="secondary icon-button"
                    title="Exclure"
                    aria-label={`Exclure ${player.pseudo ?? "ce joueur"}`}
                    onClick={() => {
                      if (window.confirm(`Exclure ${player.pseudo ?? "ce joueur"} de la room ?`)) kickPlayer(player.id);
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
                ? `Demarrer (${players.length} joueurs)`
                : `En attente : ${players.length} / ${minPlayers} joueurs minimum`}
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={leaveRoom}>
            Quitter
          </button>
        </div>
      </section>
    </main>
  );
}
