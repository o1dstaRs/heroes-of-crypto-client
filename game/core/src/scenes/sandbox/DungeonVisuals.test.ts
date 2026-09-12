import { describe, expect, test } from "bun:test";
import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";

import { FightStateManager, GridSettings, GridVals } from "@heroesofcrypto/common";

import {
    CEMETERY_OBSTACLE_SHADOW_ALPHA,
    CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS,
    CEMETERY_OBSTACLE_WIDTH_SCALE,
    attachCemeteryObstacleToDepthRoot,
    cemeteryObstacleDepthFromBaseY,
    cemeteryObstacleFrameGeometry,
    cemeteryObstacleScaleForRow,
    cemeteryObstacleShadowScaleY,
    cemeteryObstacleShadowStyle,
    cemeteryObstacleSpriteScale,
    DungeonVisuals,
    lavaSplashOriginWithinGrateOpening,
    narrowingRingCells,
} from "./DungeonVisuals";
import { images } from "../../generated/image_imports";

describe("Map narrowing rings", () => {
    test("switches approved baked narrowing backgrounds in TEST and real narrowing", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const currentBackground = Texture.WHITE;
        const firstRingBackground = Texture.EMPTY;
        const secondRingBackground = new Texture({ source: Texture.WHITE.source });
        const thirdRingBackground = new Texture({ source: Texture.WHITE.source });
        const fourthRingBackground = new Texture({ source: Texture.WHITE.source });
        const fifthRingBackground = new Texture({ source: Texture.WHITE.source });
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => new GridSettings(16, 1024, 0, 1024, 0, 64, 32),
            texAny: (key) => {
                if (key === "background_stone_tiles_sinister_16x16_first_ring_destroyed_aaa_v3") {
                    return firstRingBackground;
                }
                if (key === "background_stone_tiles_sinister_16x16_two_rings_destroyed_aaa_v7") {
                    return secondRingBackground;
                }
                if (key === "background_stone_tiles_sinister_16x16_three_rings_destroyed_aaa_v3") {
                    return thirdRingBackground;
                }
                if (key === "background_stone_tiles_sinister_16x16_four_rings_destroyed_aaa_v7") {
                    return fourthRingBackground;
                }
                if (key === "background_stone_tiles_sinister_16x16_five_rings_destroyed_aaa_v4") {
                    return fifthRingBackground;
                }
                if (key === "background_stone_tiles_sinister_16x16_original_restored") {
                    return currentBackground;
                }
                return undefined;
            },
            attachToWorldRoot: (object, zIndex = 0) => {
                object.zIndex = zIndex;
                worldRoot.addChild(object);
            },
        });

        visuals.setTestBackground(true);
        visuals.ensureBackgroundSprite();
        visuals.layoutBackgroundSquare(1);

        const background = stage.children.find(
            (child): child is Sprite => child instanceof Sprite && child.texture === firstRingBackground,
        );
        expect(background?.texture).toBe(firstRingBackground);
        expect(visuals.isTestBackground()).toBe(true);

        visuals.setTestNarrowingLevel(2);
        expect(background?.texture).toBe(secondRingBackground);
        visuals.setTestNarrowingLevel(3);
        expect(background?.texture).toBe(thirdRingBackground);
        visuals.setTestNarrowingLevel(4);
        expect(background?.texture).toBe(fourthRingBackground);
        visuals.setTestNarrowingLevel(5);
        expect(background?.texture).toBe(fifthRingBackground);
        visuals.setTestNarrowingLevel(0);
        expect(background?.texture).toBe(currentBackground);

        visuals.setTestBackground(false);
        visuals.setNarrowingLayers(1);
        expect(background?.texture).toBe(firstRingBackground);
        visuals.spawnHoleLayer(1);
        expect((visuals.getHoleContainer().children[0] as Container).children).toHaveLength(0);
        visuals.setNarrowingLayers(2);
        expect(background?.texture).toBe(secondRingBackground);
        visuals.setNarrowingLayers(3);
        expect(background?.texture).toBe(thirdRingBackground);
        visuals.setNarrowingLayers(4);
        expect(background?.texture).toBe(fourthRingBackground);
        visuals.setNarrowingLayers(5);
        expect(background?.texture).toBe(fifthRingBackground);

        visuals.destroy();
    });

    test("removes exactly one non-overlapping perimeter of the 16x16 board per step", () => {
        const first = narrowingRingCells(16, 16, 1);
        const second = narrowingRingCells(16, 16, 2);
        const third = narrowingRingCells(16, 16, 3);
        const fourth = narrowingRingCells(16, 16, 4);
        const fifth = narrowingRingCells(16, 16, 5);

        expect(first).toHaveLength(60);
        expect(second).toHaveLength(52);
        expect(third).toHaveLength(44);
        expect(fourth).toHaveLength(36);
        expect(fifth).toHaveLength(28);
        expect(first.every(({ x, y }) => x === 0 || x === 15 || y === 0 || y === 15)).toBe(true);
        expect(second.every(({ x, y }) => x === 1 || x === 14 || y === 1 || y === 14)).toBe(true);
        expect(third.every(({ x, y }) => x === 2 || x === 13 || y === 2 || y === 13)).toBe(true);
        expect(fourth.every(({ x, y }) => x === 3 || x === 12 || y === 3 || y === 12)).toBe(true);
        expect(fifth.every(({ x, y }) => x === 4 || x === 11 || y === 4 || y === 11)).toBe(true);

        const firstHashes = new Set(first.map(({ x, y }) => `${x}:${y}`));
        expect(second.some(({ x, y }) => firstHashes.has(`${x}:${y}`))).toBe(false);
        const secondHashes = new Set(second.map(({ x, y }) => `${x}:${y}`));
        expect(third.some(({ x, y }) => secondHashes.has(`${x}:${y}`))).toBe(false);
        const thirdHashes = new Set(third.map(({ x, y }) => `${x}:${y}`));
        expect(fourth.some(({ x, y }) => thirdHashes.has(`${x}:${y}`))).toBe(false);
        const fourthHashes = new Set(fourth.map(({ x, y }) => `${x}:${y}`));
        expect(fifth.some(({ x, y }) => fourthHashes.has(`${x}:${y}`))).toBe(false);
        expect(narrowingRingCells(16, 16, 8)).toHaveLength(4);
        expect(narrowingRingCells(16, 16, 9)).toEqual([]);
    });

    test("retains the generic masked abyss fallback after the baked narrowing levels", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: (key) => (key === "background_test_abyss_underlay_v4" ? Texture.WHITE : undefined),
            attachToWorldRoot: (object, zIndex = 0) => {
                object.zIndex = zIndex;
                worldRoot.addChild(object);
            },
        });

        visuals.setTestBackground(true);
        visuals.spawnHoleLayer(6);

        const layer = visuals.getHoleContainer().children[0] as Container;
        expect(layer).toBeInstanceOf(Container);
        expect(layer.children).toHaveLength(2);
        expect(layer.children[0].mask).toBe(layer.children[1]);

        visuals.destroy();
    });
});

