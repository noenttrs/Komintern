"""Duel à 2 joueurs : on discute, puis chacun vote en secret « confiance » ou « nazi ! ».

Personne ne connaît le rôle de l'autre, pas même un nazi. Trois situations équiprobables :
deux communistes, un de chaque camp, deux nazis. Accuser coûte à tout le monde : accuser
un communiste fait perdre, et un nazi qui accuse un communiste se démasque.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum

from .types import Faction


class DuelVote(str, Enum):
    TRUST = "TRUST"
    ACCUSE = "ACCUSE"


@dataclass(frozen=True)
class DuelOutcome:
    winners: list[str]
    reason: str


SITUATIONS = ("communists", "mixed", "nazis")


def draw_duel_roles(player_ids: list[str], rng: random.Random) -> dict[str, Faction]:
    if len(player_ids) != 2 or len(set(player_ids)) != 2:
        raise ValueError("a duel needs exactly 2 distinct players")
    situation = rng.choice(SITUATIONS)
    if situation == "communists":
        return {player_id: Faction.COMMUNIST for player_id in player_ids}
    if situation == "nazis":
        return {player_id: Faction.NAZI for player_id in player_ids}
    nazi = rng.choice(player_ids)
    return {player_id: Faction.NAZI if player_id == nazi else Faction.COMMUNIST for player_id in player_ids}


def resolve_duel(roles: dict[str, Faction], votes: dict[str, DuelVote]) -> DuelOutcome:
    """Table des résultats (docs/REGLES.md, « Duel à 2 joueurs »)."""
    if set(votes) != set(roles) or len(roles) != 2:
        raise ValueError("each duel player must vote exactly once")
    first, second = list(roles)
    accusers = [player_id for player_id in (first, second) if votes[player_id] == DuelVote.ACCUSE]
    nazis = [player_id for player_id in (first, second) if roles[player_id] == Faction.NAZI]

    if not nazis:
        if not accusers:
            return DuelOutcome([first, second], "mutual_trust")
        if len(accusers) == 2:
            return DuelOutcome([], "mutual_accusation")
        return DuelOutcome([player_id for player_id in (first, second) if player_id not in accusers], "false_accusation")

    if len(nazis) == 2:
        if len(accusers) == 2:
            return DuelOutcome([first, second], "nazis_found_each_other")
        if accusers:
            return DuelOutcome(accusers, "nazi_found")
        return DuelOutcome([], "nazis_fooled_each_other")

    nazi = nazis[0]
    communist = second if nazi == first else first
    if votes[communist] == DuelVote.ACCUSE:
        return DuelOutcome([communist], "nazi_unmasked")
    if votes[nazi] == DuelVote.ACCUSE:
        return DuelOutcome([communist], "nazi_gave_himself_away")
    return DuelOutcome([nazi], "nazi_accepted")
