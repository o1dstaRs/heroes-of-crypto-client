/**
 * Ranked exit rules on the public site: how a match ended early (the server's exit resolver, phase 2 of the ranked
 * match integrity plan) and the published numbers of the "Leaving a ranked match" rules. Pure parsing and labels,
 * shared by the match page, the profile history and the rules page.
 */

export const RANKED_MATCH_REASONS = [
    "normal",
    "concede",
    "disconnect",
    "double_disconnect",
    "cancel",
    "abandon",
    "unscored",
    "void",
] as const;

/**
 * How a ranked game ended. The first five are the rules before phase 2 (concede, disconnect and cancel settled with
 * reduced rating); "abandon", "unscored" and "void" exist once the exit rules apply.
 */
export type RankedMatchReason = (typeof RANKED_MATCH_REASONS)[number];

/** "none": an unscored or voided game, with no winner, no loser and no rating change. */
export type RankedMatchResult = "win" | "loss" | "draw" | "none";

export const normalizeRankedMatchReason = (value: unknown): RankedMatchReason =>
    typeof value === "string" && (RANKED_MATCH_REASONS as readonly string[]).includes(value)
        ? (value as RankedMatchReason)
        : "normal";

export const normalizeRankedMatchResult = (value: unknown): RankedMatchResult =>
    value === "win" || value === "loss" || value === "none" ? value : "draw";

const EXIT_KINDS = ["concede", "abandon", "void"] as const;
const EXIT_CAUSES = ["button", "absence", "afk", "draft_afk", "double", "incident", "server"] as const;
const EXIT_UNSCORED_REASONS = ["", "leaver_calibrating", "double_abandon", "incident", "server_fault"] as const;
const EXIT_PHASES = ["draft", "placement", "fight"] as const;

export type RankedExitKind = (typeof EXIT_KINDS)[number];
export type RankedExitCause = (typeof EXIT_CAUSES)[number];
export type RankedExitUnscoredReason = (typeof EXIT_UNSCORED_REASONS)[number];
export type RankedExitPhase = (typeof EXIT_PHASES)[number];

export interface RankedMatchExit {
    kind: RankedExitKind;
    cause: RankedExitCause;
    leaverPlayerId: string;
    scored: boolean;
    unscoredReason: RankedExitUnscoredReason;
    /** Board casualties when the exit was resolved, in basis points of the board's starting XP (5000 = 50%). */
    boardBp: number;
    phase: RankedExitPhase;
    lap: number;
    /** False while the rules are announced but not applied: the match was scored by the previous rules. */
    enforced: boolean;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

const nonNegativeInteger = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

/** Tolerant: a missing or unrecognisable exit is null, and unknown optional values fall back to neutral ones. */
export function normalizeRankedMatchExit(value: unknown): RankedMatchExit | null {
    const row = asRecord(value);
    if (!row) return null;
    const kind = oneOf(row.kind, EXIT_KINDS);
    if (!kind) return null;
    const leaverPlayerId = typeof row.leaverPlayerId === "string" ? row.leaverPlayerId.trim() : "";
    return {
        kind,
        cause: oneOf(row.cause, EXIT_CAUSES) ?? "button",
        leaverPlayerId: leaverPlayerId.length <= 64 ? leaverPlayerId : "",
        scored: row.scored === true,
        unscoredReason: oneOf(row.unscoredReason, EXIT_UNSCORED_REASONS) ?? "",
        boardBp: Math.min(10_000, nonNegativeInteger(row.boardBp)),
        phase: oneOf(row.phase, EXIT_PHASES) ?? "fight",
        lap: nonNegativeInteger(row.lap),
        enforced: row.enforced === true,
    };
}

/** Whole percent, rounded down so "49%" never reads as reaching the 50% line. */
export const casualtyPercent = (boardBp: number): number => Math.max(0, Math.min(100, Math.floor(boardBp / 100)));

export type RankedExitLabelKey =
    | "exitConcededAt"
    | "exitAbandonedAt"
    | "exitAbandonedBeforeFight"
    | "exitUnscoredCalibration"
    | "exitUnscoredDouble"
    | "exitVoided"
    | "exitCauseAbsence"
    | "exitCauseAfk"
    | "exitPreview";

type LabelLookup = (key: RankedExitLabelKey) => string;

const fill = (template: string, values: Record<string, string | number>): string =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));

