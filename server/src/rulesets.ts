// Miroir des presets de gameengine/constants.py (3 à 14 joueurs, classiques et rapides). Le moteur reste l'autorité :
// ces données servent à valider tôt (création de room) et à afficher les tailles de mission.
export const RULESET_PRESETS = {
	PRESET_3J: { playerCount: 3, naziCount: 1, missionSizes: [2, 2, 2], missionCount: 3, winThreshold: 2 },
	PRESET_4J: { playerCount: 4, naziCount: 1, missionSizes: [2, 3, 2, 3, 3], missionCount: 5, winThreshold: 3 },
	PRESET_5J: { playerCount: 5, naziCount: 2, missionSizes: [2, 3, 2, 3, 3], missionCount: 5, winThreshold: 3 },
	PRESET_6J: { playerCount: 6, naziCount: 2, missionSizes: [2, 3, 3, 4, 3, 4, 4], missionCount: 7, winThreshold: 4 },
	PRESET_7J: { playerCount: 7, naziCount: 3, missionSizes: [2, 3, 3, 4, 3, 4, 4], missionCount: 7, winThreshold: 4 },
	PRESET_8J: { playerCount: 8, naziCount: 3, missionSizes: [3, 3, 4, 4, 3, 4, 5, 4, 5], missionCount: 9, winThreshold: 5 },
	PRESET_9J: { playerCount: 9, naziCount: 3, missionSizes: [3, 4, 4, 5, 4, 5, 5, 6, 6], missionCount: 9, winThreshold: 5 },
	PRESET_10J: { playerCount: 10, naziCount: 4, missionSizes: [3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6], missionCount: 11, winThreshold: 6 },
	PRESET_11J: { playerCount: 11, naziCount: 4, missionSizes: [3, 4, 4, 5, 4, 5, 6, 5, 6, 6, 7], missionCount: 11, winThreshold: 6 },
	PRESET_12J: { playerCount: 12, naziCount: 4, missionSizes: [3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 7, 7], missionCount: 13, winThreshold: 7 },
	PRESET_13J: { playerCount: 13, naziCount: 5, missionSizes: [3, 4, 4, 5, 4, 5, 6, 5, 6, 6, 7, 6, 7], missionCount: 13, winThreshold: 7 },
	PRESET_14J: { playerCount: 14, naziCount: 5, missionSizes: [3, 4, 4, 5, 4, 5, 5, 6, 5, 6, 6, 7, 6, 7, 8], missionCount: 15, winThreshold: 8 },
	// Mode rapide : 5 missions, premier camp à 3 (au choix à la création de la room).
	PRESET_6J_RAPIDE: { playerCount: 6, naziCount: 2, missionSizes: [2, 3, 3, 4, 4], missionCount: 5, winThreshold: 3 },
	PRESET_7J_RAPIDE: { playerCount: 7, naziCount: 3, missionSizes: [2, 3, 3, 4, 4], missionCount: 5, winThreshold: 3 },
	PRESET_8J_RAPIDE: { playerCount: 8, naziCount: 3, missionSizes: [3, 4, 4, 5, 5], missionCount: 5, winThreshold: 3 },
	PRESET_9J_RAPIDE: { playerCount: 9, naziCount: 3, missionSizes: [3, 4, 4, 5, 5], missionCount: 5, winThreshold: 3 },
	PRESET_10J_RAPIDE: { playerCount: 10, naziCount: 4, missionSizes: [3, 4, 4, 5, 5], missionCount: 5, winThreshold: 3 },
	PRESET_11J_RAPIDE: { playerCount: 11, naziCount: 4, missionSizes: [4, 4, 5, 5, 6], missionCount: 5, winThreshold: 3 },
	PRESET_12J_RAPIDE: { playerCount: 12, naziCount: 4, missionSizes: [4, 5, 5, 6, 6], missionCount: 5, winThreshold: 3 },
	PRESET_13J_RAPIDE: { playerCount: 13, naziCount: 5, missionSizes: [4, 5, 5, 6, 6], missionCount: 5, winThreshold: 3 },
	PRESET_14J_RAPIDE: { playerCount: 14, naziCount: 5, missionSizes: [5, 5, 6, 6, 7], missionCount: 5, winThreshold: 3 },
} as const;

