import { describe, expect, test } from "bun:test";

import { AttackVals } from "@heroesofcrypto/common";

import { resolveMeleeAttackFromPointer, resolveMeleeCursorDirection } from "./Sandbox";
import { meleeSwordDisplayLength, meleeSwordTargetPoint, snapMeleeSwordAngle } from "./HoverManager";

const attackFrom = { x: 4, y: 5 };

const params = (overrides: Partial<Parameters<typeof resolveMeleeAttackFromPointer>[0]> = {}) => ({
    attackTypeSelection: AttackVals.MELEE,
    hasNoMelee: false,
    hasEnemyTarget: true,
    targetIsHidden: false,
    isForcedTargetAllowed: true,
    isCowardiceBlocked: false,
    isEngineMeleeTarget: true,
    isRangeAttackPreferred: () => false,
    resolveAttackFrom: () => attackFrom,
    ...overrides,
});

describe("pointer-driven unit melee targeting", () => {
    test("faces the sword blade from the landing side toward the target", () => {
        expect(resolveMeleeCursorDirection(3, 4)).toBe("right");
        expect(resolveMeleeCursorDirection(5, 4)).toBe("left");
    });

    test("locks the board sword to the eight 45-degree attack facings", () => {
        const step = Math.PI / 4;
        for (let facing = -4; facing < 4; facing += 1) {
            const angle = facing * step;
            expect(snapMeleeSwordAngle(angle + step * 0.2)).toBeCloseTo(angle);
        }
    });

    test("runs from each neighbouring cell to the matching target edge or corner", () => {
        const target = { x: 100, y: 100 };
        expect(meleeSwordTargetPoint({ x: 50, y: 100 }, target, 20)).toEqual({ x: 80, y: 100 });
        expect(meleeSwordTargetPoint({ x: 150, y: 100 }, target, 20)).toEqual({ x: 120, y: 100 });
        expect(meleeSwordTargetPoint({ x: 50, y: 50 }, target, 20)).toEqual({ x: 80, y: 80 });
        expect(meleeSwordTargetPoint({ x: 150, y: 150 }, target, 20)).toEqual({ x: 120, y: 120 });
    });

    test("keeps diagonal swords the same size as horizontal and vertical swords", () => {
        const cardinalLength = 80;
        expect(meleeSwordDisplayLength(cardinalLength, 0)).toBeCloseTo(cardinalLength);
        expect(meleeSwordDisplayLength(cardinalLength * Math.SQRT2, Math.PI / 4)).toBeCloseTo(cardinalLength);
        expect(meleeSwordDisplayLength(cardinalLength * Math.SQRT2, -Math.PI / 4)).toBeCloseTo(cardinalLength);
    });

    test("returns the pointer-selected landing for a legal melee target", () => {
        expect(resolveMeleeAttackFromPointer(params())).toEqual(attackFrom);
    });

    test.each([
        ["magic mode", { attackTypeSelection: AttackVals.MAGIC }],
        ["No Melee", { hasNoMelee: true }],
        ["friendly target", { hasEnemyTarget: false }],
        ["hidden target", { targetIsHidden: true }],
        ["forced-target rejection", { isForcedTargetAllowed: false }],
        ["Cowardice", { isCowardiceBlocked: true }],
        ["engine target rejection", { isEngineMeleeTarget: false }],
    ] as const)("never promises a sword for %s", (_reason, overrides) => {
        let rangeChecks = 0;
        let pathChecks = 0;
        expect(
            resolveMeleeAttackFromPointer(
                params({
                    ...overrides,
                    isRangeAttackPreferred: () => {
                        rangeChecks += 1;
                        return false;
                    },
                    resolveAttackFrom: () => {
                        pathChecks += 1;
                        return attackFrom;
                    },
                }),
            ),
        ).toBeUndefined();
        expect(rangeChecks).toBe(0);
        expect(pathChecks).toBe(0);
    });

    test("keeps a selected static range shot over melee without probing a landing", () => {
        let pathChecks = 0;
        expect(
            resolveMeleeAttackFromPointer(
                params({
                    attackTypeSelection: AttackVals.RANGE,
                    isRangeAttackPreferred: () => true,
                    resolveAttackFrom: () => {
                        pathChecks += 1;
                        return attackFrom;
                    },
                }),
            ),
        ).toBeUndefined();
        expect(pathChecks).toBe(0);
    });

    test("lets a selected ranged unit fall back to melee when it cannot shoot", () => {
        expect(
            resolveMeleeAttackFromPointer(
                params({ attackTypeSelection: AttackVals.RANGE, isRangeAttackPreferred: () => false }),
            ),
        ).toEqual(attackFrom);
    });
});