const describeExit = (exit: RankedMatchExit, label: LabelLookup): string => {
    if (exit.kind === "void") return label("exitVoided");
    if (exit.cause === "double") return label("exitUnscoredDouble");
    if (!exit.scored && exit.unscoredReason === "leaver_calibrating") return label("exitUnscoredCalibration");
    const pct = casualtyPercent(exit.boardBp);
    const base =
        exit.kind === "concede"
            ? fill(label("exitConcededAt"), { pct })
            : exit.phase === "fight"
              ? fill(label("exitAbandonedAt"), { pct })
              : label("exitAbandonedBeforeFight");
    const cause =
        exit.cause === "absence"
            ? label("exitCauseAbsence")
            : exit.cause === "afk" || exit.cause === "draft_afk"
              ? label("exitCauseAfk")
              : "";
    return cause ? `${base} (${cause})` : base;
};

/**
 * The line a match shows for an early ending that was scored by the exit rules, e.g. "Abandoned at 31% casualties".
 * Empty when there is no exit, or when the match was still scored by the previous rules (see rankedExitPreviewLabel).
 */
export function rankedExitLabel(exit: RankedMatchExit | null, label: LabelLookup): string {
    if (!exit || (!exit.enforced && exit.kind !== "void")) return "";
    return describeExit(exit, label);
}

/** For an exit settled before the rules applied: how the same exit counts under them. Empty otherwise. */
export function rankedExitPreviewLabel(exit: RankedMatchExit | null, label: LabelLookup): string {
    if (!exit || exit.enforced || exit.kind === "void") return "";
    return fill(label("exitPreview"), { label: describeExit(exit, label) });
}

export const leavingRulesPath = (language: "en" | "ru"): string => `${language === "ru" ? "/ru" : ""}/rules/leaving/`;

// ~~~ The published rules' numbers (GET ranked-exit-rules) ~~~

export interface RankedExitRules {
    version: string;
    enforced: boolean;
    /** When the rules start scoring matches (epoch ms); 0 = announced without a date. */
    enforceAtMs: number;
    concedeThresholdBp: number;
    absenceBudgetMs: number;
    disconnectGraceMs: number;
    afkMissedTurns: number;
    draftAutoPicks: number;
    abandonCooldownMs: number;
    /** Timed ranked locks (phase 3): whether they apply now, and from when (epoch ms; 0 = not dated yet). */
    lockRulesEnforced: boolean;
    lockRulesEnforceAtMs: number;
}

/** What the rules page prints before (or without) a response. Mirrors the server's phase-2 configuration. */
export const DEFAULT_RANKED_EXIT_RULES: RankedExitRules = {
    version: "1.0",
    enforced: false,
    enforceAtMs: 0,
    concedeThresholdBp: 5000,
    absenceBudgetMs: 300_000,
    disconnectGraceMs: 10_000,
    afkMissedTurns: 4,
    draftAutoPicks: 3,
    abandonCooldownMs: 300_000,
    lockRulesEnforced: false,
    lockRulesEnforceAtMs: 0,
};

const positiveOr = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

export function normalizeRankedExitRules(value: unknown): RankedExitRules | null {
    const row = asRecord(value);
    if (!row) return null;
    const defaults = DEFAULT_RANKED_EXIT_RULES;
    return {
        version: typeof row.version === "string" && row.version.trim() ? row.version.trim() : defaults.version,
        enforced: row.enforced === true,
        enforceAtMs: nonNegativeInteger(row.enforceAtMs),
        concedeThresholdBp: positiveOr(row.concedeThresholdBp, defaults.concedeThresholdBp),
        absenceBudgetMs: positiveOr(row.absenceBudgetMs, defaults.absenceBudgetMs),
        disconnectGraceMs: positiveOr(row.disconnectGraceMs, defaults.disconnectGraceMs),
        afkMissedTurns: positiveOr(row.afkMissedTurns, defaults.afkMissedTurns),
        draftAutoPicks: positiveOr(row.draftAutoPicks, defaults.draftAutoPicks),
        abandonCooldownMs: positiveOr(row.abandonCooldownMs, defaults.abandonCooldownMs),
        lockRulesEnforced: row.lockRulesEnforced === true,
        lockRulesEnforceAtMs: nonNegativeInteger(row.lockRulesEnforceAtMs),
    };
}

export type RankedExitRulesState = "enforced" | "enforced_undated" | "scheduled" | "pending";

