import { beforeAll, expect, test } from "bun:test";
import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
} from "@heroesofcrypto/common";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";
import { shouldPreloadUnitAnimationAtlas, usesApprovedBaseAnimations } from "../pixi/creatureAnimationSettings";
import { CREATURE_WALK_CYCLE_DISTANCE_CELLS, RenderableUnit } from "./RenderableUnit";

beforeAll(() => {
    if (typeof document === "undefined")
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
        };
});

test("preloads the painted flight without enabling Beholder's unapproved attack sheets", () => {
    expect(shouldPreloadUnitAnimationAtlas("beholder_flight_walk_atlas", false)).toBe(true);
    expect(shouldPreloadUnitAnimationAtlas("beholder_attack_atlas_quarter", false)).toBe(false);
    expect(usesApprovedBaseAnimations("Beholder")).toBe(true);
});

test.each([false, true])("painted flight in lab=%s uses twelve distinct cels and shared spatial cadence", (lab) => {
    const grid = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(TeamVals.LEFT, "Chaos", "Beholder", "beholder_512", 1),
        grid,
        TeamVals.LEFT,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const atlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
    });
    const requested: string[] = [];
    const unit = RenderableUnit.fromBase(base, (name) => {
        requested.push(name);
        return atlas;
    });
    const root = new Container();
    const view = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number; gaitDistanceCells: number; completedCycles: number };
        selectionAnimFrames: Texture[];
    };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(lab);
    unit.ensureVisual(root, grid);
    const initial = { width: view.sprite.width, height: view.sprite.height, anchor: view.sprite.anchor.y };
    unit.startBoardWalkAnimation(1, 4);
    expect(requested).toContain("beholder_flight_walk_atlas");
    expect(requested).not.toContain("beholder_walk_atlas_quarter");
    expect(new Set(view.walkAnim?.frames).size).toBe(12);
    // The added transparent horizontal margin contains the windblown tips and
    // registers the head to idle while preserving its vertical/world scale.
    const flightCanvasWidth = (initial.width * 864) / 768;
    expect(view.sprite.width).toBeCloseTo(flightCanvasWidth, 5);
    expect(view.sprite.height).toBeCloseTo(initial.height, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(initial.anchor, 5);
    for (let boundary = 0; boundary <= 24; boundary++) {
        const distance = (boundary * CREATURE_WALK_CYCLE_DISTANCE_CELLS) / 12;
        unit.setBoardWalkDistanceCells(distance);
        expect(view.walkAnim?.frameIndex).toBe(boundary % 12);
        expect(view.walkAnim?.completedCycles).toBe(Math.floor(boundary / 12));
        const texture = view.sprite.texture;
        unit.stepSelectionAnimation(10000 + boundary * 1000);
        expect(view.sprite.texture).toBe(texture);
        expect(view.sprite.filters?.some((f) => "flight" in f.resources) ?? false).toBe(false);
    }
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    unit.setBoardFacingFromMovement(-1);
    const phase = view.walkAnim?.frameIndex;
    unit.ensureVisual(root, grid);
    expect(view.walkAnim?.frameIndex).toBe(phase);
    expect(view.sprite.height).toBeCloseTo(initial.height, 5);
    expect(view.sprite.width).toBeCloseTo(flightCanvasWidth, 5);
    unit.stopBoardWalkAnimation();
    expect(view.sprite.height).toBeCloseTo(initial.height, 5);
    expect(view.sprite.width).toBeCloseTo(initial.width, 5);
    expect(view.sprite.anchor.y).toBeCloseTo(initial.anchor, 5);
    unit.startBoardWalkAnimation(-1, 0.05);
    unit.setBoardWalkDistanceCells(0.05);
    expect(unit.finishBoardWalkAnimationAfterFullCycle()).toBe(false);
    expect(view.walkAnim).toBeUndefined();
    expect(view.selectionAnimFrames).toContain(view.sprite.texture);
    root.destroy({ children: true });
});
