import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSocket } from "./test/fakeSocket";

const fake = vi.hoisted(() => ({ socket: null as unknown as FakeSocket, landscape: false }));
vi.mock("./socket", async () => {
  const { FakeSocket: Socket } = await import("./test/fakeSocket");
  fake.socket = new Socket();
  return { socket: fake.socket };
});

import App from "./App";

beforeEach(() => {
  fake.socket.reset();
  fake.landscape = false;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem("komintern.pseudo", "Rosa");
  window.matchMedia = ((query: string) => ({
    matches: fake.landscape && query.includes("landscape"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

const room = {
  code: "ROOM",
  hostPlayerId: "p1",
  targetPlayerCount: 3,
  status: "waiting",
  players: ["p1", "p2", "p3"].map((playerId) => ({ playerId, pseudo: `Joueur ${playerId}`, isHost: playerId === "p1", isAfk: false, isConnected: true })),
};

describe("App", () => {
  it("survives switching to landscape and back (audit K1)", () => {
    render(<App />);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...room }));
    act(() => fake.socket.serverEmit("game_started", {}));

    fake.landscape = true;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByText("Format vertical requis")).toBeTruthy();

    fake.landscape = false;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByText("Format vertical requis")).toBeNull();
  });

  it("shows server errors on game screens and unblocks the waiting card (audit K6)", () => {
    render(<App />);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...room }));
    act(() => fake.socket.serverEmit("game_started", {}));
    act(() => fake.socket.serverEmit("error", { code: "invalid_team_proposal", message: "only the current chef can propose a team" }));
    expect(screen.getByText("Seul le chef peut proposer une équipe.")).toBeTruthy();
  });

  it("lets only the chef pick a team, once, and resets the selection on a new proposal (audit K10)", () => {
    render(<App />);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...room }));
    act(() => fake.socket.serverEmit("game_started", {}));
    act(() => fake.socket.serverEmit("proposal_phase", { chef: "p1", missionSize: 2, missionIndex: 1, team: [] }));

    fireEvent.click(screen.getByText("Joueur p2"));
    fireEvent.click(screen.getByText("Joueur p3"));
    // Les actions sont rendues sur les deux faces de la carte.
    const propose = screen.getAllByText("Proposer equipe")[0] as HTMLButtonElement;
    expect(propose.disabled).toBe(false);
    act(() => {
      propose.click();
      propose.click();
    });
    expect(fake.socket.events().filter((event) => event === "propose_team")).toHaveLength(1);

    act(() => fake.socket.serverEmit("error", { code: "invalid_team_proposal", message: "x" }));
    act(() => fake.socket.serverEmit("proposal_phase", { chef: "p1", missionSize: 2, missionIndex: 2, team: [] }));
    expect((screen.getAllByText("Proposer equipe")[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the connection banner while disconnected in a room", () => {
    render(<App />);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...room }));
    act(() => fake.socket.drop());
    expect(screen.getByText(/Connexion perdue/)).toBeTruthy();
  });

  it("hides the chat in rooms created for in-person play", () => {
    render(<App />);
    act(() => fake.socket.serverEmit("room_joined", { playerId: "p1", ...room, chatEnabled: false }));
    expect(screen.queryByRole("button", { name: "Ouvrir le chat" })).toBeNull();
    expect(screen.getByText("Partie sur place · sans chat")).toBeTruthy();
    act(() => fake.socket.serverEmit("room_updated", { ...room, chatEnabled: true }));
    expect(screen.getByRole("button", { name: "Ouvrir le chat" })).toBeTruthy();
  });

  it("asks where the game is played and sends the choice when creating a room", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Creer une room"));
    expect(screen.getByRole("radio", { name: "Sur place" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "À distance" }));
    fireEvent.click(screen.getByRole("button", { name: "Creer" }));
    expect(fake.socket.emitted.find((entry) => entry.event === "create_room")?.payload).toMatchObject({ chatEnabled: true });
  });
});
