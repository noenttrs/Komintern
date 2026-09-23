import { useEffect, useRef, useState } from "react";

import { ChatPanel } from "./components/ChatPanel";
import { FactionIcon } from "./components/game/FactionIcon";
import { formatMissionVotes, isGamePhaseUi, stepForPhase } from "./components/game/phases";
import { StatusBanners } from "./components/game/StatusBanners";
import { Menu } from "./components/Menu";
import { useAccount } from "./hooks/useAccount";
import { useFriends } from "./hooks/useFriends";
import { useGameSocket } from "./hooks/useGameSocket";
import { useInstallPrompt } from "./hooks/useInstallPrompt";
import { useTurnAlerts } from "./hooks/useTurnAlerts";
import { translate, useI18n } from "./i18n";
import { AboutPage } from "./pages/AboutPage";
import { AdminPage } from "./pages/AdminPage";
import { ContactPage } from "./pages/ContactPage";
import { SupportPage } from "./pages/SupportPage";
import { AuthPage } from "./pages/AuthPage";
import { FriendsPage } from "./pages/FriendsPage";
import { LegalPage } from "./pages/LegalPage";
import { ProfilePage } from "./pages/ProfilePage";
import { Tutorial } from "./components/Tutorial";
import { RulesPage } from "./pages/RulesPage";
import { recordPageView } from "./audience";
import { joinCodeFromPath, navigate as goTo, useRoute } from "./router";
import { EndGameScreen } from "./screens/EndGameScreen";
import { CreateRoomScreen, JoinRoomScreen, LandingScreen, PseudoEntryScreen, WaitingRoomScreen } from "./screens/LobbyScreens";
import { MissionResultScreen, MissionScreen } from "./screens/MissionScreens";
import { type InfoMode, type RulesMode, type ScreenContextValue, ScreenProvider } from "./screens/ScreenContext";
import { RoleRevealScreen, TableOrderScreen } from "./screens/SetupScreens";
import { ConfidenceResultScreen, ConfidenceVoteScreen, ProposalScreen } from "./screens/VoteScreens";
import { socket } from "./socket";
import { availableStorage, recordFinishedGame } from "./supportBanner";

import type { ConfidenceVote, MissionVote, RulesetPreset, UIPhase } from "./types";

/** Un écran par phase ; chacun lit ce dont il a besoin via useScreen(). */
function renderScreen(phase: UIPhase): JSX.Element {
  switch (phase) {
    case "pseudo_entry":
      return <PseudoEntryScreen />;
    case "landing":
      return <LandingScreen />;
    case "create_room":
      return <CreateRoomScreen />;
    case "join_room":
      return <JoinRoomScreen />;
    case "waiting_room":
      return <WaitingRoomScreen />;
    case "table_order":
      return <TableOrderScreen />;
    case "role_reveal":
      return <RoleRevealScreen />;
    case "mission_proposal":
      return <ProposalScreen />;
    case "confidence_vote":
      return <ConfidenceVoteScreen />;
    case "confidence_result":
      return <ConfidenceResultScreen />;
    case "mission_execution":
      return <MissionScreen />;
    case "mission_result":
      return <MissionResultScreen />;
    case "end_game":
    case "replay_waiting":
      return <EndGameScreen />;
    default:
      return (
        <main className="screen">
          <section className="panel">
            <h1>{translate("app.unknownState")}</h1>
          </section>
        </main>
      );
  }
}

