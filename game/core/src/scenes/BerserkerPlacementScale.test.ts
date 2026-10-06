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
import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { BufferImageSource, Container, Sprite, Texture } from "pixi.js";

import { CREATURE_SPRITE_ANIMATION_SETTINGS } from "../pixi/creatureAnimationSettings";
import { RenderableUnit as ApprovedRenderableUnit } from "./LevelOneRenderableUnit";
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
const staticTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
});
const atlasTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});
const settings = { ...CREATURE_SPRITE_ANIMATION_SETTINGS };

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

afterEach(() => Object.assign(CREATURE_SPRITE_ANIMATION_SETTINGS, settings));

for (const [name, Renderer] of [
    ["main", RenderableUnit],
    ["approved", ApprovedRenderableUnit],
] as const) {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        test(`${name} Berserker team ${team} keeps its placement size while the sword idle loads`, () => {
            const from = spyOn(Texture, "from").mockImplementation(() => {
                throw new Error("atlas is still downloading");
            });
            const root = new Container();
            let idleReady = false;
            const create = (approved: boolean) => {
                CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
                CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = approved;
                const effects = new EffectFactory();
                const base = Unit.createUnit(
                    HoCConfig.getCreatureConfig(team as TeamType, "Might", "Berserker", "berserker_512", 1),
                    grid,
                    team as TeamType,
                    UnitVals.CREATURE,
                    new AbilityFactory(effects),
                    effects,
                    false,
                );
                const unit = Renderer.fromBase(base, (key) => {
                    if (key === "berserker_sword_idle_atlas") return idleReady ? atlasTexture : undefined;
                    if (key === "berserker_walk_atlas" || key === "berserker_hit_atlas") return atlasTexture;
                    return key.includes("_atlas") ? undefined : staticTexture;
                });
                unit.setPosition(0, 1024);
                unit.ensureVisual(root, grid);
                return unit;
            };
            try {
                const reference = create(false) as unknown as { sprite: Sprite };
                const expectedWidth = reference.sprite.width;
                const expectedHeight = reference.sprite.height;
                const unit = create(true);
                const visual = unit as unknown as { sprite: Sprite; selectionAnimFrames?: Texture[] };
                const checkStatic = () => {
                    expect(visual.sprite.texture === staticTexture).toBe(true);
                    expect(visual.sprite.width).toBeCloseTo(expectedWidth, 8);
                    expect(visual.sprite.height).toBeCloseTo(expectedHeight, 8);
                };
                checkStatic();
                unit.setBoardSelected(true);
                unit.setPosition(512, 1024);
                unit.ensureVisual(root, grid);
                checkStatic();

                unit.startBoardWalkAnimation(1, 2);
                expect(Math.abs(visual.sprite.scale.y) * 979).toBeCloseTo((expectedHeight * 765) / 768, 8);
                unit.stopBoardWalkAnimation();
                checkStatic();
                expect(unit.playOneShotAnimation("hit")).toBe(true);
                unit.returnToIdleAnimation();
                checkStatic();

                idleReady = true;
                for (let i = 0; i < 3; i++) {
                    unit.ensureVisual(root, grid);
                    expect(visual.selectionAnimFrames).toHaveLength(20);
                    expect((visual.sprite.width * 576) / 1024).toBeCloseTo(expectedWidth, 8);
                    expect((visual.sprite.height * 576) / 1024).toBeCloseTo(expectedHeight, 8);
                }
                unit.startBoardWalkAnimation(-1, 2);
                unit.stopBoardWalkAnimation();
                expect((visual.sprite.height * 576) / 1024).toBeCloseTo(expectedHeight, 8);
            } finally {
                root.destroy({ children: true });
                from.mockRestore();
            }
        });
    }
}
