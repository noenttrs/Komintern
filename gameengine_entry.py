from __future__ import annotations

import json
import sys
from dataclasses import asdict
from enum import Enum
from typing import Any

from gameengine.constants import PRESET_3J, PRESET_5J, PRESET_6J, PRESET_7J, PRESET_8J, PRESET_9J, PRESET_10J, PRESET_11J
from gameengine.game_manager import GameManager
from gameengine.round_manager import RoundManager
from gameengine.types import ConfidenceVote, Faction, GameState, InfoMode, MissionVote, RoundState, Ruleset


PRESET_BY_NAME: dict[str, Ruleset] = {
    "PRESET_3J": PRESET_3J,
    "PRESET_5J": PRESET_5J,
    "PRESET_6J": PRESET_6J,
    "PRESET_7J": PRESET_7J,
    "PRESET_8J": PRESET_8J,
    "PRESET_9J": PRESET_9J,
    "PRESET_10J": PRESET_10J,
    "PRESET_11J": PRESET_11J,
}


def _enum_name(value: Enum) -> str:
    return value.name.lower()


def _serialize_round_state(state: RoundState) -> dict[str, Any]:
    payload = asdict(state)
    payload["phase"] = _enum_name(state.phase)
    payload["confidence_votes"] = {player_id: _enum_name(vote) for player_id, vote in state.confidence_votes.items()}
    payload["mission_votes"] = [_enum_name(vote) for vote in state.mission_votes]
    return payload


def _serialize_player_view(view: dict[str, Faction]) -> dict[str, str]:
    return {player_id: _enum_name(faction) for player_id, faction in view.items()}


