import {
    filterLeagues,
    filterLiveGames,
    filterRankedPlayers,
    normalizeLiveGamesResponse,
    normalizeStandingsResponse,
    normalizeTopResponse,
    type CalibratingPlayer,
    playerInitials,
    playersInLeague,
    relativeArenaTime,
    type ArenaTab,
    type LiveGame,
    type LiveGamePlayer,
    type LiveGamesResponse,
    type LiveGameStage,
    type PlayerSort,
    type RankedLeague,
    type RankedPlayer,
    type RankedStandingsResponse,
    type RankedTopResponse,
} from "./ranked-arena-data";
import { rankedArenaCopy } from "./ranked-arena-copy";
import { initHeroLeaderboard, type HeroLeaderboardController } from "./hero-leaderboard-client";

type ArenaResource = "top" | "standings" | "games";

interface ArenaState {
    tab: ArenaTab;
    query: string;
    filters: Record<ArenaTab, string>;
    sort: PlayerSort;
    selectedPlayerId: string;
    visibleGames: number;
    top?: RankedTopResponse;
    standings?: RankedStandingsResponse;
    games?: LiveGamesResponse;
    cached: Set<ArenaResource>;
    errors: Set<ArenaResource>;
    loading: Set<ArenaResource>;
    lastSuccessfulAt: number;
}

interface CacheEnvelope {
    version: number;
    savedAt: number;
    data: unknown;
}

const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const LIVE_REFRESH_MS = 15_000;
const LADDER_REFRESH_MS = 120_000;
const CACHE_PREFIX = "hoc:ranked-arena:v1:";
const GAMES_PAGE_SIZE_MOBILE = 4;
const GAMES_PAGE_SIZE_TABLET = 8;
const GAMES_PAGE_SIZE_DESKTOP = 12;

const gamesPageSize = (): number => {
    const viewportWidth = globalThis.innerWidth;
    if (viewportWidth <= 720) return GAMES_PAGE_SIZE_MOBILE;
    if (viewportWidth <= 1100) return GAMES_PAGE_SIZE_TABLET;
    return GAMES_PAGE_SIZE_DESKTOP;
};

const runtimeHost = globalThis.location?.hostname ?? "";
const isProduction =
    runtimeHost === "heroesofcrypto.io" ||
    runtimeHost.endsWith(".heroesofcrypto.io") ||
    import.meta.env.PROD === true ||
    import.meta.env.VITE_IS_PROD === "true";

// Single-box rigs: VITE_ARENA_SAME_HOST_API_PORT pins every arena API call to the HOSTNAME the
// site was served from (protocol preserved, only the port swapped), and VITE_ARENA_SAME_HOST_GAME_PORT
// does the same for links into the game client. One build then works identically from the LAN IP, a
// public DNS name, or a tunnel — no per-hostname origin rebakes. Absolute VITE_HOST_* overrides and
// the production defaults still apply when these ports are unset.
const sameHostOrigin = (port: string | number | undefined): string | undefined => {
    if (!port || typeof globalThis.location === "undefined") {
        return undefined;
    }
    return `${globalThis.location.protocol}//${globalThis.location.hostname}:${port}`;
};
const sameHostApiOrigin = sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined);
const sameHostGameOrigin = sameHostOrigin(import.meta.env.VITE_ARENA_SAME_HOST_GAME_PORT as string | undefined);

const matchmakingBaseUrl = String(
    sameHostApiOrigin ||
        import.meta.env.VITE_HOST_MATCHMAKING_API ||
        import.meta.env.VITE_MATCHMAKING_API ||
        (isProduction ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
).replace(/\/+$/, "");

const gameApiBaseUrl = String(
    sameHostApiOrigin ||
        import.meta.env.VITE_HOST_GAME_API ||
        import.meta.env.VITE_GAME_API ||
        (isProduction ? "https://game.heroesofcrypto.io" : "http://localhost:3001"),
).replace(/\/+$/, "");

const rawGameClientUrl = String(
    sameHostGameOrigin ||
        import.meta.env.VITE_GAME_CLIENT_RANKED ||
        import.meta.env.VITE_GAME_CLIENT ||
        import.meta.env.VITE_HOST_GAME_CLIENT ||
        (isProduction ? "https://beta.heroesofcrypto.io" : "http://localhost:5174"),
).replace(/\/+$/, "");

export const gameClientRoot = rawGameClientUrl.replace(/\/play$/, "");

const endpointByResource: Record<ArenaResource, string> = {
    top: `${matchmakingBaseUrl}${isProduction ? "/v1/ranked-top?n=100" : "/v1/mm/ranked-top?n=100"}`,
    standings: `${matchmakingBaseUrl}${isProduction ? "/v1/ranked-standings" : "/v1/mm/ranked-standings"}`,
    games: `${gameApiBaseUrl}${isProduction ? "/v1/games-live" : "/v1/game/games-live"}`,
};

const normalizeByResource = {
    top: normalizeTopResponse,
    standings: normalizeStandingsResponse,
    games: normalizeLiveGamesResponse,
} satisfies Record<ArenaResource, (value: unknown) => unknown>;

const numberFormatter = new Intl.NumberFormat();

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text) {
        element.textContent = text;
    }
    return element;
};

