export const SUPPORTED_PLAYER_COUNTS = [3, 5, 6, 7, 8, 9, 10, 11] as const;

export const RULESET_PRESETS = {
	PRESET_3J: {
		playerCount: 3,
		missionSizes: [2, 2, 2],
		missionCount: 3,
	},
	PRESET_5J: {
		playerCount: 5,
		missionSizes: [2, 3, 2, 3, 3],
		missionCount: 5,
	},
	PRESET_6J: {
		playerCount: 6,
		missionSizes: [2, 3, 2, 3, 3],
		missionCount: 5,
	},
	PRESET_7J: {
		playerCount: 7,
		missionSizes: [-1, -1, -1, -1, -1, -1, -1],
		missionCount: 7,
	},
	PRESET_8J: {
		playerCount: 8,
		missionSizes: [-1, -1, -1, -1, -1, -1, -1],
		missionCount: 7,
	},
	PRESET_9J: {
		playerCount: 9,
		missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
		missionCount: 9,
	},
	PRESET_10J: {
		playerCount: 10,
		missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
		missionCount: 9,
	},
	PRESET_11J: {
		playerCount: 11,
		missionSizes: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
		missionCount: 11,
	},
} as const;

export type RulesetPreset = keyof typeof RULESET_PRESETS;

type RawRulesetPayload = Record<string, unknown>;

export type ResolvedRuleset = {
	engineArgs: { ruleset_preset: RulesetPreset } | { ruleset: RawRulesetPayload };
	playerCount: number;
	missionSizes: number[];
	missionCount: number;
};

type ParsedRulesetPayload = {
	player_count: number;
	nazi_count: number;
	communist_count: number;
	mission_sizes: number[];
	mission_count: number;
	win_threshold: number;
	info_mode: "full" | "partial" | "blind";
	experimental: boolean;
};

export function resolveRulesetForPlayerCount(
	playerCount: number,
	rulesetPreset?: string,
	ruleset?: unknown,
): ResolvedRuleset {
	if (!Number.isInteger(playerCount) || playerCount < 3) {
		throw new Error("cannot start game without a supported player count");
	}

	if (ruleset !== undefined) {
		const parsedRuleset = parseRuleset(ruleset);
		if (parsedRuleset.player_count !== playerCount) {
			throw new Error("ruleset player_count must match the number of players in the room");
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
		throw new Error("cannot infer ruleset for this player count");
	}

	const preset = RULESET_PRESETS[inferredPreset];
	return {
		engineArgs: { ruleset_preset: inferredPreset },
		playerCount,
		missionSizes: [...preset.missionSizes],
		missionCount: preset.missionCount,
	};
}

export function getPresetNameForPlayerCount(playerCount: number): RulesetPreset | null {
	for (const [presetName, preset] of Object.entries(RULESET_PRESETS) as Array<[RulesetPreset, (typeof RULESET_PRESETS)[RulesetPreset]]>) {
		if (preset.playerCount === playerCount) {
			return presetName;
		}
	}

	return null;
}

function parsePreset(rawPreset: string): RulesetPreset {
	const normalized = rawPreset.toUpperCase();
	if (normalized in RULESET_PRESETS) {
		return normalized as RulesetPreset;
	}
	throw new Error("unknown ruleset preset");
}

function parseRuleset(rawRuleset: unknown): ParsedRulesetPayload {
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

	if (naziCount + communistCount !== playerCount) {
		throw new Error("invalid ruleset: nazi_count + communist_count must equal player_count");
	}

	if (missionSizes.length !== missionCount) {
		throw new Error("invalid ruleset: mission_sizes length must equal mission_count");
	}

	if (winThreshold > missionCount) {
		throw new Error("invalid ruleset: win_threshold must be <= mission_count");
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
	if (!Number.isInteger(value)) {
		throw new Error(`ruleset.${fieldName} must be an integer`);
	}
	return value as number;
}

function requireBool(payload: RawRulesetPayload, fieldName: string): boolean {
	const value = payload[fieldName];
	if (typeof value !== "boolean") {
		throw new Error(`ruleset.${fieldName} must be a boolean`);
	}
	return value;
}

function requireMissionSizes(value: unknown): number[] {
	if (!Array.isArray(value) || !value.every((entry) => Number.isInteger(entry))) {
		throw new Error("ruleset.mission_sizes must be a list of integers");
	}
	return [...value];
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