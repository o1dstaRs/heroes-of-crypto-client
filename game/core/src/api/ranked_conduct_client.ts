import { axiosMMInstance, endpoints } from "./axios";

/** The published exit rules' numbers (server exitRulesSummary), plus the version this player acknowledged. */
export interface RankedExitRules {
    version: string;
    acceptedVersion: string;
    enforced: boolean;
    enforceAtMs: number;
    concedeThresholdBp: number;
    absenceBudgetMs: number;
    disconnectGraceMs: number;
    afkMissedTurns: number;
    draftAutoPicks: number;
    abandonCooldownMs: number;
}

/** A signed-in player's own conduct record (GET ranked-conduct). */
export interface RankedConduct {
    calibrating: boolean;
    calibrationGamesPlayed: number;
    calibrationGames: number;
    serialLeaves: number;
    serialLeaveLimit: number;
    suspended: boolean;
    abandonCooldownUntil: number;
    rules: RankedExitRules;
    serverTimeMs: number;
}

const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Tolerant parse: an older server or a malformed body reads as "no rules yet", never throws. */
export const normalizeRankedConduct = (raw: unknown): RankedConduct => {
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const rules = (body.rules && typeof body.rules === "object" ? body.rules : {}) as Record<string, unknown>;
    return {
        calibrating: body.calibrating === true,
        calibrationGamesPlayed: num(body.calibrationGamesPlayed),
        calibrationGames: num(body.calibrationGames, 5),
        serialLeaves: num(body.serialLeaves),
        serialLeaveLimit: num(body.serialLeaveLimit, 3),
        suspended: body.suspended === true,
        abandonCooldownUntil: num(body.abandonCooldownUntil),
        serverTimeMs: num(body.serverTimeMs, Date.now()),
        rules: {
            version: str(rules.version),
            acceptedVersion: str(rules.acceptedVersion),
            enforced: rules.enforced === true,
            enforceAtMs: num(rules.enforceAtMs),
            concedeThresholdBp: num(rules.concedeThresholdBp, 5000),
            absenceBudgetMs: num(rules.absenceBudgetMs, 300_000),
            disconnectGraceMs: num(rules.disconnectGraceMs, 10_000),
            afkMissedTurns: num(rules.afkMissedTurns, 4),
            draftAutoPicks: num(rules.draftAutoPicks, 3),
            abandonCooldownMs: num(rules.abandonCooldownMs, 300_000),
        },
    };
};

/** The rules card is due when a rules version exists that this player hasn't acknowledged. */
export const rulesCardDue = (conduct: RankedConduct | undefined): boolean =>
    !!conduct && !!conduct.rules.version && conduct.rules.acceptedVersion !== conduct.rules.version;

export const fetchRankedConduct = async (): Promise<RankedConduct> => {
    const response = await axiosMMInstance.get(endpoints.mm.rankedConduct, { responseType: "json" });
    return normalizeRankedConduct(response.data);
};

export const acceptRankedRules = async (version: string): Promise<void> => {
    await axiosMMInstance.post(endpoints.mm.rankedRulesAccept, JSON.stringify({ version }), {
        headers: { "Content-Type": "application/json" },
        responseType: "json",
    });
};
