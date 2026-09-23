from __future__ import annotations

from .types import InfoMode, Ruleset

# Formats de 3 à 14 joueurs (voir docs/REGLES.md) :
# - un camp gagne à (joueurs // 2) + 1 missions, donc 2 × seuil - 1 missions au plus ;
# - on commence par de petites équipes puis on alterne pour faire monter la tension ;
# - une équipe ne dépasse jamais le nombre de communistes (une équipe sans nazi reste possible).

# À 3 : un nazi, deux communistes et des équipes de 2. Après un sabotage, le chef sait qui
# est le nazi, mais le troisième joueur doit choisir qui croire : partie courte, tout au bluff.
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
	mission_sizes=[2, 3, 2, 3, 3],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

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

PRESET_6J = Ruleset(
	player_count=6,
	nazi_count=2,
	communist_count=4,
	mission_sizes=[2, 3, 3, 4, 3, 4, 4],
	mission_count=7,
	win_threshold=4,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_7J = Ruleset(
	player_count=7,
	nazi_count=3,
	communist_count=4,
	mission_sizes=[2, 3, 3, 4, 3, 4, 4],
	mission_count=7,
	win_threshold=4,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_8J = Ruleset(
	player_count=8,
	nazi_count=3,
	communist_count=5,
	mission_sizes=[3, 3, 4, 4, 3, 4, 5, 4, 5],
	mission_count=9,
	win_threshold=5,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_9J = Ruleset(
	player_count=9,
	nazi_count=3,
	communist_count=6,
	mission_sizes=[3, 4, 4, 5, 4, 5, 5, 6, 6],
	mission_count=9,
	win_threshold=5,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_10J = Ruleset(
	player_count=10,
	nazi_count=4,
	communist_count=6,
	mission_sizes=[3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6],
	mission_count=11,
	win_threshold=6,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_11J = Ruleset(
	player_count=11,
	nazi_count=4,
	communist_count=7,
	mission_sizes=[3, 4, 4, 5, 4, 5, 6, 5, 6, 6, 7],
	mission_count=11,
	win_threshold=6,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_12J = Ruleset(
	player_count=12,
	nazi_count=4,
	communist_count=8,
	mission_sizes=[3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 7, 7],
	mission_count=13,
	win_threshold=7,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_13J = Ruleset(
	player_count=13,
	nazi_count=5,
	communist_count=8,
	mission_sizes=[3, 4, 4, 5, 4, 5, 6, 5, 6, 6, 7, 6, 7],
	mission_count=13,
	win_threshold=7,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_14J = Ruleset(
	player_count=14,
	nazi_count=5,
	communist_count=9,
	mission_sizes=[3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 7, 6, 7, 8],
	mission_count=15,
	win_threshold=8,
	info_mode=InfoMode.FULL,
	experimental=False,
)

# Mode rapide (au choix à la création de la room) : toujours 5 missions, premier camp à 3,
# avec des équipes plus grandes quand on est nombreux. De 3 à 5 joueurs, identique au classique.
PRESET_6J_RAPIDE = Ruleset(
	player_count=6,
	nazi_count=2,
	communist_count=4,
	mission_sizes=[2, 3, 3, 4, 4],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_7J_RAPIDE = Ruleset(
	player_count=7,
	nazi_count=3,
	communist_count=4,
	mission_sizes=[2, 3, 3, 4, 4],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_8J_RAPIDE = Ruleset(
	player_count=8,
	nazi_count=3,
	communist_count=5,
	mission_sizes=[3, 4, 4, 5, 5],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_9J_RAPIDE = Ruleset(
	player_count=9,
	nazi_count=3,
	communist_count=6,
	mission_sizes=[3, 4, 4, 5, 5],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_10J_RAPIDE = Ruleset(
	player_count=10,
	nazi_count=4,
	communist_count=6,
	mission_sizes=[3, 4, 4, 5, 5],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_11J_RAPIDE = Ruleset(
	player_count=11,
	nazi_count=4,
	communist_count=7,
	mission_sizes=[4, 4, 5, 5, 6],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_12J_RAPIDE = Ruleset(
	player_count=12,
	nazi_count=4,
	communist_count=8,
	mission_sizes=[4, 5, 5, 6, 6],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_13J_RAPIDE = Ruleset(
	player_count=13,
	nazi_count=5,
	communist_count=8,
	mission_sizes=[4, 5, 5, 6, 6],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESET_14J_RAPIDE = Ruleset(
	player_count=14,
	nazi_count=5,
	communist_count=9,
	mission_sizes=[5, 5, 6, 6, 7],
	mission_count=5,
	win_threshold=3,
	info_mode=InfoMode.FULL,
	experimental=False,
)

PRESETS: dict[int, Ruleset] = {preset.player_count: preset for preset in (
	PRESET_3J, PRESET_4J, PRESET_5J, PRESET_6J, PRESET_7J, PRESET_8J, PRESET_9J, PRESET_10J, PRESET_11J,
	PRESET_12J, PRESET_13J, PRESET_14J,
)}

QUICK_PRESETS: dict[int, Ruleset] = {preset.player_count: preset for preset in (
	PRESET_6J_RAPIDE, PRESET_7J_RAPIDE, PRESET_8J_RAPIDE, PRESET_9J_RAPIDE, PRESET_10J_RAPIDE,
	PRESET_11J_RAPIDE, PRESET_12J_RAPIDE, PRESET_13J_RAPIDE, PRESET_14J_RAPIDE,
)}

# Alias historiques du format de base à 5 joueurs.
MISSION_SIZES = PRESET_5J.mission_sizes
WIN_THRESHOLD = PRESET_5J.win_threshold
PLAYER_COUNT = PRESET_5J.player_count
NAZI_COUNT = PRESET_5J.nazi_count
COMMUNIST_COUNT = PRESET_5J.communist_count
