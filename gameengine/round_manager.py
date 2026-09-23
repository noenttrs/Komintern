from __future__ import annotations

import random
from dataclasses import replace

from .constants import PRESET_5J
from .types import ConfidenceVote, Faction, GameState, MissionVote, RoundPhase, RoundState, Ruleset
from .utils import shuffle_votes


class RoundManager:
    """Une manche (= une mission) : PROPOSING -> VOTING -> MISSION.

    Le chef est fixe pendant toute la manche : après un rejet, il repropose. Le curseur
    n'avance qu'une fois la mission jouée, pour la manche suivante.
    """

    def __init__(
        self,
        game_state: GameState,
        mission_number: int,
        ruleset: Ruleset | None = None,
        rng: random.Random | None = None,
    ):
        self._ruleset = PRESET_5J if ruleset is None else ruleset
        if mission_number < 0 or mission_number >= self._ruleset.mission_count:
            raise ValueError("invalid mission number")
        self._game_state = game_state
        self._mission_number = mission_number
        self._rng = rng
        self._player_factions = {player.id: player.faction for player in game_state.players}
        self._last_approved: bool | None = None
        self._round_state = RoundState(
            phase=RoundPhase.PROPOSING,
            chef_id=self._current_chef_id(),
            proposed_team=[],
            confidence_votes={},
            mission_votes=[],
        )

    @property
    def mission_number(self) -> int:
        return self._mission_number

    @property
    def required_team_size(self) -> int:
        return self._ruleset.mission_sizes[self._mission_number]

    @property
    def last_approved(self) -> bool | None:
        return self._last_approved

    def propose_team(self, team: list[str], proposer_id: str | None = None) -> RoundState:
        self._ensure_phase(RoundPhase.PROPOSING)
        if proposer_id is not None and proposer_id != self._round_state.chef_id:
            raise ValueError("only the current chef can propose a team")
        self._validate_team(team)
        self._last_approved = None
        self._round_state = replace(
            self._round_state,
            phase=RoundPhase.VOTING,
            proposed_team=list(team),
            confidence_votes={},
            mission_votes=[],
        )
        return self._round_state

    def submit_confidence_votes(
        self,
        votes: dict[str, ConfidenceVote],
        voter_ids: list[str] | None = None,
    ) -> RoundState:
        """Vote simultané de confiance.

        `voter_ids` = votants attendus (les joueurs actifs) ; par défaut tous les joueurs.
        Il faut exactement un vote par votant attendu. Majorité stricte de OUI requise :
        une égalité vaut rejet. Après un rejet, le même chef repropose.
        """
        self._ensure_phase(RoundPhase.VOTING)
        expected = self._resolve_voters(voter_ids)
        if set(votes) != expected:
            raise ValueError("confidence votes must come from exactly the expected voters")

        yes_votes = sum(vote == ConfidenceVote.YES for vote in votes.values())
        approved = yes_votes * 2 > len(expected)
        self._last_approved = approved

        if approved:
            self._round_state = replace(
                self._round_state,
                phase=RoundPhase.MISSION,
                confidence_votes=dict(votes),
            )
            return self._round_state

        # Rejet : retour à la proposition, même chef, votes conservés pour l'affichage.
        self._round_state = replace(
            self._round_state,
            phase=RoundPhase.PROPOSING,
            proposed_team=[],
            confidence_votes=dict(votes),
            mission_votes=[],
        )
        return self._round_state

    def submit_mission_votes(
        self,
        votes: dict[str, MissionVote],
        voter_ids: list[str] | None = None,
    ) -> Faction:
        """`voter_ids` = membres de l'équipe encore actifs ; par défaut toute l'équipe."""
        self._ensure_phase(RoundPhase.MISSION)
        team = set(self._round_state.proposed_team)
        if voter_ids is None:
            expected = team
        else:
            expected = set(voter_ids)
            if len(expected) != len(voter_ids):
                raise ValueError("voter_ids must not contain duplicates")
            if not expected or not expected <= team:
                raise ValueError("mission voter_ids must be a non-empty subset of the team")
        if set(votes) != expected:
            raise ValueError("only team members may vote, and each exactly once")

        for player_id, vote in votes.items():
            if self._player_factions[player_id] == Faction.COMMUNIST and vote == MissionVote.NAZI:
                raise ValueError("communist players cannot submit a nazi vote")

        shuffled_votes = shuffle_votes(list(votes.values()), self._rng)
        self._round_state = replace(self._round_state, mission_votes=shuffled_votes)

        # Le chef change à chaque nouvelle manche, jamais après un simple rejet.
        self._advance_chef_cursor()
        return Faction.NAZI if MissionVote.NAZI in shuffled_votes else Faction.COMMUNIST

    def get_state(self) -> RoundState:
        return self._round_state

    def update_game_state(self, game_state: GameState) -> None:
        self._game_state = game_state
        self._round_state = replace(self._round_state, chef_id=self._current_chef_id())

    def get_game_state(self) -> GameState:
        return self._game_state

    def _resolve_voters(self, voter_ids: list[str] | None) -> set[str]:
        if voter_ids is None:
            return set(self._player_factions)
        expected = set(voter_ids)
        if len(expected) != len(voter_ids):
            raise ValueError("voter_ids must not contain duplicates")
        if not expected:
            raise ValueError("at least one voter is required")
        if not expected <= set(self._player_factions):
            raise ValueError("voter_ids contain invalid player ids")
        return expected

    def _advance_chef_cursor(self) -> None:
        next_cursor = (self._game_state.chef_cursor + 1) % len(self._game_state.players)
        self._game_state = replace(self._game_state, chef_cursor=next_cursor)

    def _current_chef_id(self) -> str:
        return self._game_state.players[self._game_state.chef_cursor].id

    def _ensure_phase(self, expected_phase: RoundPhase) -> None:
        if self._round_state.phase != expected_phase:
            raise ValueError(f"round is not in {expected_phase.value} phase")

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
