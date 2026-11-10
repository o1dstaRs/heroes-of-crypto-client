import { CREW_LEVELS, premiumCrewSlots, type CrewLayout } from "./premium-crew";
import type { PremiumCatalog } from "./premium-library";
import {
    CREW_SYNERGY_FACTIONS,
    normalizeCrewSynergyVariants,
    type CrewSynergyVariants,
} from "./premium-crew-synergies";

export const PREMIUM_CREW_STORAGE_KEY = "hoc.premium.crew.v1";
export type CrewBattlefield = "all" | "1" | "3" | "4";
export interface PremiumCrewDraft {
    version: 1;
    ids: number[];
    layout: CrewLayout;
    battlefield: CrewBattlefield;
    enemyIds?: number[];
    artifactIds?: [number, number];
    synergyVariants?: CrewSynergyVariants;
}

/** Saved drafts and shared URLs must obey today's roster and draft limits. */
export function normalizePremiumCrewDraft(value: unknown, catalog: PremiumCatalog): PremiumCrewDraft {
    const raw =
        value && typeof value === "object" && (value as Partial<PremiumCrewDraft>).version === 1
            ? (value as Partial<PremiumCrewDraft>)
            : {};
    const ids: number[] = [];
    if (raw.version === 1 && Array.isArray(raw.ids)) {
        for (const id of raw.ids.slice(0, 64)) {
            const item = catalog.units[id];
            if (!Number.isSafeInteger(id) || ids.includes(id) || !item?.kit?.amount) continue;
            const capacity = CREW_LEVELS.filter((level) => level === item.level).length;
            if (ids.filter((picked) => catalog.units[picked].level === item.level).length < capacity) ids.push(id);
        }
    }
    const enemyIds: number[] = [];
    if (Array.isArray(raw.enemyIds)) {
        for (const id of raw.enemyIds.slice(0, 64)) {
            const item = catalog.units[id];
            if (!Number.isSafeInteger(id) || ids.includes(id) || enemyIds.includes(id) || !item?.kit?.amount) continue;
            if (
                enemyIds.filter((picked) => catalog.units[picked].level === item.level).length <
                CREW_LEVELS.filter((level) => level === item.level).length
            )
                enemyIds.push(id);
        }
    }
    const artifactIds = [0, 1].map((tier) => {
        const id = Array.isArray(raw.artifactIds) ? raw.artifactIds[tier] : undefined;
        return Number.isSafeInteger(id) && catalog.artifacts[`${tier + 1}:${id}`] ? id! : 0;
    }) as [number, number];
    const synergyVariants = normalizeCrewSynergyVariants(raw.synergyVariants);
    return {
        version: 1,
        ids: premiumCrewSlots(ids, catalog).filter((id): id is number => id !== undefined),
        layout: raw.layout === "spread" ? "spread" : "screen",
        battlefield: ["all", "1", "3", "4"].includes(raw.battlefield ?? "") ? raw.battlefield! : "all",
        ...(enemyIds.length === 6
            ? { enemyIds: premiumCrewSlots(enemyIds, catalog).filter((id): id is number => id !== undefined) }
            : {}),
        ...(artifactIds.some(Boolean) ? { artifactIds } : {}),
        ...(Object.keys(synergyVariants).length ? { synergyVariants } : {}),
    };
}

export function readPremiumCrewDraft(url: URL, stored: string | null, catalog: PremiumCatalog): PremiumCrewDraft {
    if (url.searchParams.has("crew")) {
        const crew = url.searchParams.get("crew") ?? "";
        const enemy = url.searchParams.get("enemy") ?? "";
        const artifacts = url.searchParams.get("artifacts") ?? "";
        const synergies = url.searchParams.get("synergies") ?? "";
        const variants = synergies.length <= 16 ? synergies.split(",").map(Number) : [];
        return normalizePremiumCrewDraft(
            {
                version: 1,
                ids: crew.length <= 128 ? crew.split(",").filter(Boolean).map(Number) : [],
                enemyIds: enemy.length <= 128 ? enemy.split(",").filter(Boolean).map(Number) : [],
                artifactIds: artifacts.length <= 32 ? artifacts.split(",").map(Number) : [],
                synergyVariants: Object.fromEntries(
                    CREW_SYNERGY_FACTIONS.map((faction, index) => [faction, variants[index]]),
                ),
                layout: url.searchParams.get("formation"),
                battlefield: url.searchParams.get("battlefield"),
            },
            catalog,
        );
    }
    try {
        return normalizePremiumCrewDraft(stored && stored.length <= 4096 ? JSON.parse(stored) : null, catalog);
    } catch {
        return normalizePremiumCrewDraft(null, catalog);
    }
}

export function premiumCrewShareUrl(current: URL, draft: PremiumCrewDraft): string {
    const url = new URL(current.pathname, current.origin);
    url.searchParams.set("crew", draft.ids.join(","));
    if (draft.layout !== "screen") url.searchParams.set("formation", draft.layout);
    if (draft.battlefield !== "all") url.searchParams.set("battlefield", draft.battlefield);
    if (draft.enemyIds?.length) url.searchParams.set("enemy", draft.enemyIds.join(","));
    if (draft.artifactIds?.some(Boolean)) url.searchParams.set("artifacts", draft.artifactIds.join(","));
    if (draft.synergyVariants && Object.keys(draft.synergyVariants).length)
        url.searchParams.set(
            "synergies",
            CREW_SYNERGY_FACTIONS.map((faction) => draft.synergyVariants?.[faction] ?? 0).join(","),
        );
    url.hash = "premium-crew";
    return url.href;
}
