/*
 * -----------------------------------------------------------------------------
 * Pure decision logic for the "effect applied" pops — the spell icon + name that pops over a unit when
 * a debuff (violet, e.g. Beholder's Spit Ball landing Sadness / Quagmire / Weakness) or a buff (green)
 * is freshly applied, plus the brief colour wash on the unit. Shared by the local sandbox (which diffs
 * each unit's live RenderableUnit effects) and ranked (which diffs authoritative snapshots) so both
 * behave identically — and so the behaviour is unit-testable without standing up a Pixi scene.
 * -----------------------------------------------------------------------------
 */

/** Which colour wash to flash on the unit when effects land — a debuff "hit" wins over a buff. */
export type EffectFlash = "debuff" | "buff" | "none";

export interface EffectPopDiff {
    /** Newly-applied debuff names to pop (violet label), in iteration order. */
    newDebuffs: string[];
    /** Newly-applied buff names to pop (green label), in iteration order. */
    newBuffs: string[];
    /** Colour wash to flash on the unit — a debuff "hit" takes priority over a buff when both land. */
    flash: EffectFlash;
    /** True on a unit's first sighting: the caller seeds the sets silently and animates nothing. */
    seeded: boolean;
}

/**
 * Diff a unit's previously-shown debuff/buff name sets against its current ones and decide what to
 * animate. A unit is seeded silently the first time it's seen (either previous set missing) so fight
 * start — or a reconnect that hydrates a unit mid-game with effects already on it — doesn't burst every
 * already-active effect at once. Otherwise only the names that are newly present animate.
 */
export function diffUnitEffects(
    prevDebuffs: ReadonlySet<string> | undefined,
    prevBuffs: ReadonlySet<string> | undefined,
    currentDebuffs: ReadonlySet<string>,
    currentBuffs: ReadonlySet<string>,
): EffectPopDiff {
    if (!prevDebuffs || !prevBuffs) {
        return { newDebuffs: [], newBuffs: [], flash: "none", seeded: true };
    }
    const newDebuffs = [...currentDebuffs].filter((name) => !prevDebuffs.has(name));
    const newBuffs = [...currentBuffs].filter((name) => !prevBuffs.has(name));
    const flash: EffectFlash = newDebuffs.length ? "debuff" : newBuffs.length ? "buff" : "none";
    return { newDebuffs, newBuffs, flash, seeded: false };
}
