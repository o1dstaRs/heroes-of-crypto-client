type Recipient = {
    hasAbilityActive(name: string): boolean;
    isDead(): boolean;
};

/** Same condition as the engine's stat gain: casualties from damage, with a surviving owner. */
export function bitterExperienceTriggered(
    unit: Recipient | undefined,
    hit: { amount: number; unitsDied?: number; missed?: boolean; lethal?: boolean },
): boolean {
    return !!(
        unit &&
        hit.amount > 0 &&
        (hit.unitsDied ?? 0) > 0 &&
        !hit.missed &&
        !hit.lethal &&
        !unit.isDead() &&
        unit.hasAbilityActive?.("Bitter Experience")
    );
}
