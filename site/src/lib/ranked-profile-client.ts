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
    goldEarned: number;
    calibration: boolean;
    opponent: RankedProfileOpponent | null;
}

export interface PlaystyleCreature {
    creatureId: number;
    name: string;
    faction: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
    pickRatePct: number;
}

export interface PlaystyleCombo {
    creatureIds: number[];
    names: string[];
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
}

export interface PlaystyleArtifact {
    artifactId: number;
    tier: number;
    name: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
    pickRatePct: number;
}

/** A habitual combat-augment choice: a kind (1..6) at a display level (1..3), with its record. */
export interface PlaystyleAugment {
    kind: number;
    level: number;
    name: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
    pickRatePct: number;
}

/** How the player usually plays: favorite creatures, winning combos, artifact + augment habits. */
export interface PlayerPlaystyle {
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
    topCreatures: PlaystyleCreature[];
    topPairs: PlaystyleCombo[];
    topTriples: PlaystyleCombo[];
    artifactsTier1: PlaystyleArtifact[];
    artifactsTier2: PlaystyleArtifact[];
    augments: PlaystyleAugment[];
}

export interface SeasonHistoryEntry {
    seasonSequence: number;
    seasonName: string;
    state: RankedProfileState;
    mmr: number;
    gold: number;
    peakMmr: number;
    league: number;
    leagueName: string;
    leaderboardRank: number;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    winRatePct: number;
    archivedAt: number;
}

export type PredictionStatus = "open" | "won" | "lost" | "burned" | "refunded";

export interface PredictionRecord {
    gameId: string;
    predictedPlayerId: string;
    backedUsername: string;
    amount: number;
    placedAt: number;
    status: PredictionStatus;
    payout: number;
    settledAt: number;
}

/** How this player bets on OTHER people's games, and how it has gone. */
export interface PredictionHistory {
    bets: number;
    staked: number;
    returned: number;
    settled: number;
    won: number;
    net: number;
    winRatePct: number;
    recent: PredictionRecord[];
}

export interface ProfileSeason {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
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
    // Season currency ("Gold"): minted 1:1 with every positive MMR movement, never deducted.
    gold: number;
    placedAt: number;
    lastRankedGameAt: number;
    // Public playtime + presence: total seconds ever spent in games, and online / last-seen state.
    secondsInGame: number;
    online: boolean;
    lastOnlineAt: number;
    // The player's pre-game ban preference: the ONE unit they never want offered in their drafts.
    rankedBan: { creatureId: number; name: string } | null;
    predictions: PredictionHistory;
    // The season the live numbers belong to (null = season-less/preseason ladder) and the final
    // standings of every season this player already finished, newest first.
    season: ProfileSeason | null;
    seasonHistory: SeasonHistoryEntry[];
    recentGames: RankedProfileMatch[];
    playstyle: PlayerPlaystyle | null;
}