const append = <T extends ParentNode>(parent: T, ...children: Array<Node | null | undefined | false>): T => {
    parent.append(...children.filter((child): child is Node => child instanceof Node));
    return parent;
};

const replaceTemplate = (template: string, values: Record<string, string | number>): string =>
    Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);

const readCache = (resource: ArenaResource): unknown | undefined => {
    try {
        const raw = localStorage.getItem(`${CACHE_PREFIX}${resource}`);
        if (!raw) {
            return undefined;
        }
        const envelope = JSON.parse(raw) as Partial<CacheEnvelope>;
        if (
            envelope.version !== CACHE_VERSION ||
            typeof envelope.savedAt !== "number" ||
            Date.now() - envelope.savedAt > CACHE_MAX_AGE_MS
        ) {
            localStorage.removeItem(`${CACHE_PREFIX}${resource}`);
            return undefined;
        }
        return envelope.data;
    } catch {
        return undefined;
    }
};

const writeCache = (resource: ArenaResource, data: unknown): void => {
    try {
        const envelope: CacheEnvelope = { version: CACHE_VERSION, savedAt: Date.now(), data };
        localStorage.setItem(`${CACHE_PREFIX}${resource}`, JSON.stringify(envelope));
    } catch {
        // Storage may be unavailable in privacy mode; the live request remains authoritative.
    }
};

