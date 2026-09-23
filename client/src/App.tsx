import { type ReactNode, useEffect, useRef, useState } from "react";

import { ChatPanel } from "./components/ChatPanel";
import { Menu } from "./components/Menu";
import { useAccount } from "./hooks/useAccount";
import { useFriends } from "./hooks/useFriends";
import { useGameSocket } from "./hooks/useGameSocket";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useTurnAlerts } from "./hooks/useTurnAlerts";
import { AboutPage } from "./pages/AboutPage";
import { AdminPage } from "./pages/AdminPage";
import { ContactPage } from "./pages/ContactPage";
import { SupportPage } from "./pages/SupportPage";
import { AuthPage } from "./pages/AuthPage";
import { FriendsPage } from "./pages/FriendsPage";
import { LegalPage } from "./pages/LegalPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RoomInvite } from "./components/RoomInvite";
import { Tutorial } from "./components/Tutorial";
import { RulesPage } from "./pages/RulesPage";
import { joinCodeFromPath, navigate as goTo, useRoute } from "./router";
import { socket } from "./socket";

import { PLAYABLE_PRESETS, type ConfidenceVote, type MissionVote, type RulesetPreset, type UIPhase } from "./types";

function FactionIcon({ faction }: { faction: "nazi" | "communist" | null }): JSX.Element {
  if (faction === "communist") {
    return (
      <svg className="faction-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M21 12c-2 0-3-3-6-3s-3 2-3 2s0-2-3-2s-4 3-6 3c-1 0-2-1-2-1s1 5 5 5c5 0 6-3 6-3s1 3 6 3c4 0 5-5 5-5s-1 1-2 1" />
      </svg>
    );
  }

  if (faction === "nazi") {
    return (
      <svg className="faction-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
        <path fill="currentColor" d="M256 25c-71 0-111.7 11.79-135.2 38.89C100.2 87.64 91.37 125.9 89.49 183H16v18h480v-18h-73.5c-1.9-57.1-10.7-95.36-31.3-119.11C367.7 36.79 327 25 256 25M108.4 217c-2.2 15.1-3.4 30.9-3.4 47c0 25.5 2.9 50 8.3 72.8c1.5-2.2 3-4.3 4.6-6.5c8.5-12 17.5-24.5 29.3-34.4c11.7-9.8 26.6-16.9 44.8-16.9c17.5 0 35.1 4.2 49 13.5c5.9 3.9 11 8.9 15 14.8c4-5.9 9.1-10.9 15-14.8c13.9-9.3 31.5-13.5 49-13.5c18.2 0 33.1 7.1 44.8 16.9c11.8 9.9 20.8 22.4 29.3 34.4c1.6 2.2 3.1 4.3 4.6 6.5c5.4-22.8 8.3-47.3 8.3-72.8c0-16.1-1.2-31.9-3.4-47zm83.6 80c-13.8 0-23.8 4.8-33.2 12.7s-17.8 19.2-26.2 31.1c-8.4 11.8-16.8 24.2-27.5 34.3c-10.7 10-24.23 17.5-40.9 17.9c-20.06.5-39.32-11.3-55.147-23.2c2.077 4.1 4.077 8.2 6.467 12.5c14.17 25.5 34.55 51.7 51.26 57.1c18.97 6.2 54.32-4.1 90.02-17.9C192.5 407.6 228 391 256 391s63.5 16.6 99.2 30.5c35.7 13.8 71.1 24.1 90 17.9c16.7-5.4 37.1-31.6 51.3-57.1c2.4-4.3 4.4-8.4 6.4-12.5c-15.8 11.9-35 23.7-55.1 23.2c-16.7-.4-30.2-7.9-40.9-17.9c-10.7-10.1-19.1-22.5-27.5-34.3c-8.4-11.9-16.8-23.2-26.2-31.1S333.8 297 320 297c-14.5 0-28.9 3.8-39 10.5S265 323 256 323s-14.9-8.8-25-15.5s-24.5-10.5-39-10.5m64 112c-20 0-56.5 15.2-92.7 29.2c-.3.1-.7.3-1 .4c26 30.7 58.6 48.4 93.7 48.4s67.7-17.7 93.7-48.4c-.3-.1-.7-.3-1-.4c-36.2-14-72.7-29.2-92.7-29.2" />
      </svg>
    );
  }

  return <span className="faction-icon-fallback">?</span>;
}

function scoreChip(faction: "nazi" | "communist", score: number): JSX.Element {
  return (
    <span className="score-chip">
      <FactionIcon faction={faction} /> : {score}
    </span>
  );
}

function WaitingCard({ message }: { message: string }): JSX.Element {
  return (
    <div className="waiting-card-inline">
      <h2>Validation envoyee</h2>
      <p>{message}</p>
    </div>
  );
}

