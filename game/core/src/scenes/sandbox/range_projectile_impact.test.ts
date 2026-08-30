import { describe, expect, it } from "bun:test";

import type { GameEvent, HoCMath } from "@heroesofcrypto/common";

import {
    type IRangeProjectileImpact,
    findRangeResponseAnimation,
    resolveLiveRangeProjectileTracePosition,
    resolveRangeProjectileImpactPlan,
    resolveRangeProjectilePlaybackPosition,
} from "./range_projectile_impact";

type UnitAttackedEvent = Extract<GameEvent, { type: "unit_attacked" }>;

const ATTACKER_POSITION = { x: 100, y: 100 };
const AIM_POSITION = { x: 900, y: 700 };

const event = ({
    damageUnitId,
    damageUnitPosition = { x: 320, y: 480 },
    animations,
    hits,
    splash,
}: {
    damageUnitId?: string;
    damageUnitPosition?: HoCMath.XY;
    animations: UnitAttackedEvent["animations"];
    hits?: NonNullable<UnitAttackedEvent["damage"]["hits"]>;
    splash?: NonNullable<UnitAttackedEvent["damage"]["splash"]>;
}): UnitAttackedEvent => ({
    type: "unit_attacked",
    attackType: "range",
    attackerId: "archer",
    targetId: "requested",
    unitIdsDied: [],
    damage: {
        amount: 10,
        render: true,
        unitPosition: damageUnitPosition,
        unitIsSmall: true,
        ...(damageUnitId ? { unitId: damageUnitId } : {}),
        ...(hits ? { hits } : {}),
        ...(splash ? { splash } : {}),
    },
    animations,
});

const outgoing = (
    affectedUnitId: string,
    toPosition: HoCMath.XY = AIM_POSITION,
): UnitAttackedEvent["animations"][number] => ({
    affectedUnitId,
    fromPosition: ATTACKER_POSITION,
    toPosition,
});

describe("live projectile trace position", () => {
    it("uses the action's exact aim without recomputing from the cursor", () => {
        let fallbackCalls = 0;
        const position = resolveLiveRangeProjectileTracePosition(
            { x: 450, y: 275 },
            () => {
                fallbackCalls += 1;
                return { x: 999, y: 999 };
            },
            { x: 800, y: 700 },
        );

        expect(position).toEqual({ x: 450, y: 275 });
        expect(fallbackCalls).toBe(0);
    });

    it("retains cursor then target fallback order when no exact action aim exists", () => {
        expect(
            resolveLiveRangeProjectileTracePosition(undefined, () => ({ x: 600, y: 500 }), {
                x: 800,
                y: 700,
            }),
        ).toEqual({ x: 600, y: 500 });
        expect(resolveLiveRangeProjectileTracePosition(undefined, () => undefined, { x: 800, y: 700 })).toEqual({
            x: 800,
            y: 700,
        });
    });
});

