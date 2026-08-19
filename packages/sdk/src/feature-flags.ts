/**
 * RADAS Official Feature Flag SDK
 * Client-side and server-side feature flag evaluation engine.
 */

export type RadasFlagDefinition = {
	key: string;
	name?: string;
	description?: string;
	isEnabled: boolean;
	requiredTier?: string;
	limitValue?: number | null;
	currentUsage?: number | null;
	rolloutPercentage?: number;
	whitelist?: string[];
};

export type RadasEvaluationContext = {
	tier?: string;
	workspaceId?: string | null;
	userId?: string | null;
	role?: string | null;
	customFlags?: Record<string, RadasFlagDefinition>;
};

export type RadasFlagEvaluation = {
	key: string;
	isEnabled: boolean;
	isLocked: boolean;
	isAtLimit: boolean;
	currentTier: string;
	requiredTier: string;
	limitValue: number | null;
	currentUsage: number | null;
	reason: "enabled" | "locked" | "limit" | "rollout" | "disabled";
};

/**
 * Evaluates a feature flag key against context in the RADAS engine.
 */
export function evaluateRadasFlag(
	flagKey: string,
	context: RadasEvaluationContext,
	flagsMap: Record<string, RadasFlagDefinition> = {},
): RadasFlagEvaluation {
	const currentTier = context.tier ?? "free";
	const flag = context.customFlags?.[flagKey] ?? flagsMap[flagKey];

	const isEnabled = flag?.isEnabled ?? false;
	const limitValue = flag?.limitValue ?? null;
	const currentUsage = flag?.currentUsage ?? null;
	const requiredTier = flag?.requiredTier ?? "basic";
	const isAtLimit = limitValue !== null && currentUsage !== null && currentUsage >= limitValue;

	let reason: RadasFlagEvaluation["reason"] = "disabled";
	if (isEnabled && !isAtLimit) {
		reason = "enabled";
	} else if (!isEnabled) {
		reason = "locked";
	} else if (isAtLimit) {
		reason = "limit";
	}

	return {
		key: flagKey,
		isEnabled: isEnabled && !isAtLimit,
		isLocked: !isEnabled,
		isAtLimit,
		currentTier,
		requiredTier,
		limitValue,
		currentUsage,
		reason,
	};
}

/**
 * RADAS Feature Flag SDK Client instance
 */
export class RadasClient {
	private flags: Record<string, RadasFlagDefinition> = {};
	private context: RadasEvaluationContext = {};

	constructor(options: { flags?: Record<string, RadasFlagDefinition>; context?: RadasEvaluationContext } = {}) {
		if (options.flags) this.flags = options.flags;
		if (options.context) this.context = options.context;
	}

	public setContext(context: RadasEvaluationContext): void {
		this.context = { ...this.context, ...context };
	}

	public setFlags(flags: Record<string, RadasFlagDefinition>): void {
		this.flags = flags;
	}

	public evaluate(flagKey: string): RadasFlagEvaluation {
		return evaluateRadasFlag(flagKey, this.context, this.flags);
	}
}

export function createRadasClient(options: {
	flags?: Record<string, RadasFlagDefinition>;
	context?: RadasEvaluationContext;
} = {}): RadasClient {
	return new RadasClient(options);
}
