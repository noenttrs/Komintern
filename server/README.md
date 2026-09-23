# Komintern WebSocket Server

Node.js + TypeScript Socket.io server that orchestrates the Python game engine for the social deduction game.

## What This Server Does

- Manages in-memory rooms (no database).
- Starts one Python engine process per active game session.
- Enforces server-side game flow rules:
  - phase validation,
  - chef turn validation,
  - confidence vote collection,
  - mission vote collection.
- Preserves information asymmetry by sending per-player views only.
- Preserves mission vote anonymity by forwarding shuffled mission votes from Python without attribution.
- Supports the updated ruleset-driven engine while keeping the original 5-player flow as the default.

## Project Structure

- src/index.ts: Socket.io bootstrap and all socket handlers.
- src/events.ts: All client/server event constants.
- src/types.ts: TypeScript types for room/session/bridge payloads.
- src/PythonBridge.ts: Newline-delimited JSON bridge to Python child process.
- src/RoomManager.ts: Room lifecycle, active sessions, persisted chef cursor.
- src/GameSession.ts: Game state machine for one room.
- src/rulesets.ts: Ruleset preset resolution and validation helpers.

## Requirements

- Node.js 24+
- npm 11+
- Python 3.12+ (or compatible with the engine)

## Install

```bash
cd /home/nono/Komintern/server
npm install
```

## Run

### Development

```bash
cd /home/nono/Komintern/server
npm run dev
```

### Production build

```bash
cd /home/nono/Komintern/server
npm run build
npm start
```

## Environment Variables

- PORT: Socket server port. Default: 3000
- PYTHON_PATH: Python executable. Default: python3
- ENGINE_PATH: Python entrypoint script for bridge protocol.
  - Default resolution in code: ../gameengine_entry.py (relative to server folder)
  - For this repository layout, that points to /home/nono/Komintern/gameengine_entry.py

Example:

```bash
PORT=3000 PYTHON_PATH=python3 ENGINE_PATH=/home/nono/Komintern/gameengine_entry.py npm run dev
```

## Socket Event Contract

### Client -> Server

- join_room
  - payload: { roomId: string, playerId: string }
- propose_team
  - payload: { team: string[] }
- confidence_vote
  - payload: { vote: "yes" | "no" }
- mission_vote
  - payload: { vote: "nazi" | "communist" }

### Server -> Client

- room_joined
- game_started
- round_started
- team_proposed
- confidence_result
- mission_result
- game_over
- error

All event names are centralized in src/events.ts.

## Python Bridge Protocol

Transport: newline-delimited JSON over stdin/stdout.

Node writes:

```json
{"command":"start_game","args":{"player_ids":["p1","p2","p3","p4","p5"],"chef_cursor":0,"ruleset_preset":"PRESET_5J"}}
```

Python responds:

```json
{"ok":true,"result":{}}
```

or

```json
{"ok":false,"error":"message"}
```

Supported commands:

- start_game { player_ids, chef_cursor, ruleset_preset?, ruleset? }
- get_player_view { player_id }
- propose_team { team }
- submit_confidence_votes { votes }
- submit_mission_votes { votes }
- record_mission_result { winner }
- check_win_condition {}
- end_game {}

submit_mission_votes returns:

```json
{
  "winner": "nazi" | "communist",
  "votes": ["nazi" | "communist", "nazi" | "communist", "..."],
  "nazi_vote_count": 0
}
```

The votes array is already shuffled by the Python engine and must not be re-ordered or attributed server-side.

## Rule/Flow Notes

- 5-player rooms still behave exactly like before.
- Rooms can now grow to match the supported engine presets up to 11 players.
- If the client does not provide a ruleset, the server infers the matching preset from the room size at start time.
- Mission team sizes are read from the selected ruleset, so preset-specific mission layouts are enforced by the server and Python engine together.
- Confidence vote is public and requires strict majority yes to proceed.
- If confidence fails (NO majority or tie), the same chef proposes again for the same mission.
- Mission outcome:
  - at least one nazi vote => nazis win mission,
  - all communist votes => communists win mission.
- Game ends when a faction reaches 3 mission wins.
- Chef rotation advances once per round (mission), never on a rejected proposal, and persists across games.

### Supported presets

- PRESET_5J
- PRESET_6J
- PRESET_7J
- PRESET_8J
- PRESET_9J
- PRESET_10J
- PRESET_11J

Notes:

- 6-player mission sizes match the 5-player layout.
- 7, 9, and 11-player mission sizes currently use placeholders in the engine and will raise an explicit error if a round tries to use them.
- 8-player mission sizes reuse the 7-player placeholder layout for now.
- 10-player mission sizes reuse the 9-player placeholder layout for now.

## Notes for Integrators

- Room and session state are in-memory only.
- No auth/account system is included.
- Reconnection support relies on the client rejoining the same room with the same playerId.