class EngineBridge:
    def __init__(self) -> None:
        self._game_manager: GameManager | None = None
        self._game_state: GameState | None = None
        self._round_manager: RoundManager | None = None
        self._ruleset: Ruleset = PRESET_5J
        self._mission_number = 0

    def dispatch(self, command: str, args: dict[str, Any]) -> Any:
        handlers: dict[str, Any] = {
            "start_game": self.start_game,
            "get_player_view": self.get_player_view,
            "get_game_state": self.get_game_state,
            "set_turn_order": self.set_turn_order,
            "propose_team": self.propose_team,
            "submit_confidence_votes": self.submit_confidence_votes,
            "submit_mission_votes": self.submit_mission_votes,
            "record_mission_result": self.record_mission_result,
            "check_win_condition": self.check_win_condition,
            "end_game": self.end_game,
        }

        handler = handlers.get(command)
        if handler is None:
            raise ValueError(f"unknown command: {command}")
        return handler(args)

    def start_game(self, args: dict[str, Any]) -> dict[str, Any]:
        player_ids = args.get("player_ids")
        chef_cursor = args.get("chef_cursor")
        if not isinstance(player_ids, list) or not all(isinstance(player_id, str) for player_id in player_ids):
            raise ValueError("player_ids must be a list of strings")
        if not isinstance(chef_cursor, int):
            raise ValueError("chef_cursor must be an integer")

        self._ruleset = self._parse_ruleset(args)

        self._game_manager = GameManager(player_ids, chef_cursor, self._ruleset)
        self._game_state = self._game_manager.start_game()
        self._mission_number = 0
        self._round_manager = RoundManager(self._game_state, self._mission_number, self._ruleset)
        return {"status": "ok"}

    def get_player_view(self, args: dict[str, Any]) -> dict[str, str]:
        game_manager, game_state = self._require_game()
        player_id = args.get("player_id")
        if not isinstance(player_id, str):
            raise ValueError("player_id must be a string")
        raw = game_manager.get_player_view(player_id, game_state)
        return _serialize_player_view(raw)

    def get_game_state(self, args: dict[str, Any]) -> dict[str, Any]:
        del args
        _, game_state = self._require_game()
        return {
            "chef_cursor": game_state.chef_cursor,
            "nazi_wins": game_state.nazi_wins,
            "communist_wins": game_state.communist_wins,
        }

    def propose_team(self, args: dict[str, Any]) -> dict[str, Any]:
        round_manager = self._require_round()
        team = args.get("team")
        if not isinstance(team, list) or not all(isinstance(player_id, str) for player_id in team):
            raise ValueError("team must be a list of strings")
        state = round_manager.propose_team(team)
        return _serialize_round_state(state)

    def set_turn_order(self, args: dict[str, Any]) -> dict[str, Any]:
        game_manager, game_state = self._require_game()
        ordered_player_ids = args.get("ordered_player_ids")
        if not isinstance(ordered_player_ids, list) or not all(isinstance(player_id, str) for player_id in ordered_player_ids):
            raise ValueError("ordered_player_ids must be a list of strings")

        self._game_state = game_manager.set_turn_order(game_state, ordered_player_ids)
        if self._round_manager is not None and self._game_state is not None:
            self._round_manager.update_game_state(self._game_state)
        return {"status": "ok"}

    def submit_confidence_votes(self, args: dict[str, Any]) -> dict[str, Any]:
        round_manager = self._require_round()
        raw_votes = args.get("votes")
        if not isinstance(raw_votes, dict):
            raise ValueError("votes must be an object")

        votes: dict[str, ConfidenceVote] = {}
        for player_id, vote in raw_votes.items():
            if not isinstance(player_id, str) or not isinstance(vote, str):
                raise ValueError("invalid confidence vote payload")
            try:
                votes[player_id] = ConfidenceVote[vote.upper()]
            except KeyError as error:
                raise ValueError("invalid confidence vote value") from error

        state = round_manager.submit_confidence_votes(votes)
        return _serialize_round_state(state)

    def submit_mission_votes(self, args: dict[str, Any]) -> dict[str, Any]:
        round_manager = self._require_round()
        raw_votes = args.get("votes")
        if not isinstance(raw_votes, dict):
            raise ValueError("votes must be an object")

        votes: dict[str, MissionVote] = {}
        for player_id, vote in raw_votes.items():
            if not isinstance(player_id, str) or not isinstance(vote, str):
                raise ValueError("invalid mission vote payload")
            try:
                votes[player_id] = MissionVote[vote.upper()]
            except KeyError as error:
                raise ValueError("invalid mission vote value") from error

        winner = round_manager.submit_mission_votes(votes)
        state = round_manager.get_state()

        # RoundManager advances the chef cursor when proposals are made. Persist that cursor
        # into the canonical game state before creating the next round.
        self._game_state = round_manager.get_game_state()

        self._mission_number += 1
        _, game_state = self._require_game()
        if self._mission_number < self._ruleset.mission_count:
            self._round_manager = RoundManager(game_state, self._mission_number, self._ruleset)
        else:
            self._round_manager = None

        nazi_vote_count = sum(vote == MissionVote.NAZI for vote in state.mission_votes)

        return {
            "winner": _enum_name(winner),
            "votes": [_enum_name(vote) for vote in state.mission_votes],
            "nazi_vote_count": nazi_vote_count,
        }

    def record_mission_result(self, args: dict[str, Any]) -> dict[str, Any]:
        game_manager, game_state = self._require_game()
        winner = args.get("winner")
        if not isinstance(winner, str):
            raise ValueError("winner must be a string")
        try:
            faction = Faction[winner.upper()]
        except KeyError as error:
            raise ValueError("winner must be NAZI or COMMUNIST") from error
        self._game_state = game_manager.record_mission_result(faction, game_state)
        if self._round_manager is not None and self._game_state is not None:
            self._round_manager.update_game_state(self._game_state)
        return {"status": "ok"}

    def check_win_condition(self, args: dict[str, Any]) -> str | None:
        del args
        game_manager, game_state = self._require_game()
        winner = game_manager.check_win_condition(game_state)
        if winner is None:
            return None
        return _enum_name(winner)

    def end_game(self, args: dict[str, Any]) -> int:
        del args
        game_manager, game_state = self._require_game()
        return game_manager.end_game(game_state)

    def _require_game(self) -> tuple[GameManager, GameState]:
        if self._game_manager is None or self._game_state is None:
            raise RuntimeError("game has not been started")
        return self._game_manager, self._game_state

    def _require_round(self) -> RoundManager:
        if self._round_manager is None:
            raise RuntimeError("round is not initialized")
        return self._round_manager

    def _parse_ruleset(self, args: dict[str, Any]) -> Ruleset:
        preset_name = args.get("ruleset_preset")
        if preset_name is not None:
            if not isinstance(preset_name, str):
                raise ValueError("ruleset_preset must be a string")
            preset = PRESET_BY_NAME.get(preset_name.upper())
            if preset is None:
                raise ValueError("unknown ruleset_preset")
            return preset

        raw_ruleset = args.get("ruleset")
        if raw_ruleset is None:
            return PRESET_5J
        if not isinstance(raw_ruleset, dict):
            raise ValueError("ruleset must be an object")

        required_fields = [
            "player_count",
            "nazi_count",
            "communist_count",
            "mission_sizes",
            "mission_count",
            "win_threshold",
            "info_mode",
            "experimental",
        ]
        missing_fields = [field for field in required_fields if field not in raw_ruleset]
        if missing_fields:
            raise ValueError(f"ruleset missing required fields: {', '.join(missing_fields)}")

        info_mode_value = raw_ruleset["info_mode"]
        if not isinstance(info_mode_value, str):
            raise ValueError("ruleset.info_mode must be a string")

        try:
            info_mode = InfoMode(info_mode_value.lower())
        except ValueError as error:
            raise ValueError("ruleset.info_mode must be one of: full, partial, blind") from error

        mission_sizes = raw_ruleset["mission_sizes"]
        if not isinstance(mission_sizes, list) or not all(isinstance(size, int) for size in mission_sizes):
            raise ValueError("ruleset.mission_sizes must be a list of integers")

        return Ruleset(
            player_count=self._require_int(raw_ruleset, "player_count"),
            nazi_count=self._require_int(raw_ruleset, "nazi_count"),
            communist_count=self._require_int(raw_ruleset, "communist_count"),
            mission_sizes=mission_sizes,
            mission_count=self._require_int(raw_ruleset, "mission_count"),
            win_threshold=self._require_int(raw_ruleset, "win_threshold"),
            info_mode=info_mode,
            experimental=self._require_bool(raw_ruleset, "experimental"),
        )

    @staticmethod
    def _require_int(payload: dict[str, Any], field_name: str) -> int:
        value = payload.get(field_name)
        if not isinstance(value, int):
            raise ValueError(f"ruleset.{field_name} must be an integer")
        return value

    @staticmethod
    def _require_bool(payload: dict[str, Any], field_name: str) -> bool:
        value = payload.get(field_name)
        if not isinstance(value, bool):
            raise ValueError(f"ruleset.{field_name} must be a boolean")
        return value


def main() -> int:
    bridge = EngineBridge()

    for line in sys.stdin:
        stripped = line.strip()
        if not stripped:
            continue

        try:
            payload = json.loads(stripped)
            if not isinstance(payload, dict):
                raise ValueError("command payload must be an object")
            command = payload.get("command")
            args = payload.get("args", {})
            if not isinstance(command, str):
                raise ValueError("missing command")
            if not isinstance(args, dict):
                raise ValueError("args must be an object")

            result = bridge.dispatch(command, args)
            response = {"ok": True, "result": result}
        except Exception as error:
            response = {"ok": False, "error": str(error)}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