const fetchJson = async (url: string): Promise<unknown> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Arena request failed with status ${response.status}`);
        }
        return await response.json();
    } finally {
        window.clearTimeout(timeout);
    }
};

const setResourceData = (state: ArenaState, resource: ArenaResource, data: unknown): void => {
    if (resource === "top") {
        state.top = data as RankedTopResponse;
    } else if (resource === "standings") {
        state.standings = data as RankedStandingsResponse;
    } else {
        state.games = data as LiveGamesResponse;
    }
};

const allRankedPlayers = (state: ArenaState): RankedPlayer[] => {
    const byId = new Map<string, RankedPlayer>();
    const orderedFromStandings =
        state.standings?.leagues.flatMap((league) => playersInLeague(league)).sort((a, b) => b.mmr - a.mmr) ?? [];

    orderedFromStandings.forEach((player, index) => {
        byId.set(player.playerId, { ...player, position: index + 1 });
    });
    for (const player of state.top?.players ?? []) {
        const existing = byId.get(player.playerId);
        byId.set(player.playerId, { ...existing, ...player, position: player.position || existing?.position || 0 });
    }

    return [...byId.values()].sort((a, b) => {
        const aRank = a.position || Number.MAX_SAFE_INTEGER;
        const bRank = b.position || Number.MAX_SAFE_INTEGER;
        return aRank - bRank || b.mmr - a.mmr;
    });
};

const localizedLeague = (copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy], league: number): string =>
    replaceTemplate(copy.leagueTemplate, { n: league });

const localizedRelativeTime = (
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    timestamp: number,
): string => {
    const relative = relativeArenaTime(timestamp);
    if (!relative) return "";
    if (relative === "now") return copy.timeNow;
    const value = Number.parseInt(relative, 10);
    if (relative.endsWith("m")) return replaceTemplate(copy.timeMinutes, { n: value });
    if (relative.endsWith("h")) return replaceTemplate(copy.timeHours, { n: value });
    return replaceTemplate(copy.timeDays, { n: value });
};

const labelFromTemplate = (template: string, placeholder: string): string =>
    template
        .replace(`{${placeholder}}`, "")
        .replace(/^[\s:–-]+|[\s:–-]+$/g, "")
        .trim();

const localizedStage = (copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy], stage: LiveGameStage): string => {
    if (stage === "pick") return copy.pickStage;
    if (stage === "placement") return copy.placementStage;
    return copy.fightStage;
};

const createEmptyState = (title: string, body = ""): HTMLElement => {
    const empty = el("div", "ranked-arena__empty");
    append(empty, el("strong", "", title), body ? el("p", "", body) : null);
    return empty;
};

const createSkeleton = (): HTMLElement => {
    const skeleton = el("div", "ranked-arena__skeleton");
    skeleton.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 5; index += 1) {
        append(skeleton, el("span"));
    }
    return skeleton;
};

const createErrorState = (copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy]): HTMLElement => {
    const error = el("div", "ranked-arena__empty ranked-arena__empty--error");
    const retry = el("button", "ranked-arena__retry", copy.retry);
    retry.type = "button";
    retry.dataset.arenaRetry = "";
    append(error, el("strong", "", copy.errorTitle), el("p", "", copy.errorBody), retry);
    return error;
};

const createAvatar = (username: string, league: number): HTMLElement => {
    const avatar = el("span", "ranked-arena__avatar", playerInitials(username));
    avatar.dataset.league = String(league);
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
};

const createBadge = (text: string, modifier = ""): HTMLElement =>
    el("span", `ranked-arena__badge${modifier ? ` ranked-arena__badge--${modifier}` : ""}`, text);

const streakText = (copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy], player: RankedPlayer): string => {
    if (player.winStreak > 0) {
        return replaceTemplate(copy.winStreak, { n: player.winStreak });
    }
    if (player.lossStreak > 0) {
        return replaceTemplate(copy.lossStreak, { n: player.lossStreak });
    }
    return copy.noStreak;
};

const playerProfileHref = (
    lang: "en" | "ru",
    playerId: string,
    summary: Record<string, string | number | undefined>,
): string => {
    const params = new URLSearchParams({ playerId });
    for (const [key, value] of Object.entries(summary)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return `${lang === "ru" ? "/ru/profile/" : "/profile/"}?${params.toString()}`;
};

const rankedPlayerProfileHref = (lang: "en" | "ru", player: RankedPlayer): string =>
    playerProfileHref(lang, player.playerId, {
        username: player.username,
        state: "placed",
        mmr: player.mmr,
        league: player.league,
        rank: player.position || player.leaderboardRank,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        games: player.totalGames,
        winRate: player.winRatePct,
        peakMmr: player.peakMmr,
        winStreak: player.winStreak,
        lossStreak: player.lossStreak,
        lastBattle: player.lastRankedGameAt,
    });

const calibratingPlayerProfileHref = (lang: "en" | "ru", player: CalibratingPlayer): string =>
    playerProfileHref(lang, player.playerId, {
        username: player.username,
        state: player.state,
        wins: player.wins,
        losses: player.losses,
        draws: player.draws,
        games: player.totalGames,
        winRate: player.winRatePct,
        calibrationPlayed: player.gamesPlayed,
        calibrationRequired: player.gamesRequired,
    });

const livePlayerProfileHref = (lang: "en" | "ru", player: LiveGamePlayer): string =>
    playerProfileHref(lang, player.playerId, {
        username: player.username,
        state: player.ranked?.state ?? (player.rankedBot ? "calibration" : undefined),
        mmr: player.ranked?.mmr,
        league: player.ranked?.league,
        rank: player.ranked?.leaderboardRank,
    });

const createPlayerDossier = (
    player: RankedPlayer,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    dossierId: string,
): HTMLElement => {
    const dossier = el("span", "ranked-arena__player-dossier");
    dossier.id = dossierId;
    dossier.setAttribute("role", "tooltip");
    const metric = (label: string, value: string): HTMLElement => {
        const node = el("span");
        return append(node, el("small", "", label), el("strong", "", value));
    };
    append(
        dossier,
        metric(copy.gamesPlayed, numberFormatter.format(player.totalGames)),
        metric(copy.peakRating, numberFormatter.format(player.peakMmr || player.mmr)),
        metric(copy.currentStreak, streakText(copy, player)),
        metric(copy.lastBattle, player.lastRankedGameAt ? localizedRelativeTime(copy, player.lastRankedGameAt) : "—"),
    );
    return dossier;
};

const renderPlayerDetail = (
    player: RankedPlayer,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
    profileHref: string,
): HTMLElement => {
    const detail = el("aside", "ranked-arena__player-detail");
    detail.setAttribute("aria-live", "polite");

    const identity = el("div", "ranked-arena__detail-identity");
    const name = el("div");
    append(
        name,
        el("span", "ranked-arena__detail-kicker", `#${player.position || player.leaderboardRank || "—"}`),
        el("h3", "", player.username),
        el("p", "", localizedLeague(copy, player.league)),
    );
    append(identity, createAvatar(player.username, player.league), name);

    const rating = el("div", "ranked-arena__detail-rating");
    append(
        rating,
        el("span", "", copy.rating),
        el("strong", "", numberFormatter.format(player.mmr)),
        player.peakMmr ? el("small", "", `${copy.peakRating} ${numberFormatter.format(player.peakMmr)}`) : null,
    );

    const stats = el("dl", "ranked-arena__detail-stats");
    const stat = (label: string, value: string): HTMLElement => {
        const row = el("div");
        append(row, el("dt", "", label), el("dd", "", value));
        return row;
    };
    append(
        stats,
        stat(copy.record, `${player.wins}–${player.losses}–${player.draws}`),
        stat(copy.winRate, `${player.winRatePct.toFixed(1).replace(/\.0$/, "")}%`),
        stat(copy.currentStreak, streakText(copy, player)),
        stat(
            copy.lastBattle,
            player.lastRankedGameAt
                ? new Intl.DateTimeFormat(lang, { month: "short", day: "numeric" }).format(player.lastRankedGameAt)
                : "—",
        ),
    );

    const profile = el("a", "ranked-arena__detail-action", copy.viewProfile);
    profile.href = profileHref;
    append(detail, identity, rating, stats, profile);
    return detail;
};

// Players still in their placement games: listed with progress instead of a rating, so a fresh
// ladder (everyone calibrating) reads as a busy arena rather than an empty one.
const renderCalibratingSection = (
    players: CalibratingPlayer[],
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
): HTMLElement => {
    const section = el("div", "ranked-arena__calibrating");
    const heading = el("h4", "ranked-arena__calibrating-heading", `${copy.calibratingHeading} · ${players.length}`);
    const list = el("div", "ranked-arena__player-list");
    for (const player of players) {
        const row = el("a", "ranked-arena__player-row ranked-arena__player-row--calibrating");
        row.href = calibratingPlayerProfileHref(lang, player);
        const progressText =
            replaceTemplate(copy.calibratingProgress, {
                played: player.gamesPlayed,
                required: player.gamesRequired,
            }) + (player.state === "recalibration" ? ` · ${copy.recalibratingBadge}` : "");
        const identity = el("span", "ranked-arena__player-identity");
        const identityText = el("span");
        append(identityText, el("strong", "", player.username), el("small", "", progressText));
        append(identity, createAvatar(player.username, 0), identityText);
        append(
            row,
            el("span", "ranked-arena__rank", "…"),
            identity,
            el("strong", "ranked-arena__row-rating", "—"),
            el("span", "ranked-arena__row-record", `${player.wins}–${player.losses}–${player.draws}`),
            el(
                "span",
                "ranked-arena__row-rate",
                player.totalGames ? `${player.winRatePct.toFixed(1).replace(/\.0$/, "")}%` : "—",
            ),
        );
        append(list, row);
    }
    append(section, heading, list);
    return section;
};

