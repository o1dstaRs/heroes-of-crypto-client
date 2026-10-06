import { afterEach, describe, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridMath,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "../pixi/boardMirror";
import { TextureType, unitToTextureName } from "../pixi/PixiUnitsFactory";
import { HoverManager, type ISandboxHoverContext } from "./HoverManager";
import { CREATURE_ATTACK_FOREGROUND_Z_INDEX, RenderableUnit } from "./RenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const shapes = [
    { label: "square", faction: "Might", name: "Cyclops", width: 1, height: 1, pixels: [128, 128] },
    { label: "rectangular", faction: "Might", name: "Cyclops", width: 2, height: 1, pixels: [256, 128] },
    { label: "tall", faction: "Might", name: "Cyclops", width: 1, height: 1, pixels: [128, 320] },
] as const;
type Shape = (typeof shapes)[number];
type HoverVisuals = { hoverTargetSilhouettes: Sprite[]; silhouettePool: Sprite[] };
const hoverVisuals = (hover: HoverManager): HoverVisuals => hover as unknown as HoverVisuals;
const figureOf = (unit: RenderableUnit): Sprite => (unit as unknown as { sprite: Sprite }).sprite;
const cleanups: Array<() => void> = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture(shape: Shape, row: number, mirrored: boolean) {
    const stage = new Container();
    const world = new Container({ sortableChildren: true });
    world.position.set(750, 640);
    world.scale.set(mirrored ? -0.9 : 0.9, -0.62);
    stage.addChild(world);
    const cursor = new Container();
    stage.addChild(cursor);
    setBoardMirror(world, mirrored);

    // Dimensioned native textures exercise live geometry without decoded game assets or atlas frames.
    const textures = [new Texture({ source: new TextureSource({ width: shape.pixels[0], height: shape.pixels[1] }) })];
    const effects = new EffectFactory();
    const props = {
        ...HoCConfig.getCreatureConfig(TeamVals.RIGHT, shape.faction, shape.name, "", 1),
        footprint_width: shape.width,
        footprint_height: shape.height,
    };
    const base = Unit.createUnit(
        props,
        grid,
        TeamVals.RIGHT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const boardKey = unitToTextureName(shape.name, TextureType.SMALL, shape.width, shape.height);
    const unit = RenderableUnit.fromBase(base, (key) => (key === boardKey ? textures[0] : undefined));
    const logical = GridMath.getPositionForCell({ x: 8, y: row }, grid.getMinX(), grid.getStep(), grid.getHalfStep());
    unit.setPosition(logical.x, logical.y);
    unit.setBattlefieldVisualProjection(true);
    unit.setBoardFacing(-1);
    unit.syncVisual(world, grid);

    const hover = new HoverManager({
        sceneSettings: { getGridSettings: () => grid },
        attachToWorldRoot: (child: Sprite, depth: number) => {
            child.zIndex = depth;
            world.addChild(child);
        },
        attachToCursorOverlay: (child: Sprite) => cursor.addChild(child),
        texAny: () => undefined,
        getCurrentActiveUnit: () => undefined,
    } as unknown as ISandboxHoverContext);
    cleanups.push(() => {
        hover.clearAttackVisuals();
        unit.destroyVisuals();
        releaseBoardMirror(world);
        stage.destroy({ children: true });
        for (const texture of textures) texture.destroy(true);
    });
    return { unit, hover, world, textures };
}

function expectLiveGeometry(highlight: Sprite, figure: Sprite): void {
    expect(highlight.texture).toBe(figure.texture);
    expect(highlight.anchor.x).toBe(figure.anchor.x);
    expect(highlight.anchor.y).toBe(figure.anchor.y);
    expect(highlight.scale.x).toBe(figure.scale.x);
    expect(highlight.scale.y).toBe(figure.scale.y);
    expect(highlight.x).toBeCloseTo(figure.x, 10);
    expect(highlight.y).toBeCloseTo(figure.y, 10);
    expect(highlight.rotation).toBe(figure.rotation);
    expect(highlight.visible).toBe(true);
    expect(highlight.tint).toBe(0xff3030);
    expect(highlight.alpha).toBe(0.72);
    for (const x of [0, figure.texture.width]) {
        for (const y of [0, figure.texture.height]) {
            const corner = {
                x: x - figure.anchor.x * figure.texture.width,
                y: y - figure.anchor.y * figure.texture.height,
            };
            const actual = highlight.toGlobal(corner);
            const expected = figure.toGlobal(corner);
            expect(actual.x).toBeCloseTo(expected.x, 10);
            expect(actual.y).toBeCloseTo(expected.y, 10);
        }
    }
}

describe("live target highlights above battlefield figures", () => {
    for (const mirrored of [false, true]) {
        for (const shape of shapes) {
            for (const row of [1, 8, 14]) {
                test(`${shape.label}, projected row ${row}, mirrored ${mirrored}`, () => {
                    const { unit, hover, world } = fixture(shape, row, mirrored);
                    const figure = figureOf(unit);
                    expect(unit.getFootprintWidth()).toBe(shape.width);
                    expect(unit.getFootprintHeight()).toBe(shape.height);
                    expect(figure.texture.width).toBe(shape.pixels[0]);
                    expect(figure.texture.height).toBe(shape.pixels[1]);
                    hover.addTargetHighlight(unit);
                    const highlight = hoverVisuals(hover).hoverTargetSilhouettes[0];
                    expectLiveGeometry(highlight, figure);
                    world.sortChildren();
                    // The opaque live cutout covers a same-sized tint when the clone sorts underneath it.
                    expect(world.getChildIndex(highlight)).toBeGreaterThan(world.getChildIndex(figure));
                });
            }
        }

        test(`pooled clone stays above changed head-priority and foreground depths, mirrored ${mirrored}`, () => {
            const { unit, hover, world, textures } = fixture(shapes[1], 14, mirrored);
            const figure = figureOf(unit);
            hover.addTargetHighlight(unit);
            const highlight = hoverVisuals(hover).hoverTargetSilhouettes[0];
            hover.clearAttackVisuals(true);
            expect(highlight.visible).toBe(false);
            expect(hoverVisuals(hover).silhouettePool).toContain(highlight);

            const nextFrame = new Texture({ source: new TextureSource({ width: 160, height: 384 }) });
            textures.push(nextFrame);
            figure.texture = nextFrame;
            figure.anchor.set(0.45, 0.9);
            figure.scale.set(-1.3, -0.85);
            figure.position.set(figure.x + 17, figure.y + 23);
            figure.rotation = 0.12;
            for (const depth of [3995, CREATURE_ATTACK_FOREGROUND_Z_INDEX]) {
                unit.applyCreatureHeadPriorityDepth(depth);
                hover.addTargetHighlight(unit);
                expect(hoverVisuals(hover).hoverTargetSilhouettes[0]).toBe(highlight);
                expectLiveGeometry(highlight, figure);
                world.sortChildren();
                expect(world.getChildIndex(highlight)).toBeGreaterThan(world.getChildIndex(figure));
                hover.clearAttackVisuals();
                expect(highlight.visible).toBe(false);
            }
        });
    }
});
