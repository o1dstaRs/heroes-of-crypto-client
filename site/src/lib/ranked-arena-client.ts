import {
    defaultPlayerSortDirection,
    filterLeagues,
    filterLiveGames,
    filterRankedPlayers,
    liveGameFormSlots,
    livePlayerRankedState,
    normalizeLiveGamesResponse,
    normalizeStandingsResponse,
    normalizeTopResponse,
    type CalibratingPlayer,
    playerInitials,
    playersInLeague,
    relativeArenaTime,
    type ArenaTab,
    type LiveGame,
    type LiveGameFormSlot,
    type LiveGamePlayer,
    type LiveGameResult,
    type LiveGamesResponse,
    type LiveGameStage,
    type PlayerSort,
    type PlayerSortDirection,
    type RankedLeague,
    type RankedPlayer,
    type RankedStandingsResponse,
    type RankedTopResponse,
} from "./ranked-arena-data";
import { isLoggedIn } from "./auth-state";
import { fetchMyBets, impliedShare, placeBet, proposedReturn, type PredictionBet } from "./prediction-client";
import { rankedArenaCopy } from "./ranked-arena-copy";
import { initHeroLeaderboard, type HeroLeaderboardController } from "./hero-leaderboard-client";

type ArenaResource = "top" | "standings" | "games";