/** Durée de partie choisie à la création : classique (joueurs ÷ 2 + 1) ou rapide (premier à 3). */
export type GamePace = "classic" | "quick";

export function parsePace(raw: unknown): GamePace {
  return raw === "quick" ? "quick" : "classic";
}

export type RulesetPreset = keyof typeof RULESET_PRESETS;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 14;

type RawRulesetPayload = Record<string, unknown>;

export type ParsedRulesetPayload = {
	player_count: number;
	nazi_count: number;
	communist_count: number;
	mission_sizes: number[];
	mission_count: number;
	win_threshold: number;
	info_mode: "full" | "partial" | "blind";
	experimental: boolean;
};

export type ResolvedRuleset = {
	engineArgs: { ruleset_preset: RulesetPreset } | { ruleset: ParsedRulesetPayload };
	playerCount: number;
	missionSizes: number[];
	missionCount: number;
};

/** Chaque équipe tient entre 1 joueur et le nombre de communistes (une équipe sans nazi existe). */
export function isPlayable(communistCount: number, missionSizes: readonly number[]): boolean {
	return missionSizes.every((size) => Number.isInteger(size) && size >= 1 && size <= communistCount);
}

export function parsePreset(rawPreset: unknown): RulesetPreset {
	if (typeof rawPreset !== "string") {
		throw new Error("ruleset_preset must be a string");
	}
	const normalized = rawPreset.toUpperCase();
	if (!(normalized in RULESET_PRESETS)) {
		throw new Error("unknown ruleset preset");
	}
	return normalized as RulesetPreset;
}

export function resolveRulesetForPlayerCount(
	playerCount: number,
	rulesetPreset?: string,
	ruleset?: unknown,
	pace: GamePace = "classic",
): ResolvedRuleset {
	if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS) {
		throw new Error(`at least ${MIN_PLAYERS} players are required to start`);
	}

	if (ruleset !== undefined) {
		const parsedRuleset = parseRuleset(ruleset);
		if (parsedRuleset.player_count !== playerCount) {
			throw new Error(`this ruleset requires ${parsedRuleset.player_count} players`);
		}
		return {
			engineArgs: { ruleset: parsedRuleset },
			playerCount,
			missionSizes: [...parsedRuleset.mission_sizes],
			missionCount: parsedRuleset.mission_count,
		};
	}

	if (rulesetPreset !== undefined) {
		const resolvedPreset = parsePreset(rulesetPreset);
		const preset = RULESET_PRESETS[resolvedPreset];
		if (preset.playerCount !== playerCount) {
			throw new Error(`ruleset preset ${resolvedPreset} requires ${preset.playerCount} players`);
		}
		return {
			engineArgs: { ruleset_preset: resolvedPreset },
			playerCount,
			missionSizes: [...preset.missionSizes],
			missionCount: preset.missionCount,
		};
	}

	const inferredPreset = getPresetNameForPlayerCount(playerCount, pace);
	if (inferredPreset === null) {
		throw new Error(`no playable ruleset for ${playerCount} players`);
	}
	const preset = RULESET_PRESETS[inferredPreset];
	return {
		engineArgs: { ruleset_preset: inferredPreset },
		playerCount,
		missionSizes: [...preset.missionSizes],
		missionCount: preset.missionCount,
	};
}

/** Preset jouable correspondant à ce nombre de joueurs, ou null. */
export function getPresetNameForPlayerCount(playerCount: number, pace: GamePace = "classic"): RulesetPreset | null {
	const quick = `PRESET_${playerCount}J_RAPIDE`;
	if (pace === "quick" && quick in RULESET_PRESETS) {
		return quick as RulesetPreset;
	}
	const classic = `PRESET_${playerCount}J`;
	return classic in RULESET_PRESETS ? (classic as RulesetPreset) : null;
}

