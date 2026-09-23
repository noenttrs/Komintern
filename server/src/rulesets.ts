// Miroir des presets de gameengine/constants.py. Le moteur reste l'autorité : ces données
// servent à valider tôt (création de room) et à afficher les tailles de mission.
export const RULESET_PRESETS = {
	PRESET_3J: { playerCount: 3, missionSizes: [2, 2, 2], missionCount: 3 },
	PRESET_4J: { playerCount: 4, missionSizes: [2, 2, 2], missionCount: 3 },
	PRESET_5J: { playerCount: 5, missionSizes: [2, 3, 2, 3, 3], missionCount: 5 },
	PRESET_6J: { playerCount: 6, missionSizes: [2, 3, 2, 3, 3], missionCount: 5 },
	// Tailles de mission encore à définir (placeholders -1) : non jouables.
	PRESET_7J: { playerCount: 7, missionSizes: [-1, -1, -1, -1, -1, -1, -1], missionCount: 7 },
	PRESET_8J: { playerCount: 8, missionSizes: [-1, -1, -1, -1, -1, -1, -1], missionCount: 7 },
	PRESET_9J: { playerCount: 9, missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1], missionCount: 9 },
	PRESET_10J: { playerCount: 10, missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1], missionCount: 9 },
	PRESET_11J: { playerCount: 11, missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1], missionCount: 11 },
} as const;

export type RulesetPreset = keyof typeof RULESET_PRESETS;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 11;

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

export function isPlayable(playerCount: number, missionSizes: readonly number[]): boolean {
	return missionSizes.every((size) => Number.isInteger(size) && size >= 1 && size <= playerCount);
}

export function parsePreset(rawPreset: unknown): RulesetPreset {
	if (typeof rawPreset !== "string") {
		throw new Error("ruleset_preset must be a string");
	}
	const normalized = rawPreset.toUpperCase();
	if (!(normalized in RULESET_PRESETS)) {
		throw new Error("unknown ruleset preset");
	}
	const preset = RULESET_PRESETS[normalized as RulesetPreset];
	if (!isPlayable(preset.playerCount, preset.missionSizes)) {
		throw new Error(`ruleset preset ${normalized} is not playable yet (mission sizes not configured)`);
	}
	return normalized as RulesetPreset;
}

export function resolveRulesetForPlayerCount(
	playerCount: number,
	rulesetPreset?: string,
	ruleset?: unknown,
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

	const inferredPreset = getPresetNameForPlayerCount(playerCount);
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
export function getPresetNameForPlayerCount(playerCount: number): RulesetPreset | null {
	for (const [presetName, preset] of Object.entries(RULESET_PRESETS) as Array<[RulesetPreset, (typeof RULESET_PRESETS)[RulesetPreset]]>) {
		if (preset.playerCount === playerCount && isPlayable(preset.playerCount, preset.missionSizes)) {
			return presetName;
		}
	}
	return null;
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
	if (!isPlayable(playerCount, missionSizes)) {
		throw new Error("invalid ruleset: each mission size must be between 1 and player_count");
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
