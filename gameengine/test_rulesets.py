from __future__ import annotations

import unittest

from gameengine.constants import PRESETS, QUICK_PRESETS
from gameengine.types import InfoMode, Ruleset


class PresetTests(unittest.TestCase):
    def test_presets_cover_3_to_14_players(self) -> None:
        self.assertEqual(sorted(PRESETS), list(range(3, 15)))

    def test_every_preset_follows_the_design_rules(self) -> None:
        for count, preset in PRESETS.items():
            with self.subTest(players=count):
                threshold = count // 2 + 1
                self.assertEqual(preset.win_threshold, threshold)
                self.assertEqual(preset.mission_count, 2 * threshold - 1, "just enough missions for a winner")
                self.assertEqual(preset.nazi_count + preset.communist_count, count)
                self.assertLess(preset.nazi_count, preset.communist_count)
                self.assertTrue(preset.is_playable)
                self.assertLessEqual(max(preset.mission_sizes), preset.communist_count, "a nazi-free team must exist")
                self.assertEqual(preset.mission_sizes[0], min(preset.mission_sizes), "games open with a small team")
                self.assertEqual(preset.info_mode, InfoMode.FULL)


    def test_quick_presets_are_5_missions_first_to_3(self) -> None:
        self.assertEqual(sorted(QUICK_PRESETS), list(range(6, 15)))
        for count, preset in QUICK_PRESETS.items():
            with self.subTest(players=count):
                self.assertEqual((preset.mission_count, preset.win_threshold), (5, 3))
                self.assertEqual(preset.nazi_count, PRESETS[count].nazi_count, "same sides as the classic format")
                self.assertTrue(preset.is_playable)
                self.assertEqual(preset.mission_sizes[0], min(preset.mission_sizes))
                self.assertEqual(preset.mission_sizes, sorted(preset.mission_sizes), "teams grow as the game goes on")


class RulesetValidationTests(unittest.TestCase):
    def base(self, **overrides: object) -> dict[str, object]:
        values: dict[str, object] = {
            "player_count": 6,
            "nazi_count": 2,
            "communist_count": 4,
            "mission_sizes": [2, 3, 3, 4, 3, 4, 4],
            "mission_count": 7,
            "win_threshold": 4,
            "info_mode": InfoMode.FULL,
            "experimental": False,
        }
        values.update(overrides)
        return values

    def test_valid(self) -> None:
        Ruleset(**self.base())  # type: ignore[arg-type]

    def test_invalid(self) -> None:
        cases = {
            "faction total": {"communist_count": 3},
            "mission count alignment": {"mission_sizes": [2, 3]},
            "threshold above missions": {"win_threshold": 8},
            "blind without experimental": {"info_mode": InfoMode.BLIND},
            "fewer than 3 players": {"player_count": 2, "nazi_count": 1, "communist_count": 1, "mission_sizes": [1, 1, 1], "mission_count": 3, "win_threshold": 2},
        }
        for name, overrides in cases.items():
            with self.subTest(name), self.assertRaises(ValueError):
                Ruleset(**self.base(**overrides))  # type: ignore[arg-type]

    def test_team_larger_than_communists_is_not_playable(self) -> None:
        self.assertFalse(Ruleset(**self.base(mission_sizes=[2, 3, 3, 5, 3, 4, 4])).is_playable)  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
