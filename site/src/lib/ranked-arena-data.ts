export type ArenaTab = "players" | "games" | "leagues";
export type PlayerSort = "rank" | "player" | "rating" | "winRate" | "wins" | "streak" | "gold";
export type PlayerSortDirection = "asc" | "desc";
export type LiveGameStage = "pick" | "placement" | "fight";

export interface RankedPlayer {
    position: number;
    playerId: string;
    username: string;
    mmr: number;
    // Season currency balance ("Gold" on the test season): minted 1:1 with positive MMR movement.
    gold: number;
    league: number;
    leagueName: string;
    leaderboardRank: number;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    dcWins: number;
    dcLosses: number;
    winRatePct: number;
    winStreak: number;
    lossStreak: number;
    peakMmr: number;
    lastRankedGameAt: number;
    // The player's stored pre-game ban preference (0/"" = none).
    bannedCreatureId: number;
    bannedCreatureName: string;
}

export interface RankedTopResponse {
    computedAt: number;
    players: RankedPlayer[];
}

export interface RankedLeague {
    league: number;
    name: string;
    isTopLeague: boolean;
    playerCount: number;
    minMmr: number;
    maxMmr: number;
    players: RankedPlayer[];
}

/** A player still fighting through their placement games — no league or public MMR yet. */
export interface CalibratingPlayer {
    playerId: string;
    username: string;
    isBot: boolean;
    aiVersion: string;
    state: "calibration" | "recalibration";
    gamesPlayed: number;
    gamesRequired: number;
    wins: number;
    losses: number;
    draws: number;
    totalGames: number;
    winRatePct: number;
    gold: number;
}

export interface ArenaSeason {
    sequence: number;
    name: string;
    startsAt: number;
    endsAt: number;
    status: "upcoming" | "active" | "finished";
    currency: { name: string; symbol: string };
}

export interface RankedStandingsResponse {
    computedAt: number;
    // The active season this ladder belongs to (null = season-less/preseason) and the next one.
    season: ArenaSeason | null;
    nextSeason: ArenaSeason | null;
    activeCount: number;
    calibratingCount: number;
    collapsed: boolean;
    populationGate: number;
    inactivityDays: number;
    leagues: RankedLeague[];
    calibrating: CalibratingPlayer[];
}

export interface LiveGamePlayer {
    playerId: string;
    username: string;
    isBot: boolean;
    aiVersion: string | null;
    rankedBot: boolean;
    ranked: {
        state: string;
        mmr: number;
        league: number;
        leaderboardRank: number;
    } | null;
}

export interface LiveGame {
    gameId: string;
    stage: LiveGameStage;
    casual: boolean;
    observable: boolean;
    initTime: number;
    confirmedTime: number;
    pickEndTime: number;
    boardStartTime: number;
    players: LiveGamePlayer[];
}

export interface LiveGamesResponse {
    computedAt: number;
    count: number;
    games: LiveGame[];
}

export type LivePlayerRankedState = "placed" | "calibration" | "recalibration" | "unranked";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback = ""): string =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asInteger = (value: unknown, fallback = 0): number => Math.trunc(asNumber(value, fallback));

const asBoolean = (value: unknown): boolean => value === true;

