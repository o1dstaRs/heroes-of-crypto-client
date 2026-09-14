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
    /** Timed locks (phase 3): whether they apply, from when, and how long an appeal may be. */
    lockRulesEnforced: boolean;
    lockRulesEnforceAtMs: number;
    appealMinChars: number;
    appealMaxChars: number;
}

export type RankedLockReason = "in_a_row" | "rolling" | "repeat" | "migrated";

/** A ranked lock in force (phase 3). `until` arrives on the server's clock; MatchmakingRoute shifts it to the local one. */
export interface RankedConductLock {
    level: 1 | 2 | 3;
    reason: RankedLockReason;
    startedAt: number;
    until: number;
    gameIds: string[];
}

/** One of the matches behind a lock, as the lock screen lists it. */
export interface RankedLockGame {
    gameId: string;
    finishedTime: number;
    opponentUsername: string;
    reason: string;
    phase: string;
    boardBp: number;
    lap: number;
}

export interface RankedAppealState {
    status: "pending" | "lifted" | "forgiven" | "upheld" | "no_basis";
    note: string;
    createdAt: number;
    decidedAt: number;
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
    lockRulesEnforced: boolean;
    lock: RankedConductLock | null;
    abandonStreak: number;
    lockGames: RankedLockGame[];
    appeal: RankedAppealState | null;
    appealMutedUntil: number;
    rules: RankedExitRules;
    serverTimeMs: number;
}

const num = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

const LOCK_REASONS: readonly RankedLockReason[] = ["in_a_row", "rolling", "repeat", "migrated"];
const APPEAL_STATUSES: readonly RankedAppealState["status"][] = ["pending", "lifted", "forgiven", "upheld", "no_basis"];

const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeLock = (raw: unknown): RankedConductLock | null => {
    const lock = record(raw);
    if (!lock || (lock.level !== 1 && lock.level !== 2 && lock.level !== 3)) {
        return null;
    }
    if (!LOCK_REASONS.includes(lock.reason as RankedLockReason)) {
        return null;
    }
    return {
        level: lock.level as 1 | 2 | 3,
        reason: lock.reason as RankedLockReason,
        startedAt: num(lock.startedAt),
        until: num(lock.until),
        gameIds: Array.isArray(lock.gameIds) ? lock.gameIds.filter((id): id is string => typeof id === "string") : [],
    };
};

const normalizeLockGame = (raw: unknown): RankedLockGame[] => {
    const game = record(raw);
    if (!game || typeof game.gameId !== "string") {
        return [];
    }
    return [
        {
            gameId: game.gameId,
            finishedTime: num(game.finishedTime),
            opponentUsername: str(game.opponentUsername),
            reason: str(game.reason),
            phase: str(game.phase),
            boardBp: num(game.boardBp),
            lap: num(game.lap),
        },
    ];
};

const normalizeAppeal = (raw: unknown): RankedAppealState | null => {
    const appeal = record(raw);
    if (!appeal || !APPEAL_STATUSES.includes(appeal.status as RankedAppealState["status"])) {
        return null;
    }
    return {
        status: appeal.status as RankedAppealState["status"],
        note: str(appeal.note),
        createdAt: num(appeal.createdAt),
        decidedAt: num(appeal.decidedAt),
    };
};

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
        lockRulesEnforced: body.lockRulesEnforced === true,
        lock: normalizeLock(body.lock),
        abandonStreak: num(body.abandonStreak),
        lockGames: Array.isArray(body.lockGames) ? body.lockGames.flatMap(normalizeLockGame) : [],
        appeal: normalizeAppeal(body.appeal),
        appealMutedUntil: num(body.appealMutedUntil),
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
            lockRulesEnforced: rules.lockRulesEnforced === true,
            lockRulesEnforceAtMs: num(rules.lockRulesEnforceAtMs),
            appealMinChars: num(rules.appealMinChars, 20),
            appealMaxChars: num(rules.appealMaxChars, 1000),
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

export const normalizeRankedExitRules = (raw: unknown): RankedExitRules => normalizeRankedConduct({ rules: raw }).rules;

/** The published rules' numbers (public GET ranked-exit-rules): what the exit dialogs and the rules card print. */
export const fetchRankedExitRules = async (): Promise<RankedExitRules> => {
    const response = await axiosMMInstance.get(endpoints.mm.rankedExitRules, { responseType: "json" });
    return normalizeRankedExitRules(response.data);
};

/** A locked player's one appeal against their current lock (phase 3). */
export const submitRankedAppeal = async (message: string): Promise<void> => {
    await axiosMMInstance.post(endpoints.mm.rankedAppeal, JSON.stringify({ message }), {
        headers: { "Content-Type": "application/json" },
        responseType: "json",
    });
};

/** The server's explanation for a refused request, when it sent one. */
export const rankedRequestErrorMessage = (err: unknown, fallback: string): string => {
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    if (typeof data === "string" && data.trim()) {
        return data.trim();
    }
    const body = record(data);
    const text = body?.message ?? body?.error;
    return typeof text === "string" && text.trim() ? text.trim() : fallback;
};
