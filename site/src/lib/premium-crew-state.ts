import { CREW_LEVELS, premiumCrewSlots, type CrewLayout } from "./premium-crew";
import type { PremiumCatalog } from "./premium-library";

export const PREMIUM_CREW_STORAGE_KEY = "hoc.premium.crew.v1";
export type CrewBattlefield = "all" | "1" | "3" | "4";
export interface PremiumCrewDraft {
    version: 1;
    ids: number[];
    layout: CrewLayout;
    battlefield: CrewBattlefield;
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
    return {
        version: 1,
        ids: premiumCrewSlots(ids, catalog).filter((id): id is number => id !== undefined),
        layout: raw.layout === "spread" ? "spread" : "screen",
        battlefield: ["all", "1", "3", "4"].includes(raw.battlefield ?? "") ? raw.battlefield! : "all",
    };
}

export function readPremiumCrewDraft(url: URL, stored: string | null, catalog: PremiumCatalog): PremiumCrewDraft {
    if (url.searchParams.has("crew")) {
        const crew = url.searchParams.get("crew") ?? "";
        return normalizePremiumCrewDraft(
            {
                version: 1,
                ids: crew.length <= 128 ? crew.split(",").filter(Boolean).map(Number) : [],
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
    url.hash = "premium-crew";
    return url.href;
}
