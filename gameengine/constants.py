from __future__ import annotations

from .types import InfoMode, Ruleset

# Mission sizes for these presets are intentionally placeholders until finalized.
MISSION_SIZES_7J_PLACEHOLDER = [-1, -1, -1, -1, -1, -1, -1]
MISSION_SIZES_9J_PLACEHOLDER = [-1, -1, -1, -1, -1, -1, -1, -1, -1]
MISSION_SIZES_11J_PLACEHOLDER = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]

PRESET_5J = Ruleset(
	player_count=5,
	nazi_count=2,
	communist_count=3,
	mission_sizes=[2, 3, 2, 3, 3],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_3J = Ruleset(
	player_count=3,
	nazi_count=1,
	communist_count=2,
	mission_sizes=[2, 2, 2],
	mission_count=3,
	win_threshold=2,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_4J = Ruleset(
	player_count=4,
	nazi_count=1,
	communist_count=3,
	mission_sizes=[2, 2, 2],
	mission_count=3,
	win_threshold=2,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_6J = Ruleset(
	player_count=6,
	nazi_count=2,
	communist_count=4,
	mission_sizes=[2, 3, 2, 3, 3],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_7J = Ruleset(
	player_count=7,
	nazi_count=3,
	communist_count=4,
	mission_sizes=MISSION_SIZES_7J_PLACEHOLDER,
	mission_count=7,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_8J = Ruleset(
	player_count=8,
	nazi_count=3,
	communist_count=5,
	mission_sizes=MISSION_SIZES_7J_PLACEHOLDER,
	mission_count=7,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_9J = Ruleset(
	player_count=9,
	nazi_count=4,
	communist_count=5,
	mission_sizes=MISSION_SIZES_9J_PLACEHOLDER,
	mission_count=9,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_10J = Ruleset(
	player_count=10,
	nazi_count=4,
	communist_count=6,
	mission_sizes=MISSION_SIZES_9J_PLACEHOLDER,
	mission_count=9,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_11J = Ruleset(
	player_count=11,
	nazi_count=5,
	communist_count=6,
	mission_sizes=MISSION_SIZES_11J_PLACEHOLDER,
	mission_count=11,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

# Legacy aliases kept for backward compatibility with the 5-player base behavior.
MISSION_SIZES = PRESET_5J.mission_sizes
WIN_THRESHOLD = PRESET_5J.win_threshold
PLAYER_COUNT = PRESET_5J.player_count
NAZI_COUNT = PRESET_5J.nazi_count
COMMUNIST_COUNT = PRESET_5J.communist_count
