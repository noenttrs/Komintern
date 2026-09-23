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
        if self.nazi_count + self.communist_count != self.player_count:
            raise ValueError("invalid ruleset: nazi_count + communist_count must equal player_count")
        if len(self.mission_sizes) != self.mission_count:
            raise ValueError("invalid ruleset: mission_sizes length must equal mission_count")
        if self.win_threshold > self.mission_count:
            raise ValueError("invalid ruleset: win_threshold must be <= mission_count")
        if self.info_mode == InfoMode.BLIND and not self.experimental:
            raise ValueError("invalid ruleset: blind mode requires experimental=True")


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
