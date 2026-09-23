import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel";

const messages = [
  { id: "m1", playerId: "p2", pseudo: "Karl", text: "<b>salut</b>", at: 1 },
  { id: "m2", playerId: "p1", pseudo: "Rosa", text: "coucou", at: 2 },
];

describe("ChatPanel", () => {
  it("starts collapsed with an unread badge, then sends and reports", () => {
    const onSend = vi.fn();
    const onReport = vi.fn();
    const { rerender } = render(<ChatPanel messages={[]} myId="p1" onSend={onSend} onReport={onReport} />);
    rerender(<ChatPanel messages={messages} myId="p1" onSend={onSend} onReport={onReport} />);
    expect(screen.getByRole("button", { name: "Ouvrir le chat" }).textContent).toContain("2");

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le chat" }));
    expect(screen.getByText("<b>salut</b>")).toBeTruthy(); // rendu en texte, jamais en HTML
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: " bonjour " } });
    fireEvent.click(screen.getByText("Envoyer"));
    expect(onSend).toHaveBeenCalledWith(" bonjour ");

    expect(screen.getAllByRole("button", { name: /Signaler/ })).toHaveLength(1); // pas sur ses propres messages
    fireEvent.click(screen.getByRole("button", { name: "Signaler le message de Karl" }));
    expect(onReport).toHaveBeenCalledWith(messages[0]);
  });
});