const normalizePlayer = (value: unknown, fallbackPosition = 0): RankedPlayer | null => {
    const row = asRecord(value);
    const playerId = asString(row.playerId);
    if (!playerId) {
        return null;
    }

    const league = Math.max(0, asInteger(row.league));
    return {
        position: Math.max(0, asInteger(row.position, fallbackPosition)),
        playerId,
        username: asString(row.username, "Unknown player"),
        mmr: Math.max(0, asInteger(row.mmr)),
        gold: Math.max(0, asInteger(row.gold)),
        league,
        leagueName: asString(row.leagueName, league ? `League ${league}` : "Unranked"),
        leaderboardRank: Math.max(0, asInteger(row.leaderboardRank)),
        wins: Math.max(0, asInteger(row.wins)),
        losses: Math.max(0, asInteger(row.losses)),
        draws: Math.max(0, asInteger(row.draws)),
        totalGames: Math.max(0, asInteger(row.totalGames)),
        dcWins: Math.max(0, asInteger(row.dcWins)),
        dcLosses: Math.max(0, asInteger(row.dcLosses)),
        winRatePct: Math.max(0, Math.min(100, asNumber(row.winRatePct))),
        winStreak: Math.max(0, asInteger(row.winStreak)),
        lossStreak: Math.max(0, asInteger(row.lossStreak)),
        peakMmr: Math.max(0, asInteger(row.peakMmr)),
        lastRankedGameAt: Math.max(0, asInteger(row.lastRankedGameAt)),
        bannedCreatureId: Math.max(0, asInteger(row.bannedCreatureId)),
        bannedCreatureName: asString(row.bannedCreatureName),
    };
};

export function normalizeTopResponse(value: unknown): RankedTopResponse {
    const response = asRecord(value);
    const players = asArray(response.players)
        .map((player, index) => normalizePlayer(player, index + 1))
        .filter((player): player is RankedPlayer => player !== null);

    return {
        computedAt: Math.max(0, asInteger(response.computedAt)),
        players,
    };
}

export function normalizeStandingsResponse(value: unknown): RankedStandingsResponse {
    const response = asRecord(value);
    const leagues = asArray(response.leagues)
        .map((rawLeague): RankedLeague | null => {
            const leagueRow = asRecord(rawLeague);
            const league = Math.max(0, asInteger(leagueRow.league));
            if (!league) {
                return null;
            }
            const players = asArray(leagueRow.players)
                .map((player) => normalizePlayer(player))
                .filter((player): player is RankedPlayer => player !== null);
            return {
                league,
                name: asString(leagueRow.name, `League ${league}`),
                isTopLeague: asBoolean(leagueRow.isTopLeague),
                playerCount: Math.max(0, asInteger(leagueRow.playerCount)),
                minMmr: Math.max(0, asInteger(leagueRow.minMmr)),
                maxMmr: Math.max(0, asInteger(leagueRow.maxMmr)),
                players,
            };
        })
        .filter((league): league is RankedLeague => league !== null)
        .sort((a, b) => b.league - a.league);

    const calibrating = asArray(response.calibrating)
        .map((rawPlayer): CalibratingPlayer | null => {
            const row = asRecord(rawPlayer);
            const playerId = asString(row.playerId);
            if (!playerId) {
                return null;
            }
            const progress = asRecord(row.calibration);
            return {
                playerId,
                username: asString(row.username, "Unknown player"),
                isBot: asBoolean(row.isBot),
                aiVersion: row.aiVersion === null ? "" : asString(row.aiVersion),
                state: asString(row.state) === "recalibration" ? "recalibration" : "calibration",
                gamesPlayed: Math.max(0, asInteger(progress.gamesPlayed)),
                gamesRequired: Math.max(1, asInteger(progress.required) || 5),
                wins: Math.max(0, asInteger(row.wins)),
                losses: Math.max(0, asInteger(row.losses)),
                draws: Math.max(0, asInteger(row.draws)),
                totalGames: Math.max(0, asInteger(row.totalGames)),
                winRatePct: Math.max(0, asNumber(row.winRatePct)),
                gold: Math.max(0, asInteger(row.gold)),
            };
        })
        .filter((player): player is CalibratingPlayer => player !== null);

    return {
        computedAt: Math.max(0, asInteger(response.computedAt)),
        season: normalizeArenaSeason(response.season),
        nextSeason: normalizeArenaSeason(response.nextSeason),
        activeCount: Math.max(0, asInteger(response.activeCount)),
        calibratingCount: Math.max(0, asInteger(response.calibratingCount)),
        collapsed: asBoolean(response.collapsed),
        populationGate: Math.max(0, asInteger(response.populationGate)),
        inactivityDays: Math.max(0, asInteger(response.inactivityDays)),
        leagues,
        calibrating,
    };
}

