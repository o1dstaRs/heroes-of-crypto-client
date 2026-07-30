/*
 * The themed sword/bow cursor over a destructible mountain.
 *
 * The cursor and the click that damages the rock are decided by this ONE rule, because an attack cursor
 * is a promise that clicking lands a hit. Before it was shared, hovering a mountain the unit could
 * plainly hit showed the ordinary cursor -- the board read as inert terrain right up until the click.
 */
import { describe, expect, test } from "bun:test";

import { AttackVals, GridVals } from "@heroesofcrypto/common";

import { obstacleAttackKind } from "./Sandbox";

const params = (overrides: Partial<Parameters<typeof obstacleAttackKind>[0]> = {}) => ({
    hasActiveUnit: true,
    gridType: GridVals.BLOCK_CENTER as number,
    obstacleHitsLeft: 3,
    isCenterCell: () => true,
    attackTypeSelection: AttackVals.MELEE,
    canLandRangeHit: () => false,
    ...overrides,
});

describe("what the cursor may promise over a mountain", () => {
    test("a melee unit standing at the rock swings at it", () => {
        expect(obstacleAttackKind(params())).toBe("melee");
    });

    test("an archer that can land its shot shoots the rock", () => {
        expect(obstacleAttackKind(params({ attackTypeSelection: AttackVals.RANGE, canLandRangeHit: () => true }))).toBe(
            "range",
        );
    });

    test("an archer that cannot land its shot falls through to its melee swing", () => {
        // Locked in melee or out of ammo: clicking still swings, so the sword is the honest cursor.
        expect(
            obstacleAttackKind(params({ attackTypeSelection: AttackVals.RANGE, canLandRangeHit: () => false })),
        ).toBe("melee");
    });

    test("magic never chips the mountain, so it never raises an attack cursor", () => {
        expect(obstacleAttackKind(params({ attackTypeSelection: AttackVals.MAGIC }))).toBe("none");
        expect(obstacleAttackKind(params({ attackTypeSelection: AttackVals.MELEE_MAGIC }))).toBe("melee");
    });

    test("nothing to attack: wrong map, rubble already cleared, off the rock, or nobody active", () => {
        expect(obstacleAttackKind(params({ gridType: GridVals.NORMAL as number }))).toBe("none");
        expect(obstacleAttackKind(params({ obstacleHitsLeft: 0 }))).toBe("none");
        expect(obstacleAttackKind(params({ isCenterCell: () => false }))).toBe("none");
        expect(obstacleAttackKind(params({ hasActiveUnit: false }))).toBe("none");
    });

    test("the costly checks stay lazy -- they run on every mouse move", () => {
        let centerCellLookups = 0;
        let aggroMatrixLookups = 0;
        const counted = params({
            gridType: GridVals.NORMAL as number,
            isCenterCell: () => {
                centerCellLookups += 1;
                return true;
            },
            canLandRangeHit: () => {
                aggroMatrixLookups += 1;
                return true;
            },
        });

        expect(obstacleAttackKind(counted)).toBe("none");
        expect(centerCellLookups).toBe(0);
        expect(aggroMatrixLookups).toBe(0);

        // Off the rock: the aggro matrix must still not be consulted.
        obstacleAttackKind(
            params({
                isCenterCell: () => false,
                canLandRangeHit: () => {
                    aggroMatrixLookups += 1;
                    return true;
                },
            }),
        );
        expect(aggroMatrixLookups).toBe(0);
    });
});
