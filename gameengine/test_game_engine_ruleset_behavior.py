from __future__ import annotations

import unittest

from gameengine.constants import PRESET_4J, PRESET_5J
from gameengine.game_manager import GameManager
from gameengine.round_manager import RoundManager
from gameengine.types import Faction, GameState, InfoMode, Player, RoundPhase, Ruleset
from gameengine_entry import EngineBridge


class GameManagerInfoModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.state = GameState(
            players=[
                Player(id="p1", faction=Faction.NAZI),
                Player(id="p2", faction=Faction.NAZI),
                Player(id="p3", faction=Faction.NAZI),
                Player(id="p4", faction=Faction.COMMUNIST),
                Player(id="p5", faction=Faction.COMMUNIST),
                Player(id="p6", faction=Faction.COMMUNIST),
            ],
            chef_cursor=0,
            nazi_wins=0,
            communist_wins=0,
        )

    def test_full_mode_nazi_sees_everyone(self) -> None:
        ruleset = Ruleset(
            player_count=6,
            nazi_count=3,
            communist_count=3,
            mission_sizes=[2, 3, 2, 3, 3],
            mission_count=5,
            win_threshold=3,
            info_mode=InfoMode.FULL,
            experimental=False,
        )
        manager = GameManager(["p1", "p2", "p3", "p4", "p5", "p6"], 0, ruleset)

        nazi_view = manager.get_player_view("p1", self.state)
        communist_view = manager.get_player_view("p4", self.state)

        self.assertEqual(len(nazi_view), 6)
        self.assertEqual(communist_view, {"p4": Faction.COMMUNIST})

    def test_partial_mode_nazi_knows_only_one_other_nazi(self) -> None:
        ruleset = Ruleset(
            player_count=6,
            nazi_count=3,
            communist_count=3,
            mission_sizes=[2, 3, 2, 3, 3],
            mission_count=5,
            win_threshold=3,
            info_mode=InfoMode.PARTIAL,
            experimental=False,
        )
        manager = GameManager(["p1", "p2", "p3", "p4", "p5", "p6"], 0, ruleset)

        view = manager.get_player_view("p1", self.state)
        self.assertEqual(set(view.keys()), {"p1", "p2"})
        self.assertTrue(all(view[player_id] == Faction.NAZI for player_id in view))

    def test_blind_mode_everyone_only_sees_themselves(self) -> None:
        ruleset = Ruleset(
            player_count=6,
            nazi_count=3,
            communist_count=3,
            mission_sizes=[2, 3, 2, 3, 3],
            mission_count=5,
            win_threshold=3,
            info_mode=InfoMode.BLIND,
            experimental=True,
        )
        manager = GameManager(["p1", "p2", "p3", "p4", "p5", "p6"], 0, ruleset)

        self.assertEqual(manager.get_player_view("p1", self.state), {"p1": Faction.NAZI})
        self.assertEqual(manager.get_player_view("p4", self.state), {"p4": Faction.COMMUNIST})


class RoundAndBridgeRulesetTests(unittest.TestCase):
    def test_default_ruleset_is_preset_5j(self) -> None:
        manager = GameManager(["a", "b", "c", "d", "e"], 0)
        self.assertEqual(manager.ruleset, PRESET_5J)

    def test_bridge_submit_mission_votes_exposes_nazi_vote_count(self) -> None:
        bridge = EngineBridge()
        player_ids = ["a", "b", "c", "d", "e"]
        bridge.start_game({"player_ids": player_ids, "chef_cursor": 0})

        nazi_ids: list[str] = []
        for player_id in player_ids:
            view = bridge.get_player_view({"player_id": player_id})
            if len(view) > 1:
                nazi_ids.append(player_id)

        self.assertEqual(len(nazi_ids), 2)
        communist_ids = [player_id for player_id in player_ids if player_id not in nazi_ids]
        mission_team = [nazi_ids[0], communist_ids[0]]

        bridge.propose_team({"team": mission_team})

        votes = {"a": "YES", "b": "YES", "c": "YES", "d": "NO", "e": "NO"}
        bridge.submit_confidence_votes({"votes": votes})
        result = bridge.submit_mission_votes(
            {
                "votes": {
                    mission_team[0]: "NAZI",
                    mission_team[1]: "COMMUNIST",
                }
            }
        )

        self.assertIn("nazi_vote_count", result)
        self.assertEqual(result["nazi_vote_count"], 1)

        round_state = bridge._require_round().get_state()  # noqa: SLF001
        self.assertEqual(round_state.phase, RoundPhase.PROPOSING)

    def test_bridge_accepts_preset_4j(self) -> None:
        bridge = EngineBridge()
        player_ids = ["a", "b", "c", "d"]

        start_result = bridge.start_game(
            {
                "player_ids": player_ids,
                "chef_cursor": 0,
                "ruleset_preset": "PRESET_4J",
            }
        )
        self.assertEqual(start_result["status"], "ok")

        views = {player_id: bridge.get_player_view({"player_id": player_id}) for player_id in player_ids}
        nazi_ids = [player_id for player_id, view in views.items() if len(view) > 1]
        self.assertEqual(len(nazi_ids), PRESET_4J.nazi_count)


if __name__ == "__main__":
    unittest.main()
