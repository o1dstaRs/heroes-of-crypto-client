import {
    playerInitials,
    relativeArenaTime,
    TOP_WEALTH,
    type RankedPlayer,
    type RankedTopResponse,
} from "./ranked-arena-data";
import { rankedArenaCopy } from "./ranked-arena-copy";
import { leagueEmblemPath } from "./league-emblems";
import { LEGACY_SEASON_CURRENCY, seasonCurrencyIconUrl, type SeasonCurrency } from "./season-currency";

export interface HeroLeaderboardUpdate {
    top?: RankedTopResponse;
    currency?: SeasonCurrency;
    loading: boolean;
    error: boolean;
    cached: boolean;
}

export interface HeroLeaderboardController {
    update(state: HeroLeaderboardUpdate): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
};

const append = <T extends ParentNode>(parent: T, ...children: Array<Node | null | undefined | false>): T => {
    parent.append(...children.filter((child): child is Node => child instanceof Node));
    return parent;
};

const currencyAmount = (
    amount: number,
    formatter: Intl.NumberFormat,
    currency: SeasonCurrency = LEGACY_SEASON_CURRENCY,
): HTMLElement => {
    const node = el("span", "currency-amount");
    const formattedAmount = formatter.format(Math.max(0, Math.trunc(amount)));
    node.setAttribute("aria-label", `${currency.name}: ${formattedAmount}`);
    const icon = el("img", "currency-icon");
    icon.src = seasonCurrencyIconUrl(currency);
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.width = 20;
    icon.height = 20;
    return append(node, icon, document.createTextNode(formattedAmount));
};

const replaceTemplate = (template: string, values: Record<string, string | number>): string =>
    Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);

// Mirrors ranked-arena-client's own copy of this: that file imports FROM here, so the helper can't be
// shared the other way without a cycle.
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

const chunks = <T>(items: T[], size: number): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
};

const profileHref = (profileRoot: string, player: RankedPlayer): string => {
    const params = new URLSearchParams({
        playerId: player.playerId,
        username: player.username,
        state: "placed",
        mmr: String(player.mmr),
        league: String(player.league),
        rank: String(player.position || player.leaderboardRank),
        wins: String(player.wins),
        losses: String(player.losses),
        draws: String(player.draws),
        games: String(player.totalGames),
        winRate: String(player.winRatePct),
        peakMmr: String(player.peakMmr),
        winStreak: String(player.winStreak),
        lossStreak: String(player.lossStreak),
        lastBattle: String(player.lastRankedGameAt),
        bannedCreatureId: String(player.bannedCreatureId),
        bannedCreatureName: player.bannedCreatureName,
    });
    return `${profileRoot}?${params.toString()}`;
};