describe("Cemetery obstacle perspective", () => {
    test("keeps the bottom-row editor size and reaches exactly -10% at the top row", () => {
        expect(cemeteryObstacleScaleForRow(0)).toBe(1);
        expect(cemeteryObstacleScaleForRow(15)).toBeCloseTo(0.9, 10);
        expect(cemeteryObstacleScaleForRow(7)).toBeCloseTo(1 - (7 / 15) * 0.1, 10);
    });

    test("scales barrel height to 178.5% and lifts the base 20% inside the projected cell", () => {
        const bottom = cemeteryObstacleFrameGeometry(125, 82, 0);
        expect(bottom.frameHeight).toBeCloseTo(125 * (461 / 256) * 1.785, 10);
        expect(bottom.rise + 82 * 0.2 - bottom.frameHeight * 0.5).toBeCloseTo(-82 * 0.3, 10);

        const top = cemeteryObstacleFrameGeometry(125, 58, 15);
        expect(top.frameHeight).toBeCloseTo(bottom.frameHeight * 0.9, 10);
        expect(top.rise + 58 * 0.2 - top.frameHeight * 0.5).toBeCloseTo(-58 * 0.3, 10);
    });

    test("narrows every barrel by 5% without changing its vertical scale", () => {
        const scale = cemeteryObstacleSpriteScale(125, 256, 320, 461, 1);

        expect(CEMETERY_OBSTACLE_WIDTH_SCALE).toBe(0.95);
        expect(scale.x).toBeCloseTo((125 / 256) * 0.95, 10);
        expect(scale.y).toBeCloseTo(-(320 / 461), 10);
    });

    test("projects the approved barrel silhouette downward by 86% of a cell", () => {
        expect(CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS).toBe(0.86);
        expect(cemeteryObstacleShadowScaleY(82) * 235).toBeCloseTo(70.52, 10);
        expect(cemeteryObstacleShadowScaleY(58) * 235).toBeCloseTo(49.88, 10);
    });

    test("sorts a lower barrel in front of a creature and a higher barrel behind it", () => {
        const creatureGroundY = 500;
        const creatureDepth = 4000 - creatureGroundY;

        expect(cemeteryObstacleDepthFromBaseY(450)).toBeGreaterThan(creatureDepth);
        expect(cemeteryObstacleDepthFromBaseY(550)).toBeLessThan(creatureDepth);
    });

    test("places barrels in the creature depth root so a higher barrel cannot cover a creature head", () => {
        const barrel = new Container();
        const worldAttachments: number[] = [];
        const creatureDepthAttachments: number[] = [];

        attachCemeteryObstacleToDepthRoot(
            {
                attachToWorldRoot: (_object, depth = 0) => worldAttachments.push(depth),
                attachToUnitDepthRoot: (_object, depth = 0) => creatureDepthAttachments.push(depth),
            },
            barrel,
            3450,
        );

        expect(worldAttachments).toEqual([]);
        expect(creatureDepthAttachments).toEqual([3450]);
    });

    test("widens and lengthens the shadow in furnace light while keeping creature-matched opacity", () => {
        const directlyUnderCenterFurnace = cemeteryObstacleShadowStyle(7, 15);
        const betweenLightLanes = cemeteryObstacleShadowStyle(4, 15);
        const sameLaneFartherFromFurnace = cemeteryObstacleShadowStyle(7, 4);

        expect(CEMETERY_OBSTACLE_SHADOW_ALPHA).toBe(0.45);
        expect(directlyUnderCenterFurnace.firelightExposure).toBeGreaterThan(0.8);
        expect(directlyUnderCenterFurnace.lengthMultiplier).toBeGreaterThan(1.24);
        expect(directlyUnderCenterFurnace.widthMultiplier).toBeGreaterThan(1.07);
        expect(directlyUnderCenterFurnace.alpha).toBe(0.45);
        expect(betweenLightLanes.alpha).toBe(0.45);
        expect(sameLaneFartherFromFurnace.alpha).toBe(0.45);
        expect(betweenLightLanes.firelightExposure).toBeLessThan(0.2);
        expect(sameLaneFartherFromFurnace.firelightExposure).toBeGreaterThan(0);
        expect(sameLaneFartherFromFurnace.lengthMultiplier).toBeLessThan(directlyUnderCenterFurnace.lengthMultiplier);
    });
});

