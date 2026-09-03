import { describe, expect, test } from "bun:test";
import { Assets, Container, Graphics, Texture } from "pixi.js";

import { FightStateManager, GridSettings, GridVals } from "@heroesofcrypto/common";

import {
    CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS,
    CEMETERY_OBSTACLE_WIDTH_SCALE,
    cemeteryObstacleFrameGeometry,
    cemeteryObstacleScaleForRow,
    cemeteryObstacleShadowScaleY,
    cemeteryObstacleShadowStyle,
    cemeteryObstacleSpriteScale,
    DungeonVisuals,
    lavaSplashOriginWithinGrateOpening,
} from "./DungeonVisuals";
import { images } from "../../generated/image_imports";

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

    test("projects the variant-B silhouette downward by exactly one quarter cell", () => {
        expect(CEMETERY_OBSTACLE_SHADOW_LENGTH_CELLS).toBe(0.25);
        expect(cemeteryObstacleShadowScaleY(82) * 235).toBeCloseTo(20.5, 10);
        expect(cemeteryObstacleShadowScaleY(58) * 235).toBeCloseTo(14.5, 10);
    });

    test("casts a larger, clearer shadow in furnace light while leaving dark lanes unchanged", () => {
        const directlyUnderCenterFurnace = cemeteryObstacleShadowStyle(7, 15);
        const betweenLightLanes = cemeteryObstacleShadowStyle(4, 15);
        const sameLaneFartherFromFurnace = cemeteryObstacleShadowStyle(7, 4);

        expect(directlyUnderCenterFurnace.firelightExposure).toBeGreaterThan(0.8);
        expect(directlyUnderCenterFurnace.lengthMultiplier).toBeGreaterThan(1.24);
        expect(directlyUnderCenterFurnace.widthMultiplier).toBeGreaterThan(1.07);
        expect(directlyUnderCenterFurnace.alpha).toBeGreaterThan(0.52);
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

            expect(unloaded).toEqual([images.fire_pit_variant_1_low_front_fire_overlay_seamless_v2_64_atlas_half]);
        } finally {
            mutableAssets.load = originalLoad;
            mutableAssets.unload = originalUnload;
        }
    });

    test("evicts ambient flame atlases that finish decoding after teardown", async () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const mutableAssets = Assets as unknown as {
            load: typeof Assets.load;
            unload: typeof Assets.unload;
        };
        const originalLoad = mutableAssets.load;
        const originalUnload = mutableAssets.unload;
        const finishLoads: ((texture: Texture) => void)[] = [];
        const unloaded: string[] = [];
        mutableAssets.load = (() =>
            new Promise<Texture>((resolve) => {
                finishLoads.push(resolve);
            })) as typeof Assets.load;
        mutableAssets.unload = (async (url: string) => {
            unloaded.push(url);
        }) as typeof Assets.unload;

        try {
            const visuals = new DungeonVisuals({
                getStage: () => stage,
                getWorldRoot: () => worldRoot,
                getViewportSize: () => ({ width: 1024, height: 1024 }),
                getGridSettings: () => gridSettings,
                texAny: () => Texture.WHITE,
                attachToWorldRoot: () => undefined,
            });
            visuals.ensureBackgroundSprite();
            expect(finishLoads).toHaveLength(3);

            visuals.destroy();
            for (const finishLoad of finishLoads) finishLoad(Texture.WHITE);
            await Promise.resolve();
            await Promise.resolve();

            expect(new Set(unloaded)).toEqual(
                new Set([
                    images.ambient_fire_video_torch_left_natural_v4_64_atlas,
                    images.ambient_fire_video_torch_right_natural_v4_64_atlas,
                    images.ambient_fire_left_furnace_atlas,
                ]),
            );
        } finally {
            mutableAssets.load = originalLoad;
            mutableAssets.unload = originalUnload;
        }
    });
});
