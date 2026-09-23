from __future__ import annotations

from dataclasses import replace

from .constants import PRESET_5J
from .types import ConfidenceVote, Faction, GameState, MissionVote, RoundPhase, RoundState, Ruleset
from .utils import shuffle_votes


class RoundManager:
    def __init__(self, game_state: GameState, mission_number: int, ruleset: Ruleset | None = None):
        self._ruleset = PRESET_5J if ruleset is None else ruleset
        if mission_number < 0 or mission_number >= self._ruleset.mission_count:
            raise ValueError("invalid mission number")
        self._game_state = game_state
        self._mission_number = mission_number
        self._player_factions = {player.id: player.faction for player in game_state.players}
        self._round_state = RoundState(
            phase=RoundPhase.PROPOSING,
            chef_id=self._current_chef_id(),
            proposed_team=[],
            confidence_votes={},
            mission_votes=[],
        )

    def propose_team(self, team: list[str]) -> RoundState:
        self._ensure_phase(RoundPhase.PROPOSING)
        self._validate_team(team)
        self._round_state = replace(
            self._round_state,
            phase=RoundPhase.VOTING,
            proposed_team=list(team),
            confidence_votes={},
            mission_votes=[],
        )
        return self._round_state

    def submit_confidence_votes(self, votes: dict[str, ConfidenceVote]) -> RoundState:
        self._ensure_phase(RoundPhase.VOTING)
        self._validate_confidence_votes(votes)

        majority = len(self._player_factions) // 2 + 1
        yes_votes = sum(vote == ConfidenceVote.YES for vote in votes.values())
        no_votes = sum(vote == ConfidenceVote.NO for vote in votes.values())

        if yes_votes >= majority:
            self._round_state = replace(
                self._round_state,
                phase=RoundPhase.MISSION,
                confidence_votes=dict(votes),
            )
            return self._round_state

        if no_votes >= majority:
            self._round_state = replace(
                self._round_state,
                phase=RoundPhase.PROPOSING,
                chef_id=self._current_chef_id(),
                proposed_team=[],
                confidence_votes={},
                mission_votes=[],
            )
            return self._round_state

        self._round_state = replace(self._round_state, confidence_votes=dict(votes))
        return self._round_state

    def submit_mission_votes(self, votes: dict[str, MissionVote]) -> Faction:
        self._ensure_phase(RoundPhase.MISSION)
        self._validate_team_votes(votes)

        for player_id, vote in votes.items():
            if self._player_factions[player_id] == Faction.COMMUNIST and vote == MissionVote.NAZI:
                raise ValueError("communist players cannot submit a nazi vote")

        shuffled_votes = shuffle_votes(list(votes.values()))
        self._round_state = replace(self._round_state, mission_votes=shuffled_votes)

        # Advance chef cursor after mission completes, not on proposal.
        self._advance_chef_cursor()
        return Faction.NAZI if MissionVote.NAZI in shuffled_votes else Faction.COMMUNIST

    def get_state(self) -> RoundState:
        return self._round_state

    def update_game_state(self, game_state: GameState) -> None:
        self._game_state = game_state

    def get_game_state(self) -> GameState:
        return self._game_state

    def _advance_chef_cursor(self) -> None:
        next_cursor = (self._game_state.chef_cursor + 1) % self._ruleset.player_count
        self._game_state = replace(self._game_state, chef_cursor=next_cursor)

    def _current_chef_id(self) -> str:
        return self._game_state.players[self._game_state.chef_cursor].id

    def _ensure_phase(self, expected_phase: RoundPhase) -> None:
        if self._round_state.phase != expected_phase:
            raise ValueError(f"round is not in {expected_phase} phase")

    def _validate_team(self, team: list[str]) -> None:
        expected_size = self._ruleset.mission_sizes[self._mission_number]
        if expected_size <= 0:
            raise ValueError(f"mission size for mission {self._mission_number + 1} is a placeholder and must be configured")
        if len(team) != expected_size:
            raise ValueError("invalid team size")
        if len(set(team)) != len(team):
            raise ValueError("team contains duplicate player ids")
        if any(player_id not in self._player_factions for player_id in team):
            raise ValueError("team contains invalid player ids")

    def _validate_confidence_votes(self, votes: dict[str, ConfidenceVote]) -> None:
        if len(votes) == 0:
            raise ValueError("at least one confidence vote is required")
        if any(player_id not in self._player_factions for player_id in votes):
            raise ValueError("confidence votes contain invalid player ids")

    def _validate_team_votes(self, votes: dict[str, MissionVote]) -> None:
        if set(votes) != set(self._round_state.proposed_team):
            raise ValueError("only team members may vote")
