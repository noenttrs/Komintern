from __future__ import annotations

import random

from .types import Faction, MissionVote, Player, Ruleset

# Source de hasard par défaut : cryptographique, non rejouable. Les tests injectent
# un random.Random(seed) pour obtenir des parties déterministes.
_SYSTEM_RANDOM = random.SystemRandom()


def make_rng(seed: int | None = None) -> random.Random:
    if seed is None:
        return _SYSTEM_RANDOM
    return random.Random(seed)


def assign_roles(player_ids: list[str], ruleset: Ruleset, rng: random.Random | None = None) -> list[Player]:
    if len(player_ids) != ruleset.player_count:
        raise ValueError(f"player_ids must contain exactly {ruleset.player_count} players")
    if len(set(player_ids)) != ruleset.player_count:
        raise ValueError("player_ids must be unique")

    shuffled_ids = list(player_ids)
    (rng or _SYSTEM_RANDOM).shuffle(shuffled_ids)

    nazi_ids = set(shuffled_ids[:ruleset.nazi_count])
    players: list[Player] = []
    for player_id in player_ids:
        faction = Faction.NAZI if player_id in nazi_ids else Faction.COMMUNIST
        players.append(Player(id=player_id, faction=faction))

    nazi_total = sum(player.faction == Faction.NAZI for player in players)
    communist_total = sum(player.faction == Faction.COMMUNIST for player in players)
    if nazi_total != ruleset.nazi_count or communist_total != ruleset.communist_count:
        raise RuntimeError("failed to assign the expected number of roles")

    return players


def shuffle_votes(votes: list[MissionVote], rng: random.Random | None = None) -> list[MissionVote]:
    shuffled_votes = list(votes)
    (rng or _SYSTEM_RANDOM).shuffle(shuffled_votes)
    return shuffled_votes
