/**
 * Client for the public /v1/meta-stats endpoint — the "current meta" aggregated over recent ranked
 * games: creature winrates, best pair/triple combos, artifact winrates per tier. Used to decorate
 * the Units and Artifacts codex pages with live data and to power meta widgets.
 */

export interface MetaCreatureRow {
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

export interface MetaComboRow {
    creatureIds: number[];
    names: string[];
    games: number;
    wins: number;
    losses: number;
    draws: number;
    winRatePct: number;
}

export interface MetaArtifactRow {
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

export interface MetaStats {
    computedAt: number;
    windowDays: number;
    games: number;
    draws: number;
    creatures: MetaCreatureRow[];
    pairs: MetaComboRow[];
    triples: MetaComboRow[];
    artifactsTier1: MetaArtifactRow[];
    artifactsTier2: MetaArtifactRow[];
}

const runtimeHost = globalThis.location?.hostname ?? "";
const isProduction =
    runtimeHost === "heroesofcrypto.io" ||
    runtimeHost.endsWith(".heroesofcrypto.io") ||
    (import.meta.env.VITE_IS_PROD !== "false" && import.meta.env.PROD === true) ||
    import.meta.env.VITE_IS_PROD === "true";

const sameHostPort = import.meta.env.VITE_ARENA_SAME_HOST_API_PORT as string | undefined;
const apiBase = String(
    (sameHostPort && globalThis.location
        ? `${globalThis.location.protocol}//${globalThis.location.hostname}:${sameHostPort}`
        : "") ||
        import.meta.env.VITE_HOST_MATCHMAKING_API ||
        (isProduction ? "https://mm.heroesofcrypto.io" : "http://localhost:3001"),
).replace(/\/+$/, "");

const META_STATS_URL = `${apiBase}${isProduction ? "/v1/meta-stats" : "/v1/mm/meta-stats"}`;

/** Names differ cosmetically between data sources ("Warlord's Edge" vs "Warlords Edge") — match loosely. */
export const metaNameKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

let cached: MetaStats | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function fetchMetaStats(): Promise<MetaStats | null> {
    if (cached && Date.now() - cachedAt < CACHE_MS) {
        return cached;
    }
    try {
        const response = await fetch(META_STATS_URL, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) {
            return cached;
        }
        cached = (await response.json()) as MetaStats;
        cachedAt = Date.now();
        return cached;
    } catch {
        return cached;
    }
}

const badge = (winRatePct: number, games: number, gamesLabel: string): HTMLElement => {
    const chip = document.createElement("span");
    chip.className = "meta-badge";
    chip.dataset.trend = winRatePct >= 55 ? "strong" : winRatePct <= 45 ? "weak" : "even";
    chip.textContent = `${winRatePct.toFixed(1).replace(/\.0$/, "")}% WR · ${games} ${gamesLabel}`;
    return chip;
};

/**
 * Decorate the Units codex: every card carrying data-unit-name gets a live winrate badge. Cards
 * whose creature has no recorded games stay untouched (no misleading 0%).
 */
export async function decorateUnitCards(gamesLabel = "games"): Promise<void> {
    const stats = await fetchMetaStats();
    if (!stats || !stats.games) {
        return;
    }
    const byName = new Map(stats.creatures.map((row) => [metaNameKey(row.name), row]));
    for (const card of document.querySelectorAll<HTMLElement>("[data-unit-name]")) {
        if (card.querySelector(".meta-badge")) {
            continue;
        }
        const row = byName.get(metaNameKey(card.dataset.unitName ?? ""));
        if (!row || !row.games) {
            continue;
        }
        const anchor = card.querySelector(".unit-name") ?? card;
        anchor.insertAdjacentElement("afterend", badge(row.winRatePct, row.games, gamesLabel));
    }
}

/** Decorate the Artifacts codex: every card carrying data-artifact-name + data-tier gets a badge. */
export async function decorateArtifactCards(gamesLabel = "games"): Promise<void> {
    const stats = await fetchMetaStats();
    if (!stats || !stats.games) {
        return;
    }
    const rows = [...stats.artifactsTier1, ...stats.artifactsTier2];
    const byKey = new Map(rows.map((row) => [`${row.tier}:${metaNameKey(row.name)}`, row]));
    for (const card of document.querySelectorAll<HTMLElement>("[data-artifact-name]")) {
        if (card.querySelector(".meta-badge")) {
            continue;
        }
        const key = `${card.dataset.tier ?? ""}:${metaNameKey(card.dataset.artifactName ?? "")}`;
        const row = byKey.get(key);
        if (!row || !row.games) {
            continue;
        }
        const anchor = card.querySelector(".artifact-card-title") ?? card;
        anchor.appendChild(badge(row.winRatePct, row.games, gamesLabel));
    }
}
