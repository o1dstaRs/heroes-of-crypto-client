import type { GameEvent, IVisibleDamage } from "@heroesofcrypto/common";

export type DeepWoundsVisualLevel = 1 | 2 | 3;

/** Cut count follows the source card, never the victim's cumulative damage multiplier. */
export function deepWoundsVisualLevel(abilities: readonly string[]): DeepWoundsVisualLevel {
    for (const level of [3, 2, 1] as const) {
        if (abilities.includes(`Deep Wounds Level ${level}`)) return level;
    }
    // The legacy level-zero card uses the same one-cut family as its static icon.
    return 1;
}

/** One entry per application. Both records can describe the same wound, while sweeps may only log the effect. */
export function countDeepWoundsApplications(
    wounds: IVisibleDamage["deepWounds"],
    events: readonly GameEvent[] = [],
): Map<string, number> {
    const recorded = new Map<string, number>();
    for (const wound of wounds ?? []) {
        if (!wound.unitId || !Number.isFinite(wound.power) || wound.power <= 0) continue;
        recorded.set(wound.unitId, (recorded.get(wound.unitId) ?? 0) + 1);
    }
    const applied = new Map<string, number>();
    for (const event of events) {
        if (event.type !== "effects_applied") continue;
        for (const application of event.applications) {
            if (application.name !== "Deep Wounds" || application.resisted || !application.unitId) continue;
            const count = (applied.get(application.unitId) ?? 0) + 1;
            applied.set(application.unitId, count);
            if (count > (recorded.get(application.unitId) ?? 0)) recorded.set(application.unitId, count);
        }
    }
    return recorded;
}