/** Percentage of settled ranked games the player personally ended through an exit/disconnect. */
export const rankedExitRatePct = (exitCount: number, totalGames: number): number => {
    const exits = Number.isFinite(exitCount) ? Math.max(0, exitCount) : 0;
    const games = Number.isFinite(totalGames) ? Math.max(0, totalGames) : 0;
    return games > 0 ? Math.min(100, (exits / games) * 100) : 0;
};

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

    const numberOr0 = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    const playstyleRow = row.playstyle && typeof row.playstyle === "object" ? (row.playstyle as UnknownRecord) : null;
    const normalizeCreature = (value: unknown): PlaystyleCreature | null => {
        const entry = value && typeof value === "object" ? (value as UnknownRecord) : null;
        if (!entry) return null;
        return {
            creatureId: numberOr0(entry.creatureId),
            name: typeof entry.name === "string" ? entry.name : "",
            faction: typeof entry.faction === "string" ? entry.faction : "",
            games: numberOr0(entry.games),
            wins: numberOr0(entry.wins),
            losses: numberOr0(entry.losses),
            draws: numberOr0(entry.draws),
            winRatePct: numberOr0(entry.winRatePct),
            pickRatePct: numberOr0(entry.pickRatePct),
        };
    };
    const normalizeCombo = (value: unknown): PlaystyleCombo | null => {
        const entry = value && typeof value === "object" ? (value as UnknownRecord) : null;
        if (!entry) return null;
        return {
            creatureIds: Array.isArray(entry.creatureIds) ? entry.creatureIds.map(numberOr0) : [],
            names: Array.isArray(entry.names) ? entry.names.map((n) => (typeof n === "string" ? n : "")) : [],
            games: numberOr0(entry.games),
            wins: numberOr0(entry.wins),
            losses: numberOr0(entry.losses),
            draws: numberOr0(entry.draws),
            winRatePct: numberOr0(entry.winRatePct),
        };
    };
    const normalizeArtifact = (value: unknown): PlaystyleArtifact | null => {
        const entry = value && typeof value === "object" ? (value as UnknownRecord) : null;
        if (!entry) return null;
        return {
            artifactId: numberOr0(entry.artifactId),
            tier: numberOr0(entry.tier),
            name: typeof entry.name === "string" ? entry.name : "",
            games: numberOr0(entry.games),
            wins: numberOr0(entry.wins),
            losses: numberOr0(entry.losses),
            draws: numberOr0(entry.draws),
            winRatePct: numberOr0(entry.winRatePct),
            pickRatePct: numberOr0(entry.pickRatePct),
        };
    };
    const normalizeAugment = (value: unknown): PlaystyleAugment | null => {
        const entry = value && typeof value === "object" ? (value as UnknownRecord) : null;
        if (!entry) return null;
        return {
            kind: numberOr0(entry.kind),
            level: numberOr0(entry.level),
            name: typeof entry.name === "string" ? entry.name : "",
            games: numberOr0(entry.games),
            wins: numberOr0(entry.wins),
            losses: numberOr0(entry.losses),
            draws: numberOr0(entry.draws),
            winRatePct: numberOr0(entry.winRatePct),
            pickRatePct: numberOr0(entry.pickRatePct),
        };
    };
    const playstyle: PlayerPlaystyle | null = playstyleRow
        ? {
              games: numberOr0(playstyleRow.games),
              wins: numberOr0(playstyleRow.wins),
              losses: numberOr0(playstyleRow.losses),
              draws: numberOr0(playstyleRow.draws),
              winRatePct: numberOr0(playstyleRow.winRatePct),
              topCreatures: (Array.isArray(playstyleRow.topCreatures) ? playstyleRow.topCreatures : [])
                  .map(normalizeCreature)
                  .filter((entry): entry is PlaystyleCreature => entry !== null),
              topPairs: (Array.isArray(playstyleRow.topPairs) ? playstyleRow.topPairs : [])
                  .map(normalizeCombo)
                  .filter((entry): entry is PlaystyleCombo => entry !== null),
              topTriples: (Array.isArray(playstyleRow.topTriples) ? playstyleRow.topTriples : [])
                  .map(normalizeCombo)
                  .filter((entry): entry is PlaystyleCombo => entry !== null),
              artifactsTier1: (Array.isArray(playstyleRow.artifactsTier1) ? playstyleRow.artifactsTier1 : [])
                  .map(normalizeArtifact)
                  .filter((entry): entry is PlaystyleArtifact => entry !== null),
              artifactsTier2: (Array.isArray(playstyleRow.artifactsTier2) ? playstyleRow.artifactsTier2 : [])
                  .map(normalizeArtifact)
                  .filter((entry): entry is PlaystyleArtifact => entry !== null),
              augments: (Array.isArray(playstyleRow.augments) ? playstyleRow.augments : [])
                  .map(normalizeAugment)
                  .filter((entry): entry is PlaystyleAugment => entry !== null),
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
                goldEarned: nonNegativeInteger(match.goldEarned),
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
        gold: nonNegativeInteger(row.gold),
        placedAt: nonNegativeInteger(row.placedAt),
        lastRankedGameAt: nonNegativeInteger(row.lastRankedGameAt),
        secondsInGame: nonNegativeInteger(row.secondsInGame),
        online: row.online === true,
        lastOnlineAt: nonNegativeInteger(row.lastOnlineAt),
        rankedBan: normalizeRankedBan(row.rankedBan),
        predictions: normalizePredictions(row.predictions),
        season: normalizeProfileSeason(row.season),
        seasonHistory: (Array.isArray(row.seasonHistory) ? row.seasonHistory : [])
            .map(normalizeSeasonHistoryEntry)
            .filter((entry): entry is SeasonHistoryEntry => entry !== null)
            .sort((a, b) => b.seasonSequence - a.seasonSequence),
        recentGames,
        playstyle,
    };
}

