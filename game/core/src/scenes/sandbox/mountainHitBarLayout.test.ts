import { afterEach, describe, expect, test } from "bun:test";

import { Container, Texture } from "pixi.js";
import { FightStateManager, GridConstants, GridSettings, GridVals, HoCConstants } from "@heroesofcrypto/common";

import { DungeonVisuals, getMountainHitBarLayout } from "./DungeonVisuals";

describe("mountain HP bar layout", () => {
    test.each([48, 96, 165])("stays inside the mountain base at a %ipx cell size", (cellSize) => {
        const layout = getMountainHitBarLayout(cellSize);
        const framedBottom = layout.centerOffset + layout.height / 2 + layout.framePadding;

        expect(layout.width).toBeLessThanOrEqual(cellSize * 1.12);
        expect(framedBottom).toBeLessThanOrEqual(cellSize * 0.9);
        expect(layout.gap).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
    });
});

describe("mountain collapse animation", () => {
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    const gridSettings = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );

    afterEach(() => FightStateManager.getInstance().reset());

    // A collapse container holds exactly the 4 quarter-chunk sprites + the dust puffs.
    const findCollapseContainers = (attached: Container[]): Container[] =>
        attached.filter((container) => container.children.length === 16);

    function createVisuals(): { visuals: DungeonVisuals; attached: Container[]; collapses: { x: number }[] } {
        const attached: Container[] = [];
        const collapses: { x: number }[] = [];
        const visuals = new DungeonVisuals({
            getStage: () => new Container(),
            getWorldRoot: () => new Container(),
            getViewportSize: () => ({ width: 1000, height: 1000 }),
            getGridSettings: () => gridSettings,
            texAny: () => Texture.WHITE,
            attachToWorldRoot: (obj) => attached.push(obj),
            onMountainCollapse: (center) => collapses.push(center),
        });
        return { visuals, attached, collapses };
    }

    function primeBlockCenterFight(leftHits: number, rightHits: number): void {
        const fightProperties = FightStateManager.getInstance().getFightProperties();
        fightProperties.setGridType(GridVals.BLOCK_CENTER);
        fightProperties.setObstacleHitsPerMountain(leftHits, rightHits);
        fightProperties.startFight();
    }

    test("crashes a mountain into 4 chunks exactly when its hits reach zero", () => {
        primeBlockCenterFight(HoCConstants.HITS_PER_MOUNTAIN, HoCConstants.HITS_PER_MOUNTAIN);
        const { visuals, attached, collapses } = createVisuals();

        // First sight seeds silently — full hits, no collapse.
        visuals.ensureCenterTerrainSprite();
        expect(collapses).toHaveLength(0);

        // Left mountain destroyed -> one collapse, made of 4 quarter sprites (+ dust puffs).
        FightStateManager.getInstance()
            .getFightProperties()
            .setObstacleHitsPerMountain(0, HoCConstants.HITS_PER_MOUNTAIN);
        visuals.ensureCenterTerrainSprite();
        expect(collapses).toHaveLength(1);
        expect(findCollapseContainers(attached)).toHaveLength(1);

        // Re-render with unchanged hits must not re-fire.
        visuals.ensureCenterTerrainSprite();
        expect(collapses).toHaveLength(1);
    });

    test("joining a game with an already-destroyed mountain stays silent", () => {
        primeBlockCenterFight(0, HoCConstants.HITS_PER_MOUNTAIN);
        const { visuals, collapses } = createVisuals();
        visuals.ensureCenterTerrainSprite();
        visuals.ensureCenterTerrainSprite();
        expect(collapses).toHaveLength(0);
    });

    test("cleans the chunks up after the animation, even with both mountains gone", async () => {
        primeBlockCenterFight(1, 1);
        const { visuals, attached, collapses } = createVisuals();
        visuals.ensureCenterTerrainSprite();

        // Both mountains die at once (e.g. final AOE) -> two simultaneous collapses.
        FightStateManager.getInstance().getFightProperties().setObstacleHitsPerMountain(0, 0);
        visuals.ensureCenterTerrainSprite();
        expect(collapses).toHaveLength(2);
        const containers = findCollapseContainers(attached);
        expect(containers).toHaveLength(2);

        // Past the full lifetime the step (which runs even on the both-destroyed early-return path)
        // must have destroyed every chunk container.
        await sleep(1500);
        visuals.ensureCenterTerrainSprite();
        expect(containers.every((container) => container.destroyed)).toBe(true);
    });
});
