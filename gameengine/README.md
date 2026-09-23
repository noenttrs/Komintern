# Game Engine Update Notes

This document explains what changed in the Python game engine, how it worked before, and how it works now.

## Summary

The engine was originally built for a fixed 5-player setup.
It now supports configurable game setups through an injected `Ruleset`, while keeping 5-player behavior as the default when no ruleset is provided.

## Before This Update

The engine logic was hardcoded for one configuration:

- Exactly 5 players
- Exactly 2 Nazis and 3 Communists
- Exactly 5 missions
- Mission sizes fixed to `[2, 3, 2, 3, 3]`
- Win threshold fixed to `3`
- Information sharing behavior fixed:
  - Nazi players saw all roles
  - Communist players saw only themselves

This behavior was implemented through constants and implicit assumptions in role assignment, round validation, and win checking.

## What Is New Now

### 1. Ruleset-Driven Configuration

A `Ruleset` object now controls all variable game parameters:

- `player_count`
- `nazi_count`
- `communist_count`
- `mission_sizes`
- `mission_count`
- `win_threshold`
- `info_mode` (`full`, `partial`, `blind`)
- `experimental` (boolean)

The engine can be started with:

- no explicit ruleset -> default `PRESET_5J`
- a preset name (for known configurations)
- a fully custom ruleset object

### 2. Preset Rulesets

The following presets are defined:

- `PRESET_3J`
- `PRESET_5J`
- `PRESET_6J`
- `PRESET_7J`
- `PRESET_8J`
- `PRESET_9J`
- `PRESET_10J`
- `PRESET_11J`

Notes:

- 3-player preset uses 1 Nazi, 2 Communists, 3 missions, mission sizes `[2, 2, 2]`, win threshold `2`.
- 6-player mission sizes are identical to 5-player.
- 8-player mission sizes are identical to 7-player placeholder.
- 10-player mission sizes are identical to 9-player placeholder.
- 7/9/11 mission sizes are intentionally placeholders (`-1`) until official values are provided.

If a mission size placeholder is used during a game, the round manager raises an explicit error.

### 3. Custom Ruleset Validation

Custom rulesets are validated on creation.

Validation rules:

- `nazi_count + communist_count == player_count`
- `len(mission_sizes) == mission_count`
- `win_threshold <= mission_count`
- `info_mode == blind` requires `experimental == true`

Invalid rulesets raise explicit `ValueError` exceptions.

### 4. Information Modes

The startup player view now depends on `info_mode`:

- `full`:
  - Nazi players see all roles
  - Communist players see only themselves
- `partial`:
  - Each Nazi sees self + one other Nazi
  - Communist players see only themselves
- `blind`:
  - Every player sees only self
  - Allowed only when `experimental` is true

### 5. Mission Result Payload

Mission execution still hides nominal (per-player) mission votes.
The bridge now returns the exact number of Nazi votes in a mission result payload:

- `nazi_vote_count` (integer)

This matches the requirement to expose exact Nazi vote count while preserving vote anonymity.

### 6. Default Behavior Preserved

If no ruleset is passed, engine behavior remains the original 5-player mode.
This keeps backward compatibility for existing integrations.

## Engine Architecture (Still Unchanged in Core Style)

The game engine remains:

- stateful in memory
- pure game logic (no network I/O in Python game logic)
- callable by the Node.js layer through the local bridge

## How To Use

### Python: default mode

```python
from gameengine.game_manager import GameManager

manager = GameManager(player_ids=["p1", "p2", "p3", "p4", "p5"], chef_cursor=0)
state = manager.start_game()
```

### Python: custom ruleset

```python
from gameengine.game_manager import GameManager
from gameengine.types import Ruleset, InfoMode

ruleset = Ruleset(
    player_count=6,
    nazi_count=2,
    communist_count=4,
    mission_sizes=[2, 3, 2, 3, 3],
    mission_count=5,
    win_threshold=3,
    info_mode=InfoMode.PARTIAL,
    experimental=False,
)

manager = GameManager(
    player_ids=["p1", "p2", "p3", "p4", "p5", "p6"],
    chef_cursor=0,
    ruleset=ruleset,
)
state = manager.start_game()
```

### Bridge start_game with preset

Pass `ruleset_preset`, for example:

- `PRESET_5J`
- `PRESET_6J`
- etc.

### Bridge start_game with custom ruleset

Pass `ruleset` as an object containing all required fields.

## Testing Coverage Added

New unit tests cover:

- all preset consistency checks
- explicit placeholder behavior
- custom ruleset validation edge cases
- information-mode visibility behavior (`full`, `partial`, `blind`)
- bridge mission payload contains `nazi_vote_count`

## Known Pending Input

Mission sizes for 7, 9, and 11 players are not finalized yet.
When those values are provided, replace the placeholder arrays in constants and keep the same validation/tests structure.
