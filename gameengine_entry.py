from __future__ import annotations

import json
import sys
from dataclasses import asdict
from enum import Enum
from typing import Any

from gameengine.constants import PRESET_5J, PRESETS
from gameengine.game_manager import GameManager
from gameengine.round_manager import RoundManager
from gameengine.utils import make_rng
from gameengine.types import ConfidenceVote, Faction, GameState, InfoMode, MissionVote, RoundPhase, RoundState, Ruleset


PRESET_BY_NAME: dict[str, Ruleset] = {f"PRESET_{count}J": preset for count, preset in PRESETS.items()}


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


def _is_int(value: Any) -> bool:
    # bool est une sous-classe de int en Python : on l'exclut explicitement.
    return isinstance(value, int) and not isinstance(value, bool)


def _optional_str_list(args: dict[str, Any], field_name: str) -> list[str] | None:
    value = args.get(field_name)
    if value is None:
        return None
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError(f"{field_name} must be a list of strings")
    return value


def _parse_faction(value: Any, field_name: str) -> Faction:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    try:
        return Faction[value.upper()]
    except KeyError as error:
        raise ValueError(f"{field_name} must be NAZI or COMMUNIST") from error


class EngineBridge:
    def __init__(self) -> None:
        self._game_manager: GameManager | None = None
        self._game_state: GameState | None = None
        self._round_manager: RoundManager | None = None
        self._ruleset: Ruleset = PRESET_5J
        self._mission_number = 0
        self._game_winner: Faction | None = None
        self._finished = False
        self._rng = make_rng()

    def dispatch(self, command: str, args: dict[str, Any]) -> Any:
        handlers: dict[str, Any] = {
            "start_game": self.start_game,
            "get_player_view": self.get_player_view,
            "get_game_state": self.get_game_state,
            "set_turn_order": self.set_turn_order,
            "get_round_state": self.get_round_state,
            "propose_team": self.propose_team,
            "submit_confidence_votes": self.submit_confidence_votes,
            "submit_mission_votes": self.submit_mission_votes,
            "forfeit": self.forfeit,
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
        seed = args.get("seed")
        if not isinstance(player_ids, list) or not all(isinstance(player_id, str) for player_id in player_ids):
            raise ValueError("player_ids must be a list of strings")
        if not _is_int(chef_cursor):
            raise ValueError("chef_cursor must be an integer")
        if not 0 <= chef_cursor < len(player_ids):
            raise ValueError("chef_cursor must be within [0, len(player_ids))")
        if seed is not None and not _is_int(seed):
            raise ValueError("seed must be an integer")

        # Tout est construit en local : un échec ne modifie pas la partie en cours.
        ruleset = self._parse_ruleset(args)
        if not ruleset.is_playable:
            raise ValueError("each mission size must be between 1 and the number of communists")
        rng = make_rng(seed)
        game_manager = GameManager(player_ids, chef_cursor, ruleset, rng)
        game_state = game_manager.start_game()
        round_manager = RoundManager(game_state, 0, ruleset, rng)

        self._ruleset = ruleset
        self._rng = rng
        self._game_manager = game_manager
        self._game_state = game_state
        self._mission_number = 0
        self._round_manager = round_manager
        self._game_winner = None
        self._finished = False
        return {"status": "ok", "round": self._round_payload()}

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
            "game_winner": None if self._game_winner is None else _enum_name(self._game_winner),
            "finished": self._finished,
        }

    def get_round_state(self, args: dict[str, Any]) -> dict[str, Any]:
        del args
        self._require_game()
        return self._round_payload()

    def propose_team(self, args: dict[str, Any]) -> dict[str, Any]:
        round_manager = self._require_round()
        team = args.get("team")
        proposer_id = args.get("proposer_id")
        if not isinstance(team, list) or not all(isinstance(player_id, str) for player_id in team):
            raise ValueError("team must be a list of strings")
        if proposer_id is not None and not isinstance(proposer_id, str):
            raise ValueError("proposer_id must be a string")
        state = round_manager.propose_team(team, proposer_id)
        return _serialize_round_state(state)

    def set_turn_order(self, args: dict[str, Any]) -> dict[str, Any]:
        game_manager, game_state = self._require_game()
        self._ensure_not_over()
        if self._round_manager is not None and self._round_manager.get_state().phase != RoundPhase.PROPOSING:
            raise ValueError("turn order can only change while a team is being proposed")
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
            if not isinstance(vote, str):
                raise ValueError("invalid confidence vote payload")
            try:
                votes[player_id] = ConfidenceVote[vote.upper()]
            except KeyError as error:
                raise ValueError("invalid confidence vote value") from error

        voter_ids = _optional_str_list(args, "voter_ids")
        state = round_manager.submit_confidence_votes(votes, voter_ids)
        payload = _serialize_round_state(state)
        payload["approved"] = bool(round_manager.last_approved)
        return payload

    def submit_mission_votes(self, args: dict[str, Any]) -> dict[str, Any]:
        round_manager = self._require_round()
        raw_votes = args.get("votes")
        if not isinstance(raw_votes, dict):
            raise ValueError("votes must be an object")

        votes: dict[str, MissionVote] = {}
        for player_id, vote in raw_votes.items():
            if not isinstance(vote, str):
                raise ValueError("invalid mission vote payload")
            try:
                votes[player_id] = MissionVote[vote.upper()]
            except KeyError as error:
                raise ValueError("invalid mission vote value") from error

        voter_ids = _optional_str_list(args, "voter_ids")
        winner = round_manager.submit_mission_votes(votes, voter_ids)
        state = round_manager.get_state()

        # Le curseur du chef a avancé dans la manche terminée : on le reporte dans l'état
        # canonique, puis on compte le point de la mission.
        game_manager = self._require_game()[0]
        self._game_state = game_manager.record_mission_result(winner, round_manager.get_game_state())
        self._game_winner = game_manager.check_win_condition(self._game_state)

        self._mission_number += 1
        if self._game_winner is None and self._mission_number < self._ruleset.mission_count:
            self._round_manager = RoundManager(self._game_state, self._mission_number, self._ruleset, self._rng)
        else:
            self._round_manager = None

        nazi_vote_count = sum(vote == MissionVote.NAZI for vote in state.mission_votes)

        return {
            "winner": _enum_name(winner),
            "votes": [_enum_name(vote) for vote in state.mission_votes],
            "nazi_vote_count": nazi_vote_count,
            "scores": {"nazi": self._game_state.nazi_wins, "communist": self._game_state.communist_wins},
            "game_winner": None if self._game_winner is None else _enum_name(self._game_winner),
            "next_round": None if self._round_manager is None else self._round_payload(),
        }

    def forfeit(self, args: dict[str, Any]) -> dict[str, Any]:
        """La faction `faction` abandonne (joueur AFK) : l'autre camp gagne la partie."""
        self._require_game()
        self._ensure_not_over()
        faction = _parse_faction(args.get("faction"), "faction")
        self._game_winner = Faction.COMMUNIST if faction == Faction.NAZI else Faction.NAZI
        self._round_manager = None
        return {"game_winner": _enum_name(self._game_winner)}

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
        self._finished = True
        self._round_manager = None
        return game_manager.end_game(game_state)

    def _require_game(self) -> tuple[GameManager, GameState]:
        if self._game_manager is None or self._game_state is None:
            raise RuntimeError("game has not been started")
        return self._game_manager, self._game_state

    def _require_round(self) -> RoundManager:
        self._require_game()
        self._ensure_not_over()
        if self._round_manager is None:
            raise RuntimeError("round is not initialized")
        return self._round_manager

    def _ensure_not_over(self) -> None:
        if self._finished or self._game_winner is not None:
            raise RuntimeError("game is over")

    def _round_payload(self) -> dict[str, Any]:
        _, game_state = self._require_game()
        base: dict[str, Any] = {
            "mission_index": self._mission_number,
            "mission_count": self._ruleset.mission_count,
            "scores": {"nazi": game_state.nazi_wins, "communist": game_state.communist_wins},
            "game_winner": None if self._game_winner is None else _enum_name(self._game_winner),
            "finished": self._finished,
        }
        if self._round_manager is None:
            base.update({"phase": None, "chef_id": None, "required_team_size": None, "proposed_team": [], "confidence_votes": {}})
            return base
        state = _serialize_round_state(self._round_manager.get_state())
        base.update(
            {
                "phase": state["phase"],
                "chef_id": state["chef_id"],
                "required_team_size": self._round_manager.required_team_size,
                "proposed_team": state["proposed_team"],
                "confidence_votes": state["confidence_votes"],
            }
        )
        return base

    def _parse_ruleset(self, args: dict[str, Any]) -> Ruleset:
        preset_name = args.get("ruleset_preset")
        if preset_name is not None and args.get("ruleset") is not None:
            raise ValueError("provide either ruleset_preset or ruleset, not both")
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
        if not isinstance(mission_sizes, list) or not all(_is_int(size) for size in mission_sizes):
            raise ValueError("ruleset.mission_sizes must be a list of integers")

        if any(size < 1 for size in mission_sizes):
            raise ValueError("ruleset.mission_sizes must all be >= 1")
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
        if not _is_int(value):
            raise ValueError(f"ruleset.{field_name} must be an integer")
        return value

    @staticmethod
    def _require_bool(payload: dict[str, Any], field_name: str) -> bool:
        value = payload.get(field_name)
        if not isinstance(value, bool):
            raise ValueError(f"ruleset.{field_name} must be a boolean")
        return value


def handle_line(bridge: EngineBridge, line: str) -> dict[str, Any]:
    """Traite une ligne NDJSON ; la réponse reprend l'`id` de la requête s'il existe."""
    request_id: Any = None
    try:
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError("command payload must be an object")
        request_id = payload.get("id")
        command = payload.get("command")
        args = payload.get("args", {})
        if not isinstance(command, str):
            raise ValueError("missing command")
        if not isinstance(args, dict):
            raise ValueError("args must be an object")

        response: dict[str, Any] = {"ok": True, "result": bridge.dispatch(command, args)}
    except Exception as error:  # noqa: BLE001 - le process ne doit jamais mourir sur une commande
        response = {"ok": False, "error": str(error) or type(error).__name__}

    if request_id is not None:
        response["id"] = request_id
    return response


def main() -> int:
    bridge = EngineBridge()

    for line in sys.stdin:
        stripped = line.strip()
        if not stripped:
            continue

        response = handle_line(bridge, stripped)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
