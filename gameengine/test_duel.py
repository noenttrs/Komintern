import random
import unittest
from collections import Counter

from gameengine.duel import DuelVote, draw_duel_roles, resolve_duel
from gameengine.types import Faction
from gameengine_entry import EngineBridge

C, N = Faction.COMMUNIST, Faction.NAZI
T, A = DuelVote.TRUST, DuelVote.ACCUSE


def outcome(role_a: Faction, role_b: Faction, vote_a: DuelVote, vote_b: DuelVote) -> tuple[list[str], str]:
    result = resolve_duel({"a": role_a, "b": role_b}, {"a": vote_a, "b": vote_b})
    return sorted(result.winners), result.reason


class DuelTableTests(unittest.TestCase):
    def test_two_communists(self) -> None:
        self.assertEqual(outcome(C, C, T, T), (["a", "b"], "mutual_trust"))
        self.assertEqual(outcome(C, C, A, T), (["b"], "false_accusation"))
        self.assertEqual(outcome(C, C, T, A), (["a"], "false_accusation"))
        self.assertEqual(outcome(C, C, A, A), ([], "mutual_accusation"))

    def test_one_of_each(self) -> None:
        self.assertEqual(outcome(C, N, A, T), (["a"], "nazi_unmasked"))
        self.assertEqual(outcome(C, N, A, A), (["a"], "nazi_unmasked"))
        self.assertEqual(outcome(C, N, T, A), (["a"], "nazi_gave_himself_away"))
        self.assertEqual(outcome(C, N, T, T), (["b"], "nazi_accepted"))
        self.assertEqual(outcome(N, C, T, T), (["a"], "nazi_accepted"))

    def test_two_nazis(self) -> None:
        self.assertEqual(outcome(N, N, A, A), (["a", "b"], "nazis_found_each_other"))
        self.assertEqual(outcome(N, N, A, T), (["a"], "nazi_found"))
        self.assertEqual(outcome(N, N, T, T), ([], "nazis_fooled_each_other"))

    def test_votes_must_be_complete(self) -> None:
        with self.assertRaises(ValueError):
            resolve_duel({"a": C, "b": N}, {"a": T})


class DuelDrawTests(unittest.TestCase):
    def test_three_situations_roughly_equally_likely(self) -> None:
        rng = random.Random(7)
        counts = Counter(tuple(sorted(draw_duel_roles(["a", "b"], rng).values())) for _ in range(3000))
        self.assertEqual(len(counts), 3)
        for count in counts.values():
            self.assertTrue(850 < count < 1150, counts)

    def test_needs_two_players(self) -> None:
        with self.assertRaises(ValueError):
            draw_duel_roles(["a", "b", "c"], random.Random(1))


class DuelBridgeTests(unittest.TestCase):
    def test_start_then_resolve_once(self) -> None:
        bridge = EngineBridge()
        roles = bridge.dispatch("duel_start", {"player_ids": ["a", "b"], "seed": 3})["roles"]
        self.assertEqual(set(roles), {"a", "b"})
        result = bridge.dispatch("duel_resolve", {"votes": {"a": "trust", "b": "accuse"}})
        self.assertIn("reason", result)
        with self.assertRaisesRegex(ValueError, "already over"):
            bridge.dispatch("duel_resolve", {"votes": {"a": "trust", "b": "trust"}})

    def test_rejects_bad_votes(self) -> None:
        bridge = EngineBridge()
        bridge.dispatch("duel_start", {"player_ids": ["a", "b"]})
        with self.assertRaisesRegex(ValueError, "TRUST or ACCUSE"):
            bridge.dispatch("duel_resolve", {"votes": {"a": "maybe", "b": "trust"}})


if __name__ == "__main__":
    unittest.main()
