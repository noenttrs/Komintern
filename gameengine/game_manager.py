from __future__ import annotations

from dataclasses import replace

from .constants import PRESET_5J
from .types import Faction, GameState, InfoMode, Ruleset
from .utils import assign_roles


class GameManager:
    def __init__(self, player_ids: list[str], chef_cursor: int, ruleset: Ruleset | None = None):
        self._player_ids = list(player_ids)
        self._chef_cursor = chef_cursor
        self._ruleset = PRESET_5J if ruleset is None else ruleset

    @property
    def ruleset(self) -> Ruleset:
        return self._ruleset

    def start_game(self) -> GameState:
        players = assign_roles(self._player_ids, self._ruleset)
        return GameState(players=players, chef_cursor=self._chef_cursor, nazi_wins=0, communist_wins=0)

    def set_turn_order(self, state: GameState, ordered_player_ids: list[str]) -> GameState:
        if len(ordered_player_ids) != len(state.players):
            raise ValueError("ordered_player_ids must include every player exactly once")
        if len(set(ordered_player_ids)) != len(ordered_player_ids):
            raise ValueError("ordered_player_ids must not contain duplicates")

        players_by_id = {player.id: player for player in state.players}
        if set(players_by_id.keys()) != set(ordered_player_ids):
            raise ValueError("ordered_player_ids must match current game players")

        ordered_players = [players_by_id[player_id] for player_id in ordered_player_ids]
        self._player_ids = list(ordered_player_ids)
        self._chef_cursor = 0
        return replace(state, players=ordered_players, chef_cursor=0)

    def get_player_view(self, player_id: str, state: GameState) -> dict:
        player_map = {player.id: player.faction for player in state.players}
        if player_id not in player_map:
            raise ValueError("unknown player_id")

        if self._ruleset.info_mode == InfoMode.BLIND:
            return {player_id: player_map[player_id]}

        if player_map[player_id] == Faction.NAZI and self._ruleset.info_mode == InfoMode.FULL:
            return dict(player_map)

        if player_map[player_id] == Faction.NAZI and self._ruleset.info_mode == InfoMode.PARTIAL:
            nazi_ids = [player.id for player in state.players if player.faction == Faction.NAZI]
            if len(nazi_ids) <= 1:
                return {player_id: player_map[player_id]}

            current_index = nazi_ids.index(player_id)
            known_other = nazi_ids[(current_index + 1) % len(nazi_ids)]
            return {
                player_id: player_map[player_id],
                known_other: player_map[known_other],
            }

        return {player_id: player_map[player_id]}

    def record_mission_result(self, winner: Faction, state: GameState) -> GameState:
        if winner == Faction.NAZI:
            return replace(state, nazi_wins=state.nazi_wins + 1)
        if winner == Faction.COMMUNIST:
            return replace(state, communist_wins=state.communist_wins + 1)
        raise ValueError("invalid faction winner")

    def check_win_condition(self, state: GameState) -> Faction | None:
        if state.nazi_wins >= self._ruleset.win_threshold:
            return Faction.NAZI
        if state.communist_wins >= self._ruleset.win_threshold:
            return Faction.COMMUNIST
        return None

    def end_game(self, state: GameState) -> int:
        return state.chef_cursor
