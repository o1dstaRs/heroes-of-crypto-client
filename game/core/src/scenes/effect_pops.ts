/*
 * -----------------------------------------------------------------------------
 * Pure decision logic for the "effect applied" pops — the spell icon + name that pops over a unit when
 * a debuff (violet, e.g. Beholder's Spit Ball landing Sadness / Quagmire / Weakness) or a buff (green)
 * is freshly applied, plus the brief colour wash on the unit. Shared by the local sandbox (which diffs
 * each unit's live RenderableUnit effects) and ranked (which diffs authoritative snapshots) so both
 * behave identically — and so the behaviour is unit-testable without standing up a Pixi scene.
 * -----------------------------------------------------------------------------
 */

import { HoCConfig } from "@heroesofcrypto/common";

/**
 * Aura effects (continuous, radius-based) are applied to and removed from a unit as it / its neighbours
 * move in and out of range, so they must NOT trigger an "applied" pop — only directly-applied effects
 * (spells, Beholder's Spit Ball, …) should.
 *
 * The discriminator is authoritative: the ABILITY is named "<X> Aura", but the EFFECT it lands on a unit
 * is a short name that does NOT carry the suffix (ability "Pegasus Might Aura" applies effect "Pegasus
 * Might"; "Luck Aura" applies "Luck"; "War Anger Aura" applies "War Anger"; "Disguise Aura" applies
 * "Disguise"). A "ends with ' Aura'" check alone therefore missed every one of them and let aura buffs
 * pop. HoCConfig.isAuraEffectName checks membership in the real aura_effects.json registry (keeping the
 * suffix as a belt-and-suspenders fallback), so this stays correct if new auras are added.
 */
export const isAuraEffectName = (name: string): boolean => HoCConfig.isAuraEffectName(name);

/**
 * Passive "team mark" effects a creature applies as a side effect of attacking — not a deliberately-cast
 * debuff. From the player's point of view these are ambient bonuses (grouped with the creature's auras),
 * so they must not pop either. Pegasus's "Pegasus Light" (applied to whoever it attacks, so allies
 * attacking that target gain morale) is one such: it isn't in aura_effects.json (it's a regular
 * EFFECT-type ability), hence this explicit list.
 */
const NON_ANIMATABLE_PASSIVE_EFFECT_NAMES: ReadonlySet<string> = new Set(["Pegasus Light"]);

/**
 * Morale / Dismorale are lap-scoped SYSTEM effects applied to many units at once at the start of a lap
 * (and cleared at the next). They must NOT ride the generic buff/debuff diff-pop: they'd re-surface
 * whenever any OTHER effect lands and, being long-lived, muddy "what just got applied". They get their
 * own dedicated pop driven by the discrete `morale_applied` event at lap start instead — so exclude them
 * here (matching the aura exclusion) from the diff entirely.
 */
export const isMoraleEffectName = (name: string): boolean => name === "Morale" || name === "Dismorale";

/**
 * Build the set of animatable effect names from a raw list — drops empties, aura effects, passive
 * "team mark" effects (Pegasus Light), and the lap-scoped Morale/Dismorale system effects (those animate
 * via the morale_applied event, not the diff).
 */
export function animatableEffectNames(names: Iterable<string>): Set<string> {
    const result = new Set<string>();
    for (const name of names) {
        if (
            name &&
            !isAuraEffectName(name) &&
            !isMoraleEffectName(name) &&
            !NON_ANIMATABLE_PASSIVE_EFFECT_NAMES.has(name)
        ) {
            result.add(name);
        }
    }
    return result;
}

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
