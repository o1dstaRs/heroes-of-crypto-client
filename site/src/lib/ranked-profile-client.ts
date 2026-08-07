export type RankedProfileState = "calibration" | "placed" | "recalibration";
export type RankedMatchResult = "win" | "loss" | "draw";
export type RankedMatchReason = "normal" | "concede" | "disconnect" | "double_disconnect" | "cancel";

export interface RankedProfileCalibration {
    required: number;
    gamesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
}

export interface RankedProfilePreviousStanding {
    league: number;
    leagueName: string;
    mmr: number;
}

export interface RankedProfileOpponent {
    playerId: string;
    username: string;
}

export interface RankedProfileMatch {
    gameId: string;
    finishedTime: number;
    result: RankedMatchResult;
    reason: RankedMatchReason;
    mmrDelta: number;
    calibration: boolean;
    opponent: RankedProfileOpponent | null;
}

export interface PublicRankedProfile {
    playerId: string;
    username: string;
    state: RankedProfileState;
    mmr: number;
    peakMmr: number;
    league: number;
    leagueName: string;
    leaderboardRank: number;
    calibration: RankedProfileCalibration;
    previous: RankedProfilePreviousStanding | null;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    dcWins: number;
    dcLosses: number;
    winRatePct: number;
    winStreak: number;
    lossStreak: number;
    placedAt: number;
    lastRankedGameAt: number;
    recentGames: RankedProfileMatch[];
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asString = (value: unknown, fallback = ""): string =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asInteger = (value: unknown, fallback = 0): number => Math.trunc(asNumber(value, fallback));

const nonNegativeInteger = (value: unknown): number => Math.max(0, asInteger(value));

const normalizeState = (value: unknown): RankedProfileState => {
    if (value === "placed" || value === "recalibration") {
        return value;
    }
    return "calibration";
};

const normalizeResult = (value: unknown): RankedMatchResult => {
    if (value === "win" || value === "loss") {
        return value;
    }
    return "draw";
};

const normalizeReason = (value: unknown): RankedMatchReason => {
    if (value === "concede" || value === "disconnect" || value === "double_disconnect" || value === "cancel") {
        return value;
    }
    return "normal";
};

/** Human UUIDs and persistent `ai:` seats are both exactly 36 characters in the ranked service. */
export const isPublicRankedPlayerId = (value: string): boolean =>
    value.length === 36 && /^[a-zA-Z0-9._:-]+$/.test(value);

export function normalizePublicRankedProfile(value: unknown): PublicRankedProfile | null {
    const row = asRecord(value);
    const playerId = asString(row.playerId);
    if (!isPublicRankedPlayerId(playerId)) {
        return null;
    }

    const calibrationRow = asRecord(row.calibration);
    const previousRow = row.previous === null ? null : asRecord(row.previous);
    const previousLeague = previousRow ? nonNegativeInteger(previousRow.league) : 0;
    const previous =
        previousRow && previousLeague > 0
            ? {
                  league: previousLeague,
                  leagueName: asString(previousRow.leagueName, `League ${previousLeague}`),
                  mmr: nonNegativeInteger(previousRow.mmr),
              }
            : null;

    const recentGames = (Array.isArray(row.recentGames) ? row.recentGames : [])
        .map((value): RankedProfileMatch | null => {
            const match = asRecord(value);
            const gameId = asString(match.gameId);
            if (!gameId) {
                return null;
            }
            const opponentRow = match.opponent === null ? null : asRecord(match.opponent);
            const opponentId = opponentRow ? asString(opponentRow.playerId) : "";
            return {
                gameId,
                finishedTime: nonNegativeInteger(match.finishedTime),
                result: normalizeResult(match.result),
                reason: normalizeReason(match.reason),
                mmrDelta: asInteger(match.mmrDelta),
                calibration: match.calibration === true,
                opponent:
                    opponentRow && isPublicRankedPlayerId(opponentId)
                        ? {
                              playerId: opponentId,
                              username: asString(opponentRow.username, "Unknown"),
                          }
                        : null,
            };
        })
        .filter((match): match is RankedProfileMatch => match !== null)
        .sort((a, b) => b.finishedTime - a.finishedTime);

    const league = nonNegativeInteger(row.league);
    return {
        playerId,
        username: asString(row.username, "Unknown player"),
        state: normalizeState(row.state),
        mmr: nonNegativeInteger(row.mmr),
        peakMmr: nonNegativeInteger(row.peakMmr),
        league,
        leagueName: asString(row.leagueName, league ? `League ${league}` : "Unranked"),
        leaderboardRank: nonNegativeInteger(row.leaderboardRank),
        calibration: {
            required: Math.max(1, nonNegativeInteger(calibrationRow.required) || 5),
            gamesPlayed: nonNegativeInteger(calibrationRow.gamesPlayed),
            wins: nonNegativeInteger(calibrationRow.wins),
            draws: nonNegativeInteger(calibrationRow.draws),
            losses: nonNegativeInteger(calibrationRow.losses),
        },
        previous,
        wins: nonNegativeInteger(row.wins),
        losses: nonNegativeInteger(row.losses),
        draws: nonNegativeInteger(row.draws),
        totalGames: nonNegativeInteger(row.totalGames),
        dcWins: nonNegativeInteger(row.dcWins),
        dcLosses: nonNegativeInteger(row.dcLosses),
        winRatePct: Math.max(0, Math.min(100, asNumber(row.winRatePct))),
        winStreak: nonNegativeInteger(row.winStreak),
        lossStreak: nonNegativeInteger(row.lossStreak),
        placedAt: nonNegativeInteger(row.placedAt),
        lastRankedGameAt: nonNegativeInteger(row.lastRankedGameAt),
        recentGames,
    };
}

const searchNumber = (params: URLSearchParams, name: string): number => {
    const value = Number(params.get(name));
    return Number.isFinite(value) ? value : 0;
};

/**
 * Sanitized leaderboard data carried by a profile link. This is only a presentation fallback when
 * the authoritative profile request is unavailable (notably for placement/AI rows during rollout).
 */
export function publicRankedProfileFallbackFromSearchParams(params: URLSearchParams): PublicRankedProfile | null {
    const playerId = params.get("playerId")?.trim() ?? "";
    const username = params.get("username")?.trim() ?? "";
    if (!isPublicRankedPlayerId(playerId) || !username) {
        return null;
    }
    const league = searchNumber(params, "league");
    const explicitState = params.get("state");
    const state =
        explicitState === "recalibration"
            ? "recalibration"
            : explicitState === "calibration"
              ? "calibration"
              : league > 0
                ? "placed"
                : "calibration";

    return normalizePublicRankedProfile({
        playerId,
        username,
        state,
        mmr: searchNumber(params, "mmr"),
        peakMmr: searchNumber(params, "peakMmr"),
        league,
        leaderboardRank: searchNumber(params, "rank"),
        calibration: {
            required: searchNumber(params, "calibrationRequired"),
            gamesPlayed: searchNumber(params, "calibrationPlayed"),
        },
        wins: searchNumber(params, "wins"),
        losses: searchNumber(params, "losses"),
        draws: searchNumber(params, "draws"),
        totalGames: searchNumber(params, "games"),
        winRatePct: searchNumber(params, "winRate"),
        winStreak: searchNumber(params, "winStreak"),
        lossStreak: searchNumber(params, "lossStreak"),
        lastRankedGameAt: searchNumber(params, "lastBattle"),
        recentGames: [],
    });
}

export interface RankedProfileUrlOptions {
    baseUrl?: string;
    production?: boolean;
}

const runtimeHostname = (): string => globalThis.location?.hostname ?? "";

const runtimeIsProduction = (): boolean => {
    const hostname = runtimeHostname();
    return (
        hostname === "heroesofcrypto.io" ||
        hostname.endsWith(".heroesofcrypto.io") ||
        import.meta.env.PROD === true ||
        import.meta.env.VITE_IS_PROD === "true"
    );
};

const sameHostOrigin = (port: string | number | undefined): string | undefined => {
    if (!port || typeof globalThis.location === "undefined") {
        return undefined;
    }
    return `${globalThis.location.protocol}//${globalThis.location.hostname}:${port}`;
};

const runtimeBaseUrl = (production: boolean): string =>
    String(
        sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined) ||
            import.meta.env.VITE_HOST_MATCHMAKING_API ||
            import.meta.env.VITE_MATCHMAKING_API ||
            (production ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
    ).replace(/\/+$/, "");

export function buildPublicRankedProfileUrl(playerId: string, options: RankedProfileUrlOptions = {}): string {
    if (!isPublicRankedPlayerId(playerId)) {
        throw new RankedProfileInputError("invalid_player_id");
    }
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    const path = production ? "/v1/ranked-profile" : "/v1/mm/ranked-profile";
    return `${baseUrl}${path}/${encodeURIComponent(playerId)}`;
}

export class RankedProfileInputError extends Error {}
export class RankedProfileNotFoundError extends Error {}

export async function fetchPublicRankedProfile(playerId: string): Promise<PublicRankedProfile> {
    const response = await fetch(buildPublicRankedProfileUrl(playerId), {
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
        throw new RankedProfileNotFoundError("ranked_profile_not_found");
    }
    if (!response.ok) {
        throw new Error(`Ranked profile request failed with status ${response.status}`);
    }
    const profile = normalizePublicRankedProfile(await response.json());
    if (!profile) {
        throw new Error("Ranked profile response was malformed");
    }
    return profile;
}
