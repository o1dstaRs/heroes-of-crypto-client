import type { GameEvent, HoCMath } from "@heroesofcrypto/common";

type UnitAttackedEvent = Extract<GameEvent, { type: "unit_attacked" }>;

/**
 * Use the exact aim already stamped onto the live action. Only hover/legacy callers without one may
 * recompute from the cursor, and target position remains the final fail-closed endpoint.
 */
export function resolveLiveRangeProjectileTracePosition(
    exactAimPosition: HoCMath.XY | undefined,
    fallbackAimPosition: () => HoCMath.XY | undefined,
    targetPosition: HoCMath.XY,
): HoCMath.XY {
    const position = exactAimPosition ?? fallbackAimPosition() ?? targetPosition;
    return { x: position.x, y: position.y };
}

export interface IRangeProjectileImpact {
    /** Unit the projectile should visibly land on. */
    readonly targetUnitId: string;
    /** Authoritative fallback endpoint when the hit unit is absent, or the aimed edge for a direct hit. */
    readonly targetPosition?: HoCMath.XY;
    readonly intercepted: boolean;
}

const clonePosition = (position?: HoCMath.XY): HoCMath.XY | undefined =>
    position ? { x: position.x, y: position.y } : undefined;

const samePosition = (left: HoCMath.XY | undefined, right: HoCMath.XY): boolean =>
    !!left && Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01;

/**
 * The counter-shot's animation entry in a range attack, or undefined when the defender did not shoot back.
 *
 * Identified by its ORIGIN, not its victim. Every outgoing volley leaves the attacker, so the one entry
 * whose `fromPosition` is somewhere else is the response — the same discriminator the impact plan below
 * already uses to exclude it from the outgoing shots.
 *
 * The obvious-looking test, "an animation naming the attacker", is wrong and was the bug: the engine
 * stamps `affectedUnit` with the counter's FIRST VICTIM, and the counter's ray stops on the first ENEMY
 * it meets — which, fired back down the lane, is whatever stack of the attacker's own army is screening
 * it. Measured over 20-40 v0.8 matches, that is about a third of all counter-shots, and in every one of
 * those the victim was on the attacker's team. Asking about the victim therefore silently dropped the
 * whole retaliation (projectile, lunge, damage number and log line) for a routine formation.
 */
export const findRangeResponseAnimation = (
    attackEvent: UnitAttackedEvent,
    attackerPosition: HoCMath.XY,
): UnitAttackedEvent["animations"][number] | undefined =>
    attackEvent.animations.find((animation) => !samePosition(animation.fromPosition, attackerPosition));

const hasLegacyDoubleShotEvidence = (
    attackEvent: UnitAttackedEvent,
    requestedTargetId: string,
    nonResponseAnimations: UnitAttackedEvent["animations"],
): boolean => {
    if ((attackEvent.damage.hits?.length ?? 0) > 1) {
        return true;
    }
    const splashCounts = new Map<string, number>();
    for (const entry of attackEvent.damage.splash ?? []) {
        const count = (splashCounts.get(entry.unitId) ?? 0) + 1;
        if (count > 1) {
            return true;
        }
        splashCounts.set(entry.unitId, count);
    }
    return nonResponseAnimations.filter((animation) => animation.affectedUnitId === requestedTargetId).length > 1;
};

/**
 * Resolve one ordered endpoint per outgoing ranged projectile from the authoritative combat event.
 *
 * Each outgoing shot owns an ordered animation entry. This matters when Double Shot kills an
 * interceptor and retargets: damage.unitId then describes only shot two, while the two animations
 * retain shot one's and shot two's distinct victims. A ranged retaliation targets the original
 * attacker and is excluded. Modern events also carry fromPosition, which protects against a response
 * intercepted by a third unit; old journals fall back to first/last ordering only with double-shot
 * evidence. Through Shot travels to the requested aim once per authoritative volley, including a
 * second Double Shot / Crafted Double Shot volley when the engine records one. Cemetery blockers are
 * recorded as separate `obstacle_attacked` events, so callers prepend their ordered positions here;
 * those impacts consume projectile slots before the remaining unit-target animations.
 */
