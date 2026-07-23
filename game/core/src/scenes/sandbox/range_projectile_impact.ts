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
 * evidence. Through Shot always remains one projectile travelling to the requested aim.
 */
export function resolveRangeProjectileImpactPlan(
    attackEvent: UnitAttackedEvent,
    requestedTargetId: string,
    attackerPosition: HoCMath.XY,
    throughShot: boolean,
    doubleShot: boolean,
): readonly IRangeProjectileImpact[] {
    const animations = attackEvent.animations ?? [];
    const requestedAnimation = animations.find((animation) => animation.affectedUnitId === requestedTargetId);

    if (throughShot) {
        return [
            {
                targetUnitId: requestedTargetId,
                targetPosition: clonePosition((requestedAnimation ?? animations[0])?.toPosition),
                intercepted: false,
            },
        ];
    }

    const nonResponseAnimations = animations.filter((animation) => animation.affectedUnitId !== attackEvent.attackerId);
    const sourcedOutgoing = nonResponseAnimations.filter((animation) =>
        samePosition(animation.fromPosition, attackerPosition),
    );
    let outgoingAnimations: UnitAttackedEvent["animations"];
    if (sourcedOutgoing.length) {
        outgoingAnimations = sourcedOutgoing.slice(0, doubleShot ? 2 : 1);
    } else {
        const first = nonResponseAnimations[0];
        outgoingAnimations = first ? [first] : [];
        if (doubleShot && first && hasLegacyDoubleShotEvidence(attackEvent, requestedTargetId, nonResponseAnimations)) {
            const second = nonResponseAnimations.at(-1);
            if (second && second !== first) {
                outgoingAnimations.push(second);
            }
        }
    }

    if (!outgoingAnimations.length) {
        const targetUnitId = attackEvent.damage.unitId ?? requestedTargetId;
        const intercepted = targetUnitId !== requestedTargetId;
        return [
            {
                targetUnitId,
                targetPosition: intercepted ? clonePosition(attackEvent.damage.unitPosition) : undefined,
                intercepted,
            },
        ];
    }

    const splashOccurrence = new Map<string, number>();
    return outgoingAnimations.map((animation, index) => {
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
        const splash = (attackEvent.damage.splash ?? []).filter((entry) => entry.unitId === targetUnitId)[occurrence];
        const fallbackPosition =
            splash?.position ??
            (attackEvent.damage.unitId === targetUnitId ? attackEvent.damage.unitPosition : undefined);
        return {
            targetUnitId,
            targetPosition: clonePosition(fallbackPosition),
            intercepted: true,
        };
    });
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