export default function App(): JSX.Element {
  const { t } = useI18n();
  const game = useGameSocket();
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
    tableOrder,
    role,
    proposal,
    confidenceHistory,
    mission,
    gameMeta,
    missionHistory,
    setPseudo,
    navigate,
    dismissError,
    joinRoom,
    leaveRoom,
    tableOrderTap,
    confirmTableOrder,
    confirmConfidenceResult,
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
  } = game;
  const account = useAccount();
  const route = useRoute();
  useEffect(() => {
    recordPageView(window.location.pathname);
  }, [route]);
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
      window.alert(auth === "banned" ? t("app.googleBanned") : t("app.googleFailed"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [roomNameDraft, setRoomNameDraft] = useState("");
  // Par défaut, partie sur place : pas de chat qui encombre l'écran.
  const [remotePlay, setRemotePlay] = useState(false);
  const [publicDraft, setPublicDraft] = useState(false);
  const [rulesMode, setRulesMode] = useState<RulesMode>("default");
  const [presetDraft, setPresetDraft] = useState<RulesetPreset>("PRESET_5J");
  const [customPlayerCount, setCustomPlayerCount] = useState(5);
  const [customNaziCount, setCustomNaziCount] = useState(2);
  const [customCommunistCount, setCustomCommunistCount] = useState(3);
  const [customMissionSizes, setCustomMissionSizes] = useState("2,3,2,3,3");
  const [customMissionCount, setCustomMissionCount] = useState(5);
  const [customWinThreshold, setCustomWinThreshold] = useState(3);
  const [customInfoMode, setCustomInfoMode] = useState<InfoMode>("full");
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
    <span className="progress-dots progress-dots--compact" aria-label={t("app.tableProgress")}>
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
  const roleLabel = role.faction === "nazi" ? t("role.nazi") : role.faction === "communist" ? t("role.communist") : t("role.unknown");
  const roleOverlay = (
    <div>
      <h2><FactionIcon faction={role.faction} /> {roleLabel}</h2>
      {role.faction === "nazi" ? (
        <p>{t("role.allies", { names: naziAllies.length > 0 ? naziAllies.join(", ") : t("common.none") })}</p>
      ) : (
        <p>{t("role.onlyYou")}</p>
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

  // Bannière de soutien : une partie compte quand on arrive en fin de partie depuis la partie elle-même
  // (pas après un rechargement qui reprend directement sur l'écran de fin).
  const previousPhaseRef = useRef<UIPhase>(phase);
  useEffect(() => {
    const previous = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (phase === "end_game" && previous !== "end_game" && isGamePhaseUi(previous)) {
      recordFinishedGame(availableStorage());
    }
  }, [phase]);

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
        voteLabel: vote === "yes" ? t("game.yes") : t("game.no"),
      }))
    : [];
  const missionSummaryEntries = missionHistory.map((entry) => ({
    missionIndex: entry.missionIndex,
    winner: entry.result,
    votesLabel: formatMissionVotes(entry.naziVoteCount, entry.team.length),
  }));

  const renderNamesWithPipes = (names: string[]): JSX.Element => {
    if (names.length === 0) {
      return <span className="back-empty">{t("history.noPlayers")}</span>;
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
    if (window.confirm(t("history.confirmLeave"))) {
      leaveRoom();
    }
  };

  const defaultBackContent = (
    <div className="back-panel">
      <header className="back-panel__header">
        <h2>{t("history.title")}</h2>
        <p>{t("history.subtitle")}</p>
      </header>

      <div className="back-panel__body">
        <section className="back-block">
          <h3>{t("history.proposedTeam")}</h3>
          <p className="back-block__value">{renderNamesWithPipes(proposedTeamNames)}</p>
        </section>

        <section className="back-block">
          <h3>{t("history.lastVote")}</h3>
          {lastConfidenceVotes.length > 0 ? (
            <>
              <p className="back-meta-line">
                {t("history.proposed")} {renderNamesWithPipes(lastConfidenceProposedNames)}
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
            <p className="back-empty">{t("history.noLastVote")}</p>
          )}
        </section>

        <section className="back-block">
          <h3>{t("history.missions")}</h3>
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
            <p className="back-empty">{t("history.noMissions")}</p>
          )}
        </section>
      </div>

      <div className="back-actions">
        <button type="button" className="secondary" onClick={() => setShowFullHistory(true)}>
          {t("history.more")}
        </button>
        <button type="button" className="secondary" onClick={confirmLeaveGame}>
          {t("history.leave")}
        </button>
      </div>
    </div>
  );

  const expandedBackContent = (
    <div className="back-panel">
      <header className="back-panel__header">
        <h2>{t("history.fullTitle")}</h2>
        <p>{t("history.fullSubtitle")}</p>
      </header>

      <div className="back-panel__body">
        <section className="back-block">
          <h3>{t("history.votes")}</h3>
          {confidenceHistory.length > 0 ? (
            <ul className="back-list">
              {confidenceHistory.map((entry) => (
                <li key={`confidence-${entry.missionIndex}-${entry.team.join("-")}`}>
                  <strong className="back-index">{entry.missionIndex}</strong>
                  <strong className="back-sep"> | </strong>
                  <span>{t("history.proposed")} {renderNamesWithPipes(entry.team.map(nameById))}</span>
                  <strong className="back-sep"> | </strong>
                  {Object.entries(entry.votes).map(([id, vote], voteIndex, list) => (
                    <span key={`vote-${entry.missionIndex}-${id}`}>
                      <strong className="back-name">{nameById(id)}</strong>
                      <strong className="back-sep"> | </strong>
                      <span className="back-vote">{vote === "yes" ? t("game.yes") : t("game.no")}</span>
                      {voteIndex < list.length - 1 ? <strong className="back-sep"> | </strong> : null}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="back-empty">{t("history.noVotes")}</p>
          )}
        </section>

        <section className="back-block">
          <h3>{t("history.missionHistory")}</h3>
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
            <p className="back-empty">{t("history.noMissions")}</p>
          )}
        </section>
      </div>

      <div className="back-actions">
        <button type="button" className="secondary" onClick={() => setShowFullHistory(false)}>
          {t("history.less")}
        </button>
        <button type="button" className="secondary" onClick={confirmLeaveGame}>
          {t("history.leave")}
        </button>
      </div>
    </div>
  );

  const frontMeta = (
    <div>
      <p>{t("game.chef", { name: proposal.chefId ? nameById(proposal.chefId) : "-" })}</p>
    </div>
  );

  const missionProgressNumber = proposal.missionIndex ?? Math.max(1, missionHistory.length + 1);
  const missionProgressTotal = gameMeta.missionCount > 0 ? gameMeta.missionCount : missionProgressNumber;
  const missionProgressLabel = t("game.missionProgress", { number: missionProgressNumber, total: missionProgressTotal });

  const frontFooter = <div><p>{t("game.missionOngoing")}</p></div>;

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
          <h1>{t("app.portraitTitle")}</h1>
          <p>{t("app.portraitText")}</p>
        </section>
      </main>
    );
  }

  const screenContext: ScreenContextValue = {
    ...game,
    account,
    inviteCode,
    joinCodeDraft,
    setJoinCodeDraft,
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
    selectedTeam,
    setSelectedTeam,
    tableOrderAdjustPosition,
    setTableOrderAdjustPosition,
    showOrderAdjustInput,
    setShowOrderAdjustInput,
    showFullHistory,
    waitingValidationStep,
    setWaitingValidationStep,
    setQueuedReplayChoice,
    selectedConfidenceVote,
    setSelectedConfidenceVote,
    selectedMissionVote,
    setSelectedMissionVote,
    hasRevealedRoleOnce,
    setHasRevealedRoleOnce,
    isHost,
    canStart,
    flexibleRoom,
    nameById,
    naziAllies,
    orderReference,
    orderLegend,
    myOrderIndex,
    allOrderChosen,
    roleOverlay,
    defaultBackContent,
    expandedBackContent,
    frontMeta,
    frontFooter,
    missionProgressLabel,
  };

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
      <ScreenProvider value={screenContext}>{renderScreen(phase)}</ScreenProvider>
      {roomCode !== "" && myId !== null && chatEnabled && route.page === "game" ? (
        <ChatPanel
          messages={chat}
          myId={myId}
          onSend={sendChat}
          onReport={(message) => {
            const reason = window.prompt(t("chat.reportPrompt", { name: message.pseudo }), "");
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