export function resolveRangeProjectileImpactPlan(
    attackEvent: UnitAttackedEvent,
    requestedTargetId: string,
    attackerPosition: HoCMath.XY,
    throughShot: boolean,
    doubleShot: boolean,
    precedingObstaclePositions: readonly HoCMath.XY[] = [],
): readonly IRangeProjectileImpact[] {
    const projectileCount = doubleShot ? 2 : 1;
    const obstacleImpacts: IRangeProjectileImpact[] = precedingObstaclePositions
        .slice(0, projectileCount)
        .map((position) => ({
            targetUnitId: requestedTargetId,
            targetPosition: clonePosition(position),
            intercepted: false,
        }));
    const remainingProjectiles = projectileCount - obstacleImpacts.length;
    if (remainingProjectiles <= 0) {
        return obstacleImpacts;
    }
    const withObstacleImpacts = (unitImpacts: readonly IRangeProjectileImpact[]): IRangeProjectileImpact[] =>
        [...obstacleImpacts, ...unitImpacts].slice(0, projectileCount);

    const animations = attackEvent.animations ?? [];
    const requestedAnimation = animations.find((animation) => animation.affectedUnitId === requestedTargetId);

    if (throughShot) {
        const sourcedVolleys = animations.filter((animation) => samePosition(animation.fromPosition, attackerPosition));
        const recordedVolleys = sourcedVolleys.length ? sourcedVolleys : animations;
        const volleyCount = Math.max(1, Math.min(remainingProjectiles, recordedVolleys.length));
        const aimedEdge = (requestedAnimation ?? recordedVolleys[0])?.toPosition;
        return withObstacleImpacts(
            Array.from({ length: volleyCount }, (_, index) => ({
                targetUnitId: requestedTargetId,
                targetPosition: clonePosition(aimedEdge ?? recordedVolleys[index]?.toPosition),
                intercepted: false,
            })),
        );
    }

    const nonResponseAnimations = animations.filter((animation) => animation.affectedUnitId !== attackEvent.attackerId);
    const sourcedOutgoing = nonResponseAnimations.filter((animation) =>
        samePosition(animation.fromPosition, attackerPosition),
    );
    let outgoingAnimations: UnitAttackedEvent["animations"];
    if (sourcedOutgoing.length) {
        outgoingAnimations = sourcedOutgoing.slice(0, remainingProjectiles);
    } else {
        const first = nonResponseAnimations[0];
        outgoingAnimations = first ? [first] : [];
        if (
            remainingProjectiles > 1 &&
            first &&
            hasLegacyDoubleShotEvidence(attackEvent, requestedTargetId, nonResponseAnimations)
        ) {
            const second = nonResponseAnimations.at(-1);
            if (second && second !== first) {
                outgoingAnimations.push(second);
            }
        }
    }

    if (!outgoingAnimations.length) {
        const targetUnitId = attackEvent.damage.unitId ?? requestedTargetId;
        const intercepted = targetUnitId !== requestedTargetId;
        return withObstacleImpacts([
            {
                targetUnitId,
                targetPosition: intercepted ? clonePosition(attackEvent.damage.unitPosition) : undefined,
                intercepted,
            },
        ]);
    }

    const splashOccurrence = new Map<string, number>();
    return withObstacleImpacts(
        outgoingAnimations.map((animation, index) => {
            const targetUnitId =
                animation.affectedUnitId ??
                (index === outgoingAnimations.length - 1 ? attackEvent.damage.unitId : undefined) ??
                requestedTargetId;
            const intercepted = targetUnitId !== requestedTargetId;
            if (!intercepted) {
                return {
                    targetUnitId,
                    targetPosition: clonePosition(animation.toPosition),
                    intercepted: false,
                };
            }

            const occurrence = splashOccurrence.get(targetUnitId) ?? 0;
            splashOccurrence.set(targetUnitId, occurrence + 1);
            const splash = (attackEvent.damage.splash ?? []).filter((entry) => entry.unitId === targetUnitId)[
                occurrence
            ];
            const fallbackPosition =
                splash?.position ??
                (attackEvent.damage.unitId === targetUnitId ? attackEvent.damage.unitPosition : undefined);
            return {
                targetUnitId,
                targetPosition: clonePosition(fallbackPosition),
                intercepted: true,
            };
        }),
    );
}

/**
 * Existing units land at their rendered center (important for 2x2 stacks). Removed units use the
 * pre-action rendered center when available, then their per-shot authoritative event fallback.
 */
export function resolveRangeProjectilePlaybackPosition(
    impact: IRangeProjectileImpact,
    impactUnitExists: boolean,
    capturedVisualCenter?: HoCMath.XY,
): HoCMath.XY | undefined {
    if (!impact.intercepted) {
        return clonePosition(impact.targetPosition);
    }
    if (impactUnitExists) {
        return undefined;
    }
    return clonePosition(capturedVisualCenter ?? impact.targetPosition);
}
