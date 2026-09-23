from __future__ import annotations

import random

from .types import Faction, MissionVote, Player, Ruleset


def assign_roles(player_ids: list[str], ruleset: Ruleset) -> list[Player]:
    if len(player_ids) != ruleset.player_count:
        raise ValueError(f"player_ids must contain exactly {ruleset.player_count} players")
    if len(set(player_ids)) != ruleset.player_count:
        raise ValueError("player_ids must be unique")

    shuffled_ids = list(player_ids)
    random.shuffle(shuffled_ids)

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


def shuffle_votes(votes: list[MissionVote]) -> list[MissionVote]:
    shuffled_votes = list(votes)
    random.shuffle(shuffled_votes)
    return shuffled_votes
