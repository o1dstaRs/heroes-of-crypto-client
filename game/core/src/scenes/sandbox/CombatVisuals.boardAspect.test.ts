import { describe, expect, test } from "bun:test";

import { Container, Sprite } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { CombatVisuals } from "./CombatVisuals";

/**
 * The battlefield camera is deliberately anisotropic: `PixiScene.fitWorldToViewport` takes scaleX from the
 * full width between the narrowed sidebars and scaleY from the painted 16-row floor, so a world square
 * renders roughly 1.4x wider than tall at 16:9. Cell positions and cell-area coverage inherit that on
 * purpose — the board's own cells ARE drawn wider than tall — but effect ARTWORK must not, exactly as
 * creature art refuses it through `legacyBoardChildScaleCompensation`.
 *
 * These are the numbers a real 1920x1080 client produces (boardFitWidth 1206 / 2048 world, boardFitHeight
 * 840 / 2048 world), so the ratio under test is the one players actually see.
 */
const BOARD_SCALE_X = 1206 / 2048;
const BOARD_SCALE_Y = 840 / 2048;
const EXPECTED_STRETCH = BOARD_SCALE_X / BOARD_SCALE_Y;

const makeVisuals = (boardScale?: { x: number; y: number }) => {
    const attached: Container[] = [];
    const visuals = new CombatVisuals({
        getGridSettings: () => undefined as unknown as GridSettings,
        attachToWorldRoot: (obj: Container) => {
            attached.push(obj);
        },
        ...(boardScale ? { getBoardScale: () => boardScale } : {}),
        getUnitsHolder: () => undefined as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { visuals, attached };
};

type Internals = {
    fireBurns: { container: Container; particles: { age: number; life: number }[] }[];
};

/** Step past the crossing delay so the particles are born and have been given their live scale. */
const settle = (visuals: CombatVisuals, seconds: number): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
        visuals.update(0.05);
    }
};

const firstVisibleSprite = (container: Container): Sprite | undefined =>
    container.children.find((child) => child.visible) as Sprite | undefined;

describe("spell effect artwork keeps its aspect under the rectangular board camera", () => {
    test("a flame sprite is drawn taller in world units so it lands SQUARE on screen", () => {
        const { visuals } = makeVisuals({ x: BOARD_SCALE_X, y: BOARD_SCALE_Y });
        visuals.spawnFireWallCrossing({ x: 100, y: 100 }, 64, 0, false, { x: 1, y: 0 });
        settle(visuals, 0.4);

        const burn = (visuals as unknown as Internals).fireBurns[0];
        expect(burn).toBeDefined();
        const sprite = firstVisibleSprite(burn.container);
        expect(sprite).toBeDefined();

        // The sprite is deliberately NOT square in world units...
        expect(sprite!.scale.y / sprite!.scale.x).toBeCloseTo(EXPECTED_STRETCH, 4);

        // ...precisely so that it IS square once the camera has had its way with it. This is the property
        // that actually matters; the ratio above is only how we get here.
        const screenWidth = sprite!.scale.x * BOARD_SCALE_X;
        const screenHeight = sprite!.scale.y * BOARD_SCALE_Y;
        expect(screenHeight).toBeCloseTo(screenWidth, 6);
    });

    test("a uniform camera is left completely alone", () => {
        const { visuals } = makeVisuals({ x: 0.5, y: 0.5 });
        visuals.spawnFireWallCrossing({ x: 100, y: 100 }, 64, 0, false, { x: 1, y: 0 });
        settle(visuals, 0.4);

        const sprite = firstVisibleSprite((visuals as unknown as Internals).fireBurns[0].container);
        expect(sprite).toBeDefined();
        expect(sprite!.scale.y).toBeCloseTo(sprite!.scale.x, 6);
    });

    test("a context with no board at all (previews, tests) stays 1:1", () => {
        const { visuals } = makeVisuals();
        visuals.spawnFireWallCrossing({ x: 100, y: 100 }, 64, 0, false, { x: 1, y: 0 });
        settle(visuals, 0.4);

        const sprite = firstVisibleSprite((visuals as unknown as Internals).fireBurns[0].container);
        expect(sprite).toBeDefined();
        expect(sprite!.scale.y).toBeCloseTo(sprite!.scale.x, 6);
    });
});