/** Même contrat que Ruleset.__post_init__ côté Python (gameengine/types.py). */
export function parseRuleset(rawRuleset: unknown): ParsedRulesetPayload {
	if (typeof rawRuleset !== "object" || rawRuleset === null || Array.isArray(rawRuleset)) {
		throw new Error("ruleset must be an object");
	}

	const payload = rawRuleset as RawRulesetPayload;
	const requiredFields = [
		"player_count",
		"nazi_count",
		"communist_count",
		"mission_sizes",
		"mission_count",
		"win_threshold",
		"info_mode",
		"experimental",
	];

	const missingFields = requiredFields.filter((field) => !(field in payload));
	if (missingFields.length > 0) {
		throw new Error(`ruleset missing required fields: ${missingFields.join(", ")}`);
	}

	const playerCount = requireInt(payload, "player_count");
	const naziCount = requireInt(payload, "nazi_count");
	const communistCount = requireInt(payload, "communist_count");
	const missionCount = requireInt(payload, "mission_count");
	const winThreshold = requireInt(payload, "win_threshold");
	const missionSizes = requireMissionSizes(payload.mission_sizes);
	const infoMode = requireInfoMode(payload.info_mode);
	const experimental = requireBool(payload, "experimental");

	if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
		throw new Error(`invalid ruleset: player_count must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
	}
	if (naziCount < 1 || communistCount < 1) {
		throw new Error("invalid ruleset: each faction needs at least one player");
	}
	if (naziCount + communistCount !== playerCount) {
		throw new Error("invalid ruleset: nazi_count + communist_count must equal player_count");
	}
	if (missionCount < 1) {
		throw new Error("invalid ruleset: mission_count must be >= 1");
	}
	if (missionSizes.length !== missionCount) {
		throw new Error("invalid ruleset: mission_sizes length must equal mission_count");
	}
	if (!isPlayable(communistCount, missionSizes)) {
		throw new Error("invalid ruleset: each mission size must be between 1 and communist_count");
	}
	if (winThreshold < 1) {
		throw new Error("invalid ruleset: win_threshold must be >= 1");
	}
	if (winThreshold > missionCount) {
		throw new Error("invalid ruleset: win_threshold must be <= mission_count");
	}
	if (2 * winThreshold - 1 > missionCount) {
		throw new Error("invalid ruleset: mission_count must be >= 2 * win_threshold - 1 (a draw would be possible)");
	}
	if (infoMode === "blind" && !experimental) {
		throw new Error("invalid ruleset: blind mode requires experimental=True");
	}

	return {
		player_count: playerCount,
		nazi_count: naziCount,
		communist_count: communistCount,
		mission_sizes: missionSizes,
		mission_count: missionCount,
		win_threshold: winThreshold,
		info_mode: infoMode,
		experimental,
	};
}

function requireInt(payload: RawRulesetPayload, fieldName: string): number {
	const value = payload[fieldName];
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new Error(`ruleset.${fieldName} must be an integer`);
	}
	return value;
}

function requireBool(payload: RawRulesetPayload, fieldName: string): boolean {
	const value = payload[fieldName];
	if (typeof value !== "boolean") {
		throw new Error(`ruleset.${fieldName} must be a boolean`);
	}
	return value;
}

function requireMissionSizes(value: unknown): number[] {
	if (!Array.isArray(value) || value.length > 20 || !value.every((entry) => typeof entry === "number" && Number.isInteger(entry))) {
		throw new Error("ruleset.mission_sizes must be a list of integers");
	}
	return [...(value as number[])];
}

function requireInfoMode(value: unknown): "full" | "partial" | "blind" {
	if (typeof value !== "string") {
		throw new Error("ruleset.info_mode must be a string");
	}
	const normalized = value.toLowerCase();
	if (normalized === "full" || normalized === "partial" || normalized === "blind") {
		return normalized;
	}
	throw new Error("ruleset.info_mode must be one of: full, partial, blind");
}