export function normalizeArenaSeason(value: unknown): ArenaSeason | null {
    if (value === null || value === undefined) {
        return null;
    }
    const row = asRecord(value);
    const sequence = Math.max(0, asInteger(row.sequence));
    const name = asString(row.name);
    if (!sequence || !name) {
        return null;
    }
    const status = asString(row.status);
    const currency = asRecord(row.currency);
    return {
        sequence,
        name,
        startsAt: Math.max(0, asInteger(row.startsAt)),
        endsAt: Math.max(0, asInteger(row.endsAt)),
        status: status === "upcoming" || status === "finished" ? status : "active",
        currency: { name: asString(currency.name, "Coins"), symbol: asString(currency.symbol, "CN") },
    };
}

const normalizeLivePlayer = (value: unknown): LiveGamePlayer | null => {
    const player = asRecord(value);
    const playerId = asString(player.playerId);
    if (!playerId) {
        return null;
    }
    const rawRanked = player.ranked === null ? null : asRecord(player.ranked);
    const hasRanked = rawRanked !== null && Object.keys(rawRanked).length > 0;
    const rankedMmr = Math.max(0, asInteger(rawRanked?.mmr));
    const rankedLeague = Math.max(0, asInteger(rawRanked?.league));
    const rankedState = asString(rawRanked?.state);
    return {
        playerId,
        username: asString(player.username, "Unknown player"),
        isBot: asBoolean(player.isBot),
        aiVersion: player.aiVersion === null ? null : asString(player.aiVersion) || null,
        rankedBot: asBoolean(player.rankedBot),
        ranked: hasRanked
            ? {
                  // Older live-game payloads omitted `state`. A visible MMR/league is conclusive
                  // placed-player data and must never be presented as calibration.
                  state: rankedState || (rankedMmr > 0 || rankedLeague > 0 ? "placed" : "unranked"),
                  mmr: rankedMmr,
                  league: rankedLeague,
                  leaderboardRank: Math.max(0, asInteger(rawRanked.leaderboardRank)),
              }
            : null,
    };
};

const LIVE_GAME_STAGES = new Set<LiveGameStage>(["pick", "placement", "fight"]);

export function normalizeLiveGamesResponse(value: unknown): LiveGamesResponse {
    const response = asRecord(value);
    const games = asArray(response.games)
        .map((rawGame): LiveGame | null => {
            const game = asRecord(rawGame);
            const gameId = asString(game.gameId);
            const stage = asString(game.stage) as LiveGameStage;
            if (!gameId || !LIVE_GAME_STAGES.has(stage)) {
                return null;
            }
            return {
                gameId,
                stage,
                casual: asBoolean(game.casual),
                observable: asBoolean(game.observable),
                initTime: Math.max(0, asInteger(game.initTime)),
                confirmedTime: Math.max(0, asInteger(game.confirmedTime)),
                pickEndTime: Math.max(0, asInteger(game.pickEndTime)),
                boardStartTime: Math.max(0, asInteger(game.boardStartTime)),
                players: asArray(game.players)
                    .map(normalizeLivePlayer)
                    .filter((player): player is LiveGamePlayer => player !== null)
                    .slice(0, 2),
            };
        })
        .filter((game): game is LiveGame => game !== null)
        .sort((a, b) => b.initTime - a.initTime);

    return {
        computedAt: Math.max(0, asInteger(response.computedAt)),
        count: games.length,
        games,
    };
}

export function livePlayerRankedState(player: LiveGamePlayer): LivePlayerRankedState {
    const state = player.ranked?.state;
    if (state === "placed" || state === "calibration" || state === "recalibration") {
        return state;
    }
    return player.ranked && (player.ranked.mmr > 0 || player.ranked.league > 0) ? "placed" : "unranked";
}

