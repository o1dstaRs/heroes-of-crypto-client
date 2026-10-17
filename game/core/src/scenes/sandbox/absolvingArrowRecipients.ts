import type { IVisibleDamage } from "@heroesofcrypto/common";

/** Read actual lifts, including when the arrow later misses its enemy. One feather per ally per shot. */
export function absolvingArrowRecipientIds(damage: IVisibleDamage | undefined, sourceUnitId: string): string[] {
    return [
        ...new Set(
            (damage?.absolutions ?? [])
                .filter(
                    (entry) =>
                        entry.sourceUnitId === sourceUnitId &&
                        entry.unitId !== sourceUnitId &&
                        entry.liftedNames.length > 0,
                )
                .map((entry) => entry.unitId),
        ),
    ];
}
