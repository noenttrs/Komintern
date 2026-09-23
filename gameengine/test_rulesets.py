from __future__ import annotations

import unittest

from gameengine.constants import (
    PRESET_3J,
    PRESET_5J,
    PRESET_6J,
    PRESET_7J,
    PRESET_8J,
    PRESET_9J,
    PRESET_10J,
    PRESET_11J,
)
from gameengine.types import InfoMode, Ruleset


class RulesetValidationTests(unittest.TestCase):
    def test_all_presets_respect_core_validation_contract(self) -> None:
        presets = [
            PRESET_3J,
            PRESET_5J,
            PRESET_6J,
            PRESET_7J,
            PRESET_8J,
            PRESET_9J,
            PRESET_10J,
            PRESET_11J,
        ]

        for preset in presets:
            with self.subTest(player_count=preset.player_count):
                self.assertEqual(preset.nazi_count + preset.communist_count, preset.player_count)
                self.assertEqual(len(preset.mission_sizes), preset.mission_count)
                self.assertLessEqual(preset.win_threshold, preset.mission_count)
                self.assertEqual(preset.info_mode, InfoMode.FULL)
                self.assertFalse(preset.experimental)

    def test_preset_3j_matches_requested_configuration(self) -> None:
        self.assertEqual(PRESET_3J.player_count, 3)
        self.assertEqual(PRESET_3J.nazi_count, 1)
        self.assertEqual(PRESET_3J.communist_count, 2)
        self.assertEqual(PRESET_3J.mission_count, 3)
        self.assertEqual(PRESET_3J.mission_sizes, [2, 2, 2])

    def test_placeholder_mission_sizes_are_explicit_for_7j_9j_11j(self) -> None:
        for preset in [PRESET_7J, PRESET_8J, PRESET_9J, PRESET_10J, PRESET_11J]:
            with self.subTest(player_count=preset.player_count):
                self.assertTrue(all(size == -1 for size in preset.mission_sizes))

    def test_custom_ruleset_rejects_invalid_faction_total(self) -> None:
        with self.assertRaisesRegex(ValueError, r"nazi_count \+ communist_count"):
            Ruleset(
                player_count=6,
                nazi_count=2,
                communist_count=3,
                mission_sizes=[2, 3, 2, 3, 3],
                mission_count=5,
                win_threshold=3,
                info_mode=InfoMode.FULL,
                experimental=False,
            )

    def test_custom_ruleset_rejects_invalid_mission_count_alignment(self) -> None:
        with self.assertRaisesRegex(ValueError, "mission_sizes length"):
            Ruleset(
                player_count=6,
                nazi_count=2,
                communist_count=4,
                mission_sizes=[2, 3],
                mission_count=5,
                win_threshold=3,
                info_mode=InfoMode.FULL,
                experimental=False,
            )

    def test_custom_ruleset_rejects_invalid_win_threshold(self) -> None:
        with self.assertRaisesRegex(ValueError, "win_threshold"):
            Ruleset(
                player_count=6,
                nazi_count=2,
                communist_count=4,
                mission_sizes=[2, 3, 2, 3, 3],
                mission_count=5,
                win_threshold=6,
                info_mode=InfoMode.FULL,
                experimental=False,
            )

    def test_blind_mode_requires_experimental_flag(self) -> None:
        with self.assertRaisesRegex(ValueError, "blind mode requires experimental"):
            Ruleset(
                player_count=6,
                nazi_count=2,
                communist_count=4,
                mission_sizes=[2, 3, 2, 3, 3],
                mission_count=5,
                win_threshold=3,
                info_mode=InfoMode.BLIND,
                experimental=False,
            )


if __name__ == "__main__":
    unittest.main()
