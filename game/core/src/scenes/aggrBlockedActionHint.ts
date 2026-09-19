export type ManualAttackIntent =
    | { kind: "melee" | "range" | "spell"; resolvedPrimaryTargetId?: string }
    /** A splash has no single target: it is judged by everything its blast actually catches. */
    | { kind: "area"; splashTargetIds?: readonly string[] }
    | { kind: "obstacle" };

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
    if (intent.kind === "area") {
        // A blast strikes its whole 3x3 at once and has no "the" target, so the lock asks the only question
        // that means anything there: does it CATCH the provoker? Which victim the 3x3 enumerates first says
        // nothing about the aim — the aimed cell is enumerated LAST (cellsAround + target), so the first
        // entry is whichever stack stands in the ring, and reading it refused a throw aimed squarely at the
        // provoker for the crime of having a neighbour. The engine judges a splash the same way
        // (attack_handler, handleRangeAttack's AOE branch). A blast that catches nobody catches no provoker
        // either, so it cannot satisfy the lock — the engine is the more forgiving of the two there and
        // scores an empty throw as a plain miss.
        return !intent.splashTargetIds?.some((id) => id === liveForcedTargetId);
    }
    if (!intent.resolvedPrimaryTargetId) {
        return true;
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
