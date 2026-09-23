from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Faction(str, Enum):
    NAZI = "NAZI"
    COMMUNIST = "COMMUNIST"


class MissionVote(str, Enum):
    NAZI = "NAZI"
    COMMUNIST = "COMMUNIST"


class ConfidenceVote(str, Enum):
    YES = "YES"
    NO = "NO"


class RoundPhase(str, Enum):
    PROPOSING = "PROPOSING"
    VOTING = "VOTING"
    MISSION = "MISSION"


class InfoMode(str, Enum):
    FULL = "full"
    PARTIAL = "partial"
    BLIND = "blind"


@dataclass(frozen=True)
class Ruleset:
    player_count: int
    nazi_count: int
    communist_count: int
    mission_sizes: list[int]
    mission_count: int
    win_threshold: int
    info_mode: InfoMode
    experimental: bool

    def __post_init__(self) -> None:
        for field_name in ("player_count", "nazi_count", "communist_count", "mission_count", "win_threshold"):
            value = getattr(self, field_name)
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError(f"invalid ruleset: {field_name} must be an integer")
        if self.player_count < 4:
            raise ValueError("invalid ruleset: player_count must be >= 4")
        if self.nazi_count < 1 or self.communist_count < 1:
            raise ValueError("invalid ruleset: each faction needs at least one player")
        if self.mission_count < 1:
            raise ValueError("invalid ruleset: mission_count must be >= 1")
        if self.win_threshold < 1:
            raise ValueError("invalid ruleset: win_threshold must be >= 1")
        if self.nazi_count + self.communist_count != self.player_count:
            raise ValueError("invalid ruleset: nazi_count + communist_count must equal player_count")
        if len(self.mission_sizes) != self.mission_count:
            raise ValueError("invalid ruleset: mission_sizes length must equal mission_count")
        if self.win_threshold > self.mission_count:
            raise ValueError("invalid ruleset: win_threshold must be <= mission_count")
        # Chaque mission a un vainqueur : il faut assez de missions pour qu'un camp atteigne
        # forcément le seuil (sinon 2-2 sur 4 missions avec un seuil à 3, par exemple).
        if 2 * self.win_threshold - 1 > self.mission_count:
            raise ValueError("invalid ruleset: mission_count must be >= 2 * win_threshold - 1 (a draw would be possible)")
        if self.info_mode == InfoMode.BLIND and not self.experimental:
            raise ValueError("invalid ruleset: blind mode requires experimental=True")

    @property
    def is_playable(self) -> bool:
        """Vrai si chaque équipe tient entre 1 joueur et le nombre de communistes."""
        # Une équipe ne doit jamais dépasser le nombre de communistes : sinon aucune
        # équipe sans nazi n'est possible et la mission est perdue d'avance.
        return all(
            not isinstance(size, bool) and isinstance(size, int) and 1 <= size <= self.communist_count
            for size in self.mission_sizes
        )


@dataclass(frozen=True)
class Player:
    id: str
    faction: Faction


@dataclass(frozen=True)
class GameState:
    players: list[Player]
    chef_cursor: int
    nazi_wins: int
    communist_wins: int


@dataclass(frozen=True)
class RoundState:
    phase: RoundPhase
    chef_id: str
    proposed_team: list[str]
    confidence_votes: dict[str, ConfidenceVote]
    mission_votes: list[MissionVote]
