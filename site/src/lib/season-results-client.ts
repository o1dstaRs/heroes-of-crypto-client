import { LEGACY_SEASON_CURRENCY, normalizeSeasonCurrency, type SeasonCurrency } from "./season-currency";

/**
 * Public season results: the final table of every CLOSED season. When a season ends the server returns
 * every pending stake, records each player's final currency and place, and zeroes the purses — these
 * endpoints serve what it recorded:
 *   GET /v1/season-results              every closed season, newest first, with its podium
 *   GET /v1/season-results/:sequence    one season's full table
 * (development servers prefix the path with /mm, like every public ranked route.)
 */

export type SeasonResultsStatus = "upcoming" | "active" | "finished";

export interface SeasonResultsSeason {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
    status: SeasonResultsStatus;
    currency: SeasonCurrency;
}

export interface SeasonResultsPlayer {
    /** Final place, 1-based; 0 = unranked (calibrating, or no games that season). */
    place: number;
    playerId: string;
    username: string;
    state: string;
    league: number;
    leagueName: string;
    mmr: number;
    peakMmr: number;
    /** Final balance in the season's own currency (stakes returned at the close included). */
    gold: number;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    winRatePct: number;
}

export interface SeasonResultsListEntry {
    season: SeasonResultsSeason;
    closedAt: number;
    playerCount: number;
    rankedCount: number;
    totalGold: number;
    podium: SeasonResultsPlayer[];
}

export interface SeasonResultsList {
    computedAt: number;
    seasons: SeasonResultsListEntry[];
}

export interface SeasonResultsLeague {
    league: number;
    leagueName: string;
    playerCount: number;
    minMmr: number;
    maxMmr: number;
}

