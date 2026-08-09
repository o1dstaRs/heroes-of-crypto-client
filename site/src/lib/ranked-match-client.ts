import { isPublicRankedPlayerId, type RankedMatchReason, type RankedMatchResult } from "./ranked-profile-client";

export type RankedMatchSide = "lower" | "upper";

export interface PublicRankedMatchPlayer {
    playerId: string;
    username: string;
    side: RankedMatchSide;
    result: RankedMatchResult;
    mmrBefore: number;
    mmrAfter: number;
    delta: number;
    goldEarned: number;
    calibration: boolean;
}

export interface RankedMatchUnitPerformance {
    creatureId: number;
    damageDealt: number;
}

export interface RankedMatchTeamSetup {
    artifactTier1: number;
    artifactTier2: number;
    perk: number;
    augmentPlacement: number;
    augmentArmor: number;
    augmentMight: number;
    augmentEmpower: number;
    augmentSniper: number;
    augmentMovement: number;
    synergies: string[];
}

export interface PublicRankedMatchStats {
    totalLaps: number;
    gridType: number;
    lowerDamage: number;
    upperDamage: number;
    lowerCreatureIds: number[];
    upperCreatureIds: number[];
    lowerPerformers: RankedMatchUnitPerformance[];
    upperPerformers: RankedMatchUnitPerformance[];
    lowerSetup: RankedMatchTeamSetup;
    upperSetup: RankedMatchTeamSetup;
    setupRecorded: boolean;
    replayAvailable: boolean;
}