describe("authoritative ranged projectile plan", () => {
    it("keeps a direct single shot aimed at the requested visible edge", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                animations: [outgoing("requested")],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            false,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "requested",
                targetPosition: AIM_POSITION,
                intercepted: false,
            },
        ]);
    });

    it("lands an intercepted shot on the actual first victim", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "interceptor",
                animations: [outgoing("interceptor")],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            false,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "interceptor",
                targetPosition: { x: 320, y: 480 },
                intercepted: true,
            },
        ]);
    });

    it("emits two direct projectiles when Double Shot hits the same requested target", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                animations: [outgoing("requested"), outgoing("requested")],
                hits: [
                    { amount: 6, unitsDied: 0 },
                    { amount: 4, unitsDied: 0 },
                ],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "requested",
                targetPosition: AIM_POSITION,
                intercepted: false,
            },
            {
                targetUnitId: "requested",
                targetPosition: AIM_POSITION,
                intercepted: false,
            },
        ]);
    });

    it("still emits two projectiles when a Double Shot volley MISSES and reports no hit for it", () => {
        // A missed volley lands no damage, so it contributes no `hits` entry — but the engine still
        // records its outgoing animation (the arrow left the bow). The plan must be built from the
        // animations, not the damage, or a miss silently costs the player one of their two arrows.
        // Both shapes the engine actually produces are pinned: one volley landing, and neither landing.
        const secondMissed = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                animations: [outgoing("requested"), outgoing("requested")],
                hits: [{ amount: 6, unitsDied: 0 }],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
        );
        expect(secondMissed).toHaveLength(2);
        expect(secondMissed.every((impact) => !impact.intercepted)).toBe(true);

        const bothMissed = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                animations: [outgoing("requested"), outgoing("requested")],
                hits: [],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
        );
        expect(bothMissed).toHaveLength(2);
    });

    it("uses the remaining Double Shot animation after shot one destroys a cemetery object", () => {
        const cemeteryImpact = { x: 500, y: 300 };
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                // The engine records only the remaining unit-bound volley here. The first projectile
                // is the separate obstacle_attacked event supplied through cemeteryImpact.
                animations: [outgoing("requested")],
                hits: [{ amount: 6, unitsDied: 0 }],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
            [cemeteryImpact],
        );

        expect(plan).toEqual([
            {
                targetUnitId: "requested",
                targetPosition: cemeteryImpact,
                intercepted: false,
            },
            {
                targetUnitId: "requested",
                targetPosition: AIM_POSITION,
                intercepted: false,
            },
        ]);
    });

    it("retargets shot two after shot one kills an interceptor and ignores a response between them", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "requested",
                animations: [
                    outgoing("front"),
                    {
                        affectedUnitId: "archer",
                        fromPosition: { x: 500, y: 500 },
                        toPosition: ATTACKER_POSITION,
                    },
                    outgoing("requested"),
                ],
                hits: [
                    { amount: 6, unitsDied: 1 },
                    { amount: 4, unitsDied: 0 },
                ],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "front",
                targetPosition: undefined,
                intercepted: true,
            },
            {
                targetUnitId: "requested",
                targetPosition: AIM_POSITION,
                intercepted: false,
            },
        ]);
    });

    it("uses the matching AOE splash occurrence for each removed interceptor", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                animations: [outgoing("front"), outgoing("front")],
                splash: [
                    { unitId: "front", amount: 8, unitsDied: 1, position: { x: 300, y: 300 } },
                    { unitId: "front", amount: 5, unitsDied: 0, position: { x: 310, y: 310 } },
                ],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            true,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "front",
                targetPosition: { x: 300, y: 300 },
                intercepted: true,
            },
            {
                targetUnitId: "front",
                targetPosition: { x: 310, y: 310 },
                intercepted: true,
            },
        ]);
        expect(resolveRangeProjectilePlaybackPosition(plan[0], false)).toEqual({ x: 300, y: 300 });
        expect(resolveRangeProjectilePlaybackPosition(plan[1], false)).toEqual({ x: 310, y: 310 });
    });

    it("uses rendered centers for existing and captured 2x2 victims before event-anchor fallback", () => {
        const impact: IRangeProjectileImpact = {
            targetUnitId: "large-interceptor",
            targetPosition: { x: 320, y: 480 },
            intercepted: true,
        };
        const capturedVisualCenter = { x: 370, y: 530 };

        // Undefined tells the scene to use the existing RenderableUnit.getVisualCenter().
        expect(resolveRangeProjectilePlaybackPosition(impact, true, capturedVisualCenter)).toBeUndefined();
        expect(resolveRangeProjectilePlaybackPosition(impact, false, capturedVisualCenter)).toEqual(
            capturedVisualCenter,
        );
        expect(resolveRangeProjectilePlaybackPosition(impact, false)).toEqual({ x: 320, y: 480 });
    });

    it("keeps a single Through Shot to exactly one aimed-edge projectile despite legacy extra animations", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "first-pierced-unit",
                animations: [
                    outgoing("first-pierced-unit"),
                    outgoing("second-pierced-unit"),
                    outgoing("requested", { x: 850, y: 720 }),
                ],
            }),
            "requested",
            ATTACKER_POSITION,
            true,
            false,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "requested",
                targetPosition: { x: 850, y: 720 },
                intercepted: false,
            },
        ]);
    });

    it("emits two aimed-edge projectiles for an authoritative Through Shot double volley", () => {
        const secondVolleyPosition = { x: 850, y: 720 };
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "last-pierced-unit",
                animations: [
                    outgoing("last-pierced-unit", secondVolleyPosition),
                    outgoing("last-survivor", secondVolleyPosition),
                ],
            }),
            "requested",
            ATTACKER_POSITION,
            true,
            true,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "requested",
                targetPosition: secondVolleyPosition,
                intercepted: false,
            },
            {
                targetUnitId: "requested",
                targetPosition: secondVolleyPosition,
                intercepted: false,
            },
        ]);
    });

    it("falls back to legacy damage victim data when animations are absent", () => {
        const plan = resolveRangeProjectileImpactPlan(
            event({
                damageUnitId: "dead-interceptor",
                animations: [],
            }),
            "requested",
            ATTACKER_POSITION,
            false,
            false,
        );

        expect(plan).toEqual([
            {
                targetUnitId: "dead-interceptor",
                targetPosition: { x: 320, y: 480 },
                intercepted: true,
            },
        ]);
    });
});

/**
 * The counter-shot is the one animation that does not START at the attacker.
 *
 * It cannot be found by its victim: the engine stamps the entry with the counter's FIRST VICTIM, and a
 * counter fired back down the lane stops on the first enemy it meets — routinely one of the attacker's
 * OWN stacks, screening them. Measured over full v0.8 matches that is roughly a third of all counters,
 * and every one of those had the victim on the attacker's team. The old victim-based test therefore
 * dropped the entire retaliation — projectile, lunge, damage number and log line — for a normal formation.
 */
describe("finding the counter-shot animation", () => {
    const outgoing = { fromPosition: ATTACKER_POSITION, toPosition: AIM_POSITION, affectedUnitId: "victim" };

    it("returns nothing when the defender did not shoot back", () => {
        expect(findRangeResponseAnimation(event({ animations: [outgoing] }), ATTACKER_POSITION)).toBeUndefined();
    });

    it("finds the counter even when it struck the attacker's own screening stack", () => {
        const response = { fromPosition: AIM_POSITION, toPosition: ATTACKER_POSITION, affectedUnitId: "our-screen" };

        const found = findRangeResponseAnimation(event({ animations: [outgoing, response] }), ATTACKER_POSITION);

        // Named by the SCREEN, not the attacker — the case the old check missed entirely.
        expect(found?.affectedUnitId).toBe("our-screen");
    });

    it("finds the counter in the ordinary case where it struck the attacker", () => {
        const response = { fromPosition: AIM_POSITION, toPosition: ATTACKER_POSITION, affectedUnitId: "attacker" };

        expect(
            findRangeResponseAnimation(event({ animations: [outgoing, response] }), ATTACKER_POSITION)?.affectedUnitId,
        ).toBe("attacker");
    });

    it("does not mistake a second outgoing volley for a counter", () => {
        const secondVolley = { fromPosition: ATTACKER_POSITION, toPosition: AIM_POSITION, affectedUnitId: "victim-2" };

        expect(
            findRangeResponseAnimation(event({ animations: [outgoing, secondVolley] }), ATTACKER_POSITION),
        ).toBeUndefined();
    });
});