export function initHeroLeaderboard(): HeroLeaderboardController | null {
    const root = document.querySelector<HTMLElement>("[data-hero-leaderboard]");
    if (!root || root.dataset.initialized === "true") return null;

    const frame = root.querySelector<HTMLElement>("[data-hero-ranked-frame]");
    const viewport = root.querySelector<HTMLElement>("[data-hero-ranked-viewport]");
    const controls = root.querySelector<HTMLElement>("[data-hero-ranked-controls]");
    const previous = root.querySelector<HTMLButtonElement>("[data-hero-ranked-previous]");
    const next = root.querySelector<HTMLButtonElement>("[data-hero-ranked-next]");
    const pageDots = root.querySelector<HTMLElement>("[data-hero-ranked-pages]");
    const range = root.querySelector<HTMLElement>("[data-hero-ranked-range]");
    const announcer = root.querySelector<HTMLElement>("[data-hero-ranked-announcer]");
    const ladderLink = root.querySelector<HTMLAnchorElement>(".hero-ranked__ladder-link");
    if (!frame || !viewport || !controls || !previous || !next || !pageDots || !range) return null;

    const lang: "en" | "ru" = root.dataset.language === "ru" ? "ru" : "en";
    const copy = rankedArenaCopy[lang];
    const numberFormatter = new Intl.NumberFormat(lang);
    const topN = Math.max(1, Number.parseInt(root.dataset.topN ?? "10", 10) || 10);
    const profileRoot = lang === "ru" ? "/ru/profile/" : "/profile/";
    const pageSize = 4;
    let currentPage = 0;
    let pageCount = 0;
    let playerCount = 0;
    let signature = "";
    let track: HTMLElement | null = null;

    const leagueLabel = (league: number): string => copy.leagueNames[league - 1] ?? copy.unranked;
    // The gold third they sit in inside that league: adjectives lead ("Ragged Aspirant"), the top
    // tier is a noun and trails ("Demigod Whale").
    const standingLabel = (player: RankedPlayer): string => {
        const league = leagueLabel(player.league);
        const tier = player.league > 0 ? (copy.wealthNames[player.wealth - 1] ?? "") : "";
        if (!tier) {
            return league;
        }
        return player.wealth === TOP_WEALTH ? `${league} ${tier}` : `${tier} ${league}`;
    };

    const rankFor = (player: RankedPlayer, fallback: number): number =>
        player.position || player.leaderboardRank || fallback;

    const updatePage = (target: number, announce = false): void => {
        if (!track || pageCount <= 0) return;
        currentPage = (target + pageCount) % pageCount;
        track.style.transform = `translateX(-${currentPage * 100}%)`;
        track.querySelectorAll<HTMLElement>("[data-hero-ranked-page]").forEach((page, index) => {
            const active = index === currentPage;
            page.setAttribute("aria-hidden", String(!active));
            page.querySelectorAll<HTMLAnchorElement>("[data-hero-player-id]").forEach((player) => {
                player.tabIndex = active ? 0 : -1;
            });
        });
        pageDots.querySelectorAll<HTMLButtonElement>("[data-hero-ranked-page-dot]").forEach((dot, index) => {
            dot.setAttribute("aria-current", String(index === currentPage));
            dot.tabIndex = index === currentPage ? 0 : -1;
        });

        const start = currentPage * pageSize + 1;
        const end = Math.min(start + pageSize - 1, playerCount);
        const label = replaceTemplate(copy.showingRanks, { start, end, total: playerCount });
        range.textContent = label;
        if (announce && announcer) announcer.textContent = label;
    };

    const createPlayer = (player: RankedPlayer, index: number, currency: SeasonCurrency): HTMLLIElement => {
        const rank = rankFor(player, index + 1);
        const item = el("li", "hero-ranked__player-item");
        const row = el("a", "hero-ranked__player");
        row.href = profileHref(profileRoot, player);
        row.dataset.rank = String(rank);
        row.dataset.heroPlayerId = player.playerId;
        row.setAttribute(
            "aria-label",
            `${rank}. ${player.username}, ${standingLabel(player)}, ${numberFormatter.format(player.mmr)} ${copy.rating}`,
        );

        const rankNode = el("span", "hero-ranked__rank", String(rank));
        rankNode.setAttribute("aria-hidden", "true");
        const avatar = el("span", "hero-ranked__avatar", playerInitials(player.username));
        avatar.setAttribute("aria-hidden", "true");
        const leagueEmblem = el("img", "hero-ranked__league-emblem");
        leagueEmblem.src = leagueEmblemPath(player.league, player.wealth);
        leagueEmblem.alt = "";
        leagueEmblem.width = 22;
        leagueEmblem.height = 22;
        append(avatar, leagueEmblem);
        const identity = el("span", "hero-ranked__identity");
        append(identity, el("strong", "", player.username), el("small", "", standingLabel(player)));
        const rating = el("span", "hero-ranked__rating");
        append(rating, el("strong", "", numberFormatter.format(player.mmr)), el("small", "", copy.rating));

        const dossierId = `hero-ranked-dossier-${index + 1}`;
        const dossier = el("span", "hero-ranked__dossier");
        dossier.id = dossierId;
        dossier.setAttribute("role", "tooltip");
        row.setAttribute("aria-describedby", dossierId);
        const metric = (label: string, value: string | Node): HTMLElement => {
            const node = el("span", "hero-ranked__dossier-stat");
            const valueNode = el("strong");
            append(valueNode, typeof value === "string" ? document.createTextNode(value) : value);
            return append(node, el("small", "", label), valueNode);
        };
        append(
            dossier,
            metric(copy.rating, numberFormatter.format(player.mmr)),
            metric(copy.leagueLabel, leagueLabel(player.league)),
            metric(currency.name, currencyAmount(player.gold, numberFormatter, currency)),
            metric(
                copy.lastBattle,
                player.lastRankedGameAt ? localizedRelativeTime(copy, player.lastRankedGameAt) : "—",
            ),
        );
        append(row, rankNode, avatar, identity, rating, dossier);
        return append(item, row);
    };

    const renderPlayers = (players: RankedPlayer[], currency: SeasonCurrency): void => {
        const pages = chunks(players, pageSize);
        pageCount = pages.length;
        playerCount = players.length;
        currentPage = Math.min(currentPage, Math.max(0, pageCount - 1));
        track = el("div", "hero-ranked__track");

        pages.forEach((playersOnPage, pageIndex) => {
            const page = el("ol", "hero-ranked__page");
            page.dataset.heroRankedPage = String(pageIndex);
            page.setAttribute("aria-hidden", String(pageIndex !== currentPage));
            playersOnPage.forEach((player, playerIndex) =>
                append(page, createPlayer(player, pageIndex * pageSize + playerIndex, currency)),
            );
            append(track as HTMLElement, page);
        });

        viewport.replaceChildren(track);
        viewport.setAttribute("aria-busy", "false");
        controls.hidden = pageCount <= 1;
        pageDots.replaceChildren();
        pages.forEach((_, index) => {
            const dot = el("button", "hero-ranked__page-dot");
            dot.type = "button";
            dot.dataset.heroRankedPageDot = String(index);
            dot.setAttribute(
                "aria-label",
                replaceTemplate(copy.showingRanks, {
                    start: index * pageSize + 1,
                    end: Math.min((index + 1) * pageSize, playerCount),
                    total: playerCount,
                }),
            );
            dot.addEventListener("click", () => updatePage(index, true));
            pageDots.append(dot);
        });
        updatePage(currentPage);
    };

    const renderEmpty = (message: string, retry = false): void => {
        const empty = el("div", "hero-ranked__empty", message);
        if (retry) {
            const retryButton = el("button", "", copy.retry);
            retryButton.type = "button";
            retryButton.addEventListener("click", () =>
                window.dispatchEvent(new CustomEvent("hoc:ranked-arena-refresh", { detail: "top" })),
            );
            append(empty, retryButton);
        }
        viewport.replaceChildren(empty);
        viewport.setAttribute("aria-busy", "false");
        controls.hidden = true;
        range.textContent = "";
        track = null;
        pageCount = 0;
        playerCount = 0;
    };

    previous.addEventListener("click", () => updatePage(currentPage - 1, true));
    next.addEventListener("click", () => updatePage(currentPage + 1, true));
    viewport.addEventListener("keydown", (event) => {
        if (event.target !== viewport) return;
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            updatePage(currentPage - 1, true);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            updatePage(currentPage + 1, true);
        }
    });

    let touchStartX = 0;
    viewport.addEventListener(
        "touchstart",
        (event) => {
            touchStartX = event.touches[0]?.clientX ?? 0;
        },
        { passive: true },
    );
    viewport.addEventListener(
        "touchend",
        (event) => {
            const distance = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
            if (Math.abs(distance) < 42) return;
            updatePage(currentPage + (distance < 0 ? 1 : -1), true);
        },
        { passive: true },
    );

    ladderLink?.addEventListener("click", () =>
        window.dispatchEvent(new CustomEvent("hoc:ranked-arena-select-player", { detail: "" })),
    );

    root.dataset.initialized = "true";

    return {
        update(state): void {
            const players = (state.top?.players ?? []).slice(0, topN);
            const currency = state.currency ?? LEGACY_SEASON_CURRENCY;
            if (players.length) {
                const nextSignature = `${currency.name}:${currency.symbol}:${seasonCurrencyIconUrl(currency)}|${players
                    .map((player, index) => `${player.playerId}:${rankFor(player, index + 1)}:${player.mmr}`)
                    .join("|")}`;
                if (nextSignature !== signature) {
                    signature = nextSignature;
                    renderPlayers(players, currency);
                }
                frame.dataset.state = state.error || state.cached ? "stale" : state.loading ? "refreshing" : "live";
                return;
            }

            signature = "";
            if (state.error) {
                frame.dataset.state = "error";
                renderEmpty(copy.errorBody, true);
            } else if (state.top) {
                frame.dataset.state = "empty";
                renderEmpty(copy.noPlayers);
            } else {
                frame.dataset.state = "loading";
                viewport.setAttribute("aria-busy", "true");
            }
        },
    };
}