export interface PublicRankedMatch {
    gameId: string;
    finishedTime: number;
    durationMs: number;
    lowerCreatureIds: number[];
    upperCreatureIds: number[];
    outcome: "win" | "draw";
    reason: RankedMatchReason;
    winnerPlayerId: string;
    seasonSequence: number;
    players: [PublicRankedMatchPlayer, PublicRankedMatchPlayer];
    stats: PublicRankedMatchStats | null;
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asNumber = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const asInteger = (value: unknown): number => Math.trunc(asNumber(value));

const nonNegativeInteger = (value: unknown): number => Math.max(0, asInteger(value));

const normalizeReason = (value: unknown): RankedMatchReason => {
    if (value === "concede" || value === "disconnect" || value === "double_disconnect" || value === "cancel") {
        return value;
    }
    return "normal";
};

const normalizeResult = (value: unknown): RankedMatchResult => {
    if (value === "win" || value === "loss") {
        return value;
    }
    return "draw";
};

const normalizeSide = (value: unknown): RankedMatchSide | null =>
    value === "lower" || value === "upper" ? value : null;

const normalizePlayer = (value: unknown): PublicRankedMatchPlayer | null => {
    const row = asRecord(value);
    if (!row) return null;
    const playerId = asString(row.playerId);
    const side = normalizeSide(row.side);
    if (!isPublicRankedPlayerId(playerId) || !side) return null;
    return {
        playerId,
        username: asString(row.username) || "Unknown",
        side,
        result: normalizeResult(row.result),
        mmrBefore: nonNegativeInteger(row.mmrBefore),
        mmrAfter: nonNegativeInteger(row.mmrAfter),
        delta: asInteger(row.delta),
        goldEarned: nonNegativeInteger(row.goldEarned),
        calibration: row.calibration === true,
    };
};

const normalizePerformance = (value: unknown): RankedMatchUnitPerformance | null => {
    const row = asRecord(value);
    if (!row) return null;
    const creatureId = nonNegativeInteger(row.creatureId);
    if (!creatureId) return null;
    return { creatureId, damageDealt: nonNegativeInteger(row.damageDealt) };
};

const normalizeCreatureIds = (value: unknown): number[] =>
    (Array.isArray(value) ? value : []).map(nonNegativeInteger).filter((creatureId) => creatureId > 0);

const normalizeSetup = (value: unknown): RankedMatchTeamSetup => {
    const row = asRecord(value) ?? {};
    return {
        artifactTier1: nonNegativeInteger(row.artifactTier1),
        artifactTier2: nonNegativeInteger(row.artifactTier2),
        perk: nonNegativeInteger(row.perk),
        augmentPlacement: nonNegativeInteger(row.augmentPlacement),
        augmentArmor: nonNegativeInteger(row.augmentArmor),
        augmentMight: nonNegativeInteger(row.augmentMight),
        augmentEmpower: nonNegativeInteger(row.augmentEmpower),
        augmentSniper: nonNegativeInteger(row.augmentSniper),
        augmentMovement: nonNegativeInteger(row.augmentMovement),
        synergies: [
            ...new Set(
                (Array.isArray(row.synergies) ? row.synergies : [])
                    .map(asString)
                    .filter((synergy) => synergy.length > 0),
            ),
        ],
    };
};

const normalizeStats = (value: unknown): PublicRankedMatchStats | null => {
    const row = asRecord(value);
    if (!row) return null;
    const performances = (candidate: unknown): RankedMatchUnitPerformance[] =>
        (Array.isArray(candidate) ? candidate : [])
            .map(normalizePerformance)
            .filter((entry): entry is RankedMatchUnitPerformance => entry !== null)
            .sort((left, right) => right.damageDealt - left.damageDealt || left.creatureId - right.creatureId);
    return {
        totalLaps: nonNegativeInteger(row.totalLaps),
        gridType: nonNegativeInteger(row.gridType),
        lowerDamage: nonNegativeInteger(row.lowerDamage),
        upperDamage: nonNegativeInteger(row.upperDamage),
        lowerCreatureIds: normalizeCreatureIds(row.lowerCreatureIds),
        upperCreatureIds: normalizeCreatureIds(row.upperCreatureIds),
        lowerPerformers: performances(row.lowerPerformers),
        upperPerformers: performances(row.upperPerformers),
        lowerSetup: normalizeSetup(row.lowerSetup),
        upperSetup: normalizeSetup(row.upperSetup),
        setupRecorded: row.setupRecorded === true,
        replayAvailable: row.replayAvailable === true,
    };
};

export const isPublicRankedGameId = (value: string): boolean => value.length === 36 && /^[a-zA-Z0-9-]+$/.test(value);

export function normalizePublicRankedMatch(value: unknown): PublicRankedMatch | null {
    const row = asRecord(value);
    if (!row) return null;
    const gameId = asString(row.gameId);
    if (!isPublicRankedGameId(gameId)) return null;
    const players = (Array.isArray(row.players) ? row.players : [])
        .map(normalizePlayer)
        .filter((player): player is PublicRankedMatchPlayer => player !== null)
        .sort((left, right) => (left.side === right.side ? 0 : left.side === "lower" ? -1 : 1));
    if (players.length !== 2 || players[0]?.side !== "lower" || players[1]?.side !== "upper") return null;
    const winnerPlayerId = asString(row.winnerPlayerId);
    return {
        gameId,
        finishedTime: nonNegativeInteger(row.finishedTime),
        durationMs: nonNegativeInteger(row.durationMs),
        lowerCreatureIds: normalizeCreatureIds(row.lowerCreatureIds),
        upperCreatureIds: normalizeCreatureIds(row.upperCreatureIds),
        outcome: row.outcome === "win" ? "win" : "draw",
        reason: normalizeReason(row.reason),
        winnerPlayerId: isPublicRankedPlayerId(winnerPlayerId) ? winnerPlayerId : "",
        seasonSequence: nonNegativeInteger(row.seasonSequence),
        players: [players[0], players[1]],
        stats: normalizeStats(row.stats),
    };
}

export interface RankedMatchUrlOptions {
    baseUrl?: string;
    production?: boolean;
}

const runtimeIsProduction = (): boolean => {
    const hostname = globalThis.location?.hostname ?? "";
    return (
        hostname === "heroesofcrypto.io" ||
        hostname.endsWith(".heroesofcrypto.io") ||
        import.meta.env.PROD === true ||
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

export function buildPublicRankedMatchUrl(gameId: string, options: RankedMatchUrlOptions = {}): string {
    if (!isPublicRankedGameId(gameId)) throw new Error("invalid_game_id");
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    const path = production ? "/v1/ranked-match" : "/v1/mm/ranked-match";
    return `${baseUrl}${path}/${encodeURIComponent(gameId)}`;
}

export async function fetchPublicRankedMatch(gameId: string): Promise<PublicRankedMatch> {
    const response = await fetch(buildPublicRankedMatchUrl(gameId), {
        cache: "no-store",
        headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Ranked match request failed with status ${response.status}`);
    const match = normalizePublicRankedMatch(await response.json());
    if (!match) throw new Error("Ranked match response was malformed");
    return match;
}

export function buildRankedMatchPagePath(gameId: string, playerId: string, language: "en" | "ru"): string {
    const params = new URLSearchParams({ gameId });
    if (isPublicRankedPlayerId(playerId)) params.set("playerId", playerId);
    return `${language === "ru" ? "/ru" : ""}/match/?${params.toString()}`;
}