describe("Lava splash emission", () => {
    test("keeps every birth point inside one of the twelve open grate windows", () => {
        const columns = [
            [86, 136],
            [183, 232],
            [280, 328],
            [376, 424],
        ] as const;
        const rows = [
            [205, 243],
            [287, 329],
            [373, 415],
        ] as const;

        for (let zone = 0; zone < 12; zone++) {
            const zoneNoise = (zone + 0.5) / 12;
            const topLeft = lavaSplashOriginWithinGrateOpening(500, 400, 512, 512, zoneNoise, 0, 0);
            const bottomRight = lavaSplashOriginWithinGrateOpening(500, 400, 512, 512, zoneNoise, 1, 1);
            const column = columns[zone % 4];
            const row = rows[Math.floor(zone / 4)];

            expect(topLeft).toEqual({ x: 500 + column[0] - 256, y: 400 - row[0] + 256 });
            expect(bottomRight).toEqual({ x: 500 + column[1] - 256, y: 400 - row[1] + 256 });
        }
    });
});

describe("DungeonVisuals lifecycle", () => {
    test("does not retain the retired empty top band or disabled floor halo", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const camera = new Container();
        camera.zIndex = 0;
        stage.addChild(camera);
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: () => Texture.WHITE,
            attachToWorldRoot: (object, zIndex = 0) => {
                object.zIndex = zIndex;
                worldRoot.addChild(object);
            },
        });

        visuals.ensureBackgroundSprite();
        visuals.layoutBackgroundSquare(1);

        expect(stage.children.filter((child) => child instanceof Graphics)).toHaveLength(0);
        expect(visuals.getFireLightDiagnostics()).toMatchObject({
            lavaFireLightVisible: false,
            lavaFireLightGroups: 0,
        });

        visuals.destroy();
    });

    test("destroy detaches narrowing holes from the shared world root", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: () => undefined,
            attachToWorldRoot: (object, zIndex = 0) => {
                object.zIndex = zIndex;
                worldRoot.addChild(object);
            },
        });

        const holes = visuals.getHoleContainer();
        worldRoot.addChild(holes);
        visuals.spawnHoleLayer(1);

        expect(worldRoot.children).toContain(holes);
        expect(holes.children).toHaveLength(1);

        visuals.destroy();

        expect(holes.destroyed).toBe(true);
        expect(worldRoot.children).not.toContain(holes);
    });

    test("requests Cemetery sheets only after a Cemetery layout actually exists", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const requested: string[] = [];
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: (key) => {
                requested.push(key);
                return undefined;
            },
            attachToWorldRoot: () => undefined,
        });

        visuals.setScatteredMountains([], false);
        expect(requested).toEqual([]);

        visuals.setScatteredMountains([{ x: 3, y: 4, variant: 0 }], true);
        expect(requested).toEqual(["cemetery_obstacles_9x_256", "cemetery_obstacles_9x_256_hp"]);
        visuals.destroy();
    });

    test("does not request lava-pit art while drawing a water map", () => {
        const fightState = FightStateManager.getInstance();
        const previousFight = fightState.getFightProperties();
        fightState.reset();
        fightState.getFightProperties().setGridType(GridVals.WATER_CENTER);
        const requested: string[] = [];
        const visuals = new DungeonVisuals({
            getStage: () => new Container(),
            getWorldRoot: () => new Container(),
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => new GridSettings(16, 1024, 0, 1024, 0, 64, 32),
            texAny: (key) => {
                requested.push(key);
                return undefined;
            },
            attachToWorldRoot: () => undefined,
        });

        try {
            visuals.ensureCenterTerrainSprite();
            expect(requested).toEqual(["water_256"]);
        } finally {
            visuals.destroy();
            fightState.setFightProperties(previousFight);
        }
    });

    test("evicts a large deferred fire atlas that finishes decoding after teardown", async () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: () => undefined,
            attachToWorldRoot: () => undefined,
        });
        const internals = visuals as unknown as { firePitOverlayTexture(): Texture | undefined };
        const mutableAssets = Assets as unknown as {
            load: typeof Assets.load;
            unload: typeof Assets.unload;
        };
        const originalLoad = mutableAssets.load;
        const originalUnload = mutableAssets.unload;
        let finishLoad!: (texture: Texture) => void;
        const unloaded: string[] = [];
        mutableAssets.load = (() => new Promise<Texture>((resolve) => (finishLoad = resolve))) as typeof Assets.load;
        mutableAssets.unload = (async (url: string) => {
            unloaded.push(url);
        }) as typeof Assets.unload;

        try {
            expect(internals.firePitOverlayTexture()).toBeUndefined();
            visuals.destroy();
            finishLoad(Texture.WHITE);
            await Promise.resolve();
            await Promise.resolve();

            expect(unloaded).toEqual([images.fire_pit_grok_video_fire_only_v11_64_atlas]);
        } finally {
            mutableAssets.load = originalLoad;
            mutableAssets.unload = originalUnload;
        }
    });
});
