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
        self.assertEqual(outcome(C, N, T, A), ([], "nazi_gave_himself_away"))
        self.assertEqual(outcome(C, N, T, T), (["b"], "nazi_accepted"))
        self.assertEqual(outcome(N, C, T, T), (["a"], "nazi_accepted"))

    def test_two_nazis(self) -> None:
        self.assertEqual(outcome(N, N, A, A), (["a", "b"], "nazis_found_each_other"))
        self.assertEqual(outcome(N, N, A, T), (["a"], "nazi_found"))
        self.assertEqual(outcome(N, N, T, T), (["a", "b"], "nazis_trusted_each_other"))

    def test_votes_must_be_complete(self) -> None:
        with self.assertRaises(ValueError):
            resolve_duel({"a": C, "b": N}, {"a": T})


class DuelDrawTests(unittest.TestCase):
    def test_each_role_is_drawn_independently(self) -> None:
        rng = random.Random(7)
        counts = Counter(tuple(sorted(draw_duel_roles(["a", "b"], rng).values())) for _ in range(4000))
        # 25 % deux communistes, 25 % deux nazis, 50 % un de chaque.
        self.assertTrue(850 < counts[(C, C)] < 1150, counts)
        self.assertTrue(850 < counts[(N, N)] < 1150, counts)
        self.assertTrue(1850 < counts[(C, N)] < 2150, counts)

    def test_no_vote_wins_in_advance(self) -> None:
        # Espérance de gain de chaque vote, pour chaque rôle, face à toutes les stratégies adverses
        # simples : aucun vote n'est meilleur quoi que fasse l'autre (pas de stratégie dominante).
        def win_rate(my_role: Faction, my_vote: DuelVote, other_vote_by_role: dict[Faction, DuelVote]) -> float:
            total = 0.0
            for other_role in (C, N):
                result = resolve_duel({"me": my_role, "other": other_role}, {"me": my_vote, "other": other_vote_by_role[other_role]})
                total += 0.5 * ("me" in result.winners)
            return total

        strategies = [{C: vc, N: vn} for vc in (T, A) for vn in (T, A)]
        for role in (C, N):
            for vote, other in ((T, A), (A, T)):
                strictly_better_everywhere = all(win_rate(role, vote, s) > win_rate(role, other, s) for s in strategies)
                self.assertFalse(strictly_better_everywhere, f"{role} should not always {vote}")
        # Communiste : confiance et accusation ont exactement la même espérance, quoi que fasse l'autre.
        for strategy in strategies:
            self.assertEqual(win_rate(C, T, strategy), win_rate(C, A, strategy))

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