const renderPlayers = (
    state: ArenaState,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
): HTMLElement => {
    const source = allRankedPlayers(state);
    const leagueFilter = Number(state.filters.players) || 0;
    const queryNeedle = state.query.trim().toLowerCase();
    // Calibrating players have no league yet, so they only appear under the "all leagues" filter;
    // the search box still narrows them by name.
    const calibrating =
        leagueFilter === 0
            ? (state.standings?.calibrating ?? []).filter(
                  (player) => !queryNeedle || player.username.toLowerCase().includes(queryNeedle),
              )
            : [];
    if (!source.length && !calibrating.length) {
        if (state.loading.has("top") || state.loading.has("standings")) return createSkeleton();
        if (state.errors.has("top") && state.errors.has("standings")) return createErrorState(copy);
        return createEmptyState(copy.noPlayers);
    }

    const players = source.length
        ? filterRankedPlayers(source, { query: state.query, league: leagueFilter, sort: state.sort })
        : [];
    if (!players.length && !calibrating.length) {
        return createEmptyState(copy.noPlayers);
    }

    if (players.length && !players.some((player) => player.playerId === state.selectedPlayerId)) {
        state.selectedPlayerId = players[0].playerId;
    }
    const selected = players.length
        ? (players.find((player) => player.playerId === state.selectedPlayerId) ?? players[0])
        : undefined;

    const layout = el("div", "ranked-arena__player-layout");
    const table = el("div", "ranked-arena__player-table");
    if (!players.length) {
        append(table, renderCalibratingSection(calibrating, copy, lang));
        append(layout, table);
        return layout;
    }
    const heading = el("div", "ranked-arena__table-heading");
    append(
        heading,
        el("span", "", copy.position),
        el("span", "", copy.player),
        el("span", "", copy.rating),
        el("span", "", copy.record),
        el("span", "", copy.winRate),
    );
    const list = el("div", "ranked-arena__player-list");

    for (const [index, player] of players.entries()) {
        const row = el("a", "ranked-arena__player-row");
        row.href = rankedPlayerProfileHref(lang, player);
        row.dataset.playerId = player.playerId;
        row.dataset.selected = String(player.playerId === selected!.playerId);
        row.setAttribute(
            "aria-label",
            `${player.username}, ${localizedLeague(copy, player.league)}, ${player.mmr} ${copy.rating}`,
        );

        const rank = el("span", "ranked-arena__rank", `#${player.position || player.leaderboardRank || "—"}`);
        const identity = el("span", "ranked-arena__player-identity");
        const identityText = el("span");
        append(
            identityText,
            el("strong", "", player.username),
            el("small", "", localizedLeague(copy, player.league)),
        );
        append(identity, createAvatar(player.username, player.league), identityText);
        const dossierId = `ranked-arena-dossier-${index + 1}`;
        row.setAttribute("aria-describedby", dossierId);
        append(
            row,
            rank,
            identity,
            el("strong", "ranked-arena__row-rating", numberFormatter.format(player.mmr)),
            el("span", "ranked-arena__row-record", `${player.wins}–${player.losses}–${player.draws}`),
            el("span", "ranked-arena__row-rate", `${player.winRatePct.toFixed(1).replace(/\.0$/, "")}%`),
            createPlayerDossier(player, copy, dossierId),
        );
        append(list, row);
    }

    append(table, heading, list);
    if (calibrating.length) {
        append(table, renderCalibratingSection(calibrating, copy, lang));
    }
    append(layout, table, renderPlayerDetail(selected!, copy, lang, rankedPlayerProfileHref(lang, selected!)));
    return layout;
};

