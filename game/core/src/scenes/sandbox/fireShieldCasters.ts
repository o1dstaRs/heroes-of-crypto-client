import type { IVisibleDamage } from "@heroesofcrypto/common";

/** Fire Shield entries name the burned striker, not the owner of the shield. */
export function fireShieldCasterIds(attackerId: string, targetId: string, damage?: IVisibleDamage): string[] {
    if (!damage || damage.missed) return [];
    const reflected = (damage.secondary ?? []).filter(
        (hit) => hit.source === "fire_shield" && (hit.amount > 0 || hit.unitsDied > 0),
    );
    if (!reflected.length) return [];
    const victims = new Set([damage.unitId ?? targetId]);
    for (const hit of damage.splash ?? []) {
        if (!hit.missed && (hit.amount > 0 || hit.unitsDied > 0)) victims.add(hit.unitId);
    }
    for (const hit of damage.secondary ?? []) {
        if (
            ["fire_breath", "lightning_spin", "skewer_strike"].includes(hit.source) &&
            (hit.amount > 0 || hit.unitsDied > 0)
        )
            victims.add(hit.unitId);
    }
    const owners = new Set<string>();
    for (const hit of reflected) {
        if (hit.unitId === attackerId) {
            for (const id of victims) owners.add(id);
        } else if (victims.has(hit.unitId)) {
            owners.add(attackerId);
        }
    }
    return [...owners];
}
