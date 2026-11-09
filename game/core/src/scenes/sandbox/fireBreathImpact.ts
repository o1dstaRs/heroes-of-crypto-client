import type { HoCMath, IVisibleDamage } from "@heroesofcrypto/common";

/** Recorded breath victims behind this primary belong to this strike, regardless of their team.
 * The opposite counter breath travels away from the other fighter. Only assign recorded damage;
 * never recalculate targets or consult abilities which Break/theft may already have changed.
 */
export function fireBreathHitsForStrike(
    secondary: IVisibleDamage["secondary"],
    source: HoCMath.XY,
    primary: HoCMath.XY,
): NonNullable<IVisibleDamage["secondary"]> {
    const dx = primary.x - source.x;
    const dy = primary.y - source.y;
    return (secondary ?? []).filter(
        (hit) =>
            hit.source === "fire_breath" && (hit.position.x - primary.x) * dx + (hit.position.y - primary.y) * dy > 0,
    );
}
