import QRCode from "qrcode";
import { useEffect, useMemo, useReducer, useState } from "react";
import { io } from "socket.io-client";

import { scoreChip } from "../components/game/FactionIcon";
import { VoteSplit } from "../components/game/VoteSplit";
import { SERVER_EVENTS } from "../events";
import { gameReducer, initialGameState } from "../gameState";
import { useI18n } from "../i18n";

/**
 * Vue publique d'une room (grand écran posé sur la table, ou source navigateur dans OBS) :
 * l'état public de la partie, sans siège de joueur et sans aucun secret. Connexion à part : cet
 * écran ne reprend jamais la place d'un joueur (le jeu n'est pas chargé sur cette page).
 * `?stream` (ou `?fond=transparent`) cache le code et le QR de la room.
 */
export function PublicBoard({ code, token, stream, transparent }: { code: string; token: string; stream: boolean; transparent: boolean }): JSX.Element {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(gameReducer, initialGameState("", code));
  const [ended, setEnded] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const link = `${window.location.origin}/r/${code}`;

  useEffect(() => {
    const socket = io(import.meta.env.VITE_SERVER_URL || window.location.origin, { transports: ["websocket", "polling"] });
    const events = Object.values(SERVER_EVENTS).filter((event) => event !== SERVER_EVENTS.ERROR && event !== SERVER_EVENTS.SPECTATE_ENDED);
    for (const event of events) socket.on(event, (payload: unknown) => dispatch({ type: "server", event, payload }));
    // Message traduit au rendu (clé), pas ici : cet effet ne dépend que de la room et du jeton.
    socket.on(SERVER_EVENTS.ERROR, () => setEnded("invalid"));
    socket.on(SERVER_EVENTS.SPECTATE_ENDED, () => setEnded("invalid"));
    // (Re)connexion : on redemande l'état public (le serveur renvoie salon et partie en cours).
    socket.on("connect", () => socket.emit("spectate", { code, token }));
    return () => {
      socket.disconnect();
    };
  }, [code, token]);

  useEffect(() => {
    if (stream) return undefined;
    let cancelled = false;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f0f0f", light: "#ffffff" } })
      .then((svg) => {
        if (!cancelled) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
      })
      .catch(() => setQr(null));
    return () => {
      cancelled = true;
    };
  }, [link, stream]);

  const nameById = useMemo(() => {
    const names = new Map(state.players.map((player) => [player.id, player.pseudo ?? "?"]));
    return (id: string) => names.get(id) ?? "?";
  }, [state.players]);

  const className = transparent ? "board board--transparent" : "board";
  if (ended !== null) {
    return (
      <main className={className}>
        <p className="board__notice">{t("board.invalid")}</p>
      </main>
    );
  }

  const inGame = state.roomStatus !== null && state.roomStatus !== "waiting" && state.roomStatus !== "finished";
  const missionCount = state.gameMeta.missionCount;
  const chef = state.proposal.chefId === null ? null : nameById(state.proposal.chefId);
  const team = state.proposal.proposedTeam.map(nameById).join(", ");

  let body: JSX.Element;
  if (!inGame && state.phase !== "end_game" && state.phase !== "replay_waiting") {
    body = (
      <section className="board__lobby">
        <h2>{t("board.lobby")}</h2>
        <ul className="board__names">
          {state.players.map((player) => (
            <li key={player.id}>{player.pseudo ?? "?"}</li>
          ))}
        </ul>
        {!stream && qr !== null ? (
          <div className="board__join">
            <img src={qr} alt={t("invite.qrAlt", { code })} />
            <p className="mono">{t("board.join", { host: window.location.host, code })}</p>
          </div>
        ) : null}
      </section>
    );
  } else if (state.phase === "table_order") {
    body = (
      <section>
        <h2>{t("tableOrder.title")}</h2>
        <ol className="board__names board__names--ordered">
          {state.tableOrder.order.map((id) => (
            <li key={id}>{nameById(id)}</li>
          ))}
        </ol>
      </section>
    );
  } else if (state.phase === "role_reveal") {
    body = <h2>{t("board.roles")}</h2>;
  } else if (state.phase === "mission_proposal") {
    body = (
      <section>
        <h2>{t("board.proposal", { chef: chef ?? "?", size: state.proposal.teamSize })}</h2>
      </section>
    );
  } else if (state.phase === "confidence_vote") {
    body = (
      <section>
        <h2>{t("confidence.title")}</h2>
        <p className="board__team">{t("board.team", { chef: chef ?? "?", team })}</p>
      </section>
    );
  } else if (state.phase === "confidence_result") {
    body = (
      <section>
        <h2>{state.confidence.approved ? t("confidence.majorityYes") : t("confidence.majorityNo")}</h2>
        <VoteSplit votes={state.confidence.votes} nameById={nameById} />
      </section>
    );
  } else if (state.phase === "mission_execution") {
    body = (
      <section>
        <h2>{t("board.mission")}</h2>
        <p className="board__team">{state.mission.team.map(nameById).join(", ")}</p>
        <p className="mono">{t("board.missionVotes", { done: state.mission.votesSubmitted, total: state.mission.votesRequired })}</p>
      </section>
    );
  } else if (state.phase === "mission_result") {
    const nazi = state.mission.naziVoteCount ?? 0;
    body = (
      <section>
        <h2>{state.mission.result === "nazi" ? t("mission.victoryNazi") : t("mission.victoryCommunist")}</h2>
        <p>{t("mission.naziVotes", { count: nazi })}</p>
        <p>{t("mission.communistVotes", { count: Math.max(0, state.mission.team.length - nazi) })}</p>
      </section>
    );
  } else if (state.phase === "end_game" || state.phase === "replay_waiting") {
    const nazis = Object.entries(state.revealedRoles).filter(([, role]) => role === "nazi").map(([id]) => nameById(id));
    body = (
      <section>
        <h2>{state.gameOver?.winner === "nazi" ? t("mission.victoryNazi") : state.gameOver?.winner === "communist" ? t("mission.victoryCommunist") : t("game.over")}</h2>
        {nazis.length > 0 ? <p>{t("board.nazisWere", { names: nazis.join(", ") })}</p> : null}
      </section>
    );
  } else {
    body = <h2>{t("board.duel")}</h2>;
  }

  return (
    <main className={className} aria-live="polite">
      <header className="board__header">
        <span className="board__title">Nazi Communiste</span>
        {inGame || state.phase === "end_game" ? (
          <span className="board__score">
            {scoreChip("communist", state.score.communist)} {scoreChip("nazi", state.score.nazi)}
          </span>
        ) : null}
      </header>
      {missionCount > 0 && (inGame || state.phase === "end_game") ? (
        <ol className="board__track" aria-label={t("board.track")}>
          {Array.from({ length: missionCount }, (_, index) => {
            const result = state.missionHistory[index]?.result;
            return <li key={index} className={result === "nazi" ? "board__step board__step--nazi" : result === "communist" ? "board__step board__step--communist" : "board__step"}>{index + 1}</li>;
          })}
        </ol>
      ) : null}
      <div className="board__body">{body}</div>
      {chef !== null && inGame ? <p className="board__chef mono">{t("board.chef", { chef })}</p> : null}
    </main>
  );
}