const renderGameSeat = (
    game: LiveGame,
    index: number,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
    gameIndex: number,
): HTMLElement => {
    const player = game.players[index];
    if (!player) {
        const seat = el("div", "ranked-arena__game-seat ranked-arena__game-seat--empty");
        append(seat, createAvatar("?", 0), el("strong", "", "—"));
        return seat;
    }

    const seat = el("a", "ranked-arena__game-seat");
    seat.href = livePlayerProfileHref(lang, player);
    seat.title = copy.viewProfile;
    seat.setAttribute("aria-label", `${copy.viewProfile}: ${player.username}`);
    const identity = el("div");
    const ranked = player.ranked;
    const aiLabel = replaceTemplate(copy.aiLabel, { version: player.aiVersion ?? "" }).trim();
    const stateLabel =
        ranked?.state === "recalibration"
            ? copy.recalibratingBadge
            : ranked?.state === "calibration" || player.rankedBot
              ? copy.calibratingHeading
              : ranked?.league
                ? localizedLeague(copy, ranked.league)
                : player.isBot
                  ? aiLabel
                  : copy.unranked;
    const meta = ranked?.mmr
        ? `${ranked.leaderboardRank ? `#${ranked.leaderboardRank} · ` : ""}${numberFormatter.format(ranked.mmr)} MMR`
        : player.isBot && player.aiVersion
          ? `${stateLabel} · ${player.aiVersion}`
          : stateLabel;
    append(identity, el("strong", "", player.username), el("span", "", meta));
    append(seat, createAvatar(player.username, player.ranked?.league ?? 0), identity);

    const dossierId = `ranked-arena-game-${gameIndex + 1}-seat-${index + 1}`;
    const dossier = el("span", "ranked-arena__game-dossier");
    dossier.id = dossierId;
    dossier.setAttribute("role", "tooltip");
    seat.setAttribute("aria-describedby", dossierId);
    const metric = (label: string, value: string): HTMLElement => {
        const node = el("span");
        return append(node, el("small", "", label), el("strong", "", value));
    };
    append(
        dossier,
        metric(copy.rating, ranked?.mmr ? numberFormatter.format(ranked.mmr) : "—"),
        metric(copy.ladderRank, ranked?.leaderboardRank ? `#${ranked.leaderboardRank}` : "—"),
        metric(
            labelFromTemplate(copy.leagueTemplate, "n"),
            ranked?.league ? localizedLeague(copy, ranked.league) : "—",
        ),
        metric(copy.rankedStatus, player.isBot && !ranked?.league ? aiLabel : stateLabel),
    );
    append(seat, dossier);
    return seat;
};

const stageStartedAt = (game: LiveGame): number => {
    if (game.stage === "fight") {
        return game.boardStartTime || game.pickEndTime || game.confirmedTime || game.initTime;
    }
    if (game.stage === "placement") {
        return game.pickEndTime || game.confirmedTime || game.initTime;
    }
    return game.confirmedTime || game.initTime;
};

const renderGames = (
    state: ArenaState,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
): HTMLElement => {
    if (!state.games) {
        if (state.loading.has("games")) return createSkeleton();
        if (state.errors.has("games")) return createErrorState(copy);
        return createEmptyState(copy.noGames);
    }

    const stageFilter = state.filters.games as LiveGameStage | "all";
    const stagePriority: Record<LiveGameStage, number> = { fight: 0, placement: 1, pick: 2 };
    const queryMatches = filterLiveGames(state.games.games, { query: state.query, stage: "all" });
    const games = filterLiveGames(queryMatches, { stage: stageFilter }).sort(
        (a, b) =>
            Number(b.observable) - Number(a.observable) ||
            stagePriority[a.stage] - stagePriority[b.stage] ||
            b.initTime - a.initTime,
    );
    if (!games.length) {
        return createEmptyState(copy.noGames);
    }

    const wrapper = el("div", "ranked-arena__games-feed");
    const overview = el("div", "ranked-arena__games-overview");
    const liveCount = el("span", "ranked-arena__games-live-count");
    append(
        liveCount,
        el("i"),
        el("strong", "", numberFormatter.format(queryMatches.length)),
        document.createTextNode(copy.live),
    );
    const stageCounts = el("div", "ranked-arena__stage-counts");
    for (const stage of ["fight", "placement", "pick"] as const) {
        const count = queryMatches.filter((game) => game.stage === stage).length;
        const chip = el("button", "ranked-arena__stage-count");
        chip.type = "button";
        chip.dataset.gameStageFilter = stage;
        chip.dataset.stage = stage;
        chip.setAttribute("aria-pressed", String(stageFilter === stage));
        append(chip, el("i"), el("span", "", localizedStage(copy, stage)), el("strong", "", String(count)));
        append(stageCounts, chip);
    }
    append(overview, liveCount, stageCounts);

    const grid = el("div", "ranked-arena__games");
    const visibleGames = games.slice(0, state.visibleGames);
    for (const [gameIndex, game] of visibleGames.entries()) {
        const card = el("article", "ranked-arena__game-card");
        card.dataset.stage = game.stage;
        card.dataset.observable = String(game.observable);
        card.title = game.gameId;

        const header = el("div", "ranked-arena__game-header");
        const badges = el("div", "ranked-arena__game-badges");
        append(badges, createBadge(localizedStage(copy, game.stage), game.stage));
        if (game.casual) append(badges, createBadge(copy.casualGame, "casual"));

        const liveMeta = el("span", "ranked-arena__game-live");
        const relative = localizedRelativeTime(copy, stageStartedAt(game));
        const time = el("time", "", relative || copy.live);
        if (stageStartedAt(game)) time.dateTime = new Date(stageStartedAt(game)).toISOString();
        append(liveMeta, el("i"), time);
        append(header, badges, liveMeta);
        if (game.observable) {
            const watch = el("a", "ranked-arena__watch", copy.watchLive);
            watch.href = `${gameClientRoot}/game/${encodeURIComponent(game.gameId)}`;
            watch.setAttribute(
                "aria-label",
                `${copy.watchLive}: ${game.players.map((player) => player.username).join(" vs ")}`,
            );
            append(watch, el("span", "", "↗"));
            append(header, watch);
        } else {
            const waiting = el("span", "ranked-arena__watch-waiting", copy.notWatchable);
            waiting.title = copy.notWatchable;
            append(header, waiting);
        }

        const matchup = el("div", "ranked-arena__matchup");
        append(
            matchup,
            renderGameSeat(game, 0, copy, lang, gameIndex),
            el("span", "ranked-arena__versus", copy.versus),
            renderGameSeat(game, 1, copy, lang, gameIndex),
        );
        append(card, header, matchup, el("span", "sr-only", game.gameId));
        append(grid, card);
    }

    append(wrapper, overview, grid);
    const remaining = games.length - visibleGames.length;
    if (remaining > 0) {
        const increment = Math.min(gamesPageSize(), remaining);
        const more = el(
            "button",
            "ranked-arena__games-more",
            replaceTemplate(copy.showMoreGames, { n: increment, remaining }),
        );
        more.type = "button";
        more.dataset.gamesMore = "";
        append(wrapper, more);
    }
    return wrapper;
};