interface ArenaState {
    tab: ArenaTab;
    query: string;
    filters: Record<ArenaTab, string>;
    sort: PlayerSort;
    sortDirection: PlayerSortDirection;
    selectedPlayerId: string;
    visibleGames: number;
    /** The viewer's own bets keyed by gameId (empty when signed out). */
    myBets: Map<string, PredictionBet>;
    /** gameId whose stake form is expanded, and the seat it is aimed at. */
    predictOpenGameId: string;
    predictSide: string;
    predictAmount: number;
    predictError: string;
    predictBusy: boolean;
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

// Betting endpoints live on the matchmaking host alongside the rest of the authed player APIs.
const predictionEndpoints = {
    bet: `${matchmakingBaseUrl}${isProduction ? "/v1/prediction-bet" : "/v1/mm/prediction-bet"}`,
    bets: `${matchmakingBaseUrl}${isProduction ? "/v1/prediction-bets" : "/v1/mm/prediction-bets"}`,
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

const currencyAmount = (amount: number, className = ""): HTMLElement => {
    const node = el("span", ["currency-amount", className].filter(Boolean).join(" "));
    const icon = el("img", "currency-icon");
    icon.src = "/assets/icons/currency/gold.svg";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.width = 20;
    icon.height = 20;
    return append(node, icon, document.createTextNode(numberFormatter.format(Math.max(0, Math.trunc(amount)))));
};

const replaceTemplate = (template: string, values: Record<string, string | number>): string =>
    Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);

const appendRichTemplate = <T extends ParentNode>(
    parent: T,
    template: string,
    values: Record<string, string | number | Node>,
): T => {
    for (const part of template.split(/(\{[^{}]+\})/g).filter(Boolean)) {
        const placeholder = /^\{([^{}]+)\}$/.exec(part)?.[1];
        const value = placeholder ? values[placeholder] : undefined;
        parent.append(value instanceof Node ? value : document.createTextNode(value === undefined ? part : String(value)));
    }
    return parent;
};

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

const createLiveGameForm = (
    results: LiveGameResult[],
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
): HTMLElement => {
    const labels: Record<LiveGameFormSlot, string> = {
        win: copy.resultWin,
        loss: copy.resultLoss,
        draw: copy.resultDraw,
        empty: copy.resultUnavailable,
    };
    const slots = liveGameFormSlots(results);
    const form = el("span", "ranked-arena__game-form");
    form.setAttribute("role", "img");
    form.setAttribute("aria-label", `${copy.recentForm}: ${slots.map((slot) => labels[slot]).join(", ")}`);
    for (const slot of slots) {
        const dot = el("i", `ranked-arena__game-form-dot ranked-arena__game-form-dot--${slot}`);
        dot.title = labels[slot];
        dot.setAttribute("aria-hidden", "true");
        append(form, dot);
    }
    return form;
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
        bannedCreatureId: player.bannedCreatureId,
        bannedCreatureName: player.bannedCreatureName,
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

const livePlayerProfileHref = (lang: "en" | "ru", player: LiveGamePlayer, ladderRank = 0): string =>
    playerProfileHref(lang, player.playerId, {
        username: player.username,
        state: player.ranked ? livePlayerRankedState(player) : undefined,
        mmr: player.ranked?.mmr,
        league: player.ranked?.league,
        rank: player.ranked?.leaderboardRank || ladderRank,
    });

const createPlayerDossier = (
    player: RankedPlayer,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    dossierId: string,
): HTMLElement => {
    const dossier = el("span", "ranked-arena__player-dossier");
    dossier.id = dossierId;
    dossier.setAttribute("role", "tooltip");
    const metric = (label: string, value: string | Node): HTMLElement => {
        const node = el("span");
        const strong = el("strong");
        append(strong, typeof value === "string" ? document.createTextNode(value) : value);
        return append(node, el("small", "", label), strong);
    };
    append(
        dossier,
        // Season currency first: gold is minted 1:1 with won MMR and never deducted.
        metric(copy.gold, currencyAmount(player.gold)),
        metric(copy.bansLabel, player.bannedCreatureName || copy.bansNone),
        metric(copy.gamesPlayed, numberFormatter.format(player.totalGames)),
        metric(copy.peakRating, numberFormatter.format(player.peakMmr || player.mmr)),
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
    const detailGold = el("small", "ranked-arena__detail-gold");
    append(detailGold, document.createTextNode(`${copy.gold}: `), currencyAmount(player.gold));
    append(
        rating,
        el("span", "", copy.rating),
        el("strong", "", numberFormatter.format(player.mmr)),
        player.peakMmr ? el("small", "", `${copy.peakRating} ${numberFormatter.format(player.peakMmr)}`) : null,
        detailGold,
    );

    const stats = el("dl", "ranked-arena__detail-stats");
    const stat = (label: string, value: string | Node): HTMLElement => {
        const row = el("div");
        const valueNode = el("dd");
        append(valueNode, typeof value === "string" ? document.createTextNode(value) : value);
        append(row, el("dt", "", label), valueNode);
        return row;
    };
    append(
        stats,
        stat(copy.bansLabel, player.bannedCreatureName || copy.bansNone),
        stat(copy.record, `${player.wins}–${player.losses}–${player.draws}`),
        stat(copy.winRate, `${player.winRatePct.toFixed(1).replace(/\.0$/, "")}%`),
        stat(copy.recentForm, createLiveGameForm(player.recentResults, copy)),
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
            currencyAmount(player.gold, "ranked-arena__row-gold"),
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

const createSortableHeading = (
    label: string,
    sort: PlayerSort,
    activeSort: PlayerSort,
    direction: PlayerSortDirection,
): HTMLElement => {
    const cell = el("span", "ranked-arena__table-heading-cell");
    cell.setAttribute("role", "columnheader");
    cell.setAttribute("aria-sort", sort === activeSort ? (direction === "asc" ? "ascending" : "descending") : "none");
    const button = el("button", "ranked-arena__column-sort", label);
    button.type = "button";
    button.dataset.arenaColumnSort = sort;
    append(cell, button);
    return cell;
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
        ? filterRankedPlayers(source, {
              query: state.query,
              league: leagueFilter,
              sort: state.sort,
              direction: state.sortDirection,
          })
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
    heading.setAttribute("role", "row");
    append(
        heading,
        createSortableHeading(copy.position, "rank", state.sort, state.sortDirection),
        createSortableHeading(copy.player, "player", state.sort, state.sortDirection),
        createSortableHeading(copy.rating, "rating", state.sort, state.sortDirection),
        createSortableHeading(copy.gold, "gold", state.sort, state.sortDirection),
        createSortableHeading(copy.record, "wins", state.sort, state.sortDirection),
        createSortableHeading(copy.winRate, "winRate", state.sort, state.sortDirection),
    );
    const list = el("div", "ranked-arena__player-list");

    for (const [index, player] of players.entries()) {
        const row = el("a", "ranked-arena__player-row");
        row.href = rankedPlayerProfileHref(lang, player);
        row.dataset.playerId = player.playerId;
        row.dataset.selected = String(player.playerId === selected!.playerId);
        row.setAttribute(
            "aria-label",
            `${player.username}, ${localizedLeague(copy, player.league)}, ${player.mmr} ${copy.rating}, ${player.gold} ${copy.gold}`,
        );
        // Plain-hover affordance on top of the styled dossier: the balance in a native tooltip.
        row.title = `${copy.gold}: ${numberFormatter.format(player.gold)}`;

        const rank = el("span", "ranked-arena__rank", `#${player.position || player.leaderboardRank || "—"}`);
        const identity = el("span", "ranked-arena__player-identity");
        const identityText = el("span");
        append(identityText, el("strong", "", player.username), el("small", "", localizedLeague(copy, player.league)));
        append(identity, createAvatar(player.username, player.league), identityText);
        const dossierId = `ranked-arena-dossier-${index + 1}`;
        row.setAttribute("aria-describedby", dossierId);
        append(
            row,
            rank,
            identity,
            el("strong", "ranked-arena__row-rating", numberFormatter.format(player.mmr)),
            currencyAmount(player.gold, "ranked-arena__row-gold"),
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

/**
 * Prediction market panel for one pick-phase game: the two pools as a proportion bar, the viewer's
 * existing bet (if any), and — while the draft is open — a Predict button that expands into a stake
 * form previewing the exact payout the current pools would produce.
 */
const renderPredictionPanel = (
    game: LiveGame,
    state: ArenaState,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
): HTMLElement | null => {
    if (game.stage !== "pick" || game.casual || game.players.length < 2) {
        return null;
    }
    const [lower, upper] = game.players;
    const panel = el("div", "ranked-arena__market");

    // ---- pools + proportion bar ----
    const header = el("div", "ranked-arena__market-header");
    const totalPool = el("span", "ranked-arena__market-total");
    append(
        totalPool,
        document.createTextNode(`${copy.marketTotal}:`),
        currencyAmount(game.predictionPool, "ranked-arena__market-currency"),
        document.createTextNode(
            ` · ${replaceTemplate(copy.marketBets, {
                n: game.predictionBets,
            })}`,
        ),
    );
    append(
        header,
        el("span", "ranked-arena__market-title", copy.marketTitle),
        totalPool,
    );

    const lowerShare = impliedShare(lower.predictionPool, upper.predictionPool);
    const bar = el("div", "ranked-arena__market-bar");
    const lowerFill = el("span", "ranked-arena__market-fill ranked-arena__market-fill--lower");
    lowerFill.style.width = `${Math.round(lowerShare * 100)}%`;
    const upperFill = el("span", "ranked-arena__market-fill ranked-arena__market-fill--upper");
    upperFill.style.width = `${Math.round((1 - lowerShare) * 100)}%`;
    append(bar, lowerFill, upperFill);

    const legend = el("div", "ranked-arena__market-legend");
    const legendSide = (player: LiveGame["players"][number], share: number, side: "lower" | "upper"): HTMLElement => {
        const item = el("span", `ranked-arena__market-legend-item ranked-arena__market-legend-item--${side}`);
        const amount = el("span", "ranked-arena__market-legend-value");
        append(
            amount,
            currencyAmount(player.predictionPool, "ranked-arena__market-currency"),
            document.createTextNode(` · ${Math.round(share * 100)}%`),
        );
        append(item, el("strong", "", player.username), amount);
        return item;
    };
    append(legend, legendSide(lower, lowerShare, "lower"), legendSide(upper, 1 - lowerShare, "upper"));
    append(panel, header, bar, legend);

    // ---- the viewer's own position, or the way in ----
    const mine = state.myBets.get(game.gameId);
    if (mine) {
        const side = game.players.find((player) => player.playerId === mine.predictedPlayerId);
        const other = game.players.find((player) => player.playerId !== mine.predictedPlayerId);
        const placed = el("div", "ranked-arena__market-mine");
        const placedAmount = el("span");
        appendRichTemplate(placedAmount, copy.marketYourBet, {
            amount: currencyAmount(mine.amount, "ranked-arena__market-currency"),
            side: side?.username ?? "—",
        });
        const returnAmount = el("strong");
        appendRichTemplate(returnAmount, copy.marketToReturn, {
            amount: currencyAmount(
                proposedReturn(
                    mine.amount,
                    Math.max(0, (side?.predictionPool ?? 0) - mine.amount),
                    other?.predictionPool ?? 0,
                ),
                "ranked-arena__market-currency",
            ),
        });
        append(
            placed,
            placedAmount,
            returnAmount,
        );
        append(panel, placed);
        return panel;
    }

    const isOpen = state.predictOpenGameId === game.gameId;
    if (!isOpen) {
        // A bet button per SIDE, shown to everyone. Signed out, the click routes to login (carrying a
        // return path) rather than hiding the market behind a sign-in link — the whole point of the panel
        // is to show what you could back, so the ask comes at the moment of intent, not before it.
        const sides = el("div", "ranked-arena__market-sides");
        for (const player of game.players) {
            const bet = el("button", "ranked-arena__market-side ranked-arena__market-side--cta");
            bet.type = "button";
            append(
                bet,
                el("span", "ranked-arena__market-side-verb", copy.marketBetOn),
                el("strong", "", player.username),
            );
            bet.dataset.predictOpen = game.gameId;
            bet.dataset.predictPreselect = player.playerId;
            bet.setAttribute("aria-label", `${copy.marketBetOn} ${player.username}`);
            append(sides, bet);
        }
        append(panel, sides);
        if (!isLoggedIn()) {
            append(panel, el("p", "ranked-arena__market-rules", copy.marketSignInHint));
        }
        return panel;
    }

    // ---- expanded stake form ----
    const form = el("div", "ranked-arena__market-form");
    const sides = el("div", "ranked-arena__market-sides");
    for (const player of game.players) {
        const choice = el("button", "ranked-arena__market-side", player.username);
        choice.type = "button";
        choice.dataset.predictSide = player.playerId;
        choice.setAttribute("aria-pressed", String(state.predictSide === player.playerId));
        append(sides, choice);
    }

    const amountRow = el("div", "ranked-arena__market-amount");
    const input = el("input", "ranked-arena__market-input");
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.value = state.predictAmount > 0 ? String(state.predictAmount) : "";
    input.placeholder = copy.marketAmountPlaceholder;
    input.dataset.predictAmount = "";
    input.setAttribute("aria-label", copy.marketAmountPlaceholder);
    const confirm = el("button", "ranked-arena__market-confirm", state.predictBusy ? copy.marketPlacing : copy.marketPlace);
    confirm.type = "button";
    confirm.dataset.predictConfirm = game.gameId;
    confirm.disabled = state.predictBusy || !state.predictSide || state.predictAmount < 1;
    append(amountRow, input, confirm);

    const chosen = game.players.find((player) => player.playerId === state.predictSide);
    const against = game.players.find((player) => player.playerId !== state.predictSide);
    const preview = el("p", "ranked-arena__market-preview");
    if (chosen && state.predictAmount > 0) {
        const total = proposedReturn(state.predictAmount, chosen.predictionPool, against?.predictionPool ?? 0);
        appendRichTemplate(preview, copy.marketPreview, {
            stake: currencyAmount(state.predictAmount, "ranked-arena__market-currency"),
            side: chosen.username,
            total: currencyAmount(total, "ranked-arena__market-currency"),
            profit: currencyAmount(total - state.predictAmount, "ranked-arena__market-currency"),
        });
    } else {
        preview.textContent = copy.marketPreviewHint;
    }

    const rules = el("p", "ranked-arena__market-rules", copy.marketRules);
    append(form, sides, amountRow, preview, rules);
    if (state.predictError) {
        append(form, el("p", "ranked-arena__market-error", state.predictError));
    }
    const cancel = el("button", "ranked-arena__market-cancel", copy.marketCancel);
    cancel.type = "button";
    cancel.dataset.predictCancel = "";
    append(form, cancel);
    append(panel, form);
    return panel;
};

const renderGameSeat = (
    game: LiveGame,
    index: number,
    copy: (typeof rankedArenaCopy)[keyof typeof rankedArenaCopy],
    lang: "en" | "ru",
    gameIndex: number,
    fallbackLadderRank: number,
): HTMLElement => {
    const player = game.players[index];
    if (!player) {
        const seat = el("div", "ranked-arena__game-seat ranked-arena__game-seat--empty");
        append(seat, createAvatar("?", 0), el("strong", "", "—"));
        return seat;
    }

    const seat = el("a", "ranked-arena__game-seat");
    const ranked = player.ranked;
    const ladderRank = ranked?.leaderboardRank || fallbackLadderRank;
    seat.href = livePlayerProfileHref(lang, player, ladderRank);
    seat.title = copy.viewProfile;
    seat.setAttribute("aria-label", `${copy.viewProfile}: ${player.username}`);
    const identity = el("div");
    const aiLabel = replaceTemplate(copy.aiLabel, { version: player.aiVersion ?? "" }).trim();
    const rankedState = livePlayerRankedState(player);
    const stateLabel =
        rankedState === "recalibration"
            ? copy.recalibratingBadge
            : rankedState === "calibration"
              ? copy.calibratingHeading
              : ranked?.league
                ? localizedLeague(copy, ranked.league)
                : player.isBot
                  ? aiLabel
                  : copy.unranked;
    const meta = ranked?.mmr
        ? `${ladderRank ? `#${ladderRank} · ` : ""}${numberFormatter.format(ranked.mmr)} MMR`
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
    const metric = (label: string, value: string | Node): HTMLElement => {
        const node = el("span");
        const strong = el("strong");
        append(strong, typeof value === "string" ? document.createTextNode(value) : value);
        return append(node, el("small", "", label), strong);
    };
    append(
        dossier,
        metric(copy.rating, ranked?.mmr ? numberFormatter.format(ranked.mmr) : "—"),
        metric(copy.ladderRank, ladderRank ? `#${ladderRank}` : "—"),
        metric(
            labelFromTemplate(copy.leagueTemplate, "n"),
            ranked?.league ? localizedLeague(copy, ranked.league) : "—",
        ),
        metric(copy.recentForm, createLiveGameForm(ranked?.recentResults ?? [], copy)),
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
    // Betting order: drafts (the only stage you can still predict) come first, biggest market first
    // within them, then everything else by stage and recency. This deliberately outranks the old
    // "fights first" ordering — an open market is the actionable card.
    const stagePriority: Record<LiveGameStage, number> = { pick: 0, fight: 1, placement: 2 };
    const queryMatches = filterLiveGames(state.games.games, { query: state.query, stage: "all" });
    const games = filterLiveGames(queryMatches, { stage: stageFilter }).sort(
        (a, b) =>
            stagePriority[a.stage] - stagePriority[b.stage] ||
            (a.stage === "pick" ? b.predictionPool - a.predictionPool : 0) ||
            Number(b.observable) - Number(a.observable) ||
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
    const ladderRanks = new Map(
        allRankedPlayers(state).map((player) => [player.playerId, player.position || player.leaderboardRank] as const),
    );
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
            renderGameSeat(game, 0, copy, lang, gameIndex, ladderRanks.get(game.players[0]?.playerId ?? "") ?? 0),
            el("span", "ranked-arena__versus", copy.versus),
            renderGameSeat(game, 1, copy, lang, gameIndex, ladderRanks.get(game.players[1]?.playerId ?? "") ?? 0),
        );
        const market = renderPredictionPanel(game, state, copy);
        append(card, header, matchup);
        if (market) {
            append(card, market);
        }
        append(card, el("span", "sr-only", game.gameId));
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
        sortDirection: defaultPlayerSortDirection("rank"),
        selectedPlayerId: "",
        visibleGames: gamesPageSize(),
        myBets: new Map(),
        predictOpenGameId: "",
        predictSide: "",
        predictAmount: 0,
        predictError: "",
        predictBusy: false,
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
        sort.value = state.sort;
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
        const updatedText = relative ? replaceTemplate(copy.updated, { time: relative }) : "";
        // Season badge: "Season 1: First Flame · ends in 12d" ahead of the freshness stamp.
        const season = state.standings?.season ?? null;
        let seasonText = "";
        if (season) {
            const daysLeft = Math.max(0, Math.ceil((season.endsAt - Date.now()) / 86_400_000));
            seasonText = `${season.name} · ${replaceTemplate(copy.seasonEndsIn, { days: String(daysLeft) })}`;
        }
        updated.textContent = seasonText && updatedText ? `${seasonText} · ${updatedText}` : seasonText || updatedText;
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
            void refreshMyBets();
        });
    };

    /** Pull the viewer's own bets for the games currently on screen (no-op when signed out). */
    const refreshMyBets = async (): Promise<void> => {
        const games = state.games?.games ?? [];
        if (!games.length || !isLoggedIn()) {
            return;
        }
        try {
            const bets = await fetchMyBets(
                predictionEndpoints,
                games.map((game) => game.gameId),
            );
            state.myBets = new Map(bets.map((bet) => [bet.gameId, bet]));
            render();
        } catch {
            // A failed bets read just leaves the Predict buttons up; placing one re-checks server-side.
        }
    };

    const submitPrediction = async (gameId: string): Promise<void> => {
        if (state.predictBusy || !state.predictSide || state.predictAmount < 1) {
            return;
        }
        state.predictBusy = true;
        state.predictError = "";
        render();
        try {
            const bet = await placeBet(predictionEndpoints, gameId, state.predictSide, state.predictAmount);
            state.myBets.set(gameId, bet);
            state.predictOpenGameId = "";
            state.predictSide = "";
            state.predictAmount = 0;
            // Re-read the live feed so the pools (and every other viewer's proportions) include it.
            void fetchResource("games");
        } catch (err) {
            state.predictError = (err as Error).message;
        } finally {
            state.predictBusy = false;
            render();
        }
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
        state.sortDirection = defaultPlayerSortDirection(state.sort);
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
        const columnSort = target.closest<HTMLButtonElement>("[data-arena-column-sort]");
        if (columnSort?.dataset.arenaColumnSort) {
            const nextSort = columnSort.dataset.arenaColumnSort as PlayerSort;
            state.sortDirection =
                state.sort === nextSort
                    ? state.sortDirection === "asc"
                        ? "desc"
                        : "asc"
                    : defaultPlayerSortDirection(nextSort);
            state.sort = nextSort;
            sort.value = nextSort;
            render();
            return;
        }
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
        const predictOpen = target.closest<HTMLButtonElement>("[data-predict-open]");
        if (predictOpen?.dataset.predictOpen) {
            // Signed out: this click IS the intent to bet, so send them to login and come straight back
            // to the arena afterwards instead of opening a form they cannot submit.
            if (!isLoggedIn()) {
                const back = `${window.location.pathname}${window.location.search}#arena`;
                window.location.href = `/auth/login/?redirect=${encodeURIComponent(back)}`;
                return;
            }
            state.predictOpenGameId = predictOpen.dataset.predictOpen;
            // Clicking a specific side arms that side; the generic entry leaves the choice open.
            state.predictSide = predictOpen.dataset.predictPreselect ?? "";
            state.predictAmount = 0;
            state.predictError = "";
            render();
            return;
        }
        const predictSide = target.closest<HTMLButtonElement>("[data-predict-side]");
        if (predictSide?.dataset.predictSide) {
            state.predictSide = predictSide.dataset.predictSide;
            state.predictError = "";
            render();
            return;
        }
        if (target.closest("[data-predict-cancel]")) {
            state.predictOpenGameId = "";
            state.predictSide = "";
            state.predictAmount = 0;
            state.predictError = "";
            render();
            return;
        }
        const predictConfirm = target.closest<HTMLButtonElement>("[data-predict-confirm]");
        if (predictConfirm?.dataset.predictConfirm) {
            void submitPrediction(predictConfirm.dataset.predictConfirm);
            return;
        }
        if (target.closest("[data-arena-retry]")) {
            refreshAll();
        }
    });

    // The stake input is re-rendered on every state change, so read it through delegation and keep
    // the DOM value rather than re-rendering the whole card on each keystroke (that would steal focus).
    panel.addEventListener("input", (event) => {
        const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-predict-amount]");
        if (!input) {
            return;
        }
        const parsed = Math.floor(Number(input.value));
        state.predictAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        // Refresh only the preview + confirm button in place.
        const card = input.closest(".ranked-arena__game-card");
        const preview = card?.querySelector<HTMLElement>(".ranked-arena__market-preview");
        const confirm = card?.querySelector<HTMLButtonElement>("[data-predict-confirm]");
        const game = state.games?.games.find((candidate) => candidate.gameId === state.predictOpenGameId);
        const chosen = game?.players.find((player) => player.playerId === state.predictSide);
        const against = game?.players.find((player) => player.playerId !== state.predictSide);
        const copy = rankedArenaCopy[lang];
        if (preview) {
            if (chosen && state.predictAmount > 0) {
                const total = proposedReturn(state.predictAmount, chosen.predictionPool, against?.predictionPool ?? 0);
                preview.textContent = replaceTemplate(copy.marketPreview, {
                    stake: numberFormatter.format(state.predictAmount),
                    side: chosen.username,
                    total: numberFormatter.format(total),
                    profit: numberFormatter.format(total - state.predictAmount),
                });
            } else {
                preview.textContent = copy.marketPreviewHint;
            }
        }
        if (confirm) {
            confirm.disabled = state.predictBusy || !state.predictSide || state.predictAmount < 1;
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
