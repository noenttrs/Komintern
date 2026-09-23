"""Tests de règles et de protocole du moteur (docs/REGLES.md + décisions de l'audit).

Lancer depuis la racine du projet : python3 -m unittest discover -s gameengine -t .
"""

from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any

from gameengine.types import InfoMode, Ruleset
from gameengine_entry import EngineBridge, handle_line

ROOT = Path(__file__).resolve().parent.parent
PLAYERS_5 = ["a", "b", "c", "d", "e"]
PLAYERS_6 = ["a", "b", "c", "d", "e", "f"]


def start(bridge: EngineBridge, players: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    args: dict[str, Any] = {"player_ids": players or PLAYERS_5, "chef_cursor": 0, "seed": 42}
    args.update(extra)
    return bridge.start_game(args)


def roles(bridge: EngineBridge, players: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for player_id in players:
        result[player_id] = bridge.get_player_view({"player_id": player_id})[player_id]
    return result


def all_votes(players: list[str], yes: int) -> dict[str, str]:
    return {player_id: ("yes" if index < yes else "no") for index, player_id in enumerate(players)}


def play_mission(bridge: EngineBridge, players: list[str], nazi_wins: bool) -> dict[str, Any]:
    """Propose l'équipe, l'approuve à l'unanimité et joue la mission avec l'issue voulue."""
    round_state = bridge.get_round_state({})
    size = round_state["required_team_size"]
    role_map = roles(bridge, players)
    nazis = [p for p in players if role_map[p] == "nazi"]
    communists = [p for p in players if role_map[p] == "communist"]
    team = (nazis[:1] + communists)[:size] if nazi_wins else communists[:size]
    bridge.propose_team({"team": team, "proposer_id": round_state["chef_id"]})
    bridge.submit_confidence_votes({"votes": all_votes(players, len(players))})
    votes = {p: ("nazi" if nazi_wins and role_map[p] == "nazi" else "communist") for p in team}
    return bridge.submit_mission_votes({"votes": votes})


class ChefRotationTests(unittest.TestCase):
    def test_same_chef_reproposes_after_rejection(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        chef = bridge.get_round_state({})["chef_id"]
        bridge.propose_team({"team": ["a", "b"], "proposer_id": chef})
        state = bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_5, 1)})
        self.assertFalse(state["approved"])
        self.assertEqual(state["phase"], "proposing")
        self.assertEqual(state["chef_id"], chef)
        self.assertEqual(bridge.get_round_state({})["chef_id"], chef)

    def test_chef_advances_on_each_new_round(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        chefs = [bridge.get_round_state({})["chef_id"]]
        for _ in range(2):
            result = play_mission(bridge, PLAYERS_5, nazi_wins=False)
            chefs.append(result["next_round"]["chef_id"])
        self.assertEqual(chefs, ["a", "b", "c"])

    def test_only_chef_can_propose(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        with self.assertRaisesRegex(ValueError, "only the current chef"):
            bridge.propose_team({"team": ["a", "b"], "proposer_id": "b"})

    def test_end_game_returns_next_chef_index(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        for _ in range(3):
            play_mission(bridge, PLAYERS_5, nazi_wins=False)
        self.assertEqual(bridge.end_game({}), 3)


class ConfidenceVoteTests(unittest.TestCase):
    def test_tie_is_a_rejection(self) -> None:
        bridge = EngineBridge()
        start(bridge, PLAYERS_6, ruleset_preset="PRESET_6J")
        bridge.propose_team({"team": ["a", "b"]})
        state = bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_6, 3)})
        self.assertFalse(state["approved"])
        self.assertEqual(state["phase"], "proposing")
        # La manche n'est pas bloquée : on peut reproposer.
        bridge.propose_team({"team": ["a", "c"]})

    def test_strict_majority_approves(self) -> None:
        bridge = EngineBridge()
        start(bridge, PLAYERS_6, ruleset_preset="PRESET_6J")
        bridge.propose_team({"team": ["a", "b"]})
        state = bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_6, 4)})
        self.assertTrue(state["approved"])
        self.assertEqual(state["phase"], "mission")

    def test_partial_votes_are_rejected(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        bridge.propose_team({"team": ["a", "b"]})
        with self.assertRaisesRegex(ValueError, "expected voters"):
            bridge.submit_confidence_votes({"votes": {"a": "yes", "b": "yes", "c": "yes"}})

    def test_majority_is_counted_over_active_voters(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        bridge.propose_team({"team": ["a", "b"]})
        # e est AFK : 2 OUI sur 4 votants = égalité = rejet.
        state = bridge.submit_confidence_votes(
            {"votes": {"a": "yes", "b": "yes", "c": "no", "d": "no"}, "voter_ids": ["a", "b", "c", "d"]}
        )
        self.assertFalse(state["approved"])

    def test_rejection_returns_the_actual_votes(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        bridge.propose_team({"team": ["a", "b"]})
        state = bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_5, 0)})
        self.assertEqual(set(state["confidence_votes"]), set(PLAYERS_5))