const searchable = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .trim();

const matchesQuery = (haystack: string, query: string): boolean => {
    const terms = searchable(query).split(/\s+/).filter(Boolean);
    const normalizedHaystack = searchable(haystack);
    return terms.every((term) => normalizedHaystack.includes(term));
};

export function filterRankedPlayers(
    players: RankedPlayer[],
    options: { query?: string; league?: number; sort?: PlayerSort; direction?: PlayerSortDirection } = {},
): RankedPlayer[] {
    const query = options.query ?? "";
    const league = options.league ?? 0;
    const filtered = players.filter(
        (player) =>
            (!league || player.league === league) &&
            matchesQuery(`${player.username} ${player.playerId} ${player.leagueName}`, query),
    );

    const byRank = (a: RankedPlayer, b: RankedPlayer): number => {
        const aRank = a.position || a.leaderboardRank || Number.MAX_SAFE_INTEGER;
        const bRank = b.position || b.leaderboardRank || Number.MAX_SAFE_INTEGER;
        return aRank - bRank || b.mmr - a.mmr || a.username.localeCompare(b.username);
    };

    const sort = options.sort ?? "rank";
    const direction = options.direction ?? defaultPlayerSortDirection(sort);
    const directed = (comparison: number): number => (direction === "asc" ? comparison : -comparison);
    const streakScore = (player: RankedPlayer): number => player.winStreak || -player.lossStreak;

    return filtered.sort((a, b) => {
        switch (sort) {
            case "player":
                return directed(a.username.localeCompare(b.username)) || byRank(a, b);
            case "rating":
                return directed(a.mmr - b.mmr) || byRank(a, b);
            case "winRate":
                return directed(a.winRatePct - b.winRatePct) || directed(a.totalGames - b.totalGames) || byRank(a, b);
            case "wins":
                return directed(a.wins - b.wins) || byRank(a, b);
            case "streak":
                return directed(streakScore(a) - streakScore(b)) || byRank(a, b);
            case "gold":
                return directed(a.gold - b.gold) || byRank(a, b);
            default:
                return direction === "asc" ? byRank(a, b) : -byRank(a, b);
        }
    });
}

export function defaultPlayerSortDirection(sort: PlayerSort): PlayerSortDirection {
    return sort === "rank" || sort === "player" ? "asc" : "desc";
}

export function filterLiveGames(
    games: LiveGame[],
    options: { query?: string; stage?: LiveGameStage | "all" } = {},
): LiveGame[] {
    const query = options.query ?? "";
    const stage = options.stage ?? "all";
    return games.filter((game) => {
        if (stage !== "all" && game.stage !== stage) {
            return false;
        }
        const playerTerms = game.players
            .map((player) => `${player.username} ${player.playerId} ${player.aiVersion ?? ""}`)
            .join(" ");
        return matchesQuery(`${game.gameId} ${game.stage} ${playerTerms}`, query);
    });
}

export function playersInLeague(league: RankedLeague): RankedPlayer[] {
    return [...league.players].sort((a, b) => b.mmr - a.mmr || a.username.localeCompare(b.username));
}

export function filterLeagues(leagues: RankedLeague[], query = ""): RankedLeague[] {
    return leagues.filter((league) => {
        const players = playersInLeague(league);
        return matchesQuery(
            `${league.name} League ${league.league} ${players.map((player) => player.username).join(" ")}`,
            query,
        );
    });
}

export function playerInitials(username: string): string {
    const parts = username.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
        return "?";
    }
    return parts
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toLocaleUpperCase();
}

export function relativeArenaTime(timestamp: number, now = Date.now()): string {
    if (!timestamp) {
        return "";
    }
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 60) {
        return "now";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${hours}h`;
    }
    return `${Math.floor(hours / 24)}d`;
}
