import { LEGACY_SEASON_CURRENCY, normalizeSeasonCurrency, type SeasonCurrency } from "./season-currency";

/**
 * Public season results: the final tables of every CLOSED season. When a season ends the server returns
 * every pending stake, records each player's final currency and places, and zeroes the purses — these
 * endpoints serve what it recorded:
 *   GET /v1/season-results              every closed season, newest first, with the top of both tables
 *   GET /v1/season-results/:sequence    one season's players, in gold-table order
 * (development servers prefix the path with /mm, like every public ranked route.)
 *
 * A season has two tables over the same players: the GOLD table — its main result, places by final
 * balance — and the MMR table, the final rating ladder.
 *
 * A season can also have a prize pool. Its prize list is built from the gold table when the season closes,
 * stays provisional while a person checks it, and is then approved by a named admin; see /rules/prizes.
 */

export type SeasonResultsStatus = "upcoming" | "active" | "finished";

/** Which of a season's tables is shown: gold (the main one) or MMR. */
export type SeasonResultsView = "gold" | "mmr";

export interface SeasonResultsSeason {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
    status: SeasonResultsStatus;
    currency: SeasonCurrency;
    /** Whether this season plays for a prize pool. Known before the season starts. */
    hasPrizePool: boolean;
}

/** A prize list is provisional while a person checks it, then approved by a named admin. */
export type SeasonPrizeStatus = "review" | "approved";

/** One approved prize place: the place itself, and who holds it. */
export interface SeasonPrizePlace {
    place: number;
    playerId: string;
    username: string;
}

/**
 * A season's prize list, as much of it as the site may show: under review, only that and until when —
 * the places stay empty on purpose until the list is approved.
 */
export interface SeasonPrize {
    status: SeasonPrizeStatus;
    /** When the review ends (epoch ms); 0 = undated. */
    reviewUntil: number;
    places: SeasonPrizePlace[];
}

export interface SeasonResultsPlayer {
    /** Place in the gold table (final balance), 1-based; 0 = finished with an empty purse. */
    goldPlace: number;
    /** Place in the MMR table, 1-based; 0 = unranked (calibrating, or no games that season). */
    mmrPlace: number;
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
    /** Top of the gold table. */
    podium: SeasonResultsPlayer[];
    /** Top of the MMR table. */
    mmrPodium: SeasonResultsPlayer[];
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
    /** The prize list of a prize season; null when the season has none, or none was built yet. */
    prize: SeasonPrize | null;
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
        hasPrizePool: row.hasPrizePool === true,
    };
}

const prizePlaces = (value: unknown): SeasonPrizePlace[] =>
    (Array.isArray(value) ? value : [])
        .map((placeValue): SeasonPrizePlace | null => {
            const row = asRecord(placeValue);
            const place = wholeNumber(row.place);
            const playerId = asString(row.playerId);
            // A row without a place or a player can't be listed, so it's dropped rather than shown blank.
            if (!place || !playerId) {
                return null;
            }
            return { place, playerId, username: asString(row.username, "Unknown") };
        })
        .filter((place): place is SeasonPrizePlace => place !== null)
        .sort((left, right) => left.place - right.place);

/**
 * Tolerant: anything but a known status reads as no prize information at all, so an unexpected response
 * shows nothing instead of a half-filled block. Places are kept only once the list is approved — while
 * it is under review nothing about who holds a place is published.
 */
export function normalizeSeasonPrize(value: unknown): SeasonPrize | null {
    const row = asRecord(value);
    const status: SeasonPrizeStatus | null = row.status === "review" || row.status === "approved" ? row.status : null;
    if (!status) {
        return null;
    }
    return {
        status,
        reviewUntil: wholeNumber(row.reviewUntil),
        places: status === "approved" ? prizePlaces(row.places) : [],
    };
}

export function normalizeSeasonResultsPlayer(value: unknown): SeasonResultsPlayer | null {
    const row = asRecord(value);
    const playerId = asString(row.playerId);
    if (!playerId) {
        return null;
    }
    return {
        goldPlace: wholeNumber(row.goldPlace),
        mmrPlace: wholeNumber(row.mmrPlace),
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
                mmrPodium: players(entry.mmrPodium),
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
        prize: normalizeSeasonPrize(row.prize),
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

/**
 * The prize list the results page shows: only a prize season's own list. A season without a prize pool
 * shows nothing about prizes, whatever the response carries.
 */
export function seasonPrizeOf(detail: Pick<SeasonResultsDetail, "season" | "prize">): SeasonPrize | null {
    return detail.season.hasPrizePool ? detail.prize : null;
}

/** A player's place in `view`'s table; 0 = no place there. */
export function placeInView(player: SeasonResultsPlayer, view: SeasonResultsView): number {
    return view === "mmr" ? player.mmrPlace : player.goldPlace;
}

// Places first (ascending), then everyone without one.
const byPlace = (a: number, b: number): number => {
    if (a > 0 && b > 0) {
        return a - b;
    }
    return a > 0 === b > 0 ? 0 : a > 0 ? -1 : 1;
};

/**
 * The players in `view`'s table order, the order the server numbers them in: places first, then those
 * without one by the other table (MMR place for the gold table, balance for the MMR table), then id.
 */
export function playersInView(list: readonly SeasonResultsPlayer[], view: SeasonResultsView): SeasonResultsPlayer[] {
    return [...list].sort(
        (a, b) =>
            byPlace(placeInView(a, view), placeInView(b, view)) ||
            (view === "mmr" ? b.gold - a.gold : byPlace(a.mmrPlace, b.mmrPlace)) ||
            (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
    );
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

/** `?view=mmr` on the results page opens the MMR table; anything else shows the gold table. */
export function viewFromSearch(search: string): SeasonResultsView {
    return new URLSearchParams(search).get("view") === "mmr" ? "mmr" : "gold";
}