const renderLeaguePlayer = (player: RankedPlayer, position: number, lang: "en" | "ru"): HTMLElement => {
    const row = el("li", "ranked-arena__league-player");
    const link = el("a", "ranked-arena__league-player-link");
    link.href = rankedPlayerProfileHref(lang, player);
    link.setAttribute("aria-label", `${player.username}, ${numberFormatter.format(player.mmr)}`);
    const dossierId = `ranked-arena-league-${player.league}-${position + 1}`;
    link.setAttribute("aria-describedby", dossierId);
    append(
        link,
        el("span", "ranked-arena__league-rank", `#${player.position || position + 1}`),
        createAvatar(player.username, player.league),
        el("strong", "", player.username),
        el("span", "", numberFormatter.format(player.mmr)),
        createPlayerDossier(player, rankedArenaCopy[lang], dossierId),
    );
    append(row, link);
    return row;
};

const renderLeagues = (
    state: ArenaState,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
): HTMLElement => {
    if (!state.standings) {
        if (state.loading.has("standings")) return createSkeleton();
        if (state.errors.has("standings")) return createErrorState(copy);
        return createEmptyState(copy.noLeagues);
    }

    const requestedLeague = Number(state.filters.leagues) || 0;
    const matching = filterLeagues(state.standings.leagues, state.query).filter(
        (league) => !requestedLeague || league.league === requestedLeague,
    );
    if (!matching.length) {
        return createEmptyState(copy.noLeagues);
    }

    const wrapper = el("div", "ranked-arena__leagues-wrap");
    const stats = el("div", "ranked-arena__league-stats");
    const stat = (value: number, label: string): HTMLElement => {
        const item = el("div");
        append(item, el("strong", "", numberFormatter.format(value)), el("span", "", label));
        return item;
    };
    append(
        stats,
        stat(state.standings.activeCount, labelFromTemplate(copy.activePlayers, "n")),
        stat(state.standings.calibratingCount, labelFromTemplate(copy.calibratingPlayers, "n")),
    );
    append(wrapper, stats);

    if (state.standings.collapsed) {
        const notice = el("div", "ranked-arena__collapsed");
        append(notice, el("strong", "", copy.collapsedTitle), el("p", "", copy.collapsedBody));
        append(wrapper, notice);
    }

    const maxPopulation = Math.max(1, ...state.standings.leagues.map((league) => league.playerCount));
    const grid = el("div", "ranked-arena__leagues");
    for (const league of matching) {
        const card = el("article", "ranked-arena__league-card");
        card.dataset.league = String(league.league);
        card.style.setProperty("--population", `${Math.max(4, (league.playerCount / maxPopulation) * 100)}%`);

        const header = el("div", "ranked-arena__league-header");
        const crest = el("span", "ranked-arena__league-crest", String(league.league));
        crest.setAttribute("aria-hidden", "true");
        const title = el("div");
        append(
            title,
            el("h3", "", localizedLeague(copy, league.league)),
            el("span", "", replaceTemplate(copy.leaguePlayers, { n: numberFormatter.format(league.playerCount) })),
        );
        append(header, crest, title);

        const population = el("div", "ranked-arena__population");
        append(population, el("span"));

        const ratingBand = el("div", "ranked-arena__rating-band");
        append(
            ratingBand,
            el("span", "", copy.rating),
            el(
                "strong",
                "",
                league.maxMmr
                    ? replaceTemplate(copy.ratingBand, {
                          min: numberFormatter.format(league.minMmr),
                          max: numberFormatter.format(league.maxMmr),
                      })
                    : "—",
            ),
        );


        const leaguePlayers = playersInLeague(league).slice(0, 3);
        const playerList = el("ol", "ranked-arena__league-players");
        for (const [index, player] of leaguePlayers.entries()) {
            append(playerList, renderLeaguePlayer(player, index, lang));
        }

        const action = el("button", "ranked-arena__league-action", copy.viewPlayers);
        action.type = "button";
        action.dataset.leagueAction = String(league.league);
        append(card, header, population, ratingBand, leaguePlayers.length ? playerList : null, action);
        append(grid, card);
    }
    append(wrapper, grid);
    return wrapper;
};

