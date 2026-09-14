import { axiosMMInstance, endpoints } from "./axios";

/** Reputation (integrity phase 4): a 0–100 score for how reliably someone plays ranked. Mirrors server reputation.ts. */

export type ReputationBand = "restricted" | "probation" | "good" | "honorable";

export type ReputationEventKind =
    | "match_completed"
    | "abandon"
    | "low_participation"
    | "missed_accept"
    | "report_early"
    | "report_upheld"
    | "adjust"
    | "ai_assistance"
    | "win_trading";

export interface ReputationLogEntry {
    at: number;
    kind: ReputationEventKind;
    /** What it did to the score: 0 once the daily match limit is reached, for a cap, or after it was given back. */
    points: number;
    gameId: string;
    note: string;
    reverted: boolean;
    opponentUsername: string;
}

/** The published numbers (server reputationRulesSummary). */
export interface ReputationRules {
    enforced: boolean;
    enforceAtMs: number;
    start: number;
    bands: { probation: number; good: number; honorable: number };
    newUntilScored: number;
    matchDailyCap: number;
    points: Record<
        "match_completed" | "abandon" | "low_participation" | "missed_accept" | "report_early" | "report_upheld",
        number
    >;
    ageWeeksMax: number;
    identityPoints: { email: number; google: number; wallet: number };
    restrictedBlocks: string[];
}

export interface Reputation {
    score: number;
    band: ReputationBand;
    isNew: boolean;
    scoredMatches: number;
    ceiling: number | null;
    parts: { ledger: number; accountAge: number; email: number; google: number; wallet: number };
    restricted: boolean;
    log: ReputationLogEntry[];
    rules: ReputationRules;
}

const BANDS: readonly ReputationBand[] = ["restricted", "probation", "good", "honorable"];
const KINDS: readonly ReputationEventKind[] = [
    "match_completed",
    "abandon",
    "low_participation",
    "missed_accept",
    "report_early",
    "report_upheld",
    "adjust",
    "ai_assistance",
    "win_trading",
];

const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Published defaults, used for any number an older server leaves out. */
export const DEFAULT_REPUTATION_RULES: ReputationRules = {
    enforced: false,
    enforceAtMs: 0,
    start: 50,
    bands: { probation: 40, good: 60, honorable: 80 },
    newUntilScored: 10,
    matchDailyCap: 5,
    points: {
        match_completed: 1,
        abandon: -12,
        low_participation: -4,
        missed_accept: -1,
        report_early: -3,
        report_upheld: -10,
    },
    ageWeeksMax: 8,
    identityPoints: { email: 4, google: 3, wallet: 4 },
    restrictedBlocks: ["wagers", "predictions", "chat"],
};

export const normalizeReputationRules = (raw: unknown): ReputationRules => {
    const body = record(raw);
    const defaults = DEFAULT_REPUTATION_RULES;
    const bands = record(body.bands);
    const points = record(body.points);
    const identity = record(body.identityPoints);
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
        matchDailyCap: num(body.matchDailyCap, defaults.matchDailyCap),
        points: {
            match_completed: num(points.match_completed, defaults.points.match_completed),
            abandon: num(points.abandon, defaults.points.abandon),
            low_participation: num(points.low_participation, defaults.points.low_participation),
            missed_accept: num(points.missed_accept, defaults.points.missed_accept),
            report_early: num(points.report_early, defaults.points.report_early),
            report_upheld: num(points.report_upheld, defaults.points.report_upheld),
        },
        ageWeeksMax: num(body.ageWeeksMax, defaults.ageWeeksMax),
        identityPoints: {
            email: num(identity.email, defaults.identityPoints.email),
            google: num(identity.google, defaults.identityPoints.google),
            wallet: num(identity.wallet, defaults.identityPoints.wallet),
        },
        restrictedBlocks: Array.isArray(body.restrictedBlocks)
            ? body.restrictedBlocks.filter((entry): entry is string => typeof entry === "string")
            : defaults.restrictedBlocks,
    };
};

/** Tolerant parse: a missing or malformed body reads as a fresh account at the starting score. */
export const normalizeReputation = (raw: unknown): Reputation => {
    const body = record(raw);
    const rules = normalizeReputationRules(body.rules);
    const parts = record(body.parts);
    const score = Math.max(0, Math.min(100, Math.round(num(body.score, rules.start))));
    return {
        score,
        band: BANDS.includes(body.band as ReputationBand) ? (body.band as ReputationBand) : "probation",
        isNew: body.isNew !== false,
        scoredMatches: num(body.scoredMatches),
        ceiling: typeof body.ceiling === "number" ? body.ceiling : null,
        parts: {
            ledger: num(parts.ledger, rules.start),
            accountAge: num(parts.accountAge),
            email: num(parts.email),
            google: num(parts.google),
            wallet: num(parts.wallet),
        },
        restricted: body.restricted === true,
        log: Array.isArray(body.log)
            ? body.log.flatMap((entry): ReputationLogEntry[] => {
                  const row = record(entry);
                  if (!KINDS.includes(row.kind as ReputationEventKind)) {
                      return [];
                  }
                  return [
                      {
                          at: num(row.at),
                          kind: row.kind as ReputationEventKind,
                          points: num(row.points),
                          gameId: str(row.gameId),
                          note: str(row.note),
                          reverted: row.reverted === true,
                          opponentUsername: str(row.opponentUsername),
                      },
                  ];
              })
            : [],
        rules,
    };
};

export const fetchReputation = async (): Promise<Reputation> => {
    const response = await axiosMMInstance.get(endpoints.mm.reputation, { responseType: "json" });
    return normalizeReputation(response.data);
};

export const fetchReputationRules = async (): Promise<ReputationRules> => {
    const response = await axiosMMInstance.get(endpoints.mm.reputationRules, { responseType: "json" });
    return normalizeReputationRules(response.data);
};
