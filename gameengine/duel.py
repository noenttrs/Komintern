"""Duel à 2 joueurs : on discute, puis chacun vote en secret « confiance » ou « nazi ! ».

Chaque rôle est tiré indépendamment à pile ou face : 25 % de deux communistes, 25 % de deux
nazis, 50 % d'un de chaque. Connaître son propre rôle ne dit donc rien de celui de l'autre.
Personne ne connaît le rôle de l'autre, pas même un nazi.

Résultats (docs/REGLES.md, « Duel à 2 joueurs ») :
- un communiste gagne s'il juge juste : confiance à un communiste, accusation d'un nazi ;
- un nazi face à un communiste gagne s'il se fait accepter (les deux font confiance) ; s'il
  accuse un communiste, il se démasque et perd ;
- deux nazis : celui qui accuse gagne (il a trouvé l'autre) ; s'ils se font confiance, ils se
  reconnaissent et gagnent tous les deux.
Avec ce tirage, aucun vote n'est gagnant d'avance : pour un communiste, confiance et accusation
ont la même espérance ; pour un nazi, tout dépend de ce que l'autre va faire.
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


def draw_duel_roles(player_ids: list[str], rng: random.Random) -> dict[str, Faction]:
    if len(player_ids) != 2 or len(set(player_ids)) != 2:
        raise ValueError("a duel needs exactly 2 distinct players")
    # Tirage indépendant pour chaque joueur, à pile ou face.
    return {player_id: rng.choice((Faction.NAZI, Faction.COMMUNIST)) for player_id in player_ids}


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
        return DuelOutcome([first, second], "nazis_trusted_each_other")

    nazi = nazis[0]
    communist = second if nazi == first else first
    if votes[communist] == DuelVote.ACCUSE:
        return DuelOutcome([communist], "nazi_unmasked")
    if votes[nazi] == DuelVote.ACCUSE:
        # Le nazi se démasque en accusant, mais le communiste lui faisait confiance : il a mal jugé.
        return DuelOutcome([], "nazi_gave_himself_away")
    return DuelOutcome([nazi], "nazi_accepted")
