export type ManualAttackIntent =
    { kind: "melee" | "range" | "area" | "spell"; resolvedPrimaryTargetId?: string } | { kind: "obstacle" };

/**
 * Aggr narrows every attack to its still-living source. The scene resolves whether that source is alive;
 * an absent id means the lock has expired and no client action should be blocked on its behalf.
 */
export const isManualAttackBlockedByAggr = (
    liveForcedTargetId: string | undefined,
    intent: ManualAttackIntent,
): boolean => {
    if (!liveForcedTargetId) {
        return false;
    }
    if (intent.kind === "obstacle") {
        return true;
    }
    // Empty Area Throw is a legal miss in the authoritative engine. Every other attack surface requires
    // a primary; non-empty attacks are gated on affectedUnits[0][0], not a later splash victim.
    if (!intent.resolvedPrimaryTargetId) {
        return intent.kind !== "area";
    }
    return intent.resolvedPrimaryTargetId !== liveForcedTargetId;
};

export const formatAggrBlockedActionHint = (forcedTargetName?: string): string =>
    forcedTargetName ? `Aggr — must attack ${forcedTargetName}` : "Aggr — must attack the unit that provoked it";

export const isAggrBlockedActionHint = (value: string | undefined): boolean =>
    typeof value === "string" && value.startsWith("Aggr — must attack ");

/** Double Shot's first projectile clears one scattered blocker; only its second ray reaches the Aggr gate. */
export const shouldResolveAggrAfterFirstDoubleShotObstacle = (
    scatteredObstacleCount: number,
    hasDoubleShot: boolean,
    ignoresStructures: boolean,
): boolean => hasDoubleShot && !ignoresStructures && scatteredObstacleCount === 1;