export interface SeasonResultsDetail {
    computedAt: number;
    season: SeasonResultsSeason;
    closedAt: number;
    playerCount: number;
    rankedCount: number;
    totalGold: number;
    refundedGold: number;
    collapsed: boolean;
    leagues: SeasonResultsLeague[];
    players: SeasonResultsPlayer[];
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asString = (value: unknown, fallback = ""): string =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

const wholeNumber = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const percent = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

const asStatus = (value: unknown): SeasonResultsStatus =>
    value === "upcoming" || value === "active" || value === "finished" ? value : "finished";

export function normalizeSeasonResultsSeason(value: unknown): SeasonResultsSeason | null {
    const row = asRecord(value);
    const sequence = wholeNumber(row.sequence);
    if (!sequence) {
        return null;
    }
    return {
        sequence,
        name: asString(row.name, `Season ${sequence}`),
        startsAt: wholeNumber(row.startsAt),
        endsAt: wholeNumber(row.endsAt),
        status: asStatus(row.status),
        currency: normalizeSeasonCurrency(row.currency, LEGACY_SEASON_CURRENCY),
    };
}

export function normalizeSeasonResultsPlayer(value: unknown): SeasonResultsPlayer | null {
    const row = asRecord(value);
    const playerId = asString(row.playerId);
    if (!playerId) {
        return null;
    }
    return {
        place: wholeNumber(row.place),
        playerId,
        username: asString(row.username, "Unknown"),
        state: asString(row.state, "placed"),
        league: Math.min(5, wholeNumber(row.league)),
        leagueName: asString(row.leagueName, "Unranked"),
        mmr: wholeNumber(row.mmr),
        peakMmr: wholeNumber(row.peakMmr),
        gold: wholeNumber(row.gold),
        wins: wholeNumber(row.wins),
        losses: wholeNumber(row.losses),
        draws: wholeNumber(row.draws),
        totalGames: wholeNumber(row.totalGames),
        winRatePct: percent(row.winRatePct),
    };
}

const players = (value: unknown): SeasonResultsPlayer[] =>
    (Array.isArray(value) ? value : [])
        .map(normalizeSeasonResultsPlayer)
        .filter((player): player is SeasonResultsPlayer => player !== null);

export function normalizeSeasonResultsList(value: unknown): SeasonResultsList {
    const row = asRecord(value);
    const seasons = (Array.isArray(row.seasons) ? row.seasons : [])
        .map((entryValue): SeasonResultsListEntry | null => {
            const entry = asRecord(entryValue);
            const season = normalizeSeasonResultsSeason(entry.season);
            if (!season) {
                return null;
            }
            return {
                season,
                closedAt: wholeNumber(entry.closedAt),
                playerCount: wholeNumber(entry.playerCount),
                rankedCount: wholeNumber(entry.rankedCount),
                totalGold: wholeNumber(entry.totalGold),
                podium: players(entry.podium),
            };
        })
        .filter((entry): entry is SeasonResultsListEntry => entry !== null)
        .sort((left, right) => right.season.sequence - left.season.sequence);
    return { computedAt: wholeNumber(row.computedAt), seasons };
}

export function normalizeSeasonResultsDetail(value: unknown): SeasonResultsDetail | null {
    const row = asRecord(value);
    const season = normalizeSeasonResultsSeason(row.season);
    if (!season) {
        return null;
    }
    return {
        computedAt: wholeNumber(row.computedAt),
        season,
        closedAt: wholeNumber(row.closedAt),
        playerCount: wholeNumber(row.playerCount),
        rankedCount: wholeNumber(row.rankedCount),
        totalGold: wholeNumber(row.totalGold),
        refundedGold: wholeNumber(row.refundedGold),
        collapsed: row.collapsed === true,
        leagues: (Array.isArray(row.leagues) ? row.leagues : [])
            .map((leagueValue) => {
                const league = asRecord(leagueValue);
                return {
                    league: Math.min(5, wholeNumber(league.league)),
                    leagueName: asString(league.leagueName, "Unranked"),
                    playerCount: wholeNumber(league.playerCount),
                    minMmr: wholeNumber(league.minMmr),
                    maxMmr: wholeNumber(league.maxMmr),
                };
            })
            .filter((league) => league.league > 0),
        players: players(row.players),
    };
}

export interface SeasonResultsUrlOptions {
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

const resultsPath = (production: boolean): string => (production ? "/v1/season-results" : "/v1/mm/season-results");

export function buildSeasonResultsListUrl(options: SeasonResultsUrlOptions = {}): string {
    const production = options.production ?? runtimeIsProduction();
    const baseUrl = (options.baseUrl ?? runtimeBaseUrl(production)).replace(/\/+$/, "");
    return `${baseUrl}${resultsPath(production)}`;
}

export function buildSeasonResultsDetailUrl(sequence: number, options: SeasonResultsUrlOptions = {}): string {
    if (!Number.isInteger(sequence) || sequence < 1) {
        throw new SeasonResultsNotFoundError("invalid_season");
    }
    return `${buildSeasonResultsListUrl(options)}/${sequence}`;
}

export class SeasonResultsNotFoundError extends Error {}

const getJson = async (url: string): Promise<unknown> => {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (response.status === 404) {
        throw new SeasonResultsNotFoundError("season_results_not_found");
    }
    if (!response.ok) {
        throw new Error(`Season results request failed with status ${response.status}`);
    }
    return response.json();
};

export async function fetchSeasonResultsList(): Promise<SeasonResultsList> {
    return normalizeSeasonResultsList(await getJson(buildSeasonResultsListUrl()));
}

export async function fetchSeasonResultsDetail(sequence: number): Promise<SeasonResultsDetail> {
    const detail = normalizeSeasonResultsDetail(await getJson(buildSeasonResultsDetailUrl(sequence)));
    if (!detail) {
        throw new Error("Season results response was malformed");
    }
    return detail;
}

/** `?season=N` on the results page; 0 when absent or invalid. */
export function seasonFromSearch(search: string): number {
    const raw = new URLSearchParams(search).get("season");
    const sequence = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(sequence) && sequence > 0 ? sequence : 0;
}
