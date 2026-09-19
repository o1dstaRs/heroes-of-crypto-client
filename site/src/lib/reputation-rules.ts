/**
 * Reputation on the public site: the 0–100 reliability score's scale and bands (GET reputation-rules) and whether its
 * Restricted limits apply yet. Pure parsing and the status line, used by the rules page.
 *
 * What the score is made of — what each event is worth, the daily cap, the account bonuses, the offence ceilings — is
 * not published and is not part of this contract (owner, 19 Sep: only the final slider is public). A player reads
 * their own itemization in the portal, from the signed-in route.
 */

import { runtimeBaseUrl, runtimeIsProduction, type RankedExitRulesUrlOptions } from "./ranked-exit";

export const REPUTATION_RESTRICTED_BLOCKS = ["wagers", "predictions", "chat"] as const;

/** What a Restricted score closes: wagers, prediction bets, and writing in arena chat. */
export type ReputationRestrictedBlock = (typeof REPUTATION_RESTRICTED_BLOCKS)[number];

export interface ReputationBands {
    probation: number;
    good: number;
    honorable: number;
}

/** The published side of Reputation: the slider — the scale and its bands — and what the lowest band closes. */
export interface ReputationRules {
    /** Whether the Restricted limits close anything now. */
    enforced: boolean;
    /** When the Restricted limits start (epoch ms); 0 = not dated yet. */
    enforceAtMs: number;
    start: number;
    bands: ReputationBands;
    /** "New" shows until this many ranked matches are scored. */
    newUntilScored: number;
    restrictedBlocks: ReputationRestrictedBlock[];
}

/** What the rules page prints before (or without) a response. Mirrors the server's published scale. */
export const DEFAULT_REPUTATION_RULES: ReputationRules = {
    enforced: false,
    enforceAtMs: 0,
    start: 50,
    bands: { probation: 40, good: 60, honorable: 80 },
    newUntilScored: 10,
    restrictedBlocks: ["wagers", "predictions", "chat"],
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const nonNegativeOr = (value: unknown, fallback: number): number =>
    isFiniteNumber(value) && value >= 0 ? Math.trunc(value) : fallback;

const positiveOr = (value: unknown, fallback: number): number =>
    isFiniteNumber(value) && value >= 1 ? Math.trunc(value) : fallback;

/** A Reputation value: a whole number from 0 to 100. */
const scoreOr = (value: unknown, fallback: number): number =>
    isFiniteNumber(value) && value >= 0 && value <= 100 ? Math.trunc(value) : fallback;

/** Reads each known key of a number group, keeping the default for anything missing or out of range. */
const numberGroup = <T extends object>(
    value: unknown,
    defaults: T,
    read: (value: unknown, fallback: number) => number,
): T => {
    const row = asRecord(value) ?? {};
    const result: Record<string, number> = {};
    for (const [key, fallback] of Object.entries(defaults) as [string, number][]) {
        result[key] = read(row[key], fallback);
    }
    return result as T;
};

const restrictedBlocksOf = (value: unknown): ReputationRestrictedBlock[] => {
    if (!Array.isArray(value)) return [...DEFAULT_REPUTATION_RULES.restrictedBlocks];
    return REPUTATION_RESTRICTED_BLOCKS.filter((block) => value.includes(block));
};

/** Tolerant: null for a response that isn't an object; otherwise every missing or malformed number keeps its default. */
export function normalizeReputationRules(value: unknown): ReputationRules | null {
    const row = asRecord(value);
    if (!row) return null;
    const defaults = DEFAULT_REPUTATION_RULES;
    return {
        enforced: row.enforced === true,
        enforceAtMs: nonNegativeOr(row.enforceAtMs, defaults.enforceAtMs),
        start: scoreOr(row.start, defaults.start),
        bands: numberGroup(row.bands, defaults.bands, scoreOr),
        newUntilScored: positiveOr(row.newUntilScored, defaults.newUntilScored),
        restrictedBlocks: restrictedBlocksOf(row.restrictedBlocks),
    };
}

export type ReputationRulesState = "enforced" | "scheduled" | "pending";

/** Which status line the page shows: the Restricted limits apply now, from a later date, or later without a date. */
export function reputationRulesState(
    rules: Pick<ReputationRules, "enforced" | "enforceAtMs">,
    now: number,
): ReputationRulesState {
    if (rules.enforced) return "enforced";
    return rules.enforceAtMs > now ? "scheduled" : "pending";
}

export interface ReputationStatusCopy {
    statusPending: string;
    statusScheduled: string;
    statusEnforced: string;
}

/** The status line itself, with {date} filled by the caller's formatter (the page formats in its own language). */
export function reputationRulesStatusText(
    rules: Pick<ReputationRules, "enforced" | "enforceAtMs">,
    now: number,
    copy: ReputationStatusCopy,
    formatDate: (epochMs: number) => string,
): string {
    const state = reputationRulesState(rules, now);
    if (state === "enforced") return copy.statusEnforced ?? "";
    if (state === "scheduled") return (copy.statusScheduled ?? "").replace("{date}", formatDate(rules.enforceAtMs));
    return copy.statusPending ?? "";
}

export const reputationRulesPath = (language: "en" | "ru"): string =>
    `${language === "ru" ? "/ru" : ""}/rules/reputation/`;

export type ReputationRulesUrlOptions = RankedExitRulesUrlOptions;

export function buildReputationRulesUrl(options: ReputationRulesUrlOptions = {}): string {
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    return `${baseUrl}${production ? "/v1/reputation-rules" : "/v1/mm/reputation-rules"}`;
}

export async function fetchReputationRules(): Promise<ReputationRules> {
    const response = await fetch(buildReputationRulesUrl(), {
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Reputation rules request failed with status ${response.status}`);
    const rules = normalizeReputationRules(await response.json());
    if (!rules) throw new Error("Reputation rules response was malformed");
    return rules;
}