const initArena = (root: HTMLElement, heroLeaderboard: HeroLeaderboardController | null): void => {
    const lang: "en" | "ru" = document.documentElement.lang.toLowerCase().startsWith("ru") ? "ru" : "en";
    const copy = rankedArenaCopy[lang];
    const panel = root.querySelector<HTMLElement>("[data-arena-panel]");
    const search = root.querySelector<HTMLInputElement>("[data-arena-search]");
    const clear = root.querySelector<HTMLButtonElement>("[data-arena-clear]");
    const filter = root.querySelector<HTMLSelectElement>("[data-arena-filter]");
    const sort = root.querySelector<HTMLSelectElement>("[data-arena-sort]");
    const refresh = root.querySelector<HTMLButtonElement>("[data-arena-refresh]");
    const status = root.querySelector<HTMLElement>("[data-arena-status]");
    const updated = root.querySelector<HTMLElement>("[data-arena-updated]");
    const announcer = root.querySelector<HTMLElement>("[data-arena-announcer]");
    const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-arena-tab]")];
    if (!panel || !search || !filter || !sort || !refresh || !status || !updated) {
        return;
    }

    const state: ArenaState = {
        tab: "games",
        query: "",
        filters: { players: "0", games: "all", leagues: "0" },
        sort: "rank",
        selectedPlayerId: "",
        visibleGames: gamesPageSize(),
        cached: new Set(),
        errors: new Set(),
        loading: new Set(),
        lastSuccessfulAt: 0,
    };
    const inFlight = new Map<ArenaResource, Promise<void>>();

    const setOptions = (
        select: HTMLSelectElement,
        options: Array<{ value: string; label: string }>,
        value: string,
    ): void => {
        const fragment = document.createDocumentFragment();
        for (const optionData of options) {
            const option = el("option", "", optionData.label);
            option.value = optionData.value;
            fragment.append(option);
        }
        select.replaceChildren(fragment);
        select.value = value;
    };

    const updateControls = (): void => {
        const leagueOptions = [
            { value: "0", label: copy.allLeagues },
            ...[5, 4, 3, 2, 1].map((league) => ({ value: String(league), label: localizedLeague(copy, league) })),
        ];
        if (state.tab === "games") {
            setOptions(
                filter,
                [
                    { value: "all", label: copy.allStages },
                    { value: "pick", label: copy.pickStage },
                    { value: "placement", label: copy.placementStage },
                    { value: "fight", label: copy.fightStage },
                ],
                state.filters.games,
            );
        } else {
            setOptions(filter, leagueOptions, state.filters[state.tab]);
        }
        const sortField = sort.closest<HTMLElement>("[data-arena-sort-field]") ?? sort.parentElement;
        if (sortField) sortField.hidden = state.tab !== "players";
        const filterField = filter.closest<HTMLElement>("[data-arena-filter-field]") ?? filter.parentElement;
        if (filterField) filterField.hidden = false;
    };

    const updateTabs = (): void => {
        const playersCount = allRankedPlayers(state).length;
        const gamesCount = state.games?.games.length ?? 0;
        const leaguesCount = state.standings?.leagues.filter((league) => league.playerCount > 0).length ?? 0;
        const counts: Record<ArenaTab, number> = { players: playersCount, games: gamesCount, leagues: leaguesCount };

        for (const tab of tabs) {
            const name = tab.dataset.arenaTab as ArenaTab;
            const active = name === state.tab;
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && tab.id) {
                panel.setAttribute("aria-labelledby", tab.id);
            }
            const count = tab.querySelector<HTMLElement>("[data-arena-count]");
            if (count) count.textContent = numberFormatter.format(counts[name] ?? 0);
        }
    };

    const renderStatus = (): void => {
        const hasAnyData = Boolean(state.top || state.standings || state.games);
        const allUnavailable = state.errors.size === 3 && !hasAnyData;
        const refreshing = state.loading.size > 0;
        let statusText = copy.live;
        let statusState = "live";
        if (allUnavailable) {
            statusText = copy.unavailable;
            statusState = "error";
        } else if (!hasAnyData && refreshing) {
            statusText = copy.connecting;
            statusState = "loading";
        } else if (state.errors.size > 0 || state.cached.size > 0) {
            statusText = copy.partial;
            statusState = "partial";
        }
        root.dataset.connection = statusState;
        root.setAttribute("aria-busy", String(refreshing && !hasAnyData));
        status.textContent = statusText;
        refresh.disabled = refreshing;
        refresh.setAttribute("aria-label", refreshing ? copy.refreshing : copy.refresh);
        refresh.title = refreshing ? copy.refreshing : copy.refresh;

        const timestamps = [
            state.top?.computedAt ?? 0,
            state.standings?.computedAt ?? 0,
            state.games?.computedAt ?? 0,
            state.lastSuccessfulAt,
        ];
        const newest = Math.max(...timestamps);
        const relative = localizedRelativeTime(copy, newest);
        updated.textContent = relative ? replaceTemplate(copy.updated, { time: relative }) : "";
    };

    const render = (): void => {
        updateTabs();
        updateControls();
        clear?.toggleAttribute("hidden", !state.query);
        let content: HTMLElement;
        if (state.tab === "players") {
            content = renderPlayers(state, copy, lang);
        } else if (state.tab === "games") {
            content = renderGames(state, copy, lang);
        } else {
            content = renderLeagues(state, copy, lang);
        }
        panel.replaceChildren(content);
        panel.dataset.activeTab = state.tab;
        renderStatus();
        heroLeaderboard?.update({
            top: state.top,
            loading: state.loading.has("top"),
            error: state.errors.has("top"),
            cached: state.cached.has("top"),
        });
    };

    const fetchResource = (resource: ArenaResource): Promise<void> => {
        const existing = inFlight.get(resource);
        if (existing) {
            return existing;
        }
        state.loading.add(resource);
        render();
        const request = fetchJson(endpointByResource[resource])
            .then((raw) => {
                const data = normalizeByResource[resource](raw);
                setResourceData(state, resource, data);
                state.cached.delete(resource);
                state.errors.delete(resource);
                state.lastSuccessfulAt = Date.now();
                writeCache(resource, raw);
            })
            .catch(() => {
                state.errors.add(resource);
            })
            .finally(() => {
                state.loading.delete(resource);
                inFlight.delete(resource);
                render();
            });
        inFlight.set(resource, request);
        return request;
    };

    const refreshAll = (): void => {
        void Promise.allSettled([fetchResource("top"), fetchResource("standings"), fetchResource("games")]).then(() => {
            if (announcer) announcer.textContent = status.textContent ?? "";
        });
    };

    const selectTab = (tab: ArenaTab, focus = false): void => {
        state.tab = tab;
        render();
        if (focus) {
            tabs.find((item) => item.dataset.arenaTab === tab)?.focus();
        }
    };

    for (const tab of tabs) {
        tab.addEventListener("click", () => selectTab(tab.dataset.arenaTab as ArenaTab));
        tab.addEventListener("keydown", (event) => {
            const currentIndex = tabs.indexOf(tab);
            let targetIndex = currentIndex;
            if (event.key === "ArrowRight") targetIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === "ArrowLeft") targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === "Home") targetIndex = 0;
            else if (event.key === "End") targetIndex = tabs.length - 1;
            else return;
            event.preventDefault();
            selectTab(tabs[targetIndex].dataset.arenaTab as ArenaTab, true);
        });
    }

    search.addEventListener("input", () => {
        state.query = search.value;
        state.visibleGames = gamesPageSize();
        render();
    });
    clear?.addEventListener("click", () => {
        search.value = "";
        state.query = "";
        state.visibleGames = gamesPageSize();
        search.focus();
        render();
    });
    filter.addEventListener("change", () => {
        state.filters[state.tab] = filter.value;
        if (state.tab === "games") state.visibleGames = gamesPageSize();
        render();
    });
    sort.addEventListener("change", () => {
        state.sort = sort.value as PlayerSort;
        render();
    });
    refresh.addEventListener("click", refreshAll);
    window.addEventListener("hoc:ranked-arena-refresh", (event) => {
        const resource = (event as CustomEvent<ArenaResource | undefined>).detail;
        if (resource) void fetchResource(resource);
        else refreshAll();
    });
    window.addEventListener("hoc:ranked-arena-select-player", (event) => {
        const playerId = (event as CustomEvent<string>).detail;
        search.value = "";
        state.query = "";
        state.filters.players = "0";
        if (playerId) state.selectedPlayerId = playerId;
        selectTab("players");
        root.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
    });
    panel.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const stageFilter = target.closest<HTMLButtonElement>("[data-game-stage-filter]");
        if (stageFilter?.dataset.gameStageFilter) {
            const stage = stageFilter.dataset.gameStageFilter as LiveGameStage;
            state.filters.games = state.filters.games === stage ? "all" : stage;
            state.visibleGames = gamesPageSize();
            render();
            return;
        }
        if (target.closest("[data-games-more]")) {
            state.visibleGames += gamesPageSize();
            render();
            return;
        }
        const leagueAction = target.closest<HTMLButtonElement>("[data-league-action]");
        if (leagueAction?.dataset.leagueAction) {
            state.filters.players = leagueAction.dataset.leagueAction;
            selectTab("players");
            root.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            });
            return;
        }
        if (target.closest("[data-arena-retry]")) {
            refreshAll();
        }
    });

    for (const resource of ["top", "standings", "games"] as const) {
        const cached = readCache(resource);
        if (cached !== undefined) {
            setResourceData(state, resource, normalizeByResource[resource](cached));
            state.cached.add(resource);
        }
    }
    root.dataset.enhanced = "true";
    render();
    refreshAll();

    window.setInterval(() => {
        if (!document.hidden) void fetchResource("games");
    }, LIVE_REFRESH_MS);
    window.setInterval(() => {
        if (!document.hidden) {
            void fetchResource("top");
            void fetchResource("standings");
        }
    }, LADDER_REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && Date.now() - state.lastSuccessfulAt > LIVE_REFRESH_MS) {
            void fetchResource("games");
        }
    });
};

export function initRankedArenas(): void {
    const heroLeaderboard = initHeroLeaderboard();
    document.querySelectorAll<HTMLElement>("[data-ranked-arena]").forEach((root) => initArena(root, heroLeaderboard));
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRankedArenas, { once: true });
} else {
    initRankedArenas();
}