class MissionAndEndGameTests(unittest.TestCase):
    def test_mission_updates_scores_and_detects_winner(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        results = [play_mission(bridge, PLAYERS_5, nazi_wins=True) for _ in range(3)]
        self.assertEqual([r["winner"] for r in results], ["nazi"] * 3)
        self.assertEqual(results[-1]["scores"], {"nazi": 3, "communist": 0})
        self.assertEqual(results[-1]["game_winner"], "nazi")
        self.assertIsNone(results[-1]["next_round"])
        self.assertEqual(bridge.check_win_condition({}), "nazi")

    def test_no_play_after_game_is_won(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        for _ in range(3):
            play_mission(bridge, PLAYERS_5, nazi_wins=False)
        with self.assertRaisesRegex(RuntimeError, "game is over"):
            bridge.propose_team({"team": ["a", "b"]})

    def test_no_play_after_end_game(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        bridge.end_game({})
        with self.assertRaisesRegex(RuntimeError, "game is over"):
            bridge.propose_team({"team": ["a", "b"]})

    def test_communist_cannot_sabotage(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        role_map = roles(bridge, PLAYERS_5)
        communists = [p for p in PLAYERS_5 if role_map[p] == "communist"]
        bridge.propose_team({"team": communists[:2]})
        bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_5, 5)})
        with self.assertRaisesRegex(ValueError, "communist players cannot"):
            bridge.submit_mission_votes({"votes": {communists[0]: "nazi", communists[1]: "communist"}})

    def test_mission_votes_from_active_team_subset(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        role_map = roles(bridge, PLAYERS_5)
        communists = [p for p in PLAYERS_5 if role_map[p] == "communist"]
        bridge.propose_team({"team": communists[:2]})
        bridge.submit_confidence_votes({"votes": all_votes(PLAYERS_5, 5)})
        result = bridge.submit_mission_votes(
            {"votes": {communists[0]: "communist"}, "voter_ids": [communists[0]]}
        )
        self.assertEqual(result["winner"], "communist")

    def test_forfeit_gives_victory_to_other_faction(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        self.assertEqual(bridge.forfeit({"faction": "nazi"}), {"game_winner": "communist"})
        with self.assertRaisesRegex(RuntimeError, "game is over"):
            bridge.forfeit({"faction": "communist"})


class StartGameValidationTests(unittest.TestCase):
    def test_failed_start_leaves_previous_game_untouched(self) -> None:
        bridge = EngineBridge()
        start(bridge)
        before = bridge.get_game_state({})
        with self.assertRaises(ValueError):
            bridge.start_game({"player_ids": PLAYERS_5, "chef_cursor": 9})
        with self.assertRaises(ValueError):
            bridge.start_game({"player_ids": ["x", "y"], "chef_cursor": 0})
        self.assertEqual(bridge.get_game_state({}), before)

    def test_chef_cursor_validation(self) -> None:
        bridge = EngineBridge()
        for bad in (-1, 5, True, "0", 1.0):
            with self.subTest(chef_cursor=bad), self.assertRaises(ValueError):
                bridge.start_game({"player_ids": PLAYERS_5, "chef_cursor": bad})

    def test_every_preset_starts_and_plays_its_first_round(self) -> None:
        for count in range(3, 15):
            with self.subTest(players=count):
                bridge = EngineBridge()
                players = [f"p{index}" for index in range(count)]
                round_state = bridge.start_game({"player_ids": players, "chef_cursor": 0, "ruleset_preset": f"PRESET_{count}J"})["round"]
                self.assertEqual(round_state["mission_count"], 2 * (count // 2 + 1) - 1)
                bridge.propose_team({"team": players[: round_state["required_team_size"]]})

    def test_quick_presets_start(self) -> None:
        for count in range(6, 15):
            with self.subTest(players=count):
                players = [f"p{index}" for index in range(count)]
                round_state = EngineBridge().start_game({"player_ids": players, "chef_cursor": 0, "ruleset_preset": f"PRESET_{count}J_RAPIDE"})["round"]
                self.assertEqual(round_state["mission_count"], 5)

    def test_fewer_than_three_players_cannot_play(self) -> None:
        with self.assertRaisesRegex(ValueError, "ruleset_preset"):
            EngineBridge().start_game({"player_ids": ["a", "b"], "chef_cursor": 0, "ruleset_preset": "PRESET_2J"})

    def test_three_player_game_is_short_and_either_side_can_win(self) -> None:
        players = ["a", "b", "c"]
        for nazi_wins in (False, True):
            with self.subTest(nazi_wins=nazi_wins):
                bridge = EngineBridge()
                start(bridge, players, ruleset_preset="PRESET_3J")
                self.assertEqual(list(roles(bridge, players).values()).count("nazi"), 1)
                play_mission(bridge, players, nazi_wins=nazi_wins)
                result = play_mission(bridge, players, nazi_wins=nazi_wins)
                self.assertEqual(result["game_winner"], "nazi" if nazi_wins else "communist")

    def test_preset_4j_is_available(self) -> None:
        bridge = EngineBridge()
        start(bridge, ["a", "b", "c", "d"], ruleset_preset="PRESET_4J")

    def test_preset_and_custom_ruleset_are_exclusive(self) -> None:
        bridge = EngineBridge()
        with self.assertRaisesRegex(ValueError, "either"):
            start(bridge, ruleset_preset="PRESET_5J", ruleset={"player_count": 5})

    def test_seed_makes_roles_deterministic(self) -> None:
        first, second = EngineBridge(), EngineBridge()
        start(first)
        start(second)
        self.assertEqual(roles(first, PLAYERS_5), roles(second, PLAYERS_5))


class RulesetValidationTests(unittest.TestCase):
    def base(self, **overrides: Any) -> dict[str, Any]:
        values: dict[str, Any] = {
            "player_count": 5,
            "nazi_count": 2,
            "communist_count": 3,
            "mission_sizes": [2, 3, 2, 3, 3],
            "mission_count": 5,
            "win_threshold": 3,
            "info_mode": InfoMode.FULL,
            "experimental": False,
        }
        values.update(overrides)
        return values

    def test_valid_base(self) -> None:
        Ruleset(**self.base())

    def test_invalid_rulesets(self) -> None:
        cases = {
            "draw possible": {"mission_sizes": [2, 3, 2, 3], "mission_count": 4},
            "zero threshold": {"win_threshold": 0},
            "no nazi": {"nazi_count": 0, "communist_count": 5},
            "negative nazi": {"nazi_count": -1, "communist_count": 6},
            "bool count": {"player_count": True},
        }
        for name, overrides in cases.items():
            with self.subTest(name), self.assertRaises(ValueError):
                Ruleset(**self.base(**overrides))

    def test_custom_ruleset_mission_sizes_bounds(self) -> None:
        bridge = EngineBridge()
        raw = self.base(info_mode="full")
        for sizes in ([0, 3, 2, 3, 3], [2, 3, 2, 3, 6]):
            raw["mission_sizes"] = sizes
            with self.subTest(sizes=sizes), self.assertRaises(ValueError):
                bridge.start_game({"player_ids": PLAYERS_5, "chef_cursor": 0, "ruleset": raw})


class ProtocolTests(unittest.TestCase):
    def test_response_echoes_request_id(self) -> None:
        bridge = EngineBridge()
        response = handle_line(bridge, json.dumps({"id": 7, "command": "check_win_condition", "args": {}}))
        self.assertEqual(response["id"], 7)
        self.assertFalse(response["ok"])

    def test_errors_never_crash(self) -> None:
        bridge = EngineBridge()
        for line in ("not json", "[]", '{"command": 3}', '{"command": "nope"}', '{"command": "start_game", "args": 1}'):
            with self.subTest(line=line):
                self.assertFalse(handle_line(bridge, line)["ok"])

    def test_stdio_process_roundtrip(self) -> None:
        requests = [
            {"id": 1, "command": "start_game", "args": {"player_ids": PLAYERS_5, "chef_cursor": 0, "seed": 1}},
            "garbage",
            {"id": 2, "command": "get_round_state", "args": {}},
        ]
        stdin = "\n".join(r if isinstance(r, str) else json.dumps(r) for r in requests) + "\n"
        completed = subprocess.run(
            [sys.executable, str(ROOT / "gameengine_entry.py")],
            input=stdin,
            capture_output=True,
            text=True,
            timeout=10,
            cwd=ROOT,
            check=True,
        )
        lines = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual(len(lines), 3)
        self.assertEqual(lines[0]["id"], 1)
        self.assertTrue(lines[0]["ok"])
        self.assertFalse(lines[1]["ok"])
        self.assertNotIn("id", lines[1])
        self.assertEqual(lines[2]["result"]["chef_id"], "a")


if __name__ == "__main__":
    unittest.main()
