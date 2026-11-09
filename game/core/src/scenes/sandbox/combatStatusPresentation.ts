import type { UnitProperties } from "@heroesofcrypto/common";

export const IMPACT_STATUS_NAMES = ["Stun", "Blindness", "Freeze", "Paralysis", "Whirlpool"] as const;
export const EMBER_COVENANT_STATUS = "Ember Covenant Blessing";

export interface CombatStatusFrame {
    effects: ReadonlySet<string>;
    buffs: ReadonlySet<string>;
    skipping: boolean;
    immobilized: boolean;
}

/** Ranked journals carry status names, rather than the engine's live Effect/Spell objects. */
export function combatStatusFrameFromProperties(
    properties: Pick<UnitProperties, "applied_effects" | "applied_debuffs" | "applied_buffs" | "applied_buffs_laps">,
    skipping?: boolean,
    webLocked = false,
): CombatStatusFrame {
    const names = new Set([...(properties.applied_effects ?? []), ...(properties.applied_debuffs ?? [])]);
    const effects = new Set<string>(IMPACT_STATUS_NAMES.filter((name) => names.has(name)));
    const buffs = new Set(
        (properties.applied_buffs ?? []).filter(
            (name, index) => name !== EMBER_COVENANT_STATUS || (properties.applied_buffs_laps?.[index] ?? 0) > 0,
        ),
    );
    return {
        effects,
        buffs,
        skipping: skipping ?? ["Stun", "Blindness", "Freeze", "Whirlpool"].some((name) => effects.has(name)),
        immobilized: webLocked || effects.has("Paralysis") || effects.has("Whirlpool"),
    };
}

export interface CombatStatusPresentation {
    before: CombatStatusFrame;
    visible: CombatStatusFrame;
    after?: CombatStatusFrame;
    pending(): boolean;
    waitForDamage: boolean;
    effectsPresented: boolean;
    buffsPresented: boolean;
    awaitingBuffs: Set<string>;
}
