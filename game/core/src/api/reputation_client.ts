import { axiosMMInstance, endpoints } from "./axios";

/** Reputation (integrity phase 4): a 0–100 score for how reliably someone plays ranked. Mirrors server reputation.ts. */

export type ReputationBand = "restricted" | "probation" | "good" | "honorable";

/** The published scale a score is read against (server reputationPublicRules): where it starts and where a band does. */
export interface ReputationRules {
    enforced: boolean;
    enforceAtMs: number;
    start: number;
    bands: { probation: number; good: number; honorable: number };
    newUntilScored: number;
    restrictedBlocks: string[];
}

/**
 * A player's own Reputation, as the portal receives it: the final score and where it sits.
 *
 * The itemization is deliberately absent — no ledger of changes, no account bonuses, no offence ceiling (owner,
 * 20 Sep). The server stopped sending them, so there is no parsing here for them either; adding a field back to
 * this type means publishing it to anyone who opens devtools.
 */
export interface Reputation {
    score: number;
    band: ReputationBand;
    isNew: boolean;
    restricted: boolean;
    rules: ReputationRules;
}

const BANDS: readonly ReputationBand[] = ["restricted", "probation", "good", "honorable"];
const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** The published scale, used for anything the response leaves out. */
export const DEFAULT_REPUTATION_RULES: ReputationRules = {
    enforced: false,
    enforceAtMs: 0,
    start: 50,
    bands: { probation: 40, good: 60, honorable: 80 },
    newUntilScored: 10,
    restrictedBlocks: ["wagers", "predictions", "chat"],
};

export const normalizeReputationRules = (raw: unknown): ReputationRules => {
    const body = record(raw);
    const defaults = DEFAULT_REPUTATION_RULES;
    const bands = record(body.bands);
    return {
        enforced: body.enforced === true,
        enforceAtMs: num(body.enforceAtMs),
        start: num(body.start, defaults.start),
        bands: {
            probation: num(bands.probation, defaults.bands.probation),
            good: num(bands.good, defaults.bands.good),
            honorable: num(bands.honorable, defaults.bands.honorable),
        },
        newUntilScored: num(body.newUntilScored, defaults.newUntilScored),
        restrictedBlocks: Array.isArray(body.restrictedBlocks)
            ? body.restrictedBlocks.filter((entry): entry is string => typeof entry === "string")
            : defaults.restrictedBlocks,
    };
};

/**
 * Tolerant parse: a missing or malformed body reads as a fresh account at the starting score.
 *
 * Whatever else a response carries is dropped on the floor. A server still sending the old ledger or the account
 * parts must not put them within reach of the page (owner, 20 Sep: the final score only).
 */
export const normalizeReputation = (raw: unknown): Reputation => {
    const body = record(raw);
    const rules = normalizeReputationRules(body.rules);
    const score = Math.max(0, Math.min(100, Math.round(num(body.score, rules.start))));
    return {
        score,
        band: BANDS.includes(body.band as ReputationBand) ? (body.band as ReputationBand) : "probation",
        isNew: body.isNew !== false,
        restricted: body.restricted === true,
        rules,
    };
};

/**
 * A player's own Reputation: the final score, its band, and whether the Restricted limits touch them. Nobody — the
 * player included — is sent what makes up the number (owner, 20 Sep), and `reputation-rules` publishes only the
 * scale (owner, 19 Sep), so there is no route left that itemizes a score.
 */
export const fetchReputation = async (): Promise<Reputation> => {
    const response = await axiosMMInstance.get(endpoints.mm.reputation, { responseType: "json" });
    return normalizeReputation(response.data);
};
