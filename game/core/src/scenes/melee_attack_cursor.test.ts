import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AttackVals, GridSettings } from "@heroesofcrypto/common";
import { CanvasTextMetrics, type Container, type Sprite, type Text, Texture } from "pixi.js";

import {
    rangedDamageModifierIcon,
    rangedDamagePredictionText,
    resolveMeleeAttackFromPointer,
    resolveMeleeCursorDirection,
} from "./Sandbox";
import {
    HoverManager,
    type ISandboxHoverContext,
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
    test("renders the sword and every damage prediction in the cursor overlay, after the entire battlefield", () => {
        // The overlay is a camera sibling rendered after worldRoot, so nothing on the board (barrels, units,
        // target silhouettes) can cover it. Building that tree needs a real renderer, so its order is pinned.
        const pixiAppSource = readFileSync(join(import.meta.dir, "../pixi/PixiApp.ts"), "utf8");
        expect(pixiAppSource).toContain("this.camera.addChild(this.worldRoot, this.cursorOverlayRoot)");

        const overlay: { object: unknown; zIndex?: number }[] = [];
        const world: unknown[] = [];
        const hover = new HoverManager({
            sceneSettings: { getGridSettings: () => new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06) },
            getCameraScale: () => ({ x: 1, y: 1 }),
            attachToCursorOverlay: (object: Container, zIndex?: number) => overlay.push({ object, zIndex }),
            attachToWorldRoot: (object: Container) => world.push(object),
            texAny: () => Texture.WHITE,
            getCurrentActiveUnit: () => undefined,
        } as unknown as ISandboxHoverContext);
        const visuals = hover as unknown as {
            hoverAttackSwordTexture?: Texture;
            hoverAttackSword?: Sprite;
            hoverDamageText?: Text;
            hoverKillText?: Text;
            hoverDamageIcon?: Sprite;
            hoverRangeModifierIcon?: Sprite;
        };
        const metrics = spyOn(CanvasTextMetrics, "measureText").mockImplementation(
            (text) => ({ width: text.length * 12, height: 24 }) as ReturnType<typeof CanvasTextMetrics.measureText>,
        );
        try {
            visuals.hoverAttackSwordTexture = Texture.WHITE;
            // Reasserted on every draw: a rebuilt container must never leave the sword in a stale world layer.
            for (const to of [
                { x: 100, y: 100 },
                { x: 140, y: 60 },
            ]) {
                hover.drawAttackArrow({ x: 20, y: 20 }, to, undefined, undefined, "melee");
                expect(visuals.hoverAttackSword?.visible).toBe(true);
                expect(overlay.at(-1)?.object).toBe(visuals.hoverAttackSword);
            }
            expect(world).not.toContain(visuals.hoverAttackSword);

            overlay.length = 0;
            hover.drawDamagePrediction("126 - 314", "1–3", { x: 100, y: 150 }, false, "kills", "range_penalty");
            const predictions = [
                visuals.hoverDamageText,
                visuals.hoverKillText,
                visuals.hoverDamageIcon,
                visuals.hoverRangeModifierIcon,
            ];
            for (const prediction of predictions) {
                expect(prediction).toBeDefined();
                expect(overlay).toContainEqual({ object: prediction, zIndex: 100 });
                expect(world).not.toContain(prediction);
            }
        } finally {
            metrics.mockRestore();
            hover.clearAttackVisuals();
        }
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
