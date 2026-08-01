import { describe, expect, test } from "bun:test";

import { AttackVals } from "@heroesofcrypto/common";

import { resolveMeleeAttackFromPointer } from "./Sandbox";

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