// An enforcement time before this is a switch ("on"), not a date a player should be shown.
const EARLIEST_REAL_DATE_MS = Date.UTC(2020, 0, 1);

/** Which status line the rules page shows: in effect (since a date), scheduled for a date, or starting soon. */
export function rankedExitRulesState(rules: RankedExitRules, now: number): RankedExitRulesState {
    if (rules.enforced) {
        return rules.enforceAtMs >= EARLIEST_REAL_DATE_MS ? "enforced" : "enforced_undated";
    }
    return rules.enforceAtMs > now ? "scheduled" : "pending";
}

export type RankedLockRulesState = "enforced" | "scheduled" | "pending";

/** The ranked-locks status line: in effect, dated for later, or announced without a date. */
export function rankedLockRulesState(rules: RankedExitRules, now: number): RankedLockRulesState {
    if (rules.lockRulesEnforced) return "enforced";
    return rules.lockRulesEnforceAtMs > now ? "scheduled" : "pending";
}

export type RankedRuleToken = "threshold" | "absence" | "grace" | "cooldown";

const RULE_TOKENS: readonly RankedRuleToken[] = ["threshold", "absence", "grace", "cooldown"];

/** Durations as a clock ("5:00") or seconds ("10 s"), so no sentence depends on a noun's plural form. */
export const formatRuleDuration = (ms: number, language: "en" | "ru"): string => {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds} ${language === "ru" ? "с" : "s"}`;
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export function ruleTokenValue(token: RankedRuleToken, rules: RankedExitRules, language: "en" | "ru"): string {
    if (token === "threshold") return `${Math.round(rules.concedeThresholdBp / 100)}%`;
    if (token === "absence") return formatRuleDuration(rules.absenceBudgetMs, language);
    if (token === "grace") return formatRuleDuration(rules.disconnectGraceMs, language);
    return formatRuleDuration(rules.abandonCooldownMs, language);
}

export type RuleTextSegment = { text: string } | { token: RankedRuleToken };

/** Split rules copy on its {threshold}/{absence}/{grace}/{cooldown} tokens, so the numbers can be updated live. */
export function splitRuleTokens(text: string): RuleTextSegment[] {
    const segments: RuleTextSegment[] = [];
    let rest = text;
    const pattern = /\{(threshold|absence|grace|cooldown)\}/;
    for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
        if (match.index > 0) segments.push({ text: rest.slice(0, match.index) });
        segments.push({ token: match[1] as RankedRuleToken });
        rest = rest.slice(match.index + match[0].length);
    }
    if (rest) segments.push({ text: rest });
    return segments;
}

export const isRankedRuleToken = (value: string): value is RankedRuleToken =>
    (RULE_TOKENS as readonly string[]).includes(value);

export interface RankedExitRulesUrlOptions {
    baseUrl?: string;
    production?: boolean;
}

const runtimeIsProduction = (): boolean => {
    const hostname = globalThis.location?.hostname ?? "";
    return (
        hostname === "heroesofcrypto.io" ||
        hostname.endsWith(".heroesofcrypto.io") ||
        (import.meta.env.VITE_IS_PROD !== "false" && import.meta.env.PROD === true) ||
        import.meta.env.VITE_IS_PROD === "true"
    );
};

const sameHostOrigin = (port: string | number | undefined): string | undefined => {
    if (!port || typeof globalThis.location === "undefined") return undefined;
    return `${globalThis.location.protocol}//${globalThis.location.hostname}:${port}`;
};

const runtimeBaseUrl = (production: boolean): string =>
    String(
        sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined) ||
            import.meta.env.VITE_HOST_MATCHMAKING_API ||
            import.meta.env.VITE_MATCHMAKING_API ||
            (production ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
    ).replace(/\/+$/, "");

export function buildRankedExitRulesUrl(options: RankedExitRulesUrlOptions = {}): string {
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    return `${baseUrl}${production ? "/v1/ranked-exit-rules" : "/v1/mm/ranked-exit-rules"}`;
}

export async function fetchRankedExitRules(): Promise<RankedExitRules> {
    const response = await fetch(buildRankedExitRulesUrl(), { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Ranked exit rules request failed with status ${response.status}`);
    const rules = normalizeRankedExitRules(await response.json());
    if (!rules) throw new Error("Ranked exit rules response was malformed");
    return rules;
}