const PREDICTION_STATUSES = new Set<PredictionStatus>(["open", "won", "lost", "burned", "refunded"]);

function normalizePredictions(value: unknown): PredictionHistory {
    const row = asRecord(value);
    const recent = (Array.isArray(row.recent) ? row.recent : [])
        .map((entry): PredictionRecord | null => {
            const bet = asRecord(entry);
            const gameId = asString(bet.gameId);
            if (!gameId) {
                return null;
            }
            const status = asString(bet.status) as PredictionStatus;
            return {
                gameId,
                predictedPlayerId: asString(bet.predictedPlayerId),
                backedUsername: asString(bet.backedUsername),
                amount: nonNegativeInteger(bet.amount),
                placedAt: nonNegativeInteger(bet.placedAt),
                status: PREDICTION_STATUSES.has(status) ? status : "open",
                payout: nonNegativeInteger(bet.payout),
                settledAt: nonNegativeInteger(bet.settledAt),
            };
        })
        .filter((bet): bet is PredictionRecord => bet !== null)
        .sort((a, b) => b.placedAt - a.placedAt);

    return {
        bets: nonNegativeInteger(row.bets),
        staked: nonNegativeInteger(row.staked),
        returned: nonNegativeInteger(row.returned),
        settled: nonNegativeInteger(row.settled),
        won: nonNegativeInteger(row.won),
        // Net is the only signed figure here — a losing bettor is below zero.
        net: asInteger(row.net),
        winRatePct: asNumber(row.winRatePct),
        recent,
    };
}

function normalizeRankedBan(value: unknown): { creatureId: number; name: string } | null {
    if (value === null || value === undefined) {
        return null;
    }
    const row = asRecord(value);
    const creatureId = nonNegativeInteger(row.creatureId);
    const name = asString(row.name);
    return creatureId > 0 && name ? { creatureId, name } : null;
}

function normalizeProfileSeason(value: unknown): ProfileSeason | null {
    if (value === null || value === undefined) {
        return null;
    }
    const row = asRecord(value);
    const sequence = nonNegativeInteger(row.sequence);
    const name = asString(row.name);
    if (!sequence || !name) {
        return null;
    }
    return {
        sequence,
        name,
        startsAt: nonNegativeInteger(row.startsAt),
        endsAt: nonNegativeInteger(row.endsAt),
    };
}

function normalizeSeasonHistoryEntry(value: unknown): SeasonHistoryEntry | null {
    const row = asRecord(value);
    const seasonName = asString(row.seasonName);
    if (!seasonName) {
        return null;
    }
    const league = nonNegativeInteger(row.league);
    return {
        seasonSequence: nonNegativeInteger(row.seasonSequence),
        seasonName,
        state: normalizeState(row.state),
        mmr: nonNegativeInteger(row.mmr),
        gold: nonNegativeInteger(row.gold),
        peakMmr: nonNegativeInteger(row.peakMmr),
        league,
        leagueName: asString(row.leagueName, league ? `League ${league}` : "Unranked"),
        leaderboardRank: nonNegativeInteger(row.leaderboardRank),
        wins: nonNegativeInteger(row.wins),
        losses: nonNegativeInteger(row.losses),
        draws: nonNegativeInteger(row.draws),
        totalGames: nonNegativeInteger(row.totalGames),
        winRatePct: Math.max(0, Math.min(100, asNumber(row.winRatePct))),
        archivedAt: nonNegativeInteger(row.archivedAt),
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
        rankedBan: {
            creatureId: searchNumber(params, "bannedCreatureId"),
            name: params.get("bannedCreatureName") ?? "",
        },
        recentGames: [],
        playstyle: null,
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
