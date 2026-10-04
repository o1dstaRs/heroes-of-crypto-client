import { describe, expect, test } from "bun:test";
import { ColorMatrixFilter, Container, Sprite, Texture } from "pixi.js";
import { FightStateManager, GridMath, GridSettings, GridVals, type HoCMath } from "@heroesofcrypto/common";

import { DungeonVisuals, cemeteryObstacleDepthFromBaseY, cemeteryObstacleFrameGeometry } from "./DungeonVisuals";
import { projectedBattlefieldMetricsAtPoint } from "./BattlefieldVisualGrid";

if (!("document" in globalThis)) {
    (globalThis as { document?: unknown }).document = {
        createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
        querySelector: () => null,
    };
}

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
interface Internals {
    mountainTileTextures: Texture[];
    mountainHitPointTileTextures: Texture[];
    scatteredMountainSprites: Sprite[];
    barrelPlacementOutlines: (Container | undefined)[];
    barrelPlacementPreview?: Sprite;
    barrelPlacementWhiteFilter?: ColorMatrixFilter;
}

const fixture = () => {
    const fightState = FightStateManager.getInstance();
    const previous = fightState.getFightProperties();
    fightState.reset();
    fightState.getFightProperties().setGridType(GridVals.NORMAL);
    const root = new Container();
    root.scale.set(-1, -1);
    let movable: HoCMath.XY[] = [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
    ];
    const visuals = new DungeonVisuals({
        getStage: () => root,
        getWorldRoot: () => root,
        getViewportSize: () => ({ width: 1024, height: 1024 }),
        getGridSettings: () => settings,
        getMovableArtifactBarrelCells: () => movable,
        texAny: () => undefined,
        attachToWorldRoot: (object, depth = 0) => {
            object.zIndex = depth;
            root.addChild(object);
        },
        attachToUnitDepthRoot: (object, depth = 0) => {
            object.zIndex = depth;
            root.addChild(object);
        },
    });
    const internals = visuals as unknown as Internals;
    internals.mountainTileTextures = [new Texture({ source: Texture.WHITE.source })];
    internals.mountainHitPointTileTextures = [new Texture({ source: Texture.WHITE.source })];
    visuals.setScatteredMountains(
        [
            { x: 1, y: 1, variant: 0 },
            { x: 2, y: 1, variant: 0 },
            { x: 8, y: 8, variant: 0 },
        ],
        true,
    );
    return {
        visuals,
        internals,
        root,
        setMovable: (cells: HoCMath.XY[]) => {
            movable = cells;
        },
        cleanup: () => {
            visuals.destroy();
            fightState.setFightProperties(previous);
        },
    };
};

describe("movable barrel rendering", () => {
    test("draws a white silhouette only around editable owned barrels and removes it when locked or fighting", () => {
        const { visuals, internals, root, setMovable, cleanup } = fixture();
        try {
            const [first, second, neutral] = internals.barrelPlacementOutlines;
            expect(first?.visible).toBe(true);
            expect(second?.visible).toBe(true);
            expect(neutral).toBeUndefined();
            expect(first?.children).toHaveLength(16);
            expect(first?.filters).toEqual([internals.barrelPlacementWhiteFilter!]);
            const source = internals.scatteredMountainSprites[0];
            const edge = first?.children[8] as Sprite;
            expect(edge.texture).toBe(source.texture);
            expect(edge.scale.x).toBe(source.scale.x);
            expect(edge.scale.y).toBe(source.scale.y);
            expect(edge.scale.y).toBeLessThan(0);
            expect(first?.parent).toBe(source.parent);
            expect(first!.zIndex).toBeLessThan(source.zIndex);
            const matrix = internals.barrelPlacementWhiteFilter!.matrix;
            expect([matrix[4], matrix[9], matrix[14], matrix[18]]).toEqual([1, 1, 1, 1]);
            expect(root.scale.x).toBe(-1);
            setMovable([]);
            visuals.ensureCenterTerrainSprite();
            expect(first?.visible).toBe(false);
            expect(second?.visible).toBe(false);
            setMovable([{ x: 1, y: 1 }]);
            visuals.ensureCenterTerrainSprite();
            expect(first?.visible).toBe(true);
            FightStateManager.getInstance().getFightProperties().startFight();
            visuals.ensureCenterTerrainSprite();
            expect(first?.visible).toBe(false);
        } finally {
            cleanup();
        }
    });
    test("projects the dragged sprite onto its destination, marks invalid drops, and cleans it up on rebuild", () => {
        const { visuals, internals, cleanup } = fixture();
        try {
            const target = { x: 2, y: 2 };
            const position = GridMath.getPositionForCell(
                target,
                settings.getMinX(),
                settings.getStep(),
                settings.getHalfStep(),
            );
            const metrics = projectedBattlefieldMetricsAtPoint(position, settings);
            const geometry = cemeteryObstacleFrameGeometry(metrics.width, metrics.height, target.y);
            const source = internals.scatteredMountainSprites[0];
            const oldPosition = { x: source.x, y: source.y };
            visuals.previewBarrelPlacement({ x: 1, y: 1 }, target, true);
            const preview = internals.barrelPlacementPreview!;
            expect(preview.texture).toBe(source.texture);
            expect(preview.x).toBeCloseTo(metrics.center.x);
            expect(preview.y).toBeCloseTo(metrics.center.y + geometry.rise + metrics.height * 0.2);
            expect(preview.scale.y).toBeLessThan(0);
            expect(preview.alpha).toBe(0.6);
            expect(preview.zIndex).toBeCloseTo(
                cemeteryObstacleDepthFromBaseY(preview.y - geometry.frameHeight * 0.5) + 0.01,
            );
            expect({ x: source.x, y: source.y }).toEqual(oldPosition);
            visuals.previewBarrelPlacement({ x: 1, y: 1 }, target, false);
            expect(preview.tint).toBe(0xff5555);
            const outlines = internals.barrelPlacementOutlines.slice();
            visuals.setScatteredMountains([{ x: 2, y: 2, variant: 0 }], true);
            expect(preview.destroyed).toBe(true);
            expect(internals.barrelPlacementPreview).toBeUndefined();
            expect(outlines.filter(Boolean).every((outline) => outline!.destroyed)).toBe(true);
        } finally {
            cleanup();
        }
    });
});