function CardSurface({
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
      <header className="score-line" aria-label="score">
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

function VoteButtons({
  first,
  second,
  onVote,
  disabled,
  randomize,
  selectedVote,
  disabledVotes,
  split,
}: {
  first: { vote: ConfidenceVote | MissionVote; symbol: ReactNode };
  second: { vote: ConfidenceVote | MissionVote; symbol: ReactNode };
  onVote: (value: ConfidenceVote | MissionVote) => void;
  disabled?: boolean;
  randomize?: boolean;
  selectedVote?: ConfidenceVote | MissionVote | null;
  disabledVotes?: Array<ConfidenceVote | MissionVote>;
  split?: boolean;
}): JSX.Element {
  const isSwappedRef = useRef<boolean>(randomize === true && Math.random() > 0.5);
  const order = isSwappedRef.current ? [second, first] : [first, second];
  const isDisabled = (vote: ConfidenceVote | MissionVote): boolean => disabled === true || disabledVotes?.includes(vote) === true;
  return (
    <div className={split === true ? "vote-stack vote-stack--split" : "vote-stack"}>
      <button
        type="button"
        className={selectedVote === order[0].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[0].vote)}
        onClick={() => onVote(order[0].vote)}
      >
        {order[0].symbol}
      </button>
      <button
        type="button"
        className={selectedVote === order[1].vote ? "vote-btn vote-btn--active" : "vote-btn"}
        disabled={isDisabled(order[1].vote)}
        onClick={() => onVote(order[1].vote)}
      >
        {order[1].symbol}
      </button>
    </div>
  );
}

function StatusBanners({
  error,
  onDismiss,
  notice,
  onDismissNotice,
  invite,
  onAcceptInvite,
  onDismissInvite,
  connection,
  inRoom,
}: {
  error: { message: string; id: number } | null;
  onDismiss: () => void;
  notice: { message: string; id: number } | null;
  onDismissNotice: () => void;
  invite: { code: string; fromName: string } | null;
  onAcceptInvite: () => void;
  onDismissInvite: () => void;
  connection: string;
  inRoom: boolean;
}): JSX.Element | null {
  useEffect(() => {
    if (error === null) {
      return;
    }
    const timer = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(timer);
  }, [error, onDismiss]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = window.setTimeout(onDismissNotice, 4000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismissNotice]);

  const connectionMessage =
    !inRoom ? null : connection === "disconnected" ? "Connexion perdue, reconnexion en cours..." : connection === "connecting" ? "Connexion..." : null;

  if (error === null && connectionMessage === null && notice === null && invite === null) {
    return null;
  }
  return (
    <div className="status-banners" role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
      {connectionMessage !== null ? <p className="status-banner status-banner--connection">{connectionMessage}</p> : null}
      {invite !== null ? (
        <div className="status-banner status-banner--invite">
          <span>{invite.fromName} t'invite dans la room {invite.code}</span>
          <button type="button" onClick={onAcceptInvite}>Rejoindre</button>
          <button type="button" className="secondary" onClick={onDismissInvite}>Ignorer</button>
        </div>
      ) : null}
      {notice !== null ? (
        <button type="button" className="status-banner status-banner--connection" onClick={onDismissNotice}>
          {notice.message}
        </button>
      ) : null}
      {error !== null ? (
        <button type="button" className="status-banner status-banner--error" onClick={onDismiss}>
          {error.message}
        </button>
      ) : null}
    </div>
  );
}

function isGamePhaseUi(phase: UIPhase): boolean {
  return !["pseudo_entry", "landing", "create_room", "join_room", "waiting_room"].includes(phase);
}

/** Étape de validation correspondant à un écran, pour restaurer « déjà validé » au resync. */
function stepForPhase(phase: UIPhase): string | null {
  const steps: Partial<Record<UIPhase, string>> = {
    table_order: "table_order",
    role_reveal: "role_reveal",
    confidence_vote: "confidence_vote",
    confidence_result: "confidence_result",
    mission_execution: "mission_vote",
    mission_result: "mission_result",
    end_game: "end_game",
  };
  return steps[phase] ?? null;
}

function formatMissionVotes(naziVoteCount: number, teamSize: number): string {
  const naziVotes = Math.max(0, naziVoteCount);
  const communistVotes = Math.max(0, teamSize - naziVotes);
  return `vote : nazi:${naziVotes} communist:${communistVotes}`;
}

function MissionProgress({ team, submittedPlayerIds }: { team: string[]; submittedPlayerIds: string[] }): JSX.Element {
  if (team.length === 0) {
    return <span className="progress-dots progress-dots--compact" aria-label="progression de mission">...</span>;
  }

  return (
    <span className="progress-dots progress-dots--compact" aria-label="progression de mission">
      {team.map((playerId) => (
        <span key={playerId} className={submittedPlayerIds.includes(playerId) ? "dot dot--full" : "dot"} />
      ))}
    </span>
  );
}

export default function App(): JSX.Element {
  const {
    pseudo,
    roomCode,
    myId,
    hostId,
    targetPlayerCount,
    minPlayers,
    players,
    phase,
    error,
    connection,
    myProgress,
    gameOver,
    tableOrder,
    role,
    proposal,
    confidence,
    confidenceHistory,
    mission,
    gameMeta,
    missionHistory,
    score,
    winner,
    revealedRoles,
    setPseudo,
    confirmPseudo,
    navigate,
    dismissError,
    createRoom,
    startGame,
    joinRoom,
    leaveRoom,
    tableOrderTap,
    adjustTableOrder,
    confirmTableOrder,
    resetTableOrder,
    confirmRole,
    proposeTeam,
    sendConfidenceVote,
    confirmConfidenceResult,
    sendMissionVote,
    confirmMissionResult,
    confirmEndGame,
    sendReplayChoice,
    chat,
    invite,
    notice,
    sendChat,
    report,
    inviteFriend,
    acceptInvite,
    dismissInvite,
    dismissNotice,
    roomStatus,
    chatEnabled,
    kickPlayer,
    transferHost,
    setChatMode,
  } = useGameSocket();
  const account = useAccount();
  const route = useRoute();
  const friends = useFriends(account.status === "user");
  const install = useInstallPrompt();

  // « C'est ton tour » : proposer (chef), voter la confiance, voter la mission (membre de l'équipe).
  const turnKey =
    myId === null
      ? null
      : phase === "mission_proposal" && proposal.chefId === myId
        ? `propose-${proposal.missionIndex ?? 0}-${confidenceHistory.length}`
        : phase === "confidence_vote"
          ? `vote-${proposal.missionIndex ?? 0}-${confidenceHistory.length}`
          : phase === "mission_execution" && mission.team.includes(myId)
            ? `mission-${proposal.missionIndex ?? 0}`
            : null;
  const [alertSettings, setAlertSettings] = useTurnAlerts(turnKey);

  // Connecté : le pseudo du compte remplace le pseudo saisi, et le socket reste ouvert
  // pour la présence en ligne et les invitations, même hors d'une room.
  const accountName = account.user?.displayName ?? null;
  useEffect(() => {
    if (accountName !== null) {
      setPseudo(accountName);
      if (phase === "pseudo_entry") {
        navigate("landing");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountName]);
  useEffect(() => {
    if (account.status === "user" && !socket.connected) {
      socket.connect();
    }
  }, [account.status]);

  // Lien d'invitation /r/CODE : on rejoint la room dès que le joueur a un pseudo.
  const [inviteCode, setInviteCode] = useState<string | null>(() => joinCodeFromPath(window.location.pathname));
  useEffect(() => {
    if (inviteCode === null) {
      return;
    }
    if (roomCode === inviteCode) {
      setInviteCode(null);
      window.history.replaceState({}, "", "/");
      return;
    }
    if (phase === "landing" || phase === "join_room") {
      window.history.replaceState({}, "", "/");
      setInviteCode(null);
      joinRoom(inviteCode);
    }
  }, [inviteCode, phase, roomCode, joinRoom]);

  // Retour de la connexion Google (?auth=ok|error|banned).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === null) {
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
    if (auth === "ok") {
      void account.refresh();
    } else {
      window.alert(auth === "banned" ? "Ce compte est suspendu." : "La connexion avec Google a échoué.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [roomNameDraft, setRoomNameDraft] = useState("");
  // Par défaut, partie sur place : pas de chat qui encombre l'écran.
  const [remotePlay, setRemotePlay] = useState(false);
  const [rulesMode, setRulesMode] = useState<"default" | "preset" | "custom">("default");
  const [presetDraft, setPresetDraft] = useState<RulesetPreset>("PRESET_5J");
  const [customPlayerCount, setCustomPlayerCount] = useState(5);
  const [customNaziCount, setCustomNaziCount] = useState(2);
  const [customCommunistCount, setCustomCommunistCount] = useState(3);
  const [customMissionSizes, setCustomMissionSizes] = useState("2,3,2,3,3");
  const [customMissionCount, setCustomMissionCount] = useState(5);
  const [customWinThreshold, setCustomWinThreshold] = useState(3);
  const [customInfoMode, setCustomInfoMode] = useState<"full" | "partial" | "blind">("full");
  const [customExperimental, setCustomExperimental] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [tableOrderAdjustPosition, setTableOrderAdjustPosition] = useState(1);
  const [showOrderAdjustInput, setShowOrderAdjustInput] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [waitingValidationStep, setWaitingValidationStep] = useState<string | null>(null);
  const [queuedReplayChoice, setQueuedReplayChoice] = useState<"replay" | null>(null);
  const [selectedConfidenceVote, setSelectedConfidenceVote] = useState<ConfidenceVote | null>(null);
  const [selectedMissionVote, setSelectedMissionVote] = useState<MissionVote | null>(null);
  const [hasRevealedRoleOnce, setHasRevealedRoleOnce] = useState(false);
  const [isLandscapeBlocked, setIsLandscapeBlocked] = useState(false);

  const isHost = myId !== null && hostId === myId;
  const canStart = players.length >= minPlayers && players.length <= targetPlayerCount;
  const flexibleRoom = minPlayers !== targetPlayerCount;
  const nameById = (id: string): string => {
    if (myId !== null && id === myId && pseudo.trim() !== "") {
      return pseudo;
    }
    const player = players.find((entry) => entry.id === id);
    if (player?.pseudo && player.pseudo.trim() !== "") {
      return player.pseudo;
    }
    return id;
  };
  const naziAllies = Object.entries(role.roleMap)
    .filter(([id, faction]) => id !== myId && faction === "nazi")
    .map(([id]) => nameById(id));
  const orderReference = tableOrder.order.length > 0 ? tableOrder.order : players.map((entry) => entry.id);
  const orderValidatedIds = phase === "table_order" ? tableOrder.order : tableOrder.confirmed.length > 0 ? tableOrder.confirmed : tableOrder.order;
  const orderLegend = (
    <span className="progress-dots progress-dots--compact" aria-label="progression de table">
      {orderReference.map((id) => (
        <span key={id} className={orderValidatedIds.includes(id) ? "dot dot--full" : "dot"} />
      ))}
    </span>
  );
  const myOrderIndex = myId === null ? -1 : tableOrder.order.indexOf(myId);
  const allOrderChosen = players.length > 0 && tableOrder.order.length >= players.length;
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const orientationApi = window.screen?.orientation as { lock?: (value: string) => Promise<void> } | undefined;
    if (orientationApi && typeof orientationApi.lock === "function") {
      void orientationApi.lock("portrait").catch(() => {
        // Best effort only; unsupported in some browsers.
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const computeBlocked = (): boolean =>
      // Seuls les téléphones à l'horizontale sont bloqués (écran tactile peu haut), pas les ordinateurs.
      window.matchMedia("(orientation: landscape) and (max-height: 500px) and (pointer: coarse)").matches;

    const update = (): void => {
      setIsLandscapeBlocked(computeBlocked());
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  const roleLabel = role.faction === "nazi" ? "Nazi" : role.faction === "communist" ? "Communist" : "Inconnu";
  const roleOverlay = (
    <div>
      <h2><FactionIcon faction={role.faction} /> {roleLabel}</h2>
      {role.faction === "nazi" ? (
        <p>Allies: {naziAllies.length > 0 ? naziAllies.join(", ") : "aucun"}</p>
      ) : (
        <p>Role visible uniquement pour vous.</p>
      )}
    </div>
  );

  useEffect(() => {
    setWaitingValidationStep(null);
    setSelectedConfidenceVote(null);
    setSelectedMissionVote(null);
    setSelectedTeam([]);
    setShowFullHistory(false);
    setShowOrderAdjustInput(false);
    if (phase !== "role_reveal") {
      setHasRevealedRoleOnce(false);
    }
  }, [phase, proposal.chefId, proposal.missionIndex]);

  // Après un rechargement, le serveur indique ce que ce joueur a déjà validé.
  useEffect(() => {
    if (myProgress.confirmed || myProgress.votedConfidence || myProgress.votedMission) {
      setWaitingValidationStep(stepForPhase(phase));
    }
  }, [myProgress, phase]);

  // Action refusée : on ne laisse pas le joueur bloqué sur « en attente ».
  useEffect(() => {
    if (error !== null) {
      setWaitingValidationStep(null);
    }
  }, [error]);

  useEffect(() => {
    if (phase !== "replay_waiting" || queuedReplayChoice !== "replay" || waitingValidationStep === "replay_choice") {
      return;
    }

    setWaitingValidationStep("replay_choice");
    sendReplayChoice("replay");
  }, [phase, queuedReplayChoice, sendReplayChoice, waitingValidationStep]);

  const lastConfidence = confidenceHistory.length > 0 ? confidenceHistory[confidenceHistory.length - 1] : null;
  const proposedTeamNames = proposal.proposedTeam.map(nameById);
  const lastConfidenceProposedNames = lastConfidence ? lastConfidence.team.map(nameById) : [];
  const lastConfidenceVotes = lastConfidence
    ? Object.entries(lastConfidence.votes).map(([id, vote]) => ({
        playerName: nameById(id),
        voteLabel: vote === "yes" ? "Pour" : "Contre",
      }))
    : [];
  const missionSummaryEntries = missionHistory.map((entry) => ({
    missionIndex: entry.missionIndex,
    winner: entry.result,
    votesLabel: formatMissionVotes(entry.naziVoteCount, entry.team.length),
  }));

  const renderNamesWithPipes = (names: string[]): JSX.Element => {
    if (names.length === 0) {
      return <span className="back-empty">Aucun joueur</span>;
    }

    return (
      <>
        {names.map((name, index) => (
          <span key={`${name}-${index}`}>
            <strong className="back-name">{name}</strong>
            {index < names.length - 1 ? <strong className="back-sep"> | </strong> : null}
          </span>
        ))}
      </>
    );
  };

  const confirmLeaveGame = (): void => {
    if (window.confirm("Quitter maintenant fait perdre votre camp. Quitter la partie ?")) {
      leaveRoom();
    }
  };

  const defaultBackContent = (
    <div className="back-panel">
      <header className="back-panel__header">
        <h2>Historique</h2>
        <p>Resume rapide du tour</p>
      </header>

      <div className="back-panel__body">
        <section className="back-block">
          <h3>Equipe proposee</h3>
          <p className="back-block__value">{renderNamesWithPipes(proposedTeamNames)}</p>
        </section>

        <section className="back-block">
          <h3>Dernier vote confiance</h3>
          {lastConfidenceVotes.length > 0 ? (
            <>
              <p className="back-meta-line">
                Proposes: {renderNamesWithPipes(lastConfidenceProposedNames)}
              </p>
              <ul className="back-list">
                {lastConfidenceVotes.map((entry) => (
                  <li key={`last-confidence-${entry.playerName}`}>
                    <strong className="back-name">{entry.playerName}</strong>
                    <strong className="back-sep"> | </strong>
                    <span className="back-vote">{entry.voteLabel}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="back-empty">Aucun vote de confiance enregistre.</p>
          )}
        </section>

        <section className="back-block">
          <h3>Missions</h3>
          {missionSummaryEntries.length > 0 ? (
            <ul className="back-list">
              {missionSummaryEntries.slice(-3).map((entry) => (
                <li key={`mission-short-${entry.missionIndex}`}>
                  <strong className="back-index">{entry.missionIndex}</strong>
                  <strong className="back-sep"> | </strong>
                  <strong className="back-name">{entry.winner}</strong>
                  <strong className="back-sep"> | </strong>
                  <span>{entry.votesLabel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="back-empty">Aucune mission enregistree.</p>
          )}
        </section>
      </div>

      <div className="back-actions">
        <button type="button" className="secondary" onClick={() => setShowFullHistory(true)}>
          Voir plus
        </button>
        <button type="button" className="secondary" onClick={confirmLeaveGame}>
          Quitter la partie
        </button>
      </div>
    </div>
  );

  const expandedBackContent = (
    <div className="back-panel">
      <header className="back-panel__header">
        <h2>Historique complet</h2>
        <p>Tous les votes et resultats</p>
      </header>

      <div className="back-panel__body">
        <section className="back-block">
          <h3>Votes confiance</h3>
          {confidenceHistory.length > 0 ? (
            <ul className="back-list">
              {confidenceHistory.map((entry) => (
                <li key={`confidence-${entry.missionIndex}-${entry.team.join("-")}`}>
                  <strong className="back-index">{entry.missionIndex}</strong>
                  <strong className="back-sep"> | </strong>
                  <span>Proposes: {renderNamesWithPipes(entry.team.map(nameById))}</span>
                  <strong className="back-sep"> | </strong>
                  {Object.entries(entry.votes).map(([id, vote], voteIndex, list) => (
                    <span key={`vote-${entry.missionIndex}-${id}`}>
                      <strong className="back-name">{nameById(id)}</strong>
                      <strong className="back-sep"> | </strong>
                      <span className="back-vote">{vote === "yes" ? "Pour" : "Contre"}</span>
                      {voteIndex < list.length - 1 ? <strong className="back-sep"> | </strong> : null}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="back-empty">Aucun vote confiance enregistre.</p>
          )}
        </section>

        <section className="back-block">
          <h3>Historique des missions</h3>
          {missionSummaryEntries.length > 0 ? (
            <ul className="back-list">
              {missionSummaryEntries.map((entry) => (
                <li key={`mission-full-${entry.missionIndex}`}>
                  <strong className="back-index">{entry.missionIndex}</strong>
                  <strong className="back-sep"> | </strong>
                  <strong className="back-name">{entry.winner}</strong>
                  <strong className="back-sep"> | </strong>
                  <span>{entry.votesLabel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="back-empty">Aucune mission enregistree.</p>
          )}
        </section>
      </div>

      <div className="back-actions">
        <button type="button" className="secondary" onClick={() => setShowFullHistory(false)}>
          Voir moins
        </button>
        <button type="button" className="secondary" onClick={confirmLeaveGame}>
          Quitter la partie
        </button>
      </div>
    </div>
  );

  const frontMeta = (
    <div>
      <p>Chef du tour: {proposal.chefId ? nameById(proposal.chefId) : "-"}</p>
    </div>
  );

  const missionProgressNumber = proposal.missionIndex ?? Math.max(1, missionHistory.length + 1);
  const missionProgressTotal = gameMeta.missionCount > 0 ? gameMeta.missionCount : missionProgressNumber;
  const missionProgressLabel = `Mission ${missionProgressNumber} / ${missionProgressTotal}`;

  const frontFooter = <div><p>Mission en cours</p></div>;

  useEffect(() => {
    const handleGlobalTap = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null && target.closest("button, input, select, textarea, label")) {
        return;
      }

      if (phase === "table_order") {
        if (myId === null) {
          return;
        }

        if (myOrderIndex === -1) {
          tableOrderTap();
          return;
        }

        if (allOrderChosen && !tableOrder.confirmed.includes(myId) && waitingValidationStep !== "table_order") {
          setWaitingValidationStep("table_order");
          confirmTableOrder();
        }
        return;
      }
      if (phase === "confidence_result") {
        if (waitingValidationStep === "confidence_result") {
          return;
        }
        setWaitingValidationStep("confidence_result");
        confirmConfidenceResult();
        return;
      }
      if (phase === "mission_result") {
        if (waitingValidationStep === "mission_result") {
          return;
        }
        setWaitingValidationStep("mission_result");
        confirmMissionResult();
        return;
      }
      if (phase === "end_game") {
        return;
      }
    };

    window.addEventListener("click", handleGlobalTap);
    return () => {
      window.removeEventListener("click", handleGlobalTap);
    };
  }, [
    confirmConfidenceResult,
    confirmEndGame,
    confirmTableOrder,
    confirmMissionResult,
    phase,
    allOrderChosen,
    myId,
    myOrderIndex,
    tableOrder.confirmed,
    tableOrderTap,
    waitingValidationStep,
  ]);

  // Tous les hooks sont appelés avant ce point : un rendu conditionnel ne change jamais leur nombre.
  if (isLandscapeBlocked) {
    return (
      <main className="screen">
        <section className="panel">
          <h1>Format vertical requis</h1>
          <p>Tournez votre telephone en mode portrait pour continuer.</p>
        </section>
      </main>
    );
  }

  const screen = ((): JSX.Element => {
  if (phase === "pseudo_entry") {
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

  if (phase === "landing") {
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

  if (phase === "create_room") {
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
          <p className="field-hint">{remotePlay ? "Un chat est disponible pendant la partie." : "Pas de chat : tout se dit autour de la table."}</p>

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

              createRoom({ roomName: roomNameDraft, config, chatEnabled: remotePlay });
            }}
          >
            Creer
          </button>
          <button type="button" className="secondary" onClick={() => navigate("landing")}>Retour</button>
        </section>
      </main>
    );
  }

  if (phase === "join_room") {
    return (
      <main className="screen">
        <section className="panel">
          <h1>Rejoindre room</h1>
          <input
            value={joinCodeDraft}
            onChange={(event) => setJoinCodeDraft(event.target.value.toUpperCase())}
            maxLength={24}
            placeholder="Code room"
          />
          <button type="button" onClick={() => joinRoom(joinCodeDraft)}>Rejoindre</button>
          <button type="button" className="secondary" onClick={() => navigate("landing")}>Retour</button>
        </section>
      </main>
    );
  }

  if (phase === "waiting_room") {
    return (
      <main className="screen">
        <section className="panel panel--scroll">
          <RoomInvite code={roomCode} />
          <h1>Salle d attente</h1>
          <p className="mono">{chatEnabled ? "Partie à distance · chat activé" : "Partie sur place · sans chat"}</p>
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

  if (phase === "table_order") {
    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={frontFooter}
          front={
            waitingValidationStep === "table_order" ? (
              <WaitingCard message="En attente des autres joueurs pour confirmer l'ordre de table." />
            ) : (
              <>
                <h2>
                  {myOrderIndex === -1
                    ? "Tap pour prendre votre numero d'ordre"
                    : `Votre numero d'ordre: ${myOrderIndex + 1}`}
                </h2>
                <p>Progression: {orderReference.length > 0 ? orderLegend : "..."}</p>
                <p>
                  {allOrderChosen
                    ? "Tap pour passer a la suite (confirmation collective)"
                    : "En attente des joueurs selon l'ordre de table."}
                </p>
              </>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
          actions={
            myOrderIndex !== -1 ? (
              <div className="vote-stack">
                {allOrderChosen ? (
                  <button
                    type="button"
                    className="inline-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShowOrderAdjustInput((current) => !current);
                    }}
                  >
                    J'ai rate pardon
                  </button>
                ) : null}
                {allOrderChosen && showOrderAdjustInput ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, players.length)}
                      value={tableOrderAdjustPosition}
                      onChange={(event) => setTableOrderAdjustPosition(Number(event.target.value))}
                    />
                    <button
                      type="button"
                      className="inline-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        adjustTableOrder(tableOrderAdjustPosition);
                        setShowOrderAdjustInput(false);
                      }}
                    >
                      Valider correction
                    </button>
                  </>
                ) : null}
                {isHost ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      resetTableOrder();
                    }}
                  >
                    Revenir en arriere
                  </button>
                ) : null}
              </div>
            ) : undefined
          }
        />
      </main>
    );
  }

  if (phase === "role_reveal") {
    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={frontFooter}
          front={
            waitingValidationStep === "role_reveal" ? (
              <WaitingCard message="En attente des autres joueurs." />
            ) : (
              <div>
                <h2>Maintenez pour voir votre role</h2>
                <p>Puis appuyez sur "C'est bon".</p>
              </div>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
          onOverlayShown={() => {
            if (!hasRevealedRoleOnce) {
              setHasRevealedRoleOnce(true);
            }
          }}
          actions={
            hasRevealedRoleOnce ? (
              <button
                type="button"
                className="inline-action"
                onClick={() => {
                  setWaitingValidationStep("role_reveal");
                  confirmRole();
                }}
              >
                C'est bon
              </button>
            ) : undefined
          }
        />
      </main>
    );
  }

  if (phase === "mission_proposal") {
    const iAmChef = myId !== null && proposal.chefId === myId;
    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={frontFooter}
          front={
            iAmChef ? (
              <div>
                <h2>Choisir equipe ({proposal.teamSize})</h2>
                <div className="team-grid">
                  {players.map((player) => {
                    const selected = selectedTeam.includes(player.id);
                    return (
                      <button
                        key={player.id}
                        type="button"
                        className={selected ? "chip chip--active" : "chip"}
                        onClick={() => {
                          setSelectedTeam((current) => {
                            if (selected) {
                              return current.filter((entry) => entry !== player.id);
                            }
                            if (current.length >= proposal.teamSize) {
                              return current;
                            }
                            return [...current, player.id];
                          });
                        }}
                      >
                        {player.pseudo ?? player.id}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <h2>En attente de la proposition de {proposal.chefId ? nameById(proposal.chefId) : "Chef"}</h2>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
          actions={
            iAmChef ? (
              <button
                type="button"
                className="inline-action"
                disabled={selectedTeam.length !== proposal.teamSize || waitingValidationStep === "proposal"}
                onClick={() => {
                  setWaitingValidationStep("proposal");
                  proposeTeam(selectedTeam);
                }}
              >
                Proposer equipe
              </button>
            ) : undefined
          }
        />
      </main>
    );
  }

  if (phase === "confidence_vote") {
    const confidenceFooter = <div><p>{missionProgressLabel}</p></div>;

    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={confidenceFooter}
          front={
            waitingValidationStep === "confidence_vote" ? (
              <WaitingCard message="Vote enregistre, en attente des autres joueurs." />
            ) : (
              <div className="vote-phase">
                <h2>Vote de confiance</h2>
                <p>{proposal.proposedTeam.map(nameById).join(", ") || "Aucune equipe"}</p>
                <VoteButtons
                  first={{ vote: "yes", symbol: "✓" }}
                  second={{ vote: "no", symbol: "✕" }}
                  onVote={(value) => {
                    if (waitingValidationStep === "confidence_vote") {
                      return;
                    }
                    const parsed = value as ConfidenceVote;
                    setSelectedConfidenceVote(parsed);
                    setWaitingValidationStep("confidence_vote");
                    sendConfidenceVote(parsed);
                  }}
                  disabled={waitingValidationStep === "confidence_vote"}
                  selectedVote={selectedConfidenceVote}
                  split
                />
              </div>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
        />
      </main>
    );
  }

  if (phase === "confidence_result") {
    const confidenceDetails = Object.entries(confidence.votes)
      .map(([id, vote]) => `${nameById(id)}: ${vote === "yes" ? "Pour" : "Contre"}`)
      .join(" | ");

    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={<div><p>{missionProgressLabel}</p></div>}
          front={
            waitingValidationStep === "confidence_result" ? (
              <WaitingCard message="Validation envoyee, en attente des autres." />
            ) : (
              <div className="result-panel">
                <h2>{confidence.approved ? "Majorite POUR" : "Majorite CONTRE"}</h2>
                <p>{confidenceDetails || "Aucun vote recu"}</p>
                <p>Tap pour passer a la suite.</p>
              </div>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
        />
      </main>
    );
  }

  if (phase === "mission_execution") {
    const onTeam = myId !== null && mission.team.includes(myId);
    const hasSubmittedMissionVote = myId !== null && mission.submittedPlayerIds.includes(myId);
    const missionProgress = <MissionProgress team={mission.team} submittedPlayerIds={mission.submittedPlayerIds} />;
    const missionFooter = <div><p>{missionProgressLabel}</p></div>;

    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={missionProgress}
          meta={frontMeta}
          footer={missionFooter}
          front={
            waitingValidationStep === "mission_vote" || hasSubmittedMissionVote ? (
              <WaitingCard message="En attente." />
            ) : onTeam ? (
              <div className="vote-phase vote-phase--mission">
                <VoteButtons
                  first={{ vote: "communist", symbol: <FactionIcon faction="communist" /> }}
                  second={{ vote: "nazi", symbol: <FactionIcon faction="nazi" /> }}
                  onVote={(value) => {
                    if (waitingValidationStep === "mission_vote" || hasSubmittedMissionVote) {
                      return;
                    }
                    const parsed = value as MissionVote;
                    setSelectedMissionVote(parsed);
                    setWaitingValidationStep("mission_vote");
                    sendMissionVote(parsed);
                  }}
                  disabled={waitingValidationStep === "mission_vote" || hasSubmittedMissionVote}
                  selectedVote={selectedMissionVote}
                  disabledVotes={role.faction === "communist" ? ["nazi"] : role.faction === "nazi" ? [] : ["communist", "nazi"]}
                  split
                  randomize
                />
              </div>
            ) : (
              <WaitingCard message="En attente." />
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
        />
      </main>
    );
  }

  if (phase === "mission_result") {
    const missionProgress = <MissionProgress team={mission.team} submittedPlayerIds={mission.submittedPlayerIds} />;
    const naziVotes = mission.naziVoteCount ?? 0;
    const communistVotes = Math.max(0, mission.team.length - naziVotes);
    const roundWinner = mission.result;

    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={missionProgress}
          meta={frontMeta}
          footer={<div><p>{missionProgressLabel}</p></div>}
          front={
            waitingValidationStep === "mission_result" ? (
              <WaitingCard message="Validation envoyee, en attente des autres." />
            ) : (
              <div className="result-panel result-panel--mission">
                <h2>{roundWinner === "nazi" ? "Victoire Nazi" : "Victoire Communiste"}</h2>
                <p>Votes Nazi: {naziVotes}</p>
                <p>Votes Communist: {communistVotes}</p>
                <p>Tap pour passer a la suite.</p>
              </div>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={roleOverlay}
        />
      </main>
    );
  }

  if (phase === "end_game" || phase === "replay_waiting") {
    const sendReplayNow = (): void => {
      if (waitingValidationStep === "replay_choice") {
        return;
      }

      if (phase === "end_game") {
        if (waitingValidationStep === "end_game") {
          return;
        }
        setQueuedReplayChoice("replay");
        setWaitingValidationStep("end_game");
        confirmEndGame();
        return;
      }

      setQueuedReplayChoice(null);
      setWaitingValidationStep("replay_choice");
      sendReplayChoice("replay");
    };

    const quitGameNow = (): void => {
      if (waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game") {
        return;
      }
      setQueuedReplayChoice(null);
      setWaitingValidationStep("replay_choice");
      sendReplayChoice("quit");
    };

    return (
      <main className="game-screen">
        <CardSurface
          scoreLeft={scoreChip("communist", score.communist)}
          scoreRight={scoreChip("nazi", score.nazi)}
          scoreCenter={orderReference.length > 0 ? orderLegend : "..."}
          meta={frontMeta}
          footer={frontFooter}
          front={
            waitingValidationStep === "end_game" ? (
              <WaitingCard message="Validation envoyee, en attente des autres." />
            ) : waitingValidationStep === "replay_choice" ? (
              <WaitingCard message="Choix rejouer envoye, en attente des autres joueurs." />
            ) : (
              <div className="result-panel">
                <h2>Victoire {winner === "nazi" ? "Nazi" : "Communiste"}</h2>
                {gameOver?.reason === "forfeit" && gameOver.forfeitedBy !== null ? (
                  <p>Abandon de {nameById(gameOver.forfeitedBy)}</p>
                ) : null}
                <p>Rejouer ?</p>
              </div>
            )
          }
          back={showFullHistory ? expandedBackContent : defaultBackContent}
          overlay={
            <div>
              {roleOverlay}
              <p>{Object.entries(revealedRoles).map(([id, playerFaction]) => `${nameById(id)}:${playerFaction}`).join(" | ") || "Roles a venir"}</p>
              {role.faction === "nazi" ? <p>Allies nazis: {naziAllies.length > 0 ? naziAllies.join(", ") : "aucun"}</p> : null}
            </div>
          }
          actions={
            <div className="vote-stack">
              <button
                type="button"
                className="vote-btn"
                disabled={waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game"}
                onClick={sendReplayNow}
              >
                Rejouer
              </button>
              <button
                type="button"
                className="secondary"
                disabled={waitingValidationStep === "replay_choice" || waitingValidationStep === "end_game"}
                onClick={quitGameNow}
              >
                Quitter la game
              </button>
            </div>
          }
        />
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="panel">
        <h1>Etat de jeu inconnu</h1>
      </section>
    </main>
  );
  })();

  const page =
    route.page === "auth" ? (
      account.status === "user" ? <ProfilePage account={account} userId={null} setup={false} /> : <AuthPage account={account} />
    ) : route.page === "profile" ? (
      <ProfilePage account={account} userId={route.userId} setup={route.setup} />
    ) : route.page === "friends" ? (
      <FriendsPage
        signedIn={account.status === "user"}
        view={friends.view}
        refresh={friends.refresh}
        canInvite={roomCode !== "" && roomStatus === "waiting"}
        onInvite={inviteFriend}
      />
    ) : route.page === "about" ? (
      <AboutPage />
    ) : route.page === "legal" ? (
      <LegalPage editorName={account.config?.legal.editorName ?? ""} contactEmail={account.config?.legal.contactEmail ?? ""} />
    ) : route.page === "contact" ? (
      <ContactPage defaultEmail={account.user?.email ?? ""} contactEmail={account.config?.legal.contactEmail ?? ""} />
    ) : route.page === "support" ? (
      <SupportPage donationUrl={account.config?.donationUrl ?? ""} />
    ) : route.page === "rules" ? (
      <RulesPage playerCount={isGamePhaseUi(phase) ? players.length : null} />
    ) : route.page === "admin" ? (
      <AdminPage isAdmin={account.user?.isAdmin === true} />
    ) : null;

  return (
    <>
      <Menu
        signedIn={account.status === "user"}
        displayName={accountName}
        isAdmin={account.user?.isAdmin === true}
        pendingRequests={friends.view.incoming.length}
        alerts={{ settings: alertSettings, update: setAlertSettings }}
        install={install}
      />
      <StatusBanners
        error={error}
        onDismiss={dismissError}
        notice={notice}
        onDismissNotice={dismissNotice}
        invite={invite}
        onAcceptInvite={() => {
          acceptInvite();
          goTo("/");
        }}
        onDismissInvite={dismissInvite}
        connection={connection}
        inRoom={roomCode !== ""}
      />
      {screen}
      {roomCode !== "" && myId !== null && chatEnabled && route.page === "game" ? (
        <ChatPanel
          messages={chat}
          myId={myId}
          onSend={sendChat}
          onReport={(message) => {
            const reason = window.prompt(`Signaler le message de ${message.pseudo} ? Raison (facultatif) :`, "");
            if (reason !== null) {
              report({ messageId: message.id }, reason);
            }
          }}
        />
      ) : null}
      {route.page === "game" ? <Tutorial phase={phase} /> : null}
      {page}
    </>
  );
}
