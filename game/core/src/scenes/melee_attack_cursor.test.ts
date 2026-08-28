import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AttackVals } from "@heroesofcrypto/common";

import {
    rangedDamageModifierIcon,
    rangedDamagePredictionText,
    resolveMeleeAttackFromPointer,
    resolveMeleeCursorDirection,
} from "./Sandbox";
import {
    meleeSwordDisplayLength,
    meleeSwordFacingAngle,
    meleeSwordSpriteCenter,
    meleeSwordTargetPoint,
    snapMeleeSwordAngle,
} from "./HoverManager";

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
    isAttackFromAdjacent: () => true,
    ...overrides,
});

describe("pointer-driven unit melee targeting", () => {
    test("renders the sword in a camera sibling after the entire battlefield", () => {
        const hoverManagerSource = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        const pixiAppSource = readFileSync(join(import.meta.dir, "../pixi/PixiApp.ts"), "utf8");

        expect(hoverManagerSource).toContain("this.context.attachToCursorOverlay(sword)");
        expect(pixiAppSource).toContain("this.camera.addChild(this.worldRoot, this.cursorOverlayRoot)");
    });

    test("renders every damage prediction above barrels, units and target silhouettes", () => {
        const hoverManagerSource = readFileSync(join(import.meta.dir, "HoverManager.ts"), "utf8");
        const sandboxSource = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

        expect(hoverManagerSource).toContain(
            "this.context.attachToCursorOverlay(obj, DAMAGE_PREDICTION_OVERLAY_Z_INDEX)",
        );
        expect(hoverManagerSource).toContain("this.attachDamagePredictionObject(damageText)");
        expect(hoverManagerSource).toContain("this.attachDamagePredictionObject(this.hoverRangeModifierIcon)");
        expect(hoverManagerSource).toContain("this.attachDamagePredictionObject(this.hoverKillText)");
        expect(hoverManagerSource).toContain("this.attachDamagePredictionObject(this.hoverDamageIcon)");
        expect(sandboxSource).toContain("cursorOverlayRoot.sortableChildren = true");
    });

    test("uses the live range context when choosing the damage-preview attack origin", () => {
        const sandboxSource = readFileSync(join(import.meta.dir, "Sandbox.ts"), "utf8");

        // `isMelee` was removed when hover projection was unified. Leaving this stale reference made
        // every valid target hover throw after its highlight, before either damage or the attack marker
        // could be drawn.
        expect(sandboxSource).toContain("if (!isRangeAttackContext) {");
        expect(sandboxSource).not.toMatch(/\bif \(isMelee\) \{/);
    });

    test("shows the broken-arrow badge for every penalized ranged band", () => {
        const full = rangedDamageModifierIcon(true, AttackVals.RANGE, 1);
        const broken = rangedDamageModifierIcon(true, AttackVals.RANGE, 2);

        expect(full).toBeDefined();
        expect(broken).toBeDefined();
        expect(full).not.toBe(broken);
        expect(rangedDamageModifierIcon(true, AttackVals.RANGE, 4)).toBe(broken);
        expect(rangedDamageModifierIcon(true, AttackVals.RANGE, 8)).toBe(broken);
        expect(rangedDamageModifierIcon(true, AttackVals.MELEE, 4)).toBeUndefined();
        expect(rangedDamageModifierIcon(false, AttackVals.RANGE, 4)).toBeUndefined();
    });

    test("hides redundant 1/1 but keeps every penalized ranged fraction", () => {
        expect(rangedDamagePredictionText(true, 1, "126 - 314")).toBe("126 - 314");
        expect(rangedDamagePredictionText(true, 2, "126 - 314")).toBe("1/2  126 - 314");
        expect(rangedDamagePredictionText(true, 4, "126 - 314")).toBe("1/4  126 - 314");
        expect(rangedDamagePredictionText(true, 8, "126 - 314")).toBe("1/8  126 - 314");
        expect(rangedDamagePredictionText(false, 1, "126 - 314")).toBe("126 - 314");
    });

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
        expect(meleeSwordTargetPoint({ x: 100, y: 50 }, target, 20)).toEqual({ x: 100, y: 80 });
        expect(meleeSwordTargetPoint({ x: 100, y: 150 }, target, 20)).toEqual({ x: 100, y: 120 });
        expect(meleeSwordTargetPoint({ x: 50, y: 50 }, target, 20)).toEqual({ x: 80, y: 80 });
        expect(meleeSwordTargetPoint({ x: 150, y: 50 }, target, 20)).toEqual({ x: 120, y: 80 });
        expect(meleeSwordTargetPoint({ x: 50, y: 150 }, target, 20)).toEqual({ x: 80, y: 120 });
        expect(meleeSwordTargetPoint({ x: 150, y: 150 }, target, 20)).toEqual({ x: 120, y: 120 });
    });

    test("keeps the original compact half-cell sword size for every attack side", () => {
        expect(meleeSwordDisplayLength(80)).toBe(40);
        expect(meleeSwordDisplayLength(128)).toBe(64);
    });

    test("keeps all eight logical attack sides distinct, including right and bottom-right", () => {
        const target = { x: 100, y: 100 };
        const landings = [
            { point: { x: 50, y: 50 }, expected: Math.PI / 4 },
            { point: { x: 100, y: 50 }, expected: Math.PI / 2 },
            { point: { x: 150, y: 50 }, expected: (3 * Math.PI) / 4 },
            { point: { x: 150, y: 100 }, expected: Math.PI },
            { point: { x: 150, y: 150 }, expected: (-3 * Math.PI) / 4 },
            { point: { x: 100, y: 150 }, expected: -Math.PI / 2 },
            { point: { x: 50, y: 150 }, expected: -Math.PI / 4 },
            { point: { x: 50, y: 100 }, expected: 0 },
        ];
        for (const { point, expected } of landings) {
            const actual = meleeSwordFacingAngle(point, target);
            expect(Math.cos(actual)).toBeCloseTo(Math.cos(expected));
            expect(Math.sin(actual)).toBeCloseTo(Math.sin(expected));
        }
    });

    test("pins the blade tip to all eight target anchors and keeps the sword outside the target", () => {
        const anchor = { x: 100, y: 100 };
        const length = 80;
        for (let facing = -4; facing < 4; facing += 1) {
            const angle = facing * (Math.PI / 4);
            const center = meleeSwordSpriteCenter(anchor, angle, length);
            expect(Math.hypot(anchor.x - center.x, anchor.y - center.y)).toBeCloseTo(length / 2);
            expect((anchor.x - center.x) * Math.cos(angle) + (anchor.y - center.y) * Math.sin(angle)).toBeCloseTo(
                length / 2,
            );
        }
    });

    test("returns the pointer-selected landing for a legal melee target", () => {
        expect(resolveMeleeAttackFromPointer(params())).toEqual(attackFrom);
    });

    test("rejects a landing separated from the target by an intervening cell", () => {
        let adjacencyChecks = 0;
        expect(
            resolveMeleeAttackFromPointer(
                params({
                    isAttackFromAdjacent: () => {
                        adjacencyChecks += 1;
                        return false;
                    },
                }),
            ),
        ).toBeUndefined();
        expect(adjacencyChecks).toBe(1);
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
