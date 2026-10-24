import {
    AbilityFactory,
    EffectFactory,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type TeamType,
} from "@heroesofcrypto/common";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, type Sprite, Texture } from "pixi.js";

import { animationAtlases } from "../generated/animation_atlases";
import { images } from "../imageAssets";
import { CREATURE_SPRITE_ANIMATION_SETTINGS } from "../pixi/creatureAnimationSettings";
import { isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { RenderableUnit } from "./RenderableUnit";

const grid = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const settings = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };
const manifest = images as Partial<Record<string, string>>;
const productionOmissions = Object.entries(manifest).filter(
    ([key]) =>
        key.startsWith("dryad_") &&
        (isProductionOmittedAssetKey(key) || isProductionOmittedDisabledUnitAnimationAssetKey(key)),
);
const baseTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
});
const atlasTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});

beforeAll(() => {
    if (typeof document === "undefined") {
        (globalThis as { document?: unknown }).document = {
            cookie: "",
            createElement: () => ({ getContext: () => null, setAttribute: () => {} }),
            querySelector: () => null,
            querySelectorAll: () => [],
        };
    }
    document.cookie ??= "";
});

afterEach(() => {
    Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, settings);
    for (const [key, value] of productionOmissions) manifest[key] = value;
});

type Visuals = {
    sprite: Sprite;
    selectionAnimFrames?: Texture[];
};

function createDryad(team: TeamType, row: number, idleReady: () => boolean = () => true) {
    const effects = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(team, "Nature", "Dryad", "dryad_512", 100),
        grid,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effects),
        effects,
        false,
    );
    const unit = RenderableUnit.fromBase(base, (key) => {
        if (key === "dryad_painted_idle_atlas" && !idleReady()) return undefined;
        return key.includes("_atlas") ? atlasTexture : baseTexture;
    });
    const root = new Container();
    root.scale.set(0.8, -0.55);
    unit.setBattlefieldVisualProjection(true);
    unit.setPosition(-832, 64 + row * grid.getCellSize());
    unit.ensureVisual(root, grid);
    return { unit, root, visual: unit as unknown as Visuals };
}

for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
    test(`Dryad team ${team} keeps its approved size and planted feet without retired production assets`, () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
        for (const row of [0, 7, 15]) {
            const reference = createDryad(team, row);
            for (const [key] of productionOmissions) delete manifest[key];
            const production = createDryad(team, row);
            try {
                expect(manifest.dryad_idle_atlas_quarter).toBeUndefined();
                expect(production.unit.hasAnimationState("idle")).toBe(true);
                expect(production.visual.selectionAnimFrames).toHaveLength(
                    animationAtlases["Dryad Painted"].idle.frameCount,
                );
                const samePlacement = () => {
                    const actual = production.visual.sprite;
                    const expected = reference.visual.sprite;
                    expect(actual.texture.height).toBe(384);
                    expect(actual.anchor.y).toBe(366 / 384);
                    expect(actual.width).toBeCloseTo(expected.width, 8);
                    expect(actual.height).toBeCloseTo(expected.height, 8);
                    expect(actual.x).toBeCloseTo(expected.x, 8);
                    expect(actual.y).toBeCloseTo(expected.y, 8);
                };
                samePlacement();
                production.unit.setBoardSelected(true);
                production.unit.setBoardSelected(false);
                production.unit.ensureVisual(production.root, grid);
                samePlacement();
                production.unit.startBoardWalkAnimation(1, 3);
                production.unit.stopBoardWalkAnimation();
                samePlacement();
                for (const action of ["attack", "attack_up", "attack_down", "melee_attack", "hit"]) {
                    expect(production.unit.playOneShotAnimation(action)).toBe(true);
                    production.unit.stepOneShotAnimation(5000);
                    samePlacement();
                    production.unit.ensureVisual(production.root, grid);
                    samePlacement();
                }
            } finally {
                reference.root.destroy({ children: true });
                production.root.destroy({ children: true });
                for (const [key, value] of productionOmissions) manifest[key] = value;
            }
        }
    });
}

test("Dryad loads the approved idle into an unselected production stack", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    for (const [key] of productionOmissions) delete manifest[key];
    let idleReady = false;
    const { unit, root, visual } = createDryad(TeamVals.LEFT, 7, () => idleReady);
    try {
        expect(unit.hasAnimationState("idle")).toBe(true);
        expect(visual.selectionAnimFrames).toBeUndefined();
        idleReady = true;
        unit.syncVisual(root, grid);
        expect(visual.selectionAnimFrames).toHaveLength(animationAtlases["Dryad Painted"].idle.frameCount);
        expect(visual.sprite.texture.height).toBe(384);
        expect(visual.sprite.anchor.y).toBe(366 / 384);
        const size = { width: visual.sprite.width, height: visual.sprite.height };
        unit.syncVisual(root, grid);
        expect(visual.sprite.width).toBeCloseTo(size.width, 8);
        expect(visual.sprite.height).toBeCloseTo(size.height, 8);
    } finally {
        root.destroy({ children: true });
    }
});
