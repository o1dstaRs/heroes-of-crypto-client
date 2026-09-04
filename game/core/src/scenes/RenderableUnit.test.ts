import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { BufferImageSource, ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture } from "pixi.js";

import {
    AbilityFactory,
    AllAbilities,
    EffectFactory,
    GridConstants,
    GridMath,
    GridSettings,
    HoCConfig,
    HoCLib,
    Spell,
    TeamVals,
    Unit,
    UnitVals,
    type ISceneLog,
    type TeamType,
} from "@heroesofcrypto/common";

import {
    ACTIVE_TURN_POINTER_SIZE_SCALE,
    activeTurnFireFrameForElapsed,
    activeFlagGlowAlphaForTime,
    activeFlagScaleForTime,
    activeTurnPointerGap,
    stableDamagePredictionBadgeScreenTop,
    attackAnimationVerticalBandForFootprints,
    ashMothIdleBreathScaleForElapsed,
    ashMothIdleBreathScalesForElapsed,
    ashMothActionScaleMultiplier,
    authoredIdleFrameForElapsed,
    authoredIdleFrameDurationMs,
    battlefieldCreaturePerspectiveScale,
    battlefieldCreatureContourOpacity,
    battlefieldFootLineOffsetCells,
    battlefieldCreatureScaleMultiplier,
    battlefieldCreatureShadowProjection,
    battlefieldCanonicalShadowReference,
    battlefieldStableShadowReferenceScale,
    battlefieldShadowSourceForUnit,
    BATTLEFIELD_FOUR_CELL_SCALE_MULTIPLIER,
    BATTLEFIELD_FOUR_CELL_Y_OFFSET_RATIO,
    BATTLEFIELD_GARGANTUAN_SCALE_MULTIPLIER,
    BATTLEFIELD_SHADOW_BOTTOM_ROW_ALPHA,
    BATTLEFIELD_SHADOW_BOTTOM_ROW_LENGTH_SCALE,
    BATTLEFIELD_SHADOW_BOTTOM_ROW_WIDTH_SCALE,
    BATTLEFIELD_SHADOW_TOP_ROW_ALPHA,
    BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE,
    BATTLEFIELD_SHADOW_TOP_ROW_WIDTH_SCALE,
    BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO,
    BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
    commonIdleBreathScalesForElapsed,
    COMMON_IDLE_BREATH_PERIOD_MS,
    COMMON_IDLE_BREATH_SETTINGS,
    dropDuplicateAppliedEntries,
    CREATURE_ATTACK_FOREGROUND_Z_INDEX,
    CREATURE_SPRITE_ANIMATION_SETTINGS,
    creatureGenericCombatMotionEnabledForUnit,
    creatureGenericWholeSpriteMotionEnabledForLevel,
    creatureIdleAnimationEnabledForUnit,
    creatureOneShotAnimationEnabledForUnit,
    creatureWalkAnimationEnabledForUnit,
    flagOffsetXForFacing,
    nativeBoardFacingMultiplier,
    oneShotAnimationDurationMultiplier,
    placementFacingDirectionForTeam,
    resolveAnimationAtlasState,
    ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES,
    ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS,
    ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS,
    ORC_IDLE_BREATH_CYCLES_PER_AXE_TWIRL,
    ORC_IDLE_BREATH_PERIOD_MS,
    REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER,
    SQUIRE_IDLE_SPEED_MULTIPLIER,
    SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER,
    SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER,
    textureSwapHeightScaleRatio,
    SCAVENGER_ACTIVE_BATTLE_CRY_BREATH_CYCLES,
    SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS,
    SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS,
    SCAVENGER_ACTIVE_BATTLE_CRY_POINT_HOLD_MS,
    SCAVENGER_FLOURISH_FRAME_DURATION_MS,
    SCAVENGER_IDLE_BREATH_CYCLES_PER_BLADE_TWIRL,
    SCAVENGER_BOARD_MODEL_HEIGHT_CELLS,
    orcActiveBattleCryBreathElapsed,
    orcActiveBattleCryFrameForElapsed,
    orcIdleAxeTwirlFrameForElapsed,
    orcIdleBreathScalesForElapsed,
    preservesFacingForPureVerticalSingleCellAttack,
    PEASANT_ATTACK_RENDER_SCALE,
    PEASANT_DIAGONAL_ATTACK_RENDER_SCALE,
    PEASANT_ATTACK_EFFECTIVE_X_SCALE,
    PEASANT_ATTACK_END_RENDER_SCALE,
    PEASANT_ATTACK_FRAME_SCALE_FACTORS,
    PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS,
    PEASANT_SIDE_ATTACK_FRAME_DURATION_MS,
    PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES,
    PEASANT_ATTACK_DOWN_END_RENDER_SCALE,
    peasantAttackAnchorX,
    peasantAttackHorizontalScaleMultiplier,
    PEASANT_DEATH_RENDER_SCALE,
    peasantActionScaleMultiplier,
    rangedProjectileOriginFromBounds,
    RenderableUnit,
    revealedOpponentFootprintPoints,
    refreshedBoardVisualProfileForUnit,
    refreshedIdlePhaseRatio,
    scavengerActiveBattleCryBreathElapsed,
    scavengerActiveBattleCryFrameForElapsed,
    scavengerIdleBladeTwirlFrameForElapsed,
    TALL_BOARD_MODEL_FOOT_INSET_RATIO,
    WOLF_BOARD_MODEL_HEIGHT_CELLS,
    wolfWalkFrameScaleMultiplier,
    tallBoardModelFootAnchorY,
    tallBoardModelFootLineY,
    thiefIdleBreathScaleForElapsed,
    thiefIdleBreathScalesForElapsed,
    previewPlacementFacing,
} from "./RenderableUnit";
import { projectBattlefieldPoint, projectedCellPoints, projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import {
    BATTLEFIELD_CREATURE_CONTOUR_COLOR,
    BATTLEFIELD_CREATURE_CONTOUR_FURNACE_OPACITY,
    shouldApplyRuntimeBattlefieldContour,
} from "./BattlefieldCreatureContourFilter";
import { getBattlefieldAlphaHoleFillFilter, shouldFillBattlefieldAlphaHoles } from "./BattlefieldAlphaHoleFillFilter";
import { BATTLEFIELD_CREATURE_FRAMING } from "../ui/battlefieldCreatureFraming";
import { BATTLEFIELD_SHADOW_TUNING_BY_CREATURE } from "../ui/battlefieldShadowTuning";
import { DEFAULT_STUN_BADGE_TUNING, stunBadgeLayout } from "../ui/stunBadgeTuning";
import { BATTLEFIELD_HEIGHT_RATIO } from "../pixi/boardFit";
import { animationAtlases } from "../generated/animation_atlases";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const sceneLog: ISceneLog = {
    getLog: () => "",
    updateLog: () => undefined,
    hasBeenUpdated: () => false,
};

describe("ranged projectile origin", () => {
    const bounds = { left: 100, top: 50, right: 220, bottom: 250 };

    test("places an Arbalester shot at the crossbow muzzle and mirrors it with the target", () => {
        expect(rangedProjectileOriginFromBounds("Arbalester", bounds, { x: 500, y: 150 })).toEqual({
            x: 215.2,
            y: 130,
        });
        expect(rangedProjectileOriginFromBounds("Arbalester", bounds, { x: 0, y: 150 })).toEqual({
            x: 104.8,
            y: 130,
        });
    });

    test("uses the forward hand zone for an unarmed shooter", () => {
        expect(rangedProjectileOriginFromBounds("Monk", bounds, { x: 500, y: 150 })).toEqual({
            x: 193.6,
            y: 130,
        });
    });

    test("uses facing for a vertical shot and a safe hand-zone fallback for granted ranged attacks", () => {
        expect(rangedProjectileOriginFromBounds("Unknown Shooter", bounds, { x: 160, y: 0 }, -1)).toEqual({
            x: 121.6,
            y: 132,
        });
    });
});

// The atlas metadata is committed (game/core/.gitignore carves it out of src/generated/), so
// these tests run everywhere — CI included. No conditional skipping: a checkout without the
// metadata is a broken checkout and should fail loudly.
const assetTest = test;

// Atlas tests use a synthetic source that is large enough for every authored frame.
// Texture.WHITE is only 1x1; Pixi v8 correctly rejects frame rectangles outside it,
// which made the CI asset stubs hide every animation even though the metadata exists.
const testAtlasTexture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(4), width: 8192, height: 8192 }),
});

function createRenderableUnit(
    team: TeamType,
    factionName: string,
    creatureName: string,
    textureName: string,
    textureResolver: (name: string) => Texture | undefined = () => undefined,
): RenderableUnit {
    const effectFactory = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(team, factionName, creatureName, textureName, 1),
        gridSettings,
        team,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    return RenderableUnit.fromBase(base, (name) => {
        const texture = textureResolver(name);
        return texture === Texture.WHITE ? testAtlasTexture : texture;
    });
}

const spellAmounts = (unit: Unit): Record<string, number> =>
    Object.fromEntries(unit.getSpells().map((spell) => [spell.getName(), spell.getAmount()]));

beforeEach(() => {
    // Exercise authored playback in its dedicated tests. Production keeps the master switch off; the
    // frozen-state test below explicitly returns to that temporary runtime mode.
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = true;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
});

afterEach(() => {
    HoCLib.setDeterministicRandomSource(undefined);
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
});

describe("preview placement facing", () => {
    test("a teamless overlay ghost faces by the hovered board half; a real team always wins", () => {
        // The army overlay is a team-less catalog: its chips carry NO_TEAM until the drop assigns a
        // side, and the ghost must already face the way the dropped unit will.
        expect(previewPlacementFacing(TeamVals.NO_TEAM, 512)).toBe(-1);
        expect(previewPlacementFacing(TeamVals.NO_TEAM, -512)).toBe(1);
        expect(previewPlacementFacing(TeamVals.NO_TEAM, 0)).toBe(1);
        expect(previewPlacementFacing(TeamVals.RIGHT, -512)).toBe(-1);
        expect(previewPlacementFacing(TeamVals.LEFT, 512)).toBe(1);
    });
});

describe("level-one generic whole-sprite motion gate", () => {
    test("disables shared movement/combat overlays at level one and retains them above level one", () => {
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(1)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(2)).toBe(true);
        expect(creatureGenericCombatMotionEnabledForUnit("Squire", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Troglodyte", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Satyr", 2)).toBe(true);
    });
});

describe("battlefield movement preview", () => {
    assetTest("matches the exact rendered ground point after moving to the destination cell", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        const origin = { x: 384, y: 640 };
        const destination = { x: 896, y: 1024 };
        unit.setPosition(origin.x, origin.y);
        unit.setBattlefieldVisualProjection(true);
        const root = new Container();
        unit.ensureVisual(root, gridSettings);

        const sourceSprite = (unit as unknown as { sprite?: { texture: Texture; x: number; y: number } }).sprite;
        const sourceTexture = sourceSprite?.texture;
        const preview = unit.getBattlefieldPreviewAt(destination, gridSettings);
        unit.setPosition(destination.x, destination.y);
        unit.ensureVisual(root, gridSettings);
        const destinationSprite = (unit as unknown as { sprite?: { texture: Texture; x: number; y: number } }).sprite;

        expect(preview).toBeDefined();
        expect(preview?.texture).toBe(sourceTexture);
        expect(preview?.texture).not.toBe(Texture.WHITE);
        expect(preview?.x).toBeCloseTo(destinationSprite?.x ?? 0);
        expect(preview?.y).toBeCloseTo(destinationSprite?.y ?? 0);
    });

    assetTest("reuses its transient movement-preview geometry", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(384, 640);
        unit.setBattlefieldVisualProjection(true);
        const root = new Container();
        unit.ensureVisual(root, gridSettings);

        const first = unit.getBattlefieldPreviewAt({ x: 640, y: 896 }, gridSettings);
        const firstX = first?.x;
        const second = unit.getBattlefieldPreviewAt({ x: 896, y: 1024 }, gridSettings);

        expect(second).toBe(first);
        expect(second?.x).not.toBe(firstX);
    });

    assetTest("reuses depth-sort geometry while updating its live values", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(384, 640);
        unit.setBattlefieldVisualProjection(true);
        const root = new Container();
        unit.ensureVisual(root, gridSettings);

        const first = unit.getCreatureDepthSortCandidate(0);
        const firstBounds = first?.bounds;
        const firstHeadZone = first?.headZone;
        const firstLeft = first?.bounds.left;
        const sprite = (unit as unknown as { sprite?: Sprite }).sprite!;
        const originalGetBounds = sprite.getBounds.bind(sprite);
        let getBoundsCalls = 0;
        sprite.getBounds = ((...args: Parameters<Sprite["getBounds"]>) => {
            getBoundsCalls += 1;
            return originalGetBounds(...args);
        }) as Sprite["getBounds"];
        unit.setPosition(896, 1024);
        unit.ensureVisual(root, gridSettings);
        const second = unit.getCreatureDepthSortCandidate(3);

        expect(first).toBeDefined();
        expect(second).toBe(first);
        expect(second?.bounds).toBe(firstBounds);
        expect(second?.headZone).toBe(firstHeadZone);
        expect(second?.stableOrder).toBe(3);
        expect(second?.bounds.left).not.toBe(firstLeft);
        expect(getBoundsCalls).toBe(1);
    });

    assetTest("keeps stationary creature bounds across simulation ticks", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(384, 640);
        unit.setBattlefieldVisualProjection(true);
        const root = new Container();
        unit.ensureVisual(root, gridSettings, 1_000);
        unit.getCreatureDepthSortCandidate(0);

        const sprite = (unit as unknown as { sprite?: Sprite }).sprite!;
        const originalGetBounds = sprite.getBounds.bind(sprite);
        let getBoundsCalls = 0;
        sprite.getBounds = ((...args: Parameters<Sprite["getBounds"]>) => {
            getBoundsCalls += 1;
            return originalGetBounds(...args);
        }) as Sprite["getBounds"];

        unit.ensureVisual(root, gridSettings, 1_000);
        unit.getCreatureDepthSortCandidate(0);
        expect(getBoundsCalls).toBe(0);

        root.position.x += 10;
        unit.ensureVisual(root, gridSettings, 1_000);
        unit.getCreatureDepthSortCandidate(0);
        expect(getBoundsCalls).toBe(1);
    });
});

describe("attack animation vertical bands", () => {
    test("maps every surrounding row around a 1x1 target to down, side, or up", () => {
        const target = [{ x: 5, y: 5 }];
        for (const x of [4, 5, 6]) {
            expect(attackAnimationVerticalBandForFootprints([{ x, y: 6 }], target)).toBe("down");
            expect(attackAnimationVerticalBandForFootprints([{ x, y: 4 }], target)).toBe("up");
        }
        expect(attackAnimationVerticalBandForFootprints([{ x: 4, y: 5 }], target)).toBe("side");
        expect(attackAnimationVerticalBandForFootprints([{ x: 6, y: 5 }], target)).toBe("side");
    });

    test("treats both occupied rows of a 2x2 target as the side band", () => {
        const target = [
            { x: 5, y: 5 },
            { x: 6, y: 5 },
            { x: 5, y: 6 },
            { x: 6, y: 6 },
        ];
        for (const x of [4, 5, 6, 7]) {
            expect(attackAnimationVerticalBandForFootprints([{ x, y: 7 }], target)).toBe("down");
            expect(attackAnimationVerticalBandForFootprints([{ x, y: 4 }], target)).toBe("up");
        }
        for (const y of [5, 6]) {
            expect(attackAnimationVerticalBandForFootprints([{ x: 4, y }], target)).toBe("side");
            expect(attackAnimationVerticalBandForFootprints([{ x: 7, y }], target)).toBe("side");
        }
    });

    test("uses footprint row overlap for large attackers too", () => {
        const target = [
            { x: 5, y: 5 },
            { x: 6, y: 5 },
            { x: 5, y: 6 },
            { x: 6, y: 6 },
        ];
        expect(
            attackAnimationVerticalBandForFootprints(
                [
                    { x: 3, y: 6 },
                    { x: 4, y: 6 },
                    { x: 3, y: 7 },
                    { x: 4, y: 7 },
                ],
                target,
            ),
        ).toBe("side");
        expect(
            attackAnimationVerticalBandForFootprints(
                [
                    { x: 4, y: 7 },
                    { x: 5, y: 7 },
                    { x: 4, y: 8 },
                    { x: 5, y: 8 },
                ],
                target,
            ),
        ).toBe("down");
    });

    test("preserves movement facing only for a strictly vertical 1x1 attack", () => {
        expect(preservesFacingForPureVerticalSingleCellAttack([{ x: 5, y: 6 }], [{ x: 5, y: 5 }])).toBe(true);
        expect(preservesFacingForPureVerticalSingleCellAttack([{ x: 5, y: 4 }], [{ x: 5, y: 5 }])).toBe(true);
        expect(preservesFacingForPureVerticalSingleCellAttack([{ x: 4, y: 6 }], [{ x: 5, y: 5 }])).toBe(false);
        expect(
            preservesFacingForPureVerticalSingleCellAttack(
                [{ x: 5, y: 6 }],
                [
                    { x: 5, y: 5 },
                    { x: 6, y: 5 },
                    { x: 5, y: 6 },
                    { x: 6, y: 6 },
                ],
            ),
        ).toBe(false);
    });
});

describe("full-body model ground line", () => {
    test("adds the unified contour and one compact furnace-cast silhouette", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Squire", "squire_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(new Container(), gridSettings);

        const internals = unit as unknown as {
            sprite?: { filters: unknown[] | null; texture: Texture; scale: { x: number; y: number } };
            shadow?: { visible: boolean };
            silhouetteShadow?: {
                texture: Texture;
                visible: boolean;
                alpha: number;
                x: number;
                y: number;
                filters: unknown[] | null;
                scale: { x: number; y: number };
            };
            groundCastShadow?: {
                texture: Texture;
                visible: boolean;
                scale: { x: number; y: number };
            };
        };
        expect(internals.sprite?.filters).toHaveLength(1);
        // The shadow is cast from the canonical first authored idle frame; the live sprite may already sit
        // on a later frame because refreshed idles start at a stable per-unit phase.
        const canonicalIdleFrame = (unit as unknown as { selectionAnimFrames?: Texture[] }).selectionAnimFrames?.[0];
        expect(canonicalIdleFrame).toBeDefined();
        expect(internals.silhouetteShadow?.texture).toBe(canonicalIdleFrame as Texture);
        expect(internals.silhouetteShadow?.visible).toBe(true);
        expect(internals.silhouetteShadow?.scale.y).toBeGreaterThan(0);
        expect(internals.silhouetteShadow?.x).toBeDefined();
        expect(internals.silhouetteShadow?.y).toBeDefined();
        expect(internals.silhouetteShadow?.filters ?? null).toBeNull();
        expect(internals.groundCastShadow).toBeUndefined();
        expect(internals.shadow?.visible).toBe(true);
    });

    test("keeps the complete projected silhouette and contact patch for the tuned level-one group", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Orc", "orc_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(new Container(), gridSettings);

        const internals = unit as unknown as {
            sprite?: { texture: Texture; anchor: { y: number } };
            shadow?: { visible: boolean };
            silhouetteShadow?: { texture: Texture; anchor: { y: number }; renderable: boolean };
        };
        expect(internals.silhouetteShadow?.texture).toBe(internals.sprite?.texture);
        expect(internals.silhouetteShadow?.anchor.y).toBe(internals.sprite?.anchor.y);
        expect(internals.silhouetteShadow?.renderable).toBe(true);
        expect(internals.shadow?.visible).toBe(true);
    });

    test("keeps the runtime contour off every approved static battlefield cutout", () => {
        expect(BATTLEFIELD_CREATURE_CONTOUR_COLOR).toBe(0x241f19);
        expect(BATTLEFIELD_CREATURE_CONTOUR_FURNACE_OPACITY).toBe(0.6);
        expect(shouldApplyRuntimeBattlefieldContour("Squire", 1)).toBe(false);
        expect(shouldApplyRuntimeBattlefieldContour("Arachna Queen", 2)).toBe(false);
        expect(shouldApplyRuntimeBattlefieldContour("Griffin", 1)).toBe(false);
        expect(shouldApplyRuntimeBattlefieldContour("Pegasus", 1)).toBe(false);
    });

    test("repairs authored alpha cracks while keeping Peasant's flattened shadow unfiltered", () => {
        for (const [faction, name, textureName] of [
            ["Life", "Peasant", "peasant_512"],
            ["Might", "Harpy", "harpy_512"],
            ["Nature", "Elf", "elf_512"],
            ["Life", "Valkyrie", "valkyrie_512"],
        ] as const) {
            expect(shouldFillBattlefieldAlphaHoles(name)).toBe(true);
            const unit = createRenderableUnit(TeamVals.LEFT, faction, name, textureName, () => Texture.WHITE);
            unit.setPosition(0, 1024);
            unit.setBattlefieldVisualProjection(true);
            unit.ensureVisual(new Container(), gridSettings);

            const alphaRepairFilter = getBattlefieldAlphaHoleFillFilter();
            const internals = unit as unknown as {
                sprite?: { filters: unknown[] | null };
                silhouetteShadow?: { filters: unknown[] | null };
            };
            if (alphaRepairFilter) {
                expect(alphaRepairFilter.resolution).toBe("inherit");
                expect(internals.sprite?.filters).toContain(alphaRepairFilter);
                if (name === "Peasant") {
                    expect(internals.silhouetteShadow?.filters ?? []).not.toContain(alphaRepairFilter);
                } else {
                    expect(internals.silhouetteShadow?.filters).toContain(alphaRepairFilter);
                }
            }
        }
        expect(shouldFillBattlefieldAlphaHoles("Orc")).toBe(false);
    });

    test("makes the contour forty percent more transparent in the furnace-adjacent rows", () => {
        const oneCellPosition = (row: number) =>
            GridMath.getPositionForCell(
                { x: 4, y: row },
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            );
        const fourCellPosition = (bottomRow: number) =>
            GridMath.getPositionForCells(gridSettings, [
                { x: 4, y: bottomRow },
                { x: 5, y: bottomRow },
                { x: 4, y: bottomRow + 1 },
                { x: 5, y: bottomRow + 1 },
            ]);

        expect(battlefieldCreatureContourOpacity(oneCellPosition(13).y, 1, gridSettings)).toBe(1);
        expect(battlefieldCreatureContourOpacity(oneCellPosition(14).y, 1, gridSettings)).toBe(0.6);
        expect(battlefieldCreatureContourOpacity(oneCellPosition(15).y, 1, gridSettings)).toBe(0.6);
        expect(fourCellPosition(12)).toBeDefined();
        expect(fourCellPosition(13)).toBeDefined();
        expect(fourCellPosition(14)).toBeDefined();
        expect(battlefieldCreatureContourOpacity(fourCellPosition(12)!.y, 2, gridSettings)).toBe(1);
        expect(battlefieldCreatureContourOpacity(fourCellPosition(13)!.y, 2, gridSettings)).toBe(0.6);
        expect(battlefieldCreatureContourOpacity(fourCellPosition(14)!.y, 2, gridSettings)).toBe(0.6);
    });

    test("replaces rather than stacks contour filters when a creature crosses into the furnace rows", () => {
        const left = GridMath.getPositionForCell(
            { x: 4, y: 13 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const right = GridMath.getPositionForCell(
            { x: 4, y: 14 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Squire", "squire_512", () => Texture.WHITE);
        const world = new Container();
        const sprite = () => (unit as unknown as { sprite?: { filters: unknown[] | null } }).sprite;

        unit.setBattlefieldVisualProjection(true);
        unit.setPosition(left.x, left.y);
        unit.ensureVisual(world, gridSettings);
        const regularContour = sprite()?.filters?.[0];
        expect(sprite()?.filters).toHaveLength(1);

        unit.setPosition(right.x, right.y);
        unit.ensureVisual(world, gridSettings);
        const softenedContour = sprite()?.filters?.[0];
        expect(sprite()?.filters).toHaveLength(1);
        expect(softenedContour).not.toBe(regularContour);

        unit.setPosition(left.x, left.y);
        unit.ensureVisual(world, gridSettings);
        expect(sprite()?.filters).toHaveLength(1);
        expect(sprite()?.filters?.[0]).toBe(regularContour);
    });

    test("raises one-cell creatures 25% from the lower seam and lowers four-cell creatures by 70%", () => {
        const cell = { x: 2, y: 1 };
        const position = GridMath.getPositionForCell(
            cell,
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const cases = [
            ["Life", "Squire", "squire_512", 1, BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO],
            ["Chaos", "Black Dragon", "black_dragon_512", 2, BATTLEFIELD_FOUR_CELL_Y_OFFSET_RATIO],
        ] as const;

        for (const [faction, name, texture, size, offsetRatio] of cases) {
            const unit = createRenderableUnit(TeamVals.LEFT, faction, name, texture, () => Texture.WHITE);
            const expected = projectBattlefieldPoint(
                { x: position.x, y: position.y - gridSettings.getCellSize() * offsetRatio },
                gridSettings,
            );

            expect(unit.getSize()).toBe(size);
            unit.setPosition(position.x, position.y);
            unit.setBattlefieldVisualProjection(true);
            unit.ensureVisual(new Container(), gridSettings);

            const sprite = (unit as unknown as { sprite?: { x: number; y: number } }).sprite;
            const approved = BATTLEFIELD_CREATURE_FRAMING[name];
            const perspectiveScale = battlefieldCreaturePerspectiveScale(position.y, size, gridSettings);
            expect(sprite?.x).toBeCloseTo(
                expected.x + gridSettings.getCellSize() * (approved?.offsetXCells ?? 0) * perspectiveScale,
                8,
            );
            expect(sprite?.y).toBeCloseTo(
                expected.y - gridSettings.getCellSize() * (approved?.offsetYCells ?? 0) * perspectiveScale,
                8,
            );
        }
    });

    test("uses one shared projected foot line for one-cell creatures with historical vertical nudges", () => {
        const position = GridMath.getPositionForCell(
            { x: 8, y: 12 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const expected = projectBattlefieldPoint(
            {
                x: position.x,
                y: position.y - gridSettings.getCellSize() * BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO,
            },
            gridSettings,
        );

        for (const [faction, name, texture] of [
            ["Life", "Squire", "squire_512"],
            ["Chaos", "Orc", "orc_512"],
        ] as const) {
            const unit = createRenderableUnit(TeamVals.RIGHT, faction, name, texture, () => Texture.WHITE);
            unit.setPosition(position.x, position.y);
            unit.setBattlefieldVisualProjection(true);
            unit.ensureVisual(new Container(), gridSettings);

            const sprite = (unit as unknown as { sprite?: { y: number } }).sprite;
            expect(unit.getSize()).toBe(1);
            expect(sprite?.y).toBeCloseTo(expected.y, 8);
        }
    });

    test("adds another ten percent to four-cell creatures while keeping Gargantuan at twenty percent", () => {
        expect(BATTLEFIELD_FOUR_CELL_SCALE_MULTIPLIER).toBeCloseTo(1.32);
        expect(BATTLEFIELD_GARGANTUAN_SCALE_MULTIPLIER).toBe(1.2);
        expect(battlefieldCreatureScaleMultiplier("Black Dragon", 2)).toBeCloseTo(1.32);
        expect(battlefieldCreatureScaleMultiplier("Hydra", 2)).toBeCloseTo(1.32);
        expect(battlefieldCreatureScaleMultiplier("Gargantuan", 2)).toBe(1.2);
        expect(battlefieldCreatureScaleMultiplier("Squire", 1)).toBe(1);

        const unit = createRenderableUnit(TeamVals.RIGHT, "Chaos", "Black Dragon", "black_dragon_512");
        expect(unit.getSize()).toBe(2);
    });

    test("places the authored foot row exactly six percent above the cell's lower edge", () => {
        const cell = gridSettings.getCellSize();
        expect(TALL_BOARD_MODEL_FOOT_INSET_RATIO).toBe(0.06);
        expect(tallBoardModelFootLineY(1024, cell)).toBeCloseTo(1024 - cell * 0.44);
        expect(tallBoardModelFootLineY(1024, cell, 2)).toBeCloseTo(1024 + cell * 0.06);
        expect(tallBoardModelFootAnchorY("Orc", "idle")).toBeCloseTo(185 / 192);
        expect(tallBoardModelFootAnchorY("Scavenger", "idle")).toBeCloseTo(191 / 192);
        expect(tallBoardModelFootAnchorY("Wandering Mage", "walk")).toBeCloseTo(184 / 192);
        expect(tallBoardModelFootAnchorY("Future Unit", "idle", { footAnchorY: 0.9 })).toBe(0.9);
    });

    test("keeps Squire idle on the static figure anchor and adds another exact eight percent to v4", () => {
        const squireIdle = animationAtlases.Squire.idle;
        expect(squireIdle.footAnchorY).toBeCloseTo(730 / 768, 12);
        expect(SQUIRE_IDLE_SPEED_MULTIPLIER).toBeCloseTo(1.2 * 1.08, 12);
        const originalRuntimeFrameDurationMs = 150 / REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER;
        const v4RuntimeFrameDurationMs = originalRuntimeFrameDurationMs / 1.2;
        const currentRuntimeFrameDurationMs = authoredIdleFrameDurationMs("Squire", 150, true);
        expect(currentRuntimeFrameDurationMs).toBeCloseTo(v4RuntimeFrameDurationMs / 1.08, 12);
        expect(v4RuntimeFrameDurationMs / currentRuntimeFrameDurationMs).toBeCloseTo(1.08, 12);
        expect(originalRuntimeFrameDurationMs / currentRuntimeFrameDurationMs).toBeCloseTo(1.296, 12);
    });

    test("uses one constant Squire walk scale that matches the approved idle silhouette", () => {
        expect(SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER).toBeCloseTo(726 / 696, 12);
        expect(696 * SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER).toBeCloseTo(726, 12);
        expect(408 * SQUIRE_WALK_VISIBLE_SCALE_MULTIPLIER).toBeCloseTo(426, 0);
    });

    test("keeps the approved Squire death sequence width-matched, size-locked, and on the static foot anchor", () => {
        const squireDeath = animationAtlases.Squire.death;
        expect(squireDeath.frameWidth).toBe(896);
        expect(squireDeath.frameHeight).toBe(832);
        expect(squireDeath.frameCount).toBe(8);
        expect(squireDeath.frameDurationSec).toBeCloseTo(0.095, 12);
        expect(squireDeath.footAnchorY).toBeCloseTo(730 / 768, 12);
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureOneShotAnimationEnabledForUnit("Squire", "death")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Squire", "attack")).toBe(false);
        expect(oneShotAnimationDurationMultiplier("Squire", "death")).toBeCloseTo(1 / (2 * 1.2 * 1.15), 12);
        expect(
            (squireDeath.loopDurationMs / squireDeath.frameCount) *
                oneShotAnimationDurationMultiplier("Squire", "death"),
        ).toBeCloseTo(35.625 / 1.15, 12);
        const openingSwapRatio = textureSwapHeightScaleRatio(768 / 4, 832 / 4);
        expect(openingSwapRatio).toBeCloseTo(768 / 832, 12);
        expect((832 / 4) * openingSwapRatio).toBeCloseTo(768 / 4, 12);
        expect(SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER).toBeCloseTo(426 / 768 / (495 / 832), 12);
        expect((495 / 832) * SQUIRE_DEATH_HORIZONTAL_SCALE_MULTIPLIER).toBeCloseTo(426 / 768, 12);
    });

    assetTest("keeps Orc, Scavenger and Wandering Mage planted through every authored board state", () => {
        type GroundedInternals = {
            sprite?: { y: number; anchor: { y: number } };
        };
        const cases = [
            [
                "Orc",
                "orc_512",
                [
                    "attack",
                    "attack_up",
                    "attack_down",
                    "melee_attack",
                    "melee_attack_up",
                    "melee_attack_down",
                    "cast",
                    "hit",
                    "death",
                ],
            ],
            ["Scavenger", "scavenger_512", ["attack", "attack_up", "attack_down", "cast", "hit", "death"]],
            [
                "Wandering Mage",
                "wandering_mage_512",
                ["attack", "attack_up", "attack_down", "cast", "defend", "celebrate", "hit", "death"],
            ],
        ] as const;
        const cell = gridSettings.getCellSize();
        const footLineY = tallBoardModelFootLineY(1024, cell);
        // The approved static figures keep their own authored lift above the shared foot line: the Scavenger
        // rises by five percent of its model height and the Wandering Mage by its framing offset. Every walk
        // and one-shot state must then stay planted on that same line.
        const expectedYByName: Record<string, number> = {
            Orc: footLineY,
            Scavenger:
                footLineY +
                0.05 * cell * SCAVENGER_BOARD_MODEL_HEIGHT_CELLS * BATTLEFIELD_CREATURE_FRAMING.Scavenger.scaleY,
            "Wandering Mage": footLineY - BATTLEFIELD_CREATURE_FRAMING["Wandering Mage"].offsetYCells * cell,
        };

        for (const [name, texture, actionStates] of cases) {
            const expectedY = expectedYByName[name];
            const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", name, texture, () => Texture.WHITE);
            const world = new Container();
            const internals = unit as unknown as GroundedInternals;
            unit.setPosition(0, 1024);
            unit.ensureVisual(world, gridSettings);
            expect(internals.sprite?.y).toBeCloseTo(expectedY);

            unit.startBoardWalkAnimation(1);
            unit.ensureVisual(world, gridSettings);
            expect(internals.sprite?.y).toBeCloseTo(expectedY);

            for (const state of actionStates) {
                expect(unit.playOneShotAnimation(state)).toBe(true);
                unit.ensureVisual(world, gridSettings);
                expect(internals.sprite?.y).toBeCloseTo(expectedY);
                expect(internals.sprite?.anchor.y).toBe(tallBoardModelFootAnchorY(name, state));
            }
        }
    });

    assetTest("lifts only Arbalester, Blacksmith and Leprechaun by their requested bottom insets", () => {
        type PositionedInternals = { sprite?: { y: number } };
        const cell = gridSettings.getCellSize();
        const positionY = 1024;
        const cases = [
            ["Life", "Arbalester", 0.3],
            ["Life", "Blacksmith", 0.4],
            ["Nature", "Leprechaun", 0.5],
        ] as const;

        for (const [faction, name, insetRatio] of cases) {
            const unit = createRenderableUnit(TeamVals.LEFT, faction, name, `${name}_512`, () => Texture.WHITE);
            unit.setPosition(0, positionY);
            unit.ensureVisual(new Container(), gridSettings);
            const internals = unit as unknown as PositionedInternals;
            const approvedOffsetY = BATTLEFIELD_CREATURE_FRAMING[name]?.offsetYCells ?? 0;

            expect(refreshedBoardVisualProfileForUnit(name).footInsetRatio).toBe(insetRatio);
            expect(internals.sprite?.y).toBeCloseTo(
                positionY - cell * 0.5 + cell * insetRatio - cell * approvedOffsetY,
            );
        }

        expect(refreshedBoardVisualProfileForUnit("White Tiger").footInsetRatio).toBeUndefined();
        expect(tallBoardModelFootLineY(positionY, cell)).toBeCloseTo(
            positionY - cell * 0.5 + cell * TALL_BOARD_MODEL_FOOT_INSET_RATIO,
        );
    });
});

test("adds the requested non-Wandering-Mage attack, hit, and death speed boosts", () => {
    const recoveredPeasantAttackDuration = (0.03214285714285715 * 1000 * 8) / 231;
    expect(oneShotAnimationDurationMultiplier("Peasant", "attack")).toBeCloseTo(
        recoveredPeasantAttackDuration / (1.2 * 1.15 * 1.1),
    );
    expect(oneShotAnimationDurationMultiplier("Peasant", "attack_up")).toBeCloseTo(
        recoveredPeasantAttackDuration / (1.2 * 1.15 * 1.1),
    );
    expect(oneShotAnimationDurationMultiplier("Peasant", "attack_down")).toBeCloseTo(
        recoveredPeasantAttackDuration / (1.2 * 1.15 * 1.1),
    );
    expect(oneShotAnimationDurationMultiplier("Orc", "attack")).toBeCloseTo(1 / (1.4 * 1.22));
    expect(oneShotAnimationDurationMultiplier("Orc", "attack_up")).toBeCloseTo(1 / (1.4 * 1.22));
    expect(oneShotAnimationDurationMultiplier("Orc", "melee_attack_down")).toBeCloseTo(1 / (1.4 * 1.22));
    expect(oneShotAnimationDurationMultiplier("Orc", "death")).toBeCloseTo(1 / (2 * 1.2));
    expect(oneShotAnimationDurationMultiplier("Peasant", "death")).toBeCloseTo(
        1 / (2 * 1.2 * 1.35 * 1.1 * 1.16 * 1.15),
    );
    expect(oneShotAnimationDurationMultiplier("Orc", "hit")).toBeCloseTo(1 / 1.22);
    expect(oneShotAnimationDurationMultiplier("Scavenger", "death")).toBeCloseTo(1 / (2 * 1.2 * 1.12));

    // Wandering Mage keeps its existing 2x action cadence, with death accelerated by another 15%.
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "cast")).toBe(0.5);
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "attack")).toBe(0.5);
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "death")).toBeCloseTo(0.5 / 1.15);
});

test("keeps Wandering Mage cast and attack poses at its idle visual height", () => {
    expect(ashMothActionScaleMultiplier("cast", 0) * 170).toBeCloseTo(180);
    expect(ashMothActionScaleMultiplier("attack", 4) * 153).toBeCloseTo(180);
    expect(ashMothActionScaleMultiplier("attack_up", 3) * 171).toBeCloseTo(180);
    expect(ashMothActionScaleMultiplier("attack_down", 3) * 124).toBeCloseTo(180);
    expect(ashMothActionScaleMultiplier("hit", 3)).toBe(1);
    expect(ashMothActionScaleMultiplier("death", 3)).toBe(1);
});

describe("battlefield row perspective scale", () => {
    test("distributes the full fifteen percent reduction across playable rows and clamps both buffer rows", () => {
        expect(BATTLEFIELD_TOP_ROW_CREATURE_SCALE).toBe(0.85);
        const firstPlayableRow = 1;
        const lastPlayableRow = GridConstants.GRID_SIZE - 2;
        for (let row = 0; row < GridConstants.GRID_SIZE; row += 1) {
            const position = GridMath.getPositionForCell(
                { x: 0, y: row },
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            );
            const progress = Math.max(0, Math.min(1, (row - firstPlayableRow) / (lastPlayableRow - firstPlayableRow)));
            expect(battlefieldCreaturePerspectiveScale(position.y, 1, gridSettings)).toBeCloseTo(
                1 - progress * (1 - BATTLEFIELD_TOP_ROW_CREATURE_SCALE),
                8,
            );
        }
    });

    test("uses the full 100% to 85% range across legal four-cell positions", () => {
        const bottomPosition = GridMath.getPositionForCells(gridSettings, [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: 2 },
            { x: 1, y: 2 },
        ]);
        const topPosition = GridMath.getPositionForCells(gridSettings, [
            { x: 0, y: 13 },
            { x: 1, y: 13 },
            { x: 0, y: 14 },
            { x: 1, y: 14 },
        ]);

        expect(bottomPosition).toBeDefined();
        expect(topPosition).toBeDefined();
        expect(battlefieldCreaturePerspectiveScale(bottomPosition!.y, 2, gridSettings)).toBe(1);
        expect(battlefieldCreaturePerspectiveScale(topPosition!.y, 2, gridSettings)).toBeCloseTo(0.85, 8);
    });

    test("applies the same perspective to the live figure and its movement preview", () => {
        const bottom = GridMath.getPositionForCell(
            { x: 4, y: 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const top = GridMath.getPositionForCell(
            { x: 4, y: 14 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        const world = new Container();
        unit.setPosition(bottom.x, bottom.y);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);
        const internals = unit as unknown as { sprite?: { scale: { y: number } } };
        const bottomScale = Math.abs(internals.sprite?.scale.y ?? 0);
        const preview = unit.getBattlefieldPreviewAt(top, gridSettings);

        expect(preview).toBeDefined();
        expect(Math.abs(preview!.scaleY) / bottomScale).toBeCloseTo(BATTLEFIELD_TOP_ROW_CREATURE_SCALE, 8);

        unit.setPosition(top.x, top.y);
        unit.ensureVisual(world, gridSettings);
        const topScale = Math.abs(internals.sprite?.scale.y ?? 0);
        expect(topScale / bottomScale).toBeCloseTo(BATTLEFIELD_TOP_ROW_CREATURE_SCALE, 8);
    });
});

describe("furnace-cast battlefield shadow", () => {
    test("uses the first authored idle frame regardless of texture load timing", () => {
        const staticCutout = { id: "static-cutout" };
        const firstIdle = { id: "idle-0" };
        const laterIdle = { id: "idle-1" };

        expect(battlefieldCanonicalShadowReference(staticCutout)).toBe(staticCutout);
        expect(battlefieldCanonicalShadowReference(staticCutout, [firstIdle, laterIdle])).toBe(firstIdle);
    });

    test("captures Centaur's shadow reference only after it leaves the flat placement bench", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
        const world = new Container();
        const topPlayablePosition = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 2 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const internals = unit as unknown as {
            silhouetteShadowReferenceTexture?: Texture;
            silhouetteShadow?: { texture: Texture };
            sprite?: { texture: Texture };
        };

        unit.setPosition(topPlayablePosition.x, topPlayablePosition.y);
        unit.setBattlefieldVisualProjection(false);
        unit.ensureVisual(world, gridSettings);
        expect(internals.silhouetteShadowReferenceTexture).toBeUndefined();

        unit.setBattlefieldVisualProjection(true);
        unit.setVisualScaleMultiplier(1);
        unit.ensureVisual(world, gridSettings);
        expect(internals.silhouetteShadowReferenceTexture).toBe(internals.sprite?.texture);
        expect(internals.silhouetteShadow?.texture).toBe(internals.sprite?.texture);
    });

    test("keeps every creature shadow on the frozen editor idle frame instead of live combat frames", () => {
        const editorIdleFrame = { id: "editor-idle" };
        const combatFrame = { id: "combat" };

        for (const unitName of Object.keys(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE)) {
            expect(battlefieldShadowSourceForUnit(unitName, editorIdleFrame, combatFrame)).toBe(editorIdleFrame);
        }
    });

    test("sizes the frozen editor idle frame from its own canvas rather than a later combat frame", () => {
        expect(
            battlefieldStableShadowReferenceScale({
                unitName: "Centaur",
                referenceWidth: 768,
                referenceHeight: 768,
                cellSize: 128,
                chipTargetSide: 128,
                tallBoardModel: true,
                boardModelTargetHeightCells: 1.5,
                usesThiefSilhouette: false,
                refreshedFullBodyScale: true,
                refreshedWidthScale: 1,
                tallBoardWidthCells: 1.1,
                visualFootprintSide: 1,
            }),
        ).toEqual({ x: 0.25, y: 0.25 });
    });

    test("matches every approved editor profile exactly on the upper row before row scaling begins", () => {
        for (const footprintHeight of [1, 2]) {
            const cellSize = gridSettings.getCellSize();
            const bottomY = gridSettings.getMinY() + (1 + footprintHeight / 2) * cellSize;
            const topY =
                gridSettings.getMinY() +
                (gridSettings.getGridSize() - footprintHeight - 1 + footprintHeight / 2) * cellSize;
            const middleY = (bottomY + topY) / 2;

            for (const [unitName, tuning] of Object.entries(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE)) {
                const bottom = battlefieldCreatureShadowProjection(bottomY, footprintHeight, gridSettings, unitName);
                const middle = battlefieldCreatureShadowProjection(middleY, footprintHeight, gridSettings, unitName);
                const top = battlefieldCreatureShadowProjection(topY, footprintHeight, gridSettings, unitName);

                expect(top).toEqual({
                    lengthScale: tuning.top.lengthScale,
                    widthScale: tuning.top.widthScale,
                    alpha: tuning.top.alpha,
                });
                expect(bottom).toEqual({
                    lengthScale: tuning.bottom.lengthScale,
                    widthScale: tuning.bottom.widthScale,
                    alpha: tuning.bottom.alpha,
                });
                expect(middle.lengthScale).toBeCloseTo((tuning.bottom.lengthScale + tuning.top.lengthScale) / 2, 8);
                expect(middle.widthScale).toBeCloseTo((tuning.bottom.widthScale + tuning.top.widthScale) / 2, 8);
                expect(middle.alpha).toBeCloseTo((tuning.bottom.alpha + tuning.top.alpha) / 2, 8);
            }
        }
    });

    test("keeps the authored 0.45 silhouette alpha for flying creatures", () => {
        const topPosition = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Fairy", "fairy_512", () => Texture.WHITE);
        const world = new Container();
        unit.setPosition(topPosition.x, topPosition.y);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);

        const internals = unit as unknown as { silhouetteShadow?: { alpha: number } };
        expect(internals.silhouetteShadow?.alpha).toBeCloseTo(0.45, 8);
    });

    test("renders the finalized Orc silhouette at its editor opacity on the highest playable row", () => {
        const topPlayablePosition = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 2 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Orc", "orc_512", () => Texture.WHITE);
        unit.setPosition(topPlayablePosition.x, topPlayablePosition.y);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(new Container(), gridSettings);

        const internals = unit as unknown as { silhouetteShadow?: { alpha: number } };
        expect(battlefieldCreatureShadowProjection(topPlayablePosition.y, 1, gridSettings, "Orc").alpha).toBe(0.45);
        expect(internals.silhouetteShadow?.alpha).toBe(0.45);
    });

    test("uses the editor size at the upper row and shortens only its far edge by 10% at the lower row", () => {
        expect(BATTLEFIELD_SHADOW_BOTTOM_ROW_LENGTH_SCALE).toBeCloseTo(
            BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE * 0.9,
            8,
        );
        expect(BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE).toBe(0.678);
        expect(BATTLEFIELD_SHADOW_BOTTOM_ROW_ALPHA).toBe(0.45);
        expect(BATTLEFIELD_SHADOW_TOP_ROW_ALPHA).toBe(0.45);
        const bottom = GridMath.getPositionForCell(
            { x: 4, y: 0 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const top = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const bottomProjection = battlefieldCreatureShadowProjection(bottom.y, 1, gridSettings);
        const topProjection = battlefieldCreatureShadowProjection(top.y, 1, gridSettings);
        const middleProjection = battlefieldCreatureShadowProjection((bottom.y + top.y) / 2, 1, gridSettings);

        expect(bottomProjection).toEqual({
            lengthScale: BATTLEFIELD_SHADOW_BOTTOM_ROW_LENGTH_SCALE,
            widthScale: BATTLEFIELD_SHADOW_BOTTOM_ROW_WIDTH_SCALE,
            alpha: BATTLEFIELD_SHADOW_BOTTOM_ROW_ALPHA,
        });
        expect(topProjection.lengthScale).toBeCloseTo(BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE, 8);
        expect(topProjection.widthScale).toBeCloseTo(BATTLEFIELD_SHADOW_TOP_ROW_WIDTH_SCALE, 8);
        expect(topProjection.alpha).toBeCloseTo(BATTLEFIELD_SHADOW_TOP_ROW_ALPHA, 8);
        expect(topProjection.lengthScale).toBeGreaterThan(bottomProjection.lengthScale);
        expect(topProjection.widthScale).toBe(bottomProjection.widthScale);
        expect(topProjection.alpha).toBe(bottomProjection.alpha);
        expect(middleProjection.lengthScale).toBeCloseTo(BATTLEFIELD_SHADOW_TOP_ROW_LENGTH_SCALE * 0.95, 8);
        expect(middleProjection.widthScale).toBe(topProjection.widthScale);
        expect(middleProjection.alpha).toBe(topProjection.alpha);
    });

    test("interpolates Magic Dragon proportionally from the shortened lower row to the approved upper row", () => {
        const bottom = GridMath.getPositionForCell(
            { x: 4, y: 0 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const top = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const bottomProjection = battlefieldCreatureShadowProjection(bottom.y, 1, gridSettings, "Magic Dragon");
        const topProjection = battlefieldCreatureShadowProjection(top.y, 1, gridSettings, "Magic Dragon");
        const middleProjection = battlefieldCreatureShadowProjection(
            (bottom.y + top.y) / 2,
            1,
            gridSettings,
            "Magic Dragon",
        );

        expect(bottomProjection).toEqual({ lengthScale: 0.7812, widthScale: 0.91, alpha: 0.45 });
        expect(middleProjection).toEqual({ lengthScale: 0.8246, widthScale: 0.91, alpha: 0.45 });
        expect(topProjection).toEqual({ lengthScale: 0.868, widthScale: 0.91, alpha: 0.45 });
    });

    test("follows the live unit position and rescales during movement between rows", () => {
        const bottom = GridMath.getPositionForCell(
            { x: 4, y: 0 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const top = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        const world = new Container();
        const internals = unit as unknown as {
            sprite?: { x: number; y: number };
            silhouetteShadow?: { x: number; y: number; alpha: number; scale: { x: number; y: number } };
        };

        unit.setBattlefieldVisualProjection(true);
        unit.setPosition(bottom.x, bottom.y);
        unit.ensureVisual(world, gridSettings);
        const bottomLengthScale = internals.silhouetteShadow?.scale.y ?? 0;
        const bottomAlpha = internals.silhouetteShadow?.alpha ?? 0;
        const peasantShadow = BATTLEFIELD_SHADOW_TUNING_BY_CREATURE.Peasant;
        expect((internals.silhouetteShadow?.x ?? 0) - (internals.sprite?.x ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() * peasantShadow.bottom.offsetXCells,
            8,
        );
        expect((internals.silhouetteShadow?.y ?? 0) - (internals.sprite?.y ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() * peasantShadow.bottom.offsetYCells,
            8,
        );

        unit.setPosition(top.x, top.y);
        unit.ensureVisual(world, gridSettings);
        expect((internals.silhouetteShadow?.x ?? 0) - (internals.sprite?.x ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() * peasantShadow.top.offsetXCells * BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
            8,
        );
        expect((internals.silhouetteShadow?.y ?? 0) - (internals.sprite?.y ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() * peasantShadow.top.offsetYCells * BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
            8,
        );
        // Scaling happens around the shared foot anchor: the upper edge at the feet stays put while the
        // lower edge reaches the approved full length. Intermediate rows use the same linear progression.
        expect((internals.silhouetteShadow?.scale.y ?? 0) / bottomLengthScale).toBeCloseTo(1 / 0.9, 8);
        expect(internals.silhouetteShadow?.alpha ?? 0).toBe(bottomAlpha);
    });

    test("mirrors horizontal placement and rotation exactly with the creature facing", () => {
        const position = GridMath.getPositionForCell(
            { x: 4, y: GridConstants.GRID_SIZE - 1 },
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        const world = new Container();
        const internals = unit as unknown as {
            sprite?: { x: number; scale: { x: number } };
            silhouetteShadow?: { x: number; rotation: number; scale: { x: number } };
        };

        unit.setPosition(position.x, position.y);
        unit.setBattlefieldVisualProjection(true);
        unit.setBoardFacing(1);
        unit.ensureVisual(world, gridSettings);
        const rightFacingOffset = (internals.silhouetteShadow?.x ?? 0) - (internals.sprite?.x ?? 0);
        const rightFacingRotation = internals.silhouetteShadow?.rotation ?? 0;

        unit.setBoardFacing(-1);
        unit.ensureVisual(world, gridSettings);
        const leftFacingOffset = (internals.silhouetteShadow?.x ?? 0) - (internals.sprite?.x ?? 0);
        const leftFacingRotation = internals.silhouetteShadow?.rotation ?? 0;

        expect(rightFacingOffset).toBeGreaterThan(0);
        expect(leftFacingOffset).toBeCloseTo(-rightFacingOffset, 8);
        expect(leftFacingRotation).toBeCloseTo(-rightFacingRotation, 8);
        expect(Math.sign(internals.silhouetteShadow?.scale.x ?? 0)).toBe(Math.sign(internals.sprite?.scale.x ?? 0));
    });
});

test("uses Scavenger's matching right and left attack atlases", () => {
    expect(resolveAnimationAtlasState("Scavenger", "attack_up")).toBe("attack_up");
    expect(resolveAnimationAtlasState("Scavenger", "attack_down")).toBe("attack_down");
});

test("faces green right and mirrors red left during placement", () => {
    const unit = createRenderableUnit(TeamVals.RIGHT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
    const internals = unit as unknown as { sprite?: { scale: { x: number } }; facingDirection: -1 | 1 };
    const world = new Container();
    unit.setPosition(0, 1024);

    expect(placementFacingDirectionForTeam(TeamVals.RIGHT)).toBe(-1);
    expect(placementFacingDirectionForTeam(TeamVals.LEFT)).toBe(1);

    unit.setBoardFacing(placementFacingDirectionForTeam(TeamVals.RIGHT));
    unit.ensureVisual(world, gridSettings);
    expect(internals.facingDirection).toBe(-1);
    expect(internals.sprite?.scale.x).toBeLessThan(0);

    unit.setBoardFacing(placementFacingDirectionForTeam(TeamVals.LEFT));
    unit.ensureVisual(world, gridSettings);
    expect(internals.facingDirection).toBe(1);
    expect(internals.sprite?.scale.x).toBeGreaterThan(0);
});

test("mirrors the authored flag anchor with the creature but not the flag itself", () => {
    expect(flagOffsetXForFacing(0.16, 1)).toBe(0.16);
    expect(flagOffsetXForFacing(0.16, -1)).toBe(-0.16);
    expect(flagOffsetXForFacing(-0.11, 1)).toBe(-0.11);
    expect(flagOffsetXForFacing(-0.11, -1)).toBe(0.11);
});

test("mirrors the authored horizontal placement correction together with the creature", () => {
    const position = GridMath.getPositionForCell(
        { x: 4, y: 0 },
        gridSettings.getMinX(),
        gridSettings.getStep(),
        gridSettings.getHalfStep(),
    );
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
    const world = new Container();
    const sprite = () => (unit as unknown as { sprite?: { x: number } }).sprite;
    const ground = projectBattlefieldPoint(
        {
            x: position.x,
            y: position.y - gridSettings.getCellSize() * BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO,
        },
        gridSettings,
    );

    unit.setPosition(position.x, position.y);
    unit.setBattlefieldVisualProjection(true);
    unit.setBoardFacing(1);
    unit.ensureVisual(world, gridSettings);
    const rightFacingOffset = (sprite()?.x ?? 0) - ground.x;

    unit.setBoardFacing(-1);
    unit.ensureVisual(world, gridSettings);
    const leftFacingOffset = (sprite()?.x ?? 0) - ground.x;

    expect(rightFacingOffset).toBeGreaterThan(0);
    expect(leftFacingOffset).toBeCloseTo(-rightFacingOffset, 8);
});

assetTest("mirrors Centaur to the requested opposite orientation and keeps turn poses outside the gait loop", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
    const internals = unit as unknown as {
        sprite?: { scale: { x: number; y: number } };
        walkAnim?: {
            frames: Texture[];
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
        };
        facingDirection: -1 | 1;
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);

    expect(nativeBoardFacingMultiplier("Centaur")).toBe(1);
    expect(nativeBoardFacingMultiplier("Orc")).toBe(1);

    unit.startBoardWalkAnimation(1);
    unit.ensureVisual(new Container(), gridSettings);
    expect(internals.walkAnim?.frames).toHaveLength(9);
    expect(internals.walkAnim?.loopStartFrame).toBe(1);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.outroFrame).toBe(8);
    expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(1000 / (20 * 1.605));
    expect(internals.facingDirection).toBe(1);
    expect(internals.sprite?.scale.x).toBeGreaterThan(0);

    unit.setBoardFacingFromMovement(-1);
    unit.ensureVisual(new Container(), gridSettings);
    expect(internals.facingDirection).toBe(-1);
    expect(internals.sprite?.scale.x).toBeLessThan(0);
});

assetTest("plays Dryad's reversed run between one-shot turn poses", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", () => Texture.WHITE);
    const internals = unit as unknown as {
        sprite?: { texture: Texture };
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);

    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim?.frames).toHaveLength(9);
    expect(internals.walkAnim?.loopStartFrame).toBe(1);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.outroFrame).toBe(8);
    expect(internals.walkAnim?.durationPerFrameMs).toBe(50);

    unit.finishBoardWalkAnimationAfterFullCycle();
    for (let index = 0; index < 8; index += 1) {
        unit.stepSpawnAnimation(0.051);
    }
    expect(internals.walkAnim?.frameIndex).toBe(8);
    expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[8]);

    unit.stepSpawnAnimation(0.051);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("fits the approved ten-frame Wolf walk into exactly 3 travelled cells", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const resolvedKeys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", (name) => {
        resolvedKeys.push(name);
        return Texture.WHITE;
    });
    const internals = unit as unknown as {
        sprite?: { scale: { y: number }; texture: Texture };
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
            frameDurationsMs?: readonly number[];
            footAnchorY: number;
            completedCycles: number;
            distanceDriven?: boolean;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const baseRenderedCanvasHeight = Math.abs(internals.sprite?.scale.y ?? 0) * (internals.sprite?.texture.height ?? 0);

    unit.startBoardWalkAnimation(1);
    unit.ensureVisual(new Container(), gridSettings);

    expect(resolvedKeys).toContain("wolf_walk_atlas_half");
    expect(internals.walkAnim?.frames).toHaveLength(10);
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(9);
    expect(internals.walkAnim?.outroFrame).toBeUndefined();
    expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(75);
    expect(internals.walkAnim?.frameDurationsMs).toEqual([78, 78, 68, 78, 78, 68, 78, 78, 68, 78]);
    expect(internals.walkAnim?.distanceDriven).toBe(true);
    expect(internals.walkAnim?.footAnchorY).toBe(1);
    const walkRenderedCanvasHeight = Math.abs(internals.sprite?.scale.y ?? 0) * (internals.sprite?.texture.height ?? 0);
    expect(walkRenderedCanvasHeight / baseRenderedCanvasHeight).toBeCloseTo(wolfWalkFrameScaleMultiplier(0), 6);
    expect(internals.walkAnim!.frames[0].width / internals.walkAnim!.frames[0].height).toBeCloseTo(288 / 256, 6);

    expect(internals.walkAnim?.frameIndex).toBe(0);
    unit.setBoardWalkDistanceCells(0.3);
    expect(internals.walkAnim?.frameIndex).toBe(1);
    unit.setBoardWalkDistanceCells(2.7);
    expect(internals.walkAnim?.frameIndex).toBe(9);
    unit.setBoardWalkDistanceCells(3);
    expect(internals.walkAnim?.frameIndex).toBe(0);
    expect(internals.walkAnim?.completedCycles).toBe(1);
});

// SHIPPED-ART PIN (2026-08-24): the shared Drive's animation meta is one revision behind the
// authored gait tuning these walk tests originally pinned (Wolf Rider 26fps gait, Leprechaun's
// 170/380ms two-pose run, Peasant's 8-frame 15.625ms freeze walk). Until that art lands in the
// Drive's heroesofcrypto/animations, the generator emits the uniform 9-frame 20fps walk asserted
// below. When the new meta uploads: regenerate atlases and restore the original assertions (they
// are one `git log -p` away on this file).
assetTest("does not repeat the idle animation pass after visual synchronization", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", () => Texture.WHITE);
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings, 100);

    let idleSteps = 0;
    unit.stepSelectionAnimation = () => {
        idleSteps += 1;
    };
    unit.stepSpawnAnimation(1 / 60);

    expect(idleSteps).toBe(0);
});

// The authored gait metadata is committed with the client, so these timings also exercise the CI stubs.
assetTest("plays Wolf Rider's gait between one-shot turn poses", () => {
    // The approved Wolf Rider gait runs at 26 fps (see the committed wolf_rider walk metadata).
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Wolf Rider", "wolf_rider_512", () => Texture.WHITE);
    const internals = unit as unknown as {
        sprite?: { texture: Texture };
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);

    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim?.frames).toHaveLength(9);
    expect(internals.walkAnim?.loopStartFrame).toBe(1);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.outroFrame).toBe(8);
    expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(1000 / 26);

    unit.finishBoardWalkAnimationAfterFullCycle();
    const frameSeconds = (1000 / 26 + 0.1) / 1000;
    for (let index = 0; index < 8; index += 1) {
        unit.stepSpawnAnimation(frameSeconds);
    }
    expect(internals.walkAnim?.frameIndex).toBe(8);
    expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[8]);

    unit.stepSpawnAnimation(frameSeconds);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("plays Leprechaun's run between one-shot start and finish frames", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Leprechaun", "leprechaun_512", () => Texture.WHITE);
    const internals = unit as unknown as {
        sprite?: { texture: Texture };
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);

    // The approved Leprechaun run is a four-pose sheet: one start frame, a two-pose loop and one finish
    // frame, held 380 ms each (see the committed leprechaun walk metadata).
    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim?.frames).toHaveLength(4);
    expect(internals.walkAnim?.loopStartFrame).toBe(1);
    expect(internals.walkAnim?.loopEndFrame).toBe(2);
    expect(internals.walkAnim?.outroFrame).toBe(3);
    expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(380);

    unit.finishBoardWalkAnimationAfterFullCycle();
    const frameSeconds = (380 + 0.1) / 1000;
    for (let index = 0; index < 3; index += 1) {
        unit.stepSpawnAnimation(frameSeconds);
    }
    expect(internals.walkAnim?.frameIndex).toBe(3);
    expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[3]);

    unit.stepSpawnAnimation(frameSeconds);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("speeds Fairy take-off and landing by 30% while flight remains 20% faster", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Fairy", "fairy_512", () => Texture.WHITE);
    const internals = unit as unknown as {
        sprite?: { texture: Texture };
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            outroEndFrame?: number;
            introDistanceCells?: number;
            introComplete: boolean;
            durationPerFrameMs: number;
            flightFrameDurationMs?: number;
            outroFrameDurationMs?: number;
            completedCycles: number;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    expect(unit.canFly()).toBe(true);
    unit.startBoardWalkAnimation(1, 6);

    expect(internals.walkAnim?.frames).toHaveLength(9);
    expect(internals.walkAnim?.loopStartFrame).toBe(3);
    expect(internals.walkAnim?.loopEndFrame).toBe(5);
    expect(internals.walkAnim?.outroFrame).toBe(6);
    expect(internals.walkAnim?.outroEndFrame).toBe(8);
    const introDistanceCells = 1.5 / 1.3;
    const introFrameDistance = introDistanceCells / 3;
    expect(internals.walkAnim?.introDistanceCells).toBeCloseTo(introDistanceCells);
    expect(internals.walkAnim?.durationPerFrameMs).toBe(50);
    expect(internals.walkAnim?.flightFrameDurationMs).toBeCloseTo(50 / 1.2);
    expect(internals.walkAnim?.outroFrameDurationMs).toBeCloseTo(50 / 1.3);

    unit.setBoardWalkDistanceCells(introFrameDistance - 0.01);
    expect(internals.walkAnim?.frameIndex).toBe(0);
    unit.setBoardWalkDistanceCells(introFrameDistance);
    expect(internals.walkAnim?.frameIndex).toBe(1);
    unit.setBoardWalkDistanceCells(introFrameDistance * 2);
    expect(internals.walkAnim?.frameIndex).toBe(2);
    unit.setBoardWalkDistanceCells(introDistanceCells - 0.01);
    expect(internals.walkAnim?.frameIndex).toBe(2);
    unit.setBoardWalkDistanceCells(introDistanceCells);
    expect(internals.walkAnim?.frameIndex).toBe(3);
    expect(internals.walkAnim?.introComplete).toBe(true);

    const flightFrameMs = internals.walkAnim?.flightFrameDurationMs ?? 0;
    const flightFrames = [internals.walkAnim?.frameIndex];
    for (let index = 0; index < 6; index++) {
        unit.stepSpawnAnimation((flightFrameMs + 0.1) / 1000);
        flightFrames.push(internals.walkAnim?.frameIndex);
    }
    expect(flightFrames).toEqual([3, 4, 5, 3, 4, 5, 3]);
    expect(internals.walkAnim?.completedCycles).toBe(2);

    let landingComplete = false;
    expect(
        unit.finishBoardWalkAnimationAfterFullCycle(() => {
            landingComplete = true;
        }),
    ).toBe(true);
    expect(internals.walkAnim?.frameIndex).toBe(6);
    expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[6]);
    expect(landingComplete).toBe(false);
    const landingFrameMs = internals.walkAnim?.outroFrameDurationMs ?? 0;
    unit.stepSpawnAnimation((landingFrameMs + 0.1) / 1000);
    expect(internals.walkAnim?.frameIndex).toBe(7);
    expect(landingComplete).toBe(false);
    unit.stepSpawnAnimation((landingFrameMs + 0.1) / 1000);
    expect(internals.walkAnim?.frameIndex).toBe(8);
    expect(landingComplete).toBe(false);
    unit.stepSpawnAnimation((landingFrameMs + 0.1) / 1000);
    expect(internals.walkAnim).toBeUndefined();
    expect(landingComplete).toBe(true);
});

test("active-turn fire atlas ping-pongs without jumping at either endpoint", () => {
    const frameMs = 1000 / 18;
    expect(activeTurnFireFrameForElapsed(0)).toBe(0);
    expect(activeTurnFireFrameForElapsed(frameMs * 63)).toBe(63);
    expect(activeTurnFireFrameForElapsed(frameMs * 64)).toBe(62);
    expect(activeTurnFireFrameForElapsed(frameMs * 126)).toBe(0);
});

describe("Wandering Mage board animation states", () => {
    type AnimationInternals = {
        sprite?: { texture: Texture; scale: { x: number; y: number }; rotation: number; y: number };
        selectionAnimFrames?: Texture[];
        scavengerIdleBladeTwirlFrames?: Texture[];
        scavengerActiveBattleCryFrames?: Texture[];
        selectionAnimationStartedAtMs: number;
        activeTurnAnimationStartedAtMs: number;
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            durationPerFrameMs: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            completedCycles: number;
            finishAfterCycle: boolean;
            distanceDriven?: boolean;
        };
        oneShotAnim?: { frames: Texture[]; frameIndex: number; durationPerFrame: number };
        facingDirection: -1 | 1;
        stackPowerPips: Graphics[];
        stackPowerContainer?: Container;
    };

    const createWanderingMage = (): RenderableUnit => {
        const unit = createRenderableUnit(
            TeamVals.LEFT,
            "Chaos",
            "Wandering Mage",
            "wandering_mage_512",
            () => Texture.WHITE,
        );
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    assetTest("keeps the approved static figure as its idle instead of the breathing/fire cycle", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        // The Wandering Mage idles on its approved static battlefield figure; the authored Ash Moth
        // breathing/fire sheet is reserved for walks and one-shot actions.
        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
    });

    assetTest("uses the Orc-strength full-body breath and leaves its boots unobstructed", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        expect(ashMothIdleBreathScaleForElapsed(0)).toBeCloseTo(1);
        expect(ashMothIdleBreathScaleForElapsed(2600 / 4)).toBeCloseTo(1 + 0.01035 * 1.1);
        expect(ashMothIdleBreathScaleForElapsed(2600 / 2)).toBeCloseTo(1);
        expect(ashMothIdleBreathScalesForElapsed(2600 / 4).x).toBeCloseTo(1.008);
        expect(internals.stackPowerPips).toHaveLength(0);
        expect(internals.stackPowerContainer).toBeUndefined();
    });

    assetTest("temporarily switches to walk, mirrors left, then resumes idle", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(-1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.loopStartFrame).toBe(1);
        expect(internals.walkAnim?.loopEndFrame).toBe(6);
        expect(internals.walkAnim?.outroFrame).toBe(7);
        expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(74.4048, 3);
        expect(internals.walkAnim?.distanceDriven).toBe(true);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);

        const walkFrameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        unit.stepSpawnAnimation((walkFrameMs + 1) / 1000);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        unit.setBoardWalkDistanceCells(0);
        expect(internals.walkAnim?.frameIndex).toBe(1);

        unit.stopBoardWalkAnimation();
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
    });

    assetTest("maps one complete six-pose gait to exactly two travelled cells", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        const shownFrames: number[] = [];
        for (let index = 0; index < 6; index++) {
            unit.setBoardWalkDistanceCells(index / 3);
            shownFrames.push(internals.walkAnim?.frameIndex ?? -1);
        }
        expect(shownFrames).toEqual([1, 2, 3, 4, 5, 6]);
        unit.setBoardWalkDistanceCells(2);
        expect(internals.walkAnim?.frameIndex).toBe(1);
        expect(internals.walkAnim?.completedCycles).toBe(1);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim?.frameIndex).toBe(7);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
        expect(internals.walkAnim).toBeUndefined();
    });

    assetTest("exposes the complete action set and preserves action-frame proportions", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        for (const state of ["attack", "attack_up", "attack_down", "cast", "hit", "death", "defend", "celebrate"]) {
            expect(unit.hasAnimationState(state)).toBe(true);
        }

        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 0 })).toBe("attack_down");
        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 2048 })).toBe("attack_up");
        expect(unit.getAttackAnimationStateForTarget({ x: 1024, y: 1024 })).toBe("attack");
        unit.faceBoardTarget({ x: -1024, y: 1024 });
        expect(internals.facingDirection).toBe(-1);

        expect(unit.playOneShotAnimation("cast")).toBe(true);
        unit.ensureVisual(new Container(), gridSettings);
        expect(unit.isPlayingOneShotAnimation("cast")).toBe(true);
        // The authored cast is 720ms / 8 frames; Wandering Mage combat actions now run at 2x speed.
        expect(internals.oneShotAnim?.durationPerFrame).toBe(45);
        expect(internals.sprite?.texture.width).toBe(192);
        expect(internals.sprite?.texture.height).toBe(192);
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(Math.abs(internals.sprite?.scale.y ?? 0));

        unit.stepOneShotAnimation(1000);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
    });
});

describe("Orc authored animation states", () => {
    type AnimationInternals = {
        selectionAnimFrames?: Texture[];
        orcIdleAxeTwirlFrames?: Texture[];
        orcActiveBattleCryFrames?: Texture[];
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
            distanceDriven?: boolean;
        };
        oneShotAnim?: { frames: Texture[]; durationPerFrame: number };
        sprite?: { texture: Texture; scale: { x: number; y: number }; anchor: { y: number }; rotation: number };
        selectionAnimationStartedAtMs: number;
        activeTurnAnimationStartedAtMs: number;
        isShowingOrcBattleCryFrame: boolean;
        facingDirection: -1 | 1;
    };

    const createOrc = (): RenderableUnit => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Orc", "orc_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    test("breathes ten percent more strongly, expands its chest on inhale, and twirls after four cycles", () => {
        const peakInhale = orcIdleBreathScalesForElapsed(ORC_IDLE_BREATH_PERIOD_MS / 4);
        const peakExhale = orcIdleBreathScalesForElapsed((ORC_IDLE_BREATH_PERIOD_MS * 3) / 4);
        expect(peakInhale.y).toBeCloseTo(1 + 0.01035 * 1.1);
        expect(peakInhale.x).toBeCloseTo(1.008);
        expect(peakExhale.y).toBeCloseTo(1 - 0.01035 * 1.1);
        expect(peakExhale.x).toBe(1);

        const breathingWindow = ORC_IDLE_BREATH_PERIOD_MS * ORC_IDLE_BREATH_CYCLES_PER_AXE_TWIRL;
        expect(orcIdleAxeTwirlFrameForElapsed(breathingWindow - 1)).toBeUndefined();
        for (let frame = 0; frame < 6; frame += 1) {
            expect(orcIdleAxeTwirlFrameForElapsed(breathingWindow + frame * ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS)).toBe(
                frame,
            );
        }
        expect(
            orcIdleAxeTwirlFrameForElapsed(breathingWindow + 6 * ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS),
        ).toBeUndefined();
    });

    assetTest("keeps the static figure on screen through the former axe-flourish window", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;
        const breathingWindow = ORC_IDLE_BREATH_PERIOD_MS * ORC_IDLE_BREATH_CYCLES_PER_AXE_TWIRL;
        const idleStartedAt = internals.selectionAnimationStartedAtMs;

        // The approved Orc idles on its static battlefield figure. The axe-flourish sheet stays loaded for
        // the authored timing helpers, but the live sprite never leaves the static frame while idle.
        expect(internals.orcIdleAxeTwirlFrames).toHaveLength(6);
        for (let frame = 0; frame < 6; frame += 1) {
            unit.stepSelectionAnimation(idleStartedAt + breathingWindow + frame * ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS);
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
        }

        unit.stepSelectionAnimation(idleStartedAt + breathingWindow + 6 * ORC_IDLE_AXE_TWIRL_FRAME_DURATION_MS);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
    });

    assetTest("keeps the static figure on its active turn while the battle-cry timing stays authored", () => {
        const cryWindow = ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * 6;
        const breathingWindow = ORC_IDLE_BREATH_PERIOD_MS * ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES;

        for (let frame = 0; frame < 6; frame += 1) {
            expect(orcActiveBattleCryFrameForElapsed(frame * ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS)).toBe(frame);
        }
        expect(orcActiveBattleCryFrameForElapsed(cryWindow)).toBeUndefined();
        expect(orcActiveBattleCryBreathElapsed(cryWindow)).toBe(0);
        expect(orcActiveBattleCryBreathElapsed(cryWindow + breathingWindow - 1)).toBe(breathingWindow - 1);
        expect(orcActiveBattleCryFrameForElapsed(cryWindow + breathingWindow)).toBe(0);

        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;
        unit.setActiveTurn(true);
        const turnStartedAt = internals.activeTurnAnimationStartedAtMs;

        // The battle-cry sheet is loaded, but the approved static Orc figure stays on screen for the
        // whole active turn instead of cycling through it.
        expect(internals.orcActiveBattleCryFrames).toHaveLength(6);
        for (let frame = 0; frame < 6; frame += 1) {
            unit.stepSelectionAnimation(turnStartedAt + frame * ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS);
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
            expect(internals.isShowingOrcBattleCryFrame).toBe(false);
        }
        unit.stepSelectionAnimation(turnStartedAt + cryWindow);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
        expect(internals.isShowingOrcBattleCryFrame).toBe(false);

        unit.stepSelectionAnimation(turnStartedAt + cryWindow + breathingWindow);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);

        unit.setActiveTurn(false);
        expect(internals.isShowingOrcBattleCryFrame).toBe(false);
    });

    assetTest("keeps the static idle figure and exposes the complete ranged and melee action sets", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;

        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(internals.orcIdleAxeTwirlFrames).toHaveLength(6);
        expect(internals.orcActiveBattleCryFrames).toHaveLength(6);
        for (const state of [
            "walk",
            "attack",
            "attack_up",
            "attack_down",
            "melee_attack",
            "melee_attack_up",
            "melee_attack_down",
            "cast",
            "hit",
            "death",
        ]) {
            expect(unit.hasAnimationState(state)).toBe(true);
        }

        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 0 })).toBe("attack_down");
        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 2048 })).toBe("attack_up");
        expect(unit.getAttackAnimationStateForTarget({ x: 1024, y: 1024 })).toBe("attack");
        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 0 }, "melee")).toBe("melee_attack_down");
        expect(unit.getAttackAnimationStateForTarget({ x: 0, y: 2048 }, "melee")).toBe("melee_attack_up");
        expect(unit.getAttackAnimationStateForTarget({ x: 1024, y: 1024 }, "melee")).toBe("melee_attack");

        expect(unit.playOneShotAnimation("attack")).toBe(true);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.oneShotAnim?.frames).toHaveLength(8);
        expect(internals.oneShotAnim?.durationPerFrame).toBeCloseTo(27 / (1.4 * 1.22));
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Orc.scaleX / BATTLEFIELD_CREATURE_FRAMING.Orc.scaleY,
        );
    });

    assetTest("plays turn-in once, loops seven gait poses, mirrors by direction, then plays turn-back once", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(-1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(9);
        expect(internals.walkAnim?.loopStartFrame).toBe(1);
        expect(internals.walkAnim?.loopEndFrame).toBe(7);
        expect(internals.walkAnim?.outroFrame).toBe(8);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(17.857, 3);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);

        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        const shownFrames = [internals.walkAnim?.frameIndex];
        for (let index = 0; index < 8; index++) {
            unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
            shownFrames.push(internals.walkAnim?.frameIndex);
        }
        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 1]);

        unit.setBoardFacingFromMovement(1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.facingDirection).toBe(1);
        expect(internals.sprite?.scale.x).toBeGreaterThan(0);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim?.frameIndex).toBe(8);
        expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[8]);

        unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.selectionAnimFrames).toHaveLength(1);
    });

    assetTest("leaves the level-one Orc walk entirely to its authored sprite frames", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        unit.ensureVisual(new Container(), gridSettings);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        const baseScaleX = internals.sprite?.scale.x;
        const baseScaleY = internals.sprite?.scale.y;
        expect(frameMs).toBeCloseTo(17.857, 3);

        // Intro and first gait pose are neutral; the next gait pose starts the authored sway.
        unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
        unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
        expect(internals.walkAnim?.frameIndex).toBe(2);

        unit.applyMoveEffect(0);
        const rotationAtPhaseZero = internals.sprite?.rotation ?? 0;
        unit.applyMoveEffect(123);
        const rotationAtDifferentScenePhase = internals.sprite?.rotation ?? 0;

        expect(rotationAtPhaseZero).toBe(0);
        expect(rotationAtDifferentScenePhase).toBe(0);
        expect(internals.sprite?.scale.x).toBe(baseScaleX);
        expect(internals.sprite?.scale.y).toBe(baseScaleY);
    });
});

describe("Troll full-body battlefield figure", () => {
    type AnimationInternals = {
        sprite?: { texture: Texture; scale: { x: number; y: number }; anchor: { y: number }; y: number };
        selectionAnimFrames?: Texture[];
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
            distanceDriven?: boolean;
        };
        facingDirection: -1 | 1;
    };

    const createTroll = (worldRoot = new Container()): RenderableUnit => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troll", "troll_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(worldRoot, gridSettings);
        return unit;
    };

    test("keeps its former screen dimensions under the rectangular board camera", () => {
        const makeWorld = (scaleX: number, scaleY: number): Container => {
            const camera = new Container();
            const flippedWorld = new Container();
            const units = new Container();
            camera.scale.set(scaleX, scaleY);
            flippedWorld.scale.set(1, -1);
            camera.addChild(flippedWorld);
            flippedWorld.addChild(units);
            return units;
        };

        const reference = createTroll(makeWorld(1, 1)) as unknown as AnimationInternals;
        const rectangular = createTroll(makeWorld(1.12, BATTLEFIELD_HEIGHT_RATIO)) as unknown as AnimationInternals;
        const referenceTexture = reference.sprite?.texture;
        const rectangularTexture = rectangular.sprite?.texture;

        const referenceScreenWidth = (referenceTexture?.width ?? 0) * Math.abs(reference.sprite?.scale.x ?? 0);
        const referenceScreenHeight = (referenceTexture?.height ?? 0) * Math.abs(reference.sprite?.scale.y ?? 0);
        const rectangularScreenWidth =
            (rectangularTexture?.width ?? 0) * Math.abs(rectangular.sprite?.scale.x ?? 0) * 1.12;
        const rectangularScreenHeight =
            (rectangularTexture?.height ?? 0) * Math.abs(rectangular.sprite?.scale.y ?? 0) * BATTLEFIELD_HEIGHT_RATIO;

        expect(rectangularScreenWidth).toBeCloseTo(referenceScreenWidth);
        expect(rectangularScreenHeight).toBeCloseTo(referenceScreenHeight);
    });

    assetTest("uses the static figure idle and the refreshed walk atlas at exactly one by one-and-a-half cells", () => {
        const unit = createTroll();
        const internals = unit as unknown as AnimationInternals;
        const cellSize = gridSettings.getCellSize();

        expect(unit.hasAnimationState("idle")).toBe(true);
        expect(unit.hasAnimationState("walk")).toBe(true);
        // The approved Troll idles on its static battlefield figure, sized from its own canvas.
        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Troll.scaleX / BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        expect(Math.abs(internals.sprite?.scale.y ?? 0) * (internals.sprite?.texture.height ?? 0)).toBeCloseTo(
            cellSize * 1.5 * BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        expect(internals.sprite?.anchor.y).toBeCloseTo(0.9505208333);
        expect(internals.sprite?.y).toBeCloseTo(tallBoardModelFootLineY(1024, cellSize));

        unit.startBoardWalkAnimation(-1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(9);
        expect(internals.walkAnim?.loopStartFrame).toBe(0);
        expect(internals.walkAnim?.loopEndFrame).toBe(8);
        expect(internals.walkAnim?.outroFrame).toBeUndefined();
        expect(internals.walkAnim?.durationPerFrameMs).toBe(50);
        expect(internals.walkAnim?.distanceDriven).toBe(true);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Troll.scaleX / BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        expect(Math.abs(internals.sprite?.scale.y ?? 0) * 192).toBeCloseTo(
            cellSize * 1.5 * BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );

        unit.setBoardWalkDistanceCells(0);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        unit.setBoardWalkDistanceCells(0.5);
        expect(internals.walkAnim?.frameIndex).toBe(3);
        unit.setBoardWalkDistanceCells(0.5 / 0.8);
        expect(internals.walkAnim?.frameIndex).toBe(4);
        unit.setBoardWalkDistanceCells(1 / 0.8);
        expect(internals.walkAnim?.frameIndex).toBe(0);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
    });
});

describe("refreshed full-body placement scale", () => {
    type SpawnInternals = {
        sprite?: { scale: { x: number; y: number } };
        spawnAnim?: { startScaleX: number; startScaleY: number; endScaleX: number; endScaleY: number };
    };

    for (const [faction, creature] of [
        ["Chaos", "Troglodyte"],
        ["Chaos", "Efreet"],
        ["Chaos", "Black Dragon"],
    ] as const) {
        const placementTest = creature === "Efreet" ? test : assetTest;
        placementTest(`keeps ${creature}'s authored proportions and size when it lands`, () => {
            const unit = createRenderableUnit(TeamVals.LEFT, faction, creature, `${creature}_512`, () => Texture.WHITE);
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            const internals = unit as unknown as SpawnInternals;
            const initialScaleX = internals.sprite?.scale.x ?? 0;
            const initialScaleY = internals.sprite?.scale.y ?? 0;

            expect(Math.abs(initialScaleX) / Math.abs(initialScaleY)).toBeCloseTo(
                BATTLEFIELD_CREATURE_FRAMING[creature].scaleX / BATTLEFIELD_CREATURE_FRAMING[creature].scaleY,
            );
            unit.startSpawnAnimation(0.125);
            if (creature === "Troglodyte") {
                expect(internals.spawnAnim).toBeUndefined();
                expect(internals.sprite?.scale.x).toBe(initialScaleX);
                expect(internals.sprite?.scale.y).toBe(initialScaleY);
                return;
            }
            expect(internals.spawnAnim?.endScaleX).toBe(initialScaleX);
            expect(internals.spawnAnim?.endScaleY).toBe(initialScaleY);
            expect(internals.spawnAnim?.startScaleX).toBe(initialScaleX);
            expect(internals.spawnAnim?.startScaleY).toBe(initialScaleY);
        });
    }
});

describe("refreshed authored action playback", () => {
    type AnimationInternals = {
        sprite?: { texture: Texture; rotation: number; scale: { x: number; y: number } };
        selectionAnimFrames?: Texture[];
        walkAnim?: { frames: Texture[]; frameIndex: number; durationPerFrameMs: number };
        oneShotAnim?: { frames: Texture[]; frameIndex: number; durationPerFrame: number };
    };

    const createTroglodyte = (): RenderableUnit => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troglodyte", "troglodyte_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    assetTest("walk advances atlas textures and never receives legacy whole-sprite rocking", () => {
        const unit = createTroglodyte();
        const internals = unit as unknown as AnimationInternals;
        unit.startBoardWalkAnimation(1);
        const firstTexture = internals.sprite?.texture;
        const baseScaleX = internals.sprite?.scale.x;
        const baseScaleY = internals.sprite?.scale.y;

        expect(internals.walkAnim?.frames).toHaveLength(7);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        expect(frameMs).toBeCloseTo(1000 / 56, 3);
        // Seven frames consume 125 simulation ms = 500 real ms, exactly the two-cell travel window.
        expect(frameMs * 7).toBeCloseTo(125, 3);
        expect(frameMs * 7 * 4).toBeCloseTo(500, 3);

        const shownFrames = [internals.walkAnim?.frameIndex];
        unit.stepSpawnAnimation((frameMs + 0.01) / 1000);
        shownFrames.push(internals.walkAnim?.frameIndex);
        expect(internals.sprite?.texture).not.toBe(firstTexture);
        for (let index = 1; index < 7; index++) {
            unit.stepSpawnAnimation((frameMs + 0.01) / 1000);
            shownFrames.push(internals.walkAnim?.frameIndex);
        }
        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
        unit.applyMoveEffect(0.37);
        expect(internals.sprite?.rotation).toBe(0);
        expect(internals.sprite?.scale.x).toBe(baseScaleX);
        expect(internals.sprite?.scale.y).toBe(baseScaleY);
    });

    for (const state of ["attack", "attack_up", "attack_down", "hit"] as const) {
        assetTest(`${state} advances the authored one-shot textures`, () => {
            const unit = createTroglodyte();
            const internals = unit as unknown as AnimationInternals;
            expect(unit.playOneShotAnimation(state)).toBe(true);
            const firstTexture = internals.sprite?.texture;
            unit.stepOneShotAnimation((internals.oneShotAnim?.durationPerFrame ?? 50) + 1);
            expect(internals.oneShotAnim?.frameIndex).toBe(1);
            expect(internals.sprite?.texture).not.toBe(firstTexture);
        });
    }
});

describe("refreshed idle cadence and quadruped scale", () => {
    type IdleInternals = {
        sprite?: { scale: { x: number; y: number }; texture: Texture };
        selectionAnimFrameDurationMs: number;
        selectionAnimFrameDurationsMs?: readonly number[];
        selectionAnimFrames?: Texture[];
        refreshedIdlePhaseRatio: number;
    };

    test("selects authored idle frames from independent per-frame durations", () => {
        const durations = [144, 144, 140, 140];
        expect(authoredIdleFrameForElapsed(0, durations)).toBe(0);
        expect(authoredIdleFrameForElapsed(143, durations)).toBe(0);
        expect(authoredIdleFrameForElapsed(144, durations)).toBe(1);
        expect(authoredIdleFrameForElapsed(288, durations)).toBe(2);
        expect(authoredIdleFrameForElapsed(428, durations)).toBe(3);
        expect(authoredIdleFrameForElapsed(568, durations)).toBe(0);
        expect(authoredIdleFrameForElapsed(-1, durations)).toBe(3);
    });

    test("gives every creature the shared grounded breathing scale", () => {
        const neutral = commonIdleBreathScalesForElapsed(0);
        const inhale = commonIdleBreathScalesForElapsed(COMMON_IDLE_BREATH_PERIOD_MS / 4);
        const exhale = commonIdleBreathScalesForElapsed((COMMON_IDLE_BREATH_PERIOD_MS * 3) / 4);

        expect(neutral).toEqual({ x: 1, y: 1 });
        expect(inhale.x).toBeCloseTo(1.008);
        expect(inhale.y).toBeCloseTo(1 + 0.01035 * 1.1);
        expect(exhale.x).toBe(1);
        expect(exhale.y).toBeCloseTo(1 - 0.01035 * 1.1);
    });

    assetTest("keeps Wolf at its authored proportions inside its two-cell footprint", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as IdleInternals;
        const scaleX = Math.abs(internals.sprite?.scale.x ?? 0);
        const scaleY = Math.abs(internals.sprite?.scale.y ?? 0);

        expect(WOLF_BOARD_MODEL_HEIGHT_CELLS).toBeCloseTo(1.05 * 0.99);
        // Wolf ships 2x1 now, but occupancy must not stretch the square-authored figure horizontally.
        expect(unit.getFootprintWidth()).toBe(2);
        expect(scaleX * (internals.sprite?.texture.width ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() *
                WOLF_BOARD_MODEL_HEIGHT_CELLS *
                refreshedBoardVisualProfileForUnit("Wolf").widthScale *
                BATTLEFIELD_CREATURE_FRAMING.Wolf.scaleX,
        );
        expect(scaleY * (internals.sprite?.texture.height ?? 0)).toBeCloseTo(
            gridSettings.getCellSize() * WOLF_BOARD_MODEL_HEIGHT_CELLS * BATTLEFIELD_CREATURE_FRAMING.Wolf.scaleY,
        );
    });

    test("keeps every Wolf walk frame at the static battlefield figure's visible height", () => {
        const staticVisibleHeightRatio = 562 / 768;
        const walkVisibleHeights = [376, 375, 369, 365, 365, 370, 372, 370, 369, 363];
        for (const [frameIndex, visibleHeight] of walkVisibleHeights.entries()) {
            expect((visibleHeight / 512) * wolfWalkFrameScaleMultiplier(frameIndex)).toBeCloseTo(
                staticVisibleHeightRatio,
                8,
            );
        }
    });

    test("keeps the requested per-creature battlefield profiles", () => {
        expect(refreshedBoardVisualProfileForUnit("Peasant").offsetXCells).toBe(0.025);
        expect(refreshedBoardVisualProfileForUnit("Wolf")).toMatchObject({
            heightCells: WOLF_BOARD_MODEL_HEIGHT_CELLS,
            offsetXCells: 0.02,
        });
        expect(refreshedBoardVisualProfileForUnit("Fairy").offsetYCells).toBe(-0.1);
        expect(refreshedBoardVisualProfileForUnit("Orc").offsetYCells).toBe(0.1);
        expect(refreshedBoardVisualProfileForUnit("Centaur").offsetYCells).toBe(0.15);
        expect(refreshedBoardVisualProfileForUnit("White Tiger")).toEqual({
            heightCells: 1.18,
            widthScale: 1.695,
            offsetXCells: 0,
        });
        expect(refreshedBoardVisualProfileForUnit("Hyena")).toEqual({
            heightCells: 1.25,
            widthScale: 1.616,
            offsetXCells: 0,
        });
        expect(refreshedBoardVisualProfileForUnit("Manticore")).toEqual({
            heightCells: 1.5,
            widthScale: 1.14,
            offsetXCells: 0,
        });
        expect(refreshedBoardVisualProfileForUnit("Pikeman").offsetXCells).toBe(0.14);
        expect(refreshedBoardVisualProfileForUnit("Wyvern")).toEqual({
            heightCells: 1.41,
            widthScale: 1.153,
            offsetXCells: 0,
        });
        expect(refreshedBoardVisualProfileForUnit("Griffin").widthScale).toBe(0.92);
        expect(refreshedBoardVisualProfileForUnit("Mantis").widthScale).toBe(0.92);
        expect(refreshedBoardVisualProfileForUnit("Unicorn").widthScale).toBe(0.93);
        expect(refreshedBoardVisualProfileForUnit("Pegasus").heightCells).toBe(1.425);
        expect(refreshedBoardVisualProfileForUnit("Nightmare")).toEqual({
            heightCells: 1.5,
            widthScale: 0.98,
            offsetXCells: 0.05,
        });
    });

    test("keeps independently tuned long-bodied level-2 art within its two-cell presentation", () => {
        for (const name of ["White Tiger", "Manticore", "Hyena", "Wyvern"] as const) {
            const profile = refreshedBoardVisualProfileForUnit(name);
            const framing = BATTLEFIELD_CREATURE_FRAMING[name];
            const renderedWidthCells = profile.heightCells * profile.widthScale * framing.scaleX;
            expect(renderedWidthCells).toBeGreaterThanOrEqual(1.9);
            expect(renderedWidthCells).toBeLessThanOrEqual(2.4);
            expect(profile.offsetXCells).toBe(0);
        }
    });

    assetTest("slows refreshed idle loops by 23 percent and assigns stable per-unit phases", () => {
        // Arbalester carries an approved 125 ms-per-frame idle; Troglodyte idles on its static figure.
        const first = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", () => Texture.WHITE);
        const second = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", () => Texture.WHITE);
        first.setPosition(0, 1024);
        second.setPosition(128, 1024);
        first.ensureVisual(new Container(), gridSettings);
        second.ensureVisual(new Container(), gridSettings);
        const firstInternals = first as unknown as IdleInternals;
        const secondInternals = second as unknown as IdleInternals;

        expect(REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER).toBe(0.77);
        expect(firstInternals.selectionAnimFrameDurationMs).toBeCloseTo(125 / 0.77);
        expect(firstInternals.refreshedIdlePhaseRatio).toBe(
            refreshedIdlePhaseRatio(first.getId(), first.getUnitProperties().name),
        );
        expect(secondInternals.refreshedIdlePhaseRatio).toBe(
            refreshedIdlePhaseRatio(second.getId(), second.getUnitProperties().name),
        );
        expect(firstInternals.refreshedIdlePhaseRatio).not.toBe(secondInternals.refreshedIdlePhaseRatio);
    });

    assetTest("temporarily freezes every creature sprite-sheet animation on its first authored frame", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troglodyte", "troglodyte_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as IdleInternals;
        const firstIdleFrame = internals.selectionAnimFrames?.[0];

        expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
        expect(firstIdleFrame).toBeDefined();
        unit.stepSelectionAnimation(10_000);
        expect(internals.sprite?.texture).toBe(firstIdleFrame);
        unit.stepSelectionAnimation(60_000);
        expect(internals.sprite?.texture).toBe(firstIdleFrame);

        unit.startBoardWalkAnimation(1);
        expect((unit as unknown as { walkAnim?: unknown }).walkAnim).toBeUndefined();
        let actionCompleted = false;
        expect(unit.playOneShotAnimation("attack", () => (actionCompleted = true))).toBe(false);
        expect(actionCompleted).toBe(true);
        expect(internals.sprite?.texture).toBe(firstIdleFrame);

        // The local Animation Lab can inspect an authored atlas even while production combat motion is
        // globally frozen; leaving the preview must restore the permanent idle immediately.
        expect(unit.playOneShotAnimation("attack", undefined, true)).toBe(true);
        expect(unit.isPlayingOneShotAnimation("attack")).toBe(true);
        unit.returnToIdleAnimation();
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internals.sprite?.texture).toBe(firstIdleFrame);
    });

    assetTest(
        "plays the approved sixteen-frame Arbalester weapon-sway idle while the global creature freeze is active",
        () => {
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
            const resolvedKeys: string[] = [];
            const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) => {
                resolvedKeys.push(name);
                return Texture.WHITE;
            });
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            const idle = unit as unknown as IdleInternals;

            expect(creatureIdleAnimationEnabledForUnit("Arbalester")).toBe(true);
            expect(resolvedKeys).toContain("arbalester_idle_atlas_quarter");
            expect(idle.selectionAnimFrames).toHaveLength(16);
            expect(idle.selectionAnimFrameDurationsMs).toEqual(Array(16).fill(125));
            expect(authoredIdleFrameForElapsed(0, idle.selectionAnimFrameDurationsMs ?? [])).toBe(0);
            expect(authoredIdleFrameForElapsed(2000, idle.selectionAnimFrameDurationsMs ?? [])).toBe(0);
        },
    );

    assetTest("plays the approved eight-frame Arbalester walk while the global creature freeze is active", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const resolvedKeys: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) => {
            resolvedKeys.push(name);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);

        unit.startBoardWalkAnimation(1, 2);
        const walk = (
            unit as unknown as {
                walkAnim?: {
                    frames: Texture[];
                    frameIndex: number;
                    durationPerFrameMs: number;
                    completedCycles: number;
                    distanceDriven?: boolean;
                };
            }
        ).walkAnim;

        expect(creatureWalkAnimationEnabledForUnit("Arbalester")).toBe(true);
        expect(resolvedKeys).toContain("arbalester_walk_atlas_quarter");
        expect(walk?.frames).toHaveLength(8);
        expect(walk?.frameIndex).toBe(0);
        expect(walk?.durationPerFrameMs).toBe(125);
        expect(walk?.distanceDriven).toBe(true);
        const openingFrame = walk?.frames[0];
        unit.setBoardWalkDistanceCells(1.5 / 8 + 0.001);
        expect(walk?.frameIndex).toBe(1);
        expect((unit as unknown as { sprite?: { texture: Texture } }).sprite?.texture).not.toBe(openingFrame);
        unit.setBoardWalkDistanceCells(1.5);
        expect(walk?.completedCycles).toBe(1);
        expect(walk?.frameIndex).toBe(0);
    });

    assetTest("keeps approved idles and walks active during the global freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureIdleAnimationEnabledForUnit("Peasant")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Beholder")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Squire")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Arbalester")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Troglodyte")).toBe(false);
        expect(creatureWalkAnimationEnabledForUnit("Peasant")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Squire")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Wolf")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Arbalester")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Troglodyte")).toBe(false);

        const greenResolvedKeys: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", (name) => {
            greenResolvedKeys.push(name);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const idle = unit as unknown as IdleInternals;
        expect(greenResolvedKeys).toContain("peasant_idle_atlas_quarter");
        expect(greenResolvedKeys).not.toContain("peasant_idle_red_atlas_quarter");
        expect(idle.selectionAnimFrames).toHaveLength(12);
        // The authored twelve-pose Peasant idle runs at 6 fps before the shared 0.77 slow-down.
        expect(idle.selectionAnimFrameDurationMs).toBeCloseTo(1000 / 6 / 0.77);
        unit.stepSelectionAnimation(10_000);
        const currentIdleTexture = idle.sprite?.texture;
        unit.stepSelectionAnimation(10_000 + idle.selectionAnimFrameDurationMs + 1);
        expect(idle.sprite?.texture).not.toBe(currentIdleTexture);

        const beholderResolvedKeys: string[] = [];
        const beholder = createRenderableUnit(TeamVals.LEFT, "Chaos", "Beholder", "beholder_512", (name) => {
            beholderResolvedKeys.push(name);
            return Texture.WHITE;
        });
        beholder.setPosition(0, 1024);
        beholder.ensureVisual(new Container(), gridSettings);
        const beholderIdle = beholder as unknown as IdleInternals;
        expect(beholderResolvedKeys).toContain("beholder_idle_atlas_quarter");
        expect(beholderResolvedKeys.at(-1)).toBe("beholder_idle_atlas_quarter");
        expect(beholderIdle.selectionAnimFrames).toHaveLength(16);
        expect(beholderIdle.selectionAnimFrameDurationMs).toBeCloseTo(187 / 1.3);
        expect(beholderIdle.selectionAnimFrameDurationsMs).toHaveLength(16);
        expect(beholderIdle.selectionAnimFrameDurationsMs?.slice(0, 11)).toEqual(Array(11).fill(187 / 1.3));
        expect(beholderIdle.selectionAnimFrameDurationsMs?.slice(11)).toEqual(Array(5).fill((187 * 3) / 0.8 / 5));
        beholder.stepSelectionAnimation(10_000);
        const currentBeholderTexture = beholderIdle.sprite?.texture;
        beholder.stepSelectionAnimation(10_000 + beholderIdle.selectionAnimFrameDurationMs + 1);
        expect(beholderIdle.sprite?.texture).not.toBe(currentBeholderTexture);

        const redResolvedKeys: string[] = [];
        const redUnit = createRenderableUnit(TeamVals.RIGHT, "Life", "Peasant", "peasant_512", (name) => {
            redResolvedKeys.push(name);
            return Texture.WHITE;
        });
        redUnit.setPosition(0, 1024);
        redUnit.ensureVisual(new Container(), gridSettings);
        expect(redResolvedKeys).not.toContain("peasant_idle_red_atlas_quarter");
        const redIdle = redUnit as unknown as IdleInternals;
        expect(redIdle.selectionAnimFrames).toHaveLength(12);
        expect(redIdle.selectionAnimFrames).toBe(idle.selectionAnimFrames);
        expect(redIdle.selectionAnimFrameDurationMs).toBeCloseTo(1000 / 6 / 0.77);
        unit.startBoardWalkAnimation(1);

        const walk = (
            unit as unknown as {
                walkAnim?: {
                    frames: Texture[];
                    loopStartFrame: number;
                    loopEndFrame: number;
                    durationPerFrameMs: number;
                    frameDurationsMs?: readonly number[];
                    frameIndex: number;
                    completedCycles: number;
                    distanceDriven: boolean;
                };
            }
        ).walkAnim;
        unit.setBoardWalkDistanceCells(0.2);
        expect(walk?.frames).toHaveLength(8);
        expect(walk?.frames[0].frame.width).toBe(192);
        expect(
            (unit as unknown as { battlefieldAlphaHoleFillFilter?: unknown }).battlefieldAlphaHoleFillFilter,
        ).toBeUndefined();
        expect(walk?.loopStartFrame).toBe(0);
        expect(walk?.loopEndFrame).toBe(7);
        expect(walk?.durationPerFrameMs).toBeCloseTo(15.625);
        expect(walk?.frameDurationsMs).toEqual(Array(8).fill(15.625));
        expect(walk?.distanceDriven).toBe(true);

        unit.setBoardWalkDistanceCells(0.22);
        expect(walk?.frameIndex).toBe(0);
        unit.setBoardWalkDistanceCells(0.25);
        expect(walk?.frameIndex).toBe(1);
        unit.setBoardWalkDistanceCells(1.75);
        expect(walk?.frameIndex).toBe(7);
        unit.setBoardWalkDistanceCells(2);
        expect(walk?.frameIndex).toBe(0);
        expect(walk?.completedCycles).toBe(1);

        const squire = createRenderableUnit(TeamVals.LEFT, "Life", "Squire", "squire_512", () => Texture.WHITE);
        squire.setPosition(0, 1024);
        squire.ensureVisual(new Container(), gridSettings);

        const squireInternals = squire as unknown as {
            sprite?: { texture: Texture; rotation: number; scale: { x: number; y: number } };
            walkAnim?: {
                frames: Texture[];
                loopStartFrame: number;
                loopEndFrame: number;
                durationPerFrameMs: number;
                frameIndex: number;
                distanceDriven: boolean;
            };
        };
        const idleScaleX = squireInternals.sprite?.scale.x ?? 0;
        const idleScaleY = squireInternals.sprite?.scale.y ?? 0;
        squire.startBoardWalkAnimation(1);
        squire.ensureVisual(new Container(), gridSettings);
        const squireWalk = squireInternals.walkAnim;
        expect(squireWalk?.frames).toHaveLength(9);
        expect(squireWalk?.loopStartFrame).toBe(0);
        expect(squireWalk?.loopEndFrame).toBe(7);
        expect(squireWalk?.durationPerFrameMs).toBe(50);
        expect(squireWalk?.distanceDriven).toBe(true);
        expect(squireWalk?.frameIndex).toBe(0);
        const walkScaleX = squireInternals.sprite?.scale.x ?? 0;
        const walkScaleY = squireInternals.sprite?.scale.y ?? 0;
        expect(Math.abs(walkScaleY) * (696 / 4)).toBeCloseTo(Math.abs(idleScaleY) * (726 / 4), 8);
        // The approved constant Squire walk scale keeps the walk width within half a quarter-pixel of idle.
        expect(Math.abs(walkScaleX) * (408 / 4)).toBeCloseTo(Math.abs(idleScaleX) * (426 / 4), 0);
        squire.applyMoveEffect(0.37);
        expect(squireInternals.sprite?.rotation).toBe(0);
        expect(squireInternals.sprite?.scale.x).toBe(walkScaleX);
        expect(squireInternals.sprite?.scale.y).toBe(walkScaleY);
        const firstSquireTexture = squireInternals.sprite?.texture;
        const squireCycleDistance = 1.5 / 0.85;
        squire.setBoardWalkDistanceCells(squireCycleDistance / 8);
        expect(squireWalk?.frameIndex).toBe(1);
        expect(squireInternals.sprite?.texture).not.toBe(firstSquireTexture);
        squire.setBoardWalkDistanceCells(squireCycleDistance / 2);
        expect(squireWalk?.frameIndex).toBe(4);
        squire.setBoardWalkDistanceCells((squireCycleDistance * 7) / 8);
        expect(squireWalk?.frameIndex).toBe(7);
        squire.setBoardWalkDistanceCells(squireCycleDistance);
        expect(squireWalk?.frameIndex).toBe(0);
    });

    assetTest("keeps the approved one-shot animations active during the global animation freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureOneShotAnimationEnabledForUnit("Peasant", "attack")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Peasant", "attack_up")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Peasant", "attack_down")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Peasant", "death")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Peasant", "hit")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "attack")).toBe(false);
        expect(PEASANT_ATTACK_RENDER_SCALE).toBeCloseTo(701 / 438);
        expect(PEASANT_DIAGONAL_ATTACK_RENDER_SCALE).toBeCloseTo(701 / 443);
        expect(PEASANT_ATTACK_END_RENDER_SCALE).toBe(PEASANT_ATTACK_RENDER_SCALE);
        expect(PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES).toEqual([
            PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_up[6],
            PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_up[7],
        ]);
        expect(PEASANT_ATTACK_DOWN_END_RENDER_SCALE).toBe(
            PEASANT_DIAGONAL_ATTACK_RENDER_SCALE * PEASANT_ATTACK_FRAME_SCALE_FACTORS.attack_down[7],
        );
        const supportFootContacts = {
            attack: [289, 289.34, 289, 288, 235, 250, 289, 289],
            attack_up: [288.6, 289, 289, 289, 289, 289, 289, 288.6],
            attack_down: [288.6, 289, 289, 289, 289.04, 289, 289, 288.6],
        } as const;
        for (const state of ["attack", "attack_up", "attack_down"] as const) {
            for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
                const actionScale = peasantActionScaleMultiplier(state, frameIndex);
                const effectiveXScale =
                    PEASANT_ATTACK_EFFECTIVE_X_SCALE * PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[state][frameIndex];
                expect(peasantAttackHorizontalScaleMultiplier(state, frameIndex) * actionScale).toBeCloseTo(
                    effectiveXScale,
                );
                expect(effectiveXScale).toBeCloseTo(actionScale);
                expect(
                    (supportFootContacts[state][frameIndex] - peasantAttackAnchorX(state, frameIndex) * 768) *
                        effectiveXScale,
                ).toBeCloseTo(289 - 384);
            }
        }
        expect(peasantActionScaleMultiplier("attack")).toBe(PEASANT_ATTACK_RENDER_SCALE);
        expect(peasantActionScaleMultiplier("attack_up")).toBe(PEASANT_DIAGONAL_ATTACK_RENDER_SCALE);
        expect(peasantActionScaleMultiplier("attack_down")).toBe(PEASANT_DIAGONAL_ATTACK_RENDER_SCALE);
        expect(peasantActionScaleMultiplier("attack", 7)).toBe(PEASANT_ATTACK_END_RENDER_SCALE);
        expect(peasantActionScaleMultiplier("attack_up", 6)).toBe(PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES[0]);
        expect(peasantActionScaleMultiplier("attack_up", 7)).toBe(PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES[1]);
        expect(peasantActionScaleMultiplier("attack_down", 7)).toBe(PEASANT_ATTACK_DOWN_END_RENDER_SCALE);
        expect(peasantActionScaleMultiplier("death")).toBe(PEASANT_DEATH_RENDER_SCALE);
        expect(PEASANT_DEATH_RENDER_SCALE).toBeCloseTo(701 / 629);
        expect(peasantActionScaleMultiplier("hit")).toBe(1);

        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        expect((unit as unknown as { sprite?: Sprite }).sprite?.anchor.y).toBeCloseTo(730 / 768);

        for (const state of ["attack", "attack_up", "attack_down"] as const) {
            const badgeBeforeAction = unit as unknown as { badgeContainer?: Container };
            const stableFlagPosition = {
                x: badgeBeforeAction.badgeContainer?.x,
                y: badgeBeforeAction.badgeContainer?.y,
            };
            expect(unit.playOneShotAnimation(state)).toBe(true);
            expect(unit.isPlayingForegroundAttackAnimation()).toBe(true);
            unit.syncVisual(worldRoot, gridSettings);
            const attackInternals = unit as unknown as {
                sprite?: Sprite;
                badgeContainer?: Container;
                oneShotAnim?: { durationPerFrame: number; frameIndex: number };
                battlefieldAlphaHoleFillFilter?: unknown;
            };
            const openingScaleY = Math.abs(attackInternals.sprite?.scale.y ?? 0);
            const openingScaleX = Math.abs(attackInternals.sprite?.scale.x ?? 0);
            expect(attackInternals.sprite?.anchor.x).toBeCloseTo(peasantAttackAnchorX(state, 0));
            expect(attackInternals.battlefieldAlphaHoleFillFilter).toBeUndefined();
            expect((unit as unknown as { sprite?: Sprite }).sprite?.zIndex).toBe(CREATURE_ATTACK_FOREGROUND_Z_INDEX);
            expect((unit as unknown as { sprite?: Sprite }).sprite?.anchor.y).toBeCloseTo(742 / 768);
            expect(unit.getCreatureDepthSortCandidate(0)).toBeUndefined();
            expect(
                (unit as unknown as { oneShotAnim?: { durationPerFrame: number } }).oneShotAnim?.durationPerFrame,
            ).toBeCloseTo(state === "attack" ? PEASANT_SIDE_ATTACK_FRAME_DURATION_MS : 45 / 1.4 / (1.2 * 1.15 * 1.1));
            expect(attackInternals.badgeContainer?.x).toBe(stableFlagPosition.x);
            expect(attackInternals.badgeContainer?.y).toBe(stableFlagPosition.y);
            for (let frameIndex = 0; frameIndex < 8; frameIndex += 1) {
                if (frameIndex > 0) {
                    unit.stepOneShotAnimation((attackInternals.oneShotAnim?.durationPerFrame ?? 1) + 0.01);
                    unit.syncVisual(worldRoot, gridSettings);
                }
                expect(attackInternals.oneShotAnim?.frameIndex).toBe(frameIndex);
                expect(Math.abs(attackInternals.sprite?.scale.x ?? 0) / openingScaleX).toBeCloseTo(
                    PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[state][frameIndex] /
                        PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[state][0],
                );
                expect(attackInternals.sprite?.anchor.x).toBeCloseTo(peasantAttackAnchorX(state, frameIndex));
                expect(attackInternals.sprite?.anchor.y).toBeCloseTo(742 / 768);
                expect(attackInternals.badgeContainer?.x).toBe(stableFlagPosition.x);
                expect(attackInternals.badgeContainer?.y).toBe(stableFlagPosition.y);
            }
            expect(attackInternals.oneShotAnim?.frameIndex).toBe(7);
            const expectedRecoveryScale =
                state === "attack"
                    ? PEASANT_ATTACK_END_RENDER_SCALE
                    : state === "attack_up"
                      ? PEASANT_ATTACK_UP_RECOVERY_RENDER_SCALES[1]
                      : PEASANT_ATTACK_DOWN_END_RENDER_SCALE;
            const openingActionScale =
                state === "attack" ? PEASANT_ATTACK_RENDER_SCALE : PEASANT_DIAGONAL_ATTACK_RENDER_SCALE;
            expect(Math.abs(attackInternals.sprite?.scale.y ?? 0) / openingScaleY).toBeCloseTo(
                expectedRecoveryScale / openingActionScale,
            );
            expect(Math.abs(attackInternals.sprite?.scale.x ?? 0) / openingScaleX).toBeCloseTo(
                PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[state][7] / PEASANT_ATTACK_HORIZONTAL_FRAME_FACTORS[state][0],
            );
            expect(attackInternals.sprite?.anchor.x).toBeCloseTo(peasantAttackAnchorX(state, 7));
            unit.stepOneShotAnimation(10_000);
            expect(unit.isPlayingForegroundAttackAnimation()).toBe(false);
            unit.syncVisual(worldRoot, gridSettings);
            expect((unit as unknown as { sprite?: Sprite }).sprite?.anchor.y).toBeCloseTo(730 / 768);
        }
    });

    assetTest("keeps Peasant authored motion isolated from generic combat overlays", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(1)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(2)).toBe(true);
        expect(creatureGenericCombatMotionEnabledForUnit("Peasant", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Troglodyte", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Satyr", 2)).toBe(true);

        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        expect(unit.playOneShotAnimation("attack")).toBe(true);

        type PeasantMotionInternals = {
            sprite?: Sprite;
            facingDirection: -1 | 1;
            recoilStartMs: number;
            recoilDx: number;
            recoilDy: number;
            recoilShakeAmplitude: number;
            recoilWindup: boolean;
        };
        const internals = unit as unknown as PeasantMotionInternals;
        unit.syncVisual(worldRoot, gridSettings);
        const attackX = internals.sprite?.x;
        const attackY = internals.sprite?.y;
        const attackFacing = internals.facingDirection;
        const expectNoGenericRecoil = (): void => {
            expect(internals.recoilStartMs).toBe(0);
            expect(internals.recoilDx).toBe(0);
            expect(internals.recoilDy).toBe(0);
            expect(internals.recoilShakeAmplitude).toBe(0);
            expect(internals.recoilWindup).toBe(false);
        };

        unit.applyRecoil(40, -20);
        expectNoGenericRecoil();
        unit.applyWindupRecoil(40, -20);
        expectNoGenericRecoil();
        unit.applyHitReaction(40, -20);
        expectNoGenericRecoil();
        expect(unit.isPlayingOneShotAnimation("attack")).toBe(true);
        expect(internals.facingDirection).toBe(attackFacing);

        let hitCallbackCompleted = false;
        expect(unit.playOneShotAnimation("hit", () => (hitCallbackCompleted = true))).toBe(true);
        unit.syncVisual(worldRoot, gridSettings);
        expect(
            (unit as unknown as { battlefieldAlphaHoleFillFilter?: unknown }).battlefieldAlphaHoleFillFilter,
        ).toBeUndefined();
        expect(hitCallbackCompleted).toBe(false);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        expect(
            (unit as unknown as { oneShotAnim?: { durationPerFrame: number } }).oneShotAnim?.durationPerFrame,
        ).toBeCloseTo(51.98);
        unit.stepOneShotAnimation(414);
        expect(hitCallbackCompleted).toBe(false);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        unit.stepOneShotAnimation(2);
        expect(hitCallbackCompleted).toBe(true);

        let realTimeHitCompleted = false;
        expect(unit.playOneShotAnimation("hit", () => (realTimeHitCompleted = true))).toBe(true);
        for (let tick = 0; tick < 24; tick++) unit.stepSpawnAnimation(1 / 240);
        expect(realTimeHitCompleted).toBe(false);
        unit.stepSpawnAnimation(1 / 240);
        expect(realTimeHitCompleted).toBe(true);

        unit.applyHitReaction(40, -20);
        expectNoGenericRecoil();
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);

        const activeHit = (unit as unknown as { oneShotAnim?: { elapsed: number } }).oneShotAnim;
        unit.stepOneShotAnimation(20);
        const elapsedBeforeRepeatedDamage = activeHit?.elapsed;
        unit.applyHitReaction(40, -20);
        expect((unit as unknown as { oneShotAnim?: { elapsed: number } }).oneShotAnim).toBe(activeHit);
        expect(activeHit?.elapsed).toBe(elapsedBeforeRepeatedDamage);

        unit.playDodgeAnimation(40, -20);
        expect(unit.isDodging()).toBe(false);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.sprite?.x).toBe(attackX);
        expect(internals.sprite?.y).toBe(attackY);
    });

    test("does not request disabled Orc flourish sheets while rendering its static cutout", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const requestedKeys: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Orc", "orc_512", (key) => {
            requestedKeys.push(key);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);

        expect(requestedKeys).not.toContain("orc_idle_axe_twirl_atlas_quarter");
        expect(requestedKeys).not.toContain("orc_idle_battle_cry_atlas_quarter");
        expect(requestedKeys).toContain("orc_battlefield_side_right_final_v1");
    });
});

/** The restyled Scavenger figure is lifted by five percent of its model height above the shared foot line. */
const scavengerBattlefieldLift = (): number =>
    0.05 *
    gridSettings.getCellSize() *
    SCAVENGER_BOARD_MODEL_HEIGHT_CELLS *
    BATTLEFIELD_CREATURE_FRAMING.Scavenger.scaleY;

describe("Scavenger thief visual replacement", () => {
    type AnimationInternals = {
        sprite?: { texture: Texture; scale: { x: number; y: number }; rotation: number; y: number };
        selectionAnimFrames?: Texture[];
        scavengerIdleBladeTwirlFrames?: Texture[];
        scavengerActiveBattleCryFrames?: Texture[];
        selectionAnimationStartedAtMs: number;
        activeTurnAnimationStartedAtMs: number;
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            durationPerFrameMs: number;
        };
        oneShotAnim?: { durationPerFrame: number };
        spawnAnim?: { startScaleX: number; startScaleY: number; endScaleX: number; endScaleY: number };
    };

    const createScavenger = (): RenderableUnit => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Scavenger", "scavenger_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    assetTest("keeps the restyled static figure undistorted on the existing foot line", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        // The restyled figure is a square cutout used at its own canvas size, never squeezed on X.
        expect(internals.sprite?.texture.width).toBe(internals.sprite?.texture.height ?? -1);
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(Math.abs(internals.sprite?.scale.y ?? 0));
        expect(internals.sprite?.y).toBeCloseTo(
            tallBoardModelFootLineY(1024, gridSettings.getCellSize()) + scavengerBattlefieldLift(),
        );
    });

    assetTest("uses the complete thief animation set at Squire's visible height", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        // The Scavenger idles on its static figure; the thief sheet drives walks and one-shot actions.
        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
        // The static canvas is scaled so the thief's 186-of-192 visible height fills the model height.
        const expectedUniformScale =
            (((gridSettings.getCellSize() * SCAVENGER_BOARD_MODEL_HEIGHT_CELLS) / 186) *
                BATTLEFIELD_CREATURE_FRAMING.Scavenger.scaleY *
                192) /
            (internals.sprite?.texture.height ?? 1);
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(expectedUniformScale);
        expect(Math.abs(internals.sprite?.scale.y ?? 0)).toBeCloseTo(expectedUniformScale);
        expect(internals.sprite?.y).toBeCloseTo(
            tallBoardModelFootLineY(1024, gridSettings.getCellSize()) + scavengerBattlefieldLift(),
        );
        expect(thiefIdleBreathScaleForElapsed(0)).toBeCloseTo(1);
        expect(thiefIdleBreathScaleForElapsed(2800 / 4)).toBeCloseTo(1 + 0.01035 * 1.1);
        expect(thiefIdleBreathScaleForElapsed(2800 / 2)).toBeCloseTo(1);
        expect(thiefIdleBreathScalesForElapsed(2800 / 4).x).toBeCloseTo(1.008);
        expect(thiefIdleBreathScalesForElapsed((2800 * 3) / 4).x).toBeCloseTo(1);

        for (const state of ["walk", "attack", "attack_up", "attack_down", "cast", "hit", "death"]) {
            expect(unit.hasAnimationState(state)).toBe(true);
        }

        expect(unit.playOneShotAnimation("hit")).toBe(true);
        expect(internals.oneShotAnim?.durationPerFrame).toBeCloseTo(40.125 / 1.22);
        unit.stepOneShotAnimation(1000);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);

        unit.startBoardWalkAnimation(1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.loopStartFrame).toBe(1);
        expect(internals.walkAnim?.loopEndFrame).toBe(6);
        expect(internals.walkAnim?.outroFrame).toBe(7);
        expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(20.8333, 3);
        expect(Math.abs(internals.sprite?.scale.y ?? 0) * 185).toBeCloseTo(
            gridSettings.getCellSize() *
                SCAVENGER_BOARD_MODEL_HEIGHT_CELLS *
                BATTLEFIELD_CREATURE_FRAMING.Scavenger.scaleY,
        );
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(Math.abs(internals.sprite?.scale.y ?? 0));
        const walkScaleX = internals.sprite?.scale.x;
        const walkScaleY = internals.sprite?.scale.y;
        unit.applyMoveEffect(123);
        expect(internals.sprite?.rotation).toBe(0);
        expect(internals.sprite?.scale.x).toBe(walkScaleX);
        expect(internals.sprite?.scale.y).toBe(walkScaleY);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        const shownFrames = [internals.walkAnim?.frameIndex];
        unit.finishBoardWalkAnimationAfterFullCycle();
        for (let index = 0; index < 7; index++) {
            unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
            shownFrames.push(internals.walkAnim?.frameIndex);
        }
        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
        expect(internals.walkAnim).toBeUndefined();

        const expectedScaleX = internals.sprite?.scale.x;
        const expectedScaleY = internals.sprite?.scale.y;
        const boardScale = unit.getCurrentVisualScale();
        unit.startSpawnAnimation(boardScale);
        expect(internals.spawnAnim).toBeUndefined();
        expect(internals.sprite?.scale.x).toBe(expectedScaleX);
        expect(internals.sprite?.scale.y).toBe(expectedScaleY);
    });

    assetTest("keeps the static figure while the blade-twirl and battle-cry timings stay authored", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;
        const idleWindow = 2800 * SCAVENGER_IDLE_BREATH_CYCLES_PER_BLADE_TWIRL;
        const cryWindow = SCAVENGER_ACTIVE_BATTLE_CRY_DURATION_MS;
        const activeBreathingWindow = 2800 * SCAVENGER_ACTIVE_BATTLE_CRY_BREATH_CYCLES;

        expect(internals.scavengerIdleBladeTwirlFrames).toHaveLength(6);
        expect(internals.scavengerActiveBattleCryFrames).toHaveLength(6);
        expect(scavengerIdleBladeTwirlFrameForElapsed(idleWindow - 1)).toBeUndefined();
        for (let frame = 0; frame < 6; frame += 1) {
            expect(
                scavengerIdleBladeTwirlFrameForElapsed(idleWindow + frame * SCAVENGER_FLOURISH_FRAME_DURATION_MS),
            ).toBe(frame);
            unit.stepSelectionAnimation(
                internals.selectionAnimationStartedAtMs + idleWindow + frame * SCAVENGER_FLOURISH_FRAME_DURATION_MS,
            );
            // The approved static Scavenger figure stays on screen; the flourish sheet is only loaded.
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
        }
        expect(scavengerIdleBladeTwirlFrameForElapsed(idleWindow + cryWindow)).toBeUndefined();

        unit.setActiveTurn(true);
        const activeStartedAt = internals.activeTurnAnimationStartedAtMs;
        let frameStartMs = 0;
        for (let frame = 0; frame < 6; frame += 1) {
            expect(scavengerActiveBattleCryFrameForElapsed(frameStartMs)).toBe(frame);
            unit.stepSelectionAnimation(activeStartedAt + frameStartMs);
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
            frameStartMs +=
                frame === 4 ? SCAVENGER_ACTIVE_BATTLE_CRY_POINT_HOLD_MS : SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS;
        }
        const pointingFrameStart = SCAVENGER_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * 4;
        expect(scavengerActiveBattleCryFrameForElapsed(pointingFrameStart)).toBe(4);
        expect(scavengerActiveBattleCryFrameForElapsed(pointingFrameStart + 999)).toBe(4);
        expect(scavengerActiveBattleCryFrameForElapsed(pointingFrameStart + 1000)).toBe(5);
        expect(scavengerActiveBattleCryFrameForElapsed(cryWindow)).toBeUndefined();
        expect(scavengerActiveBattleCryBreathElapsed(cryWindow)).toBe(0);
        expect(scavengerActiveBattleCryBreathElapsed(cryWindow + 2800)).toBe(2800);
        expect(scavengerActiveBattleCryFrameForElapsed(cryWindow + activeBreathingWindow)).toBe(0);
        unit.stepSelectionAnimation(activeStartedAt + cryWindow + activeBreathingWindow);
        expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
    });

    assetTest("plays the entry once, repeats only the six walking poses, and keeps the outro out of the loop", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        const shownFrames = [internals.walkAnim?.frameIndex];
        for (let index = 0; index < 9; index++) {
            unit.stepSpawnAnimation((frameMs + 0.1) / 1000);
            shownFrames.push(internals.walkAnim?.frameIndex);
        }

        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 1, 2, 3]);
    });
});

test("initializes the active-turn aura color when promoting a base unit", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
    const worldRoot = new Container();
    unit.setPosition(0, 1024);
    unit.setActiveTurn(true);

    // fromBase() bypasses class-field initializers. An uninitialized activeAuraColor reaches Pixi's
    // Graphics.fill as undefined and aborts every simulation frame as soon as a unit becomes active.
    expect(() => unit.syncVisual(worldRoot, gridSettings)).not.toThrow();
    expect(worldRoot.children.some((child) => child instanceof Graphics)).toBe(true);
});

describe("RenderableUnit runtime spell synchronization", () => {
    test("removes and grants getSpells entries when a castable ability is stolen", () => {
        const queen = createRenderableUnit(TeamVals.LEFT, "Nature", "Arachna Queen", "arachna_queen_512");
        const angel = createRenderableUnit(TeamVals.RIGHT, "Life", "Angel", "angel_512");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(angel)).toEqual({ Resurrection: 1 });
        expect(spellAmounts(queen)).toEqual({});
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, angel, sceneLog)?.abilityName).toBe(
            "Resurrection",
        );
        expect(spellAmounts(angel)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Resurrection: 1 });
    });

    test("transfers exact remaining spellbook charges into the thief's getSpells entries", () => {
        const queen = createRenderableUnit(TeamVals.LEFT, "Nature", "Arachna Queen", "arachna_queen_512");
        const satyr = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512");
        satyr.useSpell("Courage");
        satyr.useSpell("Summon Wolves");
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(spellAmounts(satyr)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
        expect(AllAbilities.processPredatoryAssimilationAbility(queen, satyr, sceneLog)?.abilityName).toBe(
            "Forest Spellbook",
        );
        expect(spellAmounts(satyr)).toEqual({});
        expect(spellAmounts(queen)).toEqual({ Courage: 2, "Helping Hand": 1, "Summon Wolves": 1 });
    });

    test("builds spellbook rendering when an initially spell-less unit gains a runtime spell", () => {
        const queen = createRenderableUnit(
            TeamVals.LEFT,
            "Nature",
            "Arachna Queen",
            "arachna_queen_512",
            () => Texture.WHITE,
        );
        const angel = createRenderableUnit(TeamVals.RIGHT, "Life", "Angel", "angel_512");
        const spellBookLayer = new Container();
        const digits = new Map([[1, Texture.WHITE]]);
        HoCLib.setDeterministicRandomSource(() => 0);

        expect(queen.ensureSpellBookRendering(spellBookLayer, digits)).toBe(false);
        expect(spellBookLayer.children).toHaveLength(0);

        expect(AllAbilities.processPredatoryAssimilationAbility(queen, angel, sceneLog)?.abilityName).toBe(
            "Resurrection",
        );
        expect(queen.ensureSpellBookRendering(spellBookLayer, digits)).toBe(true);
        queen.renderSpells(1);
        expect(spellBookLayer.children.length).toBeGreaterThan(0);
        expect(spellBookLayer.children.some((child) => child.visible)).toBe(true);
    });

    test("rebuilds a spellbook card after its on-demand icon and furniture arrive", () => {
        let spellbookArtReady = false;
        const requestedKeys: string[] = [];
        const angel = createRenderableUnit(TeamVals.LEFT, "Life", "Angel", "angel_512", (key) => {
            requestedKeys.push(key);
            return spellbookArtReady ? Texture.WHITE : undefined;
        });
        const spellBookLayer = new Container();
        const digits = new Map([[1, Texture.WHITE]]);

        angel.setSpellBookLayer(spellBookLayer, digits);
        expect(requestedKeys).toEqual(
            expect.arrayContaining([
                "resurrection_256",
                "spell_cell_260",
                "spell_cast_wax_seal_blank_v1",
                "spell_inner_frame_linework_v2",
                "spell_stack_fill_green_variant2",
                "spell_stack_fill_red_variant2",
                "spell_stack_rail_variant2",
            ]),
        );
        expect(spellBookLayer.children).toHaveLength(0);

        spellbookArtReady = true;
        expect(angel.ensureSpellBookRendering(spellBookLayer, digits)).toBe(true);
        angel.renderSpells(1);
        expect(spellBookLayer.children.length).toBeGreaterThan(0);
        expect(spellBookLayer.children.some((child) => child.visible)).toBe(true);
    });
});

describe("RenderableUnit runtime aura and reflection descriptions", () => {
    const descriptionFor = (
        creatureName: "Dryad" | "Satyr" | "Magic Dragon",
        textureName: string,
        abilityName: string,
        stackPower: number,
        luck: number,
    ): string => {
        const effectFactory = new EffectFactory();
        const properties = HoCConfig.getCreatureConfig(TeamVals.LEFT, "Nature", creatureName, textureName, 1);
        properties.luck = luck;
        const base = Unit.createUnit(
            properties,
            gridSettings,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );
        const unit = RenderableUnit.fromBase(base, () => undefined);
        unit.setStackPower(stackPower);
        unit.adjustBaseStats(false, 0, 0, 0, 0, 0, luck);

        const abilityIndex = unit.getUnitProperties().abilities.indexOf(abilityName);
        expect(abilityIndex).toBeGreaterThanOrEqual(0);
        return unit.getUnitProperties().abilities_descriptions[abilityIndex] ?? "";
    };

    test("replaces live Guiding Winds, Sylvan Focus and Magic Mirror values", () => {
        expect(descriptionFor("Dryad", "dryad_512", "Guiding Winds Aura", 2, 10)).toContain("shoot 20% further");
        expect(descriptionFor("Satyr", "satyr_512", "Sylvan Focus Aura", 1, 10)).toContain(
            "deal 25% more magic damage",
        );
        // Magic Reflection is stack-scaled now: at power 75 that is 15/30/45/60/75 across the stack, then
        // shifted by luck. One pip of stack with 10 luck rebounds at 25%, not the configured full-stack 75.
        expect(descriptionFor("Magic Dragon", "magic_dragon_512", "Magic Reflection", 1, 10)).toContain(
            "creature 25% of the time",
        );
        expect(descriptionFor("Magic Dragon", "magic_dragon_512", "Magic Reflection", 5, 10)).toContain(
            "creature 85% of the time",
        );
    });

    test("replaces Chakram's total-target limit at every stack tier", () => {
        for (let stackPower = 1; stackPower <= 5; stackPower += 1) {
            const effectFactory = new EffectFactory();
            const base = Unit.createUnit(
                HoCConfig.getCreatureConfig(TeamVals.LEFT, "Might", "Zena", "zena_512", 1),
                gridSettings,
                TeamVals.LEFT,
                UnitVals.CREATURE,
                new AbilityFactory(effectFactory),
                effectFactory,
                false,
            );
            const unit = RenderableUnit.fromBase(base, () => undefined);
            unit.setStackPower(stackPower);
            unit.adjustBaseStats(false, 0, 0, 0, 0, 0, 0);

            const properties = unit.getUnitProperties();
            const index = properties.abilities.indexOf("Chakram");
            expect(properties.abilities_descriptions[index]).toContain(`Maximum targets: ${stackPower}.`);
        }
    });
});

describe("RenderableUnit revealed roster card", () => {
    // Revealed units carry a ColorMatrixFilter (the B&W pass), whose constructor probes a WebGL context
    // through the DOM adapter. Headless bun has no document; hand it a canvas stub whose getContext
    // returns null, which pixi already handles by falling back to mediump precision.
    if (!("document" in globalThis)) {
        (globalThis as { document?: unknown }).document = {
            createElement: () => ({ getContext: () => null, setAttribute: () => undefined }),
            querySelector: () => null,
        };
    }

    // In-grid position (x ∈ (-1024, 1024), y ∈ (0, 2048)) so ensureVisual builds the sprite.
    const pos = { x: 0, y: 1900 };

    const revealedUnit = (): { unit: RenderableUnit; worldRoot: Container } => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setVisualRevealed(true);
        unit.setVisualScaleMultiplier(0.85);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        return { unit, worldRoot };
    };

    const cardOf = (unit: RenderableUnit): Container | undefined =>
        (unit as unknown as { rosterCard?: Container }).rosterCard;

    test("traces one-cell and four-cell markers on the exact painted deployment seams", () => {
        const singleCell = { x: 12, y: 8 };
        const singleCenter = GridMath.getPositionForCell(
            singleCell,
            gridSettings.getMinX(),
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        expect(revealedOpponentFootprintPoints(singleCenter, 1, 1, gridSettings)).toEqual(
            projectedCellPoints(singleCell, gridSettings),
        );

        const largeCells = [
            { x: 12, y: 8 },
            { x: 13, y: 8 },
            { x: 12, y: 9 },
            { x: 13, y: 9 },
        ];
        const largeCenter = GridMath.getPositionForCells(gridSettings, largeCells)!;
        const step = gridSettings.getStep();
        expect(revealedOpponentFootprintPoints(largeCenter, 2, 2, gridSettings)).toEqual(
            projectedRectPoints(
                largeCenter.x - step,
                largeCenter.y - step,
                largeCenter.x + step,
                largeCenter.y + step,
                gridSettings,
            ),
        );
    });

    test("draws only its plate beneath the silhouette at full filter resolution", () => {
        const { unit, worldRoot } = revealedUnit();
        const card = cardOf(unit);

        expect(card).toBeDefined();
        expect(card!.visible).toBe(true);
        expect(card!.children.some((child) => child instanceof Graphics)).toBe(true);
        expect(card!.children.some((child) => child instanceof Text)).toBe(false);
        // Behind the sprite (higher zIndex draws later/on top).
        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y) as Sprite;
        expect(sprite).toBeDefined();
        expect(card!.zIndex).toBeLessThan(sprite!.zIndex);
        const grayscale = sprite.filters?.find((filter) => filter instanceof ColorMatrixFilter);
        expect(grayscale).toBeDefined();
        expect(grayscale!.resolution).toBe("inherit");
        expect(grayscale!.antialias).toBe("inherit");
    });

    test("follows the unit and disappears once it is no longer a revealed silhouette", () => {
        const { unit, worldRoot } = revealedUnit();
        const card = cardOf(unit)!;
        const zIndexBefore = card.zIndex;

        unit.setPosition(pos.x + 300, pos.y);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(card.visible).toBe(true);
        expect(card.zIndex).toBe(zIndexBefore);

        unit.setVisualRevealed(false);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(card.visible).toBe(false);
    });

    test("a normal board unit never builds one", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);

        expect(cardOf(unit)).toBeUndefined();
    });
});

describe("RenderableUnit steady-state overlays", () => {
    type OverlayInternals = {
        activeAura?: Container;
        activeAuraGlow?: Graphics;
        activeAuraMask?: Graphics;
        activeTurnFireSprite?: Sprite;
        badgeContainer?: Container;
        badgeHeader?: Graphics;
        badgeFlag?: Graphics;
        badgeFlagGlow?: Graphics;
        activeTurnPointer?: Graphics;
        sprite?: Sprite;
        badgeDrawState?: {
            geometry: {
                bannerLeft: number;
                bannerRight: number;
                bannerBottom: number;
                flagHeight: number;
                headerWidth: number;
                borderWidth: number;
            };
        };
        stackPowerPips: Graphics[];
        stackPowerDrawState?: { power: number };
        hourglassContainer?: Container;
        hourglassSprite?: Sprite;
        stunContainer?: Container;
        stunSprite?: Sprite;
        respondContainer?: Container;
        respondSprite?: Sprite;
        updateActiveAura: (
            worldRoot: Container,
            gs: typeof gridSettings,
            pos: { x: number; y: number },
            nowMs: number,
        ) => void;
        whirlpoolAura?: Graphics;
        updateWhirlpoolAura: (
            worldRoot: Container,
            gs: typeof gridSettings,
            pos: { x: number; y: number },
            nowMs: number,
        ) => void;
        smallTextureName: string;
    };

    test("synchronizes the all-gold pointer enlargement with its glow pulse", () => {
        expect(ACTIVE_TURN_POINTER_SIZE_SCALE).toBeCloseTo(2.067);
        expect(activeFlagScaleForTime(0)).toBeCloseTo(1);
        expect(activeFlagScaleForTime(0.35)).toBeCloseTo(1.04);
        expect(activeFlagScaleForTime(0.7)).toBeCloseTo(1.08);
        expect(activeFlagScaleForTime(1.4)).toBeCloseTo(1);
        expect(activeFlagGlowAlphaForTime(0)).toBeCloseTo(0.32);
        expect(activeFlagGlowAlphaForTime(0.35)).toBeCloseTo(0.61);
        expect(activeFlagGlowAlphaForTime(0.7)).toBeCloseTo(0.9);
        expect(activeFlagGlowAlphaForTime(1.4)).toBeCloseTo(0.32);
    });

    test("adds a visible six percent of one board cell above the established flag gap", () => {
        const cellSide = 70;
        const flagWidth = cellSide * 0.42;
        const flagHeight = 13;

        expect(activeTurnPointerGap(flagHeight, flagWidth)).toBeCloseTo(2 + cellSide * 0.06);
    });

    test("keeps the flag upright while its manual head anchor follows a mirrored creature", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        const internals = unit as unknown as OverlayInternals;
        const offsetFromSpriteCenter = () => {
            const bounds = internals.sprite!.getBounds();
            return internals.badgeContainer!.x - (bounds.x + bounds.width * 0.5);
        };

        unit.setBoardFacing(1);
        unit.ensureVisual(worldRoot, gridSettings);
        const originalOffset = offsetFromSpriteCenter();

        unit.setBoardFacing(-1);
        unit.ensureVisual(worldRoot, gridSettings);
        const mirroredOffset = offsetFromSpriteCenter();

        expect(mirroredOffset).toBeCloseTo(-originalOffset, 8);
        expect(internals.badgeContainer?.scale.x).toBeGreaterThan(0);
    });

    test("shows one downward all-gold pointer above only the active unit's flag", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.activeTurnPointer).toBeDefined();
        expect(internals.activeTurnPointer!.visible).toBe(false);

        unit.setActiveTurn(true);
        unit.syncVisual(worldRoot, gridSettings);
        const geometry = internals.badgeDrawState!.geometry;
        expect(internals.activeTurnPointer!.visible).toBe(true);
        expect(internals.badgeFlagGlow!.visible).toBe(true);
        // The world root is y-up, so a larger local y is visually above the flag.
        expect(internals.activeTurnPointer!.y).toBeCloseTo(
            geometry.bannerBottom + activeTurnPointerGap(geometry.flagHeight, geometry.headerWidth),
        );
        const pointerFill = internals.activeTurnPointer!.context.instructions.find(
            (instruction) => instruction.action === "fill",
        ) as unknown as { data: { style: { color: number } } };
        expect(pointerFill.data.style.color).toBe(0xffc83d);
        const pointerStroke = internals.activeTurnPointer!.context.instructions.find(
            (instruction) => instruction.action === "stroke",
        ) as unknown as { data: { style: { color: number; pixelLine: boolean; width: number } } };
        expect(pointerStroke.data.style.color).toBe(0x100d08);
        expect(pointerStroke.data.style.width).toBe(1);
        expect(pointerStroke.data.style.pixelLine).toBe(true);

        unit.setActiveTurn(false);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeTurnPointer!.visible).toBe(false);
        expect(internals.badgeFlagGlow!.visible).toBe(false);
    });

    test("hides the active-turn pointer immediately when movement or an action begins", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setActiveTurn(true);
        const worldRoot = new Container();

        unit.syncVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.activeTurnPointer!.visible).toBe(true);
        expect(internals.badgeFlagGlow!.visible).toBe(true);

        // Hiding is synchronous and does not depend on whether this creature has an authored walk atlas.
        unit.startBoardWalkAnimation(1);
        expect(internals.activeTurnPointer!.visible).toBe(false);
        expect(internals.badgeFlagGlow!.visible).toBe(false);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeTurnPointer!.visible).toBe(false);

        // A new turn resets the latch; starting any action then consumes the marker in the same way.
        unit.setActiveTurn(false);
        unit.setActiveTurn(true);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeTurnPointer!.visible).toBe(true);

        unit.playOneShotAnimation("attack");
        expect(internals.activeTurnPointer!.visible).toBe(false);
        expect(internals.badgeFlagGlow!.visible).toBe(false);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeTurnPointer!.visible).toBe(false);
    });

    test("keeps the damage anchor independent from the active flag pulse scale", () => {
        const anchorAtDimPulse = stableDamagePredictionBadgeScreenTop(200, 3, 16, 0.87, 1);
        const anchorAtBrightPulse = stableDamagePredictionBadgeScreenTop(200, 3, 16, 0.87, 1);

        expect(anchorAtBrightPulse).toBe(anchorAtDimPulse);
        expect(anchorAtBrightPulse).toBeCloseTo(183.08);
    });

    test("keeps the animated gold flag contour at one physical screen pixel", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const flag = (unit as unknown as OverlayInternals).badgeFlag!;
        const strokes = flag.context.instructions.filter((instruction) => instruction.action === "stroke");
        const finalStroke = strokes.at(-1) as unknown as {
            data: { style: { color: number; alpha: number; pixelLine: boolean } };
        };

        expect(finalStroke.data.style.color).toBe(0xb08a45);
        expect(finalStroke.data.style.alpha).toBe(1);
        expect(finalStroke.data.style.pixelLine).toBe(true);
    });

    test("moves the active-turn glow off the static flag and onto the pointer", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setActiveTurn(true);
        const worldRoot = new Container();

        unit.syncVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        const flagStrokeColors = internals
            .badgeFlag!.context.instructions.filter((instruction) => instruction.action === "stroke")
            .map((instruction) => (instruction.data.style as { color: number }).color);
        const flagGlowStrokes = internals.badgeFlagGlow!.context.instructions.filter(
            (instruction) => instruction.action === "stroke",
        );
        const flagGlowStyles = flagGlowStrokes.map(
            (instruction) => instruction.data.style as { color: number; alpha: number },
        );
        const pointerStrokeColors = internals
            .activeTurnPointer!.context.instructions.filter((instruction) => instruction.action === "stroke")
            .map((instruction) => (instruction.data.style as { color: number }).color);

        expect(internals.activeAura).toBeUndefined();
        expect(internals.activeTurnFireSprite).toBeUndefined();
        expect(internals.badgeFlagGlow?.visible).toBe(true);
        expect(flagStrokeColors.at(-1)).toBe(0xb08a45);
        expect(pointerStrokeColors).toContain(0x100d08);
        expect(flagGlowStrokes).toHaveLength(2);
        expect(flagGlowStyles.every(({ color }) => color === 0xffd05a)).toBe(true);
        expect(flagGlowStyles.every(({ alpha }) => alpha > 0)).toBe(true);

        // Placement hover remains a separate pre-combat interaction and may still use the footprint light.
        unit.setActiveTurn(false);
        unit.setHoverTurnAura(true);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeAura?.visible).toBe(true);
        expect(internals.badgeFlagGlow?.visible).toBe(false);
    });

    test("uses one borderless placement-hover footprint beneath a two-by-two creature", () => {
        const unit = createRenderableUnit(
            TeamVals.RIGHT,
            "Chaos",
            "Black Dragon",
            "black_dragon_512",
            () => Texture.WHITE,
        );
        unit.setPosition(0, 1024);
        unit.setHoverTurnAura(true);
        const worldRoot = new Container();

        unit.syncVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        const cellGlowFills = internals.activeAuraGlow!.context.instructions.filter(
            (instruction) => instruction.action === "fill",
        );
        const cellGlowStrokes = internals.activeAuraGlow!.context.instructions.filter(
            (instruction) => instruction.action === "stroke",
        );
        const footprintMaskFills = internals.activeAuraMask!.context.instructions.filter(
            (instruction) => instruction.action === "fill",
        );

        expect(unit.getCells()).toHaveLength(4);
        expect(cellGlowFills).toHaveLength(2);
        expect(cellGlowStrokes).toHaveLength(0);
        expect(footprintMaskFills).toHaveLength(1);
    });

    test("keeps the compact amount ribbon hidden with the unit and leaves the old power rail disabled", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setStackPower(3);
        unit.setVisualVisible(false);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.badgeFlag).toBeInstanceOf(Graphics);
        expect(internals.badgeContainer?.visible).toBe(false);
        expect(internals.badgeFlagGlow?.filters ?? []).toHaveLength(0);
        expect(internals.stackPowerPips).toHaveLength(0);
        expect(internals.hourglassContainer).toBeUndefined();
        expect(internals.stunContainer).toBeUndefined();
        expect(internals.respondContainer).toBeUndefined();

        unit.setStackPower(4);
        unit.setActiveTurn(true);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(internals.badgeFlag).toBeInstanceOf(Graphics);
        expect(internals.badgeContainer?.visible).toBe(false);
        expect(internals.stackPowerPips).toHaveLength(0);
    });

    test("attaches the hourglass left of the flag and crossed response swords behind it", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setOnHourglass(true);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        const bareFlagX = internals.badgeContainer!.x;
        const bareFlagY = internals.badgeContainer!.y;
        expect(internals.respondContainer).toBeUndefined();

        AllAbilities.processOneInTheFieldAbility(unit);
        // The real combat-engine callback runs after its last scene sync, so visibility must change immediately.
        expect(internals.respondContainer?.visible).toBe(true);
        unit.ensureVisual(worldRoot, gridSettings);
        const {
            bannerLeft: flagLeft,
            bannerRight: flagRight,
            flagHeight,
            headerWidth,
        } = internals.badgeDrawState!.geometry;

        expect(internals.hourglassContainer?.parent).toBe(internals.badgeContainer);
        expect(internals.respondContainer?.parent).toBe(internals.badgeContainer);
        expect(internals.badgeContainer?.sortableChildren).toBe(false);
        expect(internals.respondContainer?.zIndex).toBe(0);
        expect(internals.respondContainer?.visible).toBe(true);
        expect(internals.respondSprite?.visible).toBe(true);
        expect(internals.badgeContainer!.getChildIndex(internals.respondContainer!)).toBeLessThan(
            internals.badgeContainer!.getChildIndex(internals.badgeFlag!),
        );
        // Turning the response marker on must not move or redraw the existing flag itself.
        expect(internals.badgeContainer!.x).toBe(bareFlagX);
        expect(internals.badgeContainer!.y).toBe(bareFlagY);
        expect(internals.hourglassContainer!.x).toBeLessThan(flagLeft);
        expect(internals.hourglassContainer!.y).toBe(0);
        expect(internals.respondContainer!.x).toBeCloseTo((flagLeft + flagRight) * 0.5);
        expect(internals.respondContainer!.y).toBe(0);
        expect(internals.hourglassSprite!.height).toBeCloseTo(flagHeight);
        // The source has broad transparent padding, so its canvas must be much larger than the flag for
        // the actual opaque blades and hilts to protrude clearly from behind the cloth on the zoomed-out map.
        expect(internals.respondSprite!.width).toBeCloseTo(headerWidth * 2.25);
        expect(internals.respondSprite!.height).toBeCloseTo(headerWidth * 2.25 * 0.8);
        expect(internals.respondSprite!.width).toBeGreaterThan(flagRight - flagLeft);
        expect(internals.respondSprite!.height).toBeGreaterThan(flagHeight);
        // Nine transparent pixels at the texture's right edge are tucked into the banner, so the visible
        // gold hourglass rail—not merely its 64 px canvas—meets the flag while both stay equal in height.
        expect(internals.hourglassContainer!.x + flagHeight * (0.5 - 9 / 64)).toBeCloseTo(flagLeft);

        const responseEmblemX = internals.respondContainer!.x;
        const responseEmblemY = internals.respondContainer!.y;
        unit.setOnHourglass(false);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(internals.hourglassContainer?.visible).toBe(false);
        expect(internals.respondContainer?.x).toBe(responseEmblemX);
        expect(internals.respondContainer?.y).toBe(responseEmblemY);
    });

    test("replaces the hourglass with the forged hand stun badge in the same flag slot", () => {
        const requestedTextures: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", (textureName) => {
            requestedTextures.push(textureName);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.setOnHourglass(true);
        unit.setSkipping(true);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        const internals = unit as unknown as OverlayInternals;
        const { bannerLeft: flagLeft, flagHeight } = internals.badgeDrawState!.geometry;

        expect(requestedTextures).toContain("stun_hand_forged");
        expect(internals.hourglassContainer).toBeUndefined();
        expect(internals.stunContainer?.parent).toBe(internals.badgeContainer);
        expect(internals.stunContainer?.visible).toBe(true);
        expect(internals.stunContainer?.y).toBe(0);
        const layout = stunBadgeLayout(flagHeight, flagLeft, DEFAULT_STUN_BADGE_TUNING);
        expect(internals.stunSprite?.width).toBeCloseTo(layout.width);
        expect(internals.stunSprite?.height).toBeCloseTo(layout.height);
        expect(internals.stunContainer!.x).toBeCloseTo(layout.centerX);

        unit.setSkipping(false);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(internals.stunContainer?.visible).toBe(false);
        expect(internals.hourglassContainer?.visible).toBe(true);
        expect(internals.hourglassContainer?.parent).toBe(internals.badgeContainer);
    });

    test("shows the board stun badge immediately when an already-rendered unit receives the effect", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setOnHourglass(true);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.hourglassContainer?.visible).toBe(true);
        expect(internals.stunContainer).toBeUndefined();

        const stun = new EffectFactory().makeEffect("Stun");
        expect(stun).toBeDefined();
        expect(unit.applyEffect(stun!)).toBe(true);

        expect(internals.hourglassContainer?.visible).toBe(false);
        expect(internals.stunContainer?.visible).toBe(true);
        expect(internals.stunContainer?.parent).toBe(internals.badgeContainer);

        unit.deleteEffect("Stun");
        expect(internals.stunContainer?.visible).toBe(false);
        expect(internals.hourglassContainer?.visible).toBe(true);
    });

    test("shows the board stun badge immediately when ranked snapshot metadata arrives", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as OverlayInternals;
        expect(internals.stunContainer).toBeUndefined();

        unit.setSkipping(true);
        expect(internals.stunContainer?.visible).toBe(true);
        expect(internals.stunContainer?.parent).toBe(internals.badgeContainer);

        unit.setSkipping(false);
        expect(internals.stunContainer?.visible).toBe(false);
    });

    test("keeps crossed swords visible when a lap flip clears responded before the next rendered frame", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as OverlayInternals;

        // In a two-stack fight the combat engine can retaliate and roll the lap inside one synchronous
        // action. Pixi never sees the intermediate true state unless the visual feedback is latched.
        unit.setResponded(true);
        unit.setResponded(false);

        expect(unit.getResponded()).toBe(false);
        expect((unit as unknown as { respondFeedbackUntilMs: number }).respondFeedbackUntilMs).toBeGreaterThan(
            performance.now(),
        );
        expect(internals.respondContainer?.visible).toBe(true);
        unit.destroyVisuals();
    });

    test("previews stack power without changing the unit's mechanical value", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setStackPower(5);
        const worldRoot = new Container();

        unit.ensureVisual(worldRoot, gridSettings);
        expect((unit as unknown as OverlayInternals).stackPowerDrawState?.power).toBe(5);

        unit.setProjectedStackPower(2);
        unit.ensureVisual(worldRoot, gridSettings);
        expect(unit.getStackPower()).toBe(5);
        expect((unit as unknown as OverlayInternals).stackPowerDrawState?.power).toBe(2);

        unit.clearProjectedStackPower();
        unit.ensureVisual(worldRoot, gridSettings);
        expect((unit as unknown as OverlayInternals).stackPowerDrawState?.power).toBe(5);
    });

    test("does not rebuild the active unit's rigid flag or pointer on steady frames", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setActiveTurn(true);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);

        const internals = unit as unknown as OverlayInternals;
        const flag = internals.badgeFlag!;
        const header = internals.badgeHeader!;
        const glow = internals.badgeFlagGlow!;
        const pointer = internals.activeTurnPointer!;
        const originalClear = flag.clear.bind(flag);
        const originalHeaderClear = header.clear.bind(header);
        const originalGlowClear = glow.clear.bind(glow);
        const originalPointerClear = pointer.clear.bind(pointer);
        const clearCounts = { flag: 0, header: 0, glow: 0, pointer: 0 };
        flag.clear = () => {
            clearCounts.flag++;
            return originalClear();
        };
        header.clear = () => {
            clearCounts.header++;
            return originalHeaderClear();
        };
        glow.clear = () => {
            clearCounts.glow++;
            return originalGlowClear();
        };
        pointer.clear = () => {
            clearCounts.pointer++;
            return originalPointerClear();
        };

        unit.ensureVisual(worldRoot, gridSettings);
        unit.ensureVisual(worldRoot, gridSettings);

        expect(clearCounts).toEqual({ flag: 0, header: 0, glow: 0, pointer: 0 });
    });

    test("updates an inactive flag at its own lower visual cadence", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings, 100);

        const flag = (unit as unknown as OverlayInternals).badgeFlag!;
        const originalClear = flag.clear.bind(flag);
        let clearCount = 0;
        flag.clear = () => {
            clearCount++;
            return originalClear();
        };

        unit.ensureVisual(worldRoot, gridSettings, 110);
        expect(clearCount).toBe(0);
        unit.ensureVisual(worldRoot, gridSettings, 151);
        expect(clearCount).toBe(1);
    });

    test("coalesces stationary status-effect redraws but follows movement immediately", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        const worldRoot = new Container();
        const internals = unit as unknown as OverlayInternals;
        const pos = { x: 384, y: 640 };
        internals.updateWhirlpoolAura(worldRoot, gridSettings, pos, 1_000);

        const vortex = internals.whirlpoolAura!;
        const originalClear = vortex.clear.bind(vortex);
        let clearCount = 0;
        vortex.clear = () => {
            clearCount++;
            return originalClear();
        };

        internals.updateWhirlpoolAura(worldRoot, gridSettings, pos, 1_001);
        expect(clearCount).toBe(0);
        internals.updateWhirlpoolAura(worldRoot, gridSettings, { x: pos.x + 1, y: pos.y }, 1_002);
        expect(clearCount).toBe(1);
    });

    test("shows Whirlpool from both the Sandbox debuff object and Ranked's authoritative display status", () => {
        const sandboxUnit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        sandboxUnit.setPosition(0, 1024);
        sandboxUnit.applyDebuff(
            new Spell({ spellProperties: HoCConfig.getSpellConfig("Nature", "Whirlpool"), amount: 1 }),
        );
        const sandboxRoot = new Container();
        sandboxUnit.syncVisual(sandboxRoot, gridSettings);
        const sandboxVortex = (sandboxUnit as unknown as OverlayInternals).whirlpoolAura;
        expect(sandboxVortex).toBeDefined();
        expect(sandboxVortex?.visible).toBe(true);
        expect(sandboxVortex?.getLocalBounds().width).toBeGreaterThan(gridSettings.getCellSize());

        // Ranked deliberately has no AppliedSpell object: its server snapshot fills only the parallel
        // display arrays. The shared status predicate must still create the exact same board VFX.
        const rankedUnit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        rankedUnit.setPosition(0, 1024);
        const rankedProperties = rankedUnit.getUnitProperties();
        rankedProperties.applied_debuffs.push("Whirlpool");
        rankedProperties.applied_debuffs_laps.push(1);
        rankedProperties.applied_debuffs_descriptions.push("Trapped in a churning vortex");
        rankedProperties.applied_debuffs_powers.push(0);
        const rankedRoot = new Container();
        rankedUnit.syncVisual(rankedRoot, gridSettings);
        const rankedVortex = (rankedUnit as unknown as OverlayInternals).whirlpoolAura;
        expect(rankedVortex).toBeDefined();
        expect(rankedVortex?.visible).toBe(true);
        expect(rankedVortex?.getLocalBounds().width).toBeGreaterThan(gridSettings.getCellSize());

        // Once the authoritative status clears, the persistent vortex clears on the same visual sync.
        rankedProperties.applied_debuffs.length = 0;
        rankedUnit.syncVisual(rankedRoot, gridSettings);
        expect(rankedVortex?.visible).toBe(false);
    });
});

describe("RenderableUnit applied buff/debuff display de-duplication", () => {
    test("collapses a repeated name onto its first entry", () => {
        const names = ["Visible", "Hidden", "Visible"];
        const laps = [3, 2, 1];
        const descriptions = ["from the snapshot", "hidden", "re-applied locally"];
        const powers = [0, 0, 7];

        expect(dropDuplicateAppliedEntries(names, laps, descriptions, powers)).toBe(true);
        expect(names).toEqual(["Visible", "Hidden"]);
        expect(laps).toEqual([3, 2]);
        expect(descriptions).toEqual(["from the snapshot", "hidden"]);
        expect(powers).toEqual([0, 0]);
    });

    test("leaves a list without repeats untouched", () => {
        const names = ["Visible", "Hidden"];
        expect(dropDuplicateAppliedEntries(names, [1, 1], ["a", "b"], [0, 0])).toBe(false);
        expect(names).toEqual(["Visible", "Hidden"]);
    });

    test("refuses to splice arrays that are already desynced", () => {
        const names = ["Visible", "Visible"];
        expect(dropDuplicateAppliedEntries(names, [1], ["a", "b"], [0, 0])).toBe(false);
        expect(names).toHaveLength(2);
    });

    test("leaves a single Visible on a unit that carries it twice (the ranked double-render)", () => {
        const tiger = createRenderableUnit(TeamVals.RIGHT, "Nature", "White Tiger", "white_tiger_512");
        const visible = new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Visible"), amount: 1 });
        // Ranked shape: the snapshot seeds one display entry, common's guarded re-apply appends another.
        tiger.applyDebuff(visible);
        tiger.applyDebuff(visible);
        expect(tiger.getUnitProperties().applied_debuffs).toEqual(["Visible", "Visible"]);

        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(true);

        const properties = tiger.getUnitProperties();
        expect(properties.applied_debuffs).toEqual(["Visible"]);
        expect(properties.applied_debuffs_laps).toHaveLength(1);
        expect(properties.applied_debuffs_descriptions).toHaveLength(1);
        expect(properties.applied_debuffs_powers).toHaveLength(1);
        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(false);
    });

    test("collapses a duplicated buff the same way", () => {
        const tiger = createRenderableUnit(TeamVals.RIGHT, "Nature", "White Tiger", "white_tiger_512");
        const hidden = new Spell({ spellProperties: HoCConfig.getSpellConfig("System", "Hidden"), amount: 1 });
        tiger.applyBuff(hidden);
        tiger.applyBuff(hidden);

        expect(tiger.dropDuplicateAppliedDisplayEntries()).toBe(true);
        expect(tiger.getUnitProperties().applied_buffs).toEqual(["Hidden"]);
        expect(tiger.getUnitProperties().applied_buffs_laps).toHaveLength(1);
        expect(tiger.hasBuffActive("Hidden")).toBe(true);
    });
});

describe("RenderableUnit dodge animation", () => {
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    // In-grid position (x ∈ (-1024, 1024), y ∈ (0, 2048)) so ensureVisual builds the sprite.
    const pos = { x: 0, y: 1024 };

    function createVisualUnit(): { unit: RenderableUnit; worldRoot: Container } {
        const effectFactory = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", 1),
            gridSettings,
            TeamVals.RIGHT,
            UnitVals.CREATURE,
            new AbilityFactory(effectFactory),
            effectFactory,
            false,
        );
        const unit = RenderableUnit.fromBase(base, () => Texture.WHITE);
        unit.setPosition(pos.x, pos.y);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        return { unit, worldRoot };
    }

    test("is a safe no-op before any sprite exists", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512");
        unit.playDodgeAnimation(40, -20);
        expect(unit.isDodging()).toBe(false);
    });

    test("offsets sprite by the full displacement during the hold phase and leaves a ghost trail", async () => {
        const { unit, worldRoot } = createVisualUnit();
        const childrenBefore = worldRoot.children.length;
        const spriteBefore = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        const restX = spriteBefore!.x;
        const restY = spriteBefore!.y;

        unit.playDodgeAnimation(40, -20);
        expect(unit.isDodging()).toBe(true);
        unit.ensureVisual(worldRoot, gridSettings);

        // 250ms sits inside the hold phase (22%..55% of the 640ms dodge) where the envelope is exactly 1.
        await sleep(250);
        unit.ensureVisual(worldRoot, gridSettings);
        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        expect(sprite).toBeDefined();
        expect(sprite!.x).toBeCloseTo(restX + 40, 5);
        expect(sprite!.y).toBeCloseTo(restY - 20, 5);
        expect(sprite!.rotation).not.toBe(0);
        // Afterimage ghosts joined the world root behind the sprite.
        expect(worldRoot.children.length).toBeGreaterThan(childrenBefore);
    });

    test("springs back to rest and cleans up its ghosts after the dodge completes", async () => {
        const { unit, worldRoot } = createVisualUnit();
        const childrenBefore = worldRoot.children.length;
        const spriteBefore = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        const restX = spriteBefore!.x;
        const restY = spriteBefore!.y;

        unit.playDodgeAnimation(40, -20);
        unit.ensureVisual(worldRoot, gridSettings);
        // 640ms dodge + 300ms ghost life, with margin.
        await sleep(1100);
        unit.ensureVisual(worldRoot, gridSettings);

        const sprite = worldRoot.children.find((child) => child.zIndex === 4000 - pos.y);
        expect(sprite!.x).toBeCloseTo(restX, 5);
        expect(sprite!.y).toBeCloseTo(restY, 5);
        expect(sprite!.rotation).toBe(0);
        expect(unit.isDodging()).toBe(false);
        expect(worldRoot.children.length).toBe(childrenBefore);
    });
});

describe("RenderableUnit filter lifecycle", () => {
    test("does not retain scene-leased static battlefield frames across scene replacements", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const makeTexture = () =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
            });
        const firstTexture = makeTexture();
        const secondTexture = makeTexture();
        const first = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => firstTexture);
        first.setPosition(0, 1024);
        first.ensureVisual(new Container(), gridSettings);
        expect((first as unknown as { selectionAnimFrames?: Texture[] }).selectionAnimFrames?.[0]).toBe(firstTexture);
        first.destroyVisuals();

        const second = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => secondTexture);
        second.setPosition(0, 1024);
        second.ensureVisual(new Container(), gridSettings);
        expect((second as unknown as { selectionAnimFrames?: Texture[] }).selectionAnimFrames?.[0]).toBe(secondTexture);
        second.destroyVisuals();

        firstTexture.destroy(true);
        secondTexture.destroy(true);
    });

    test("keeps the installed dodge-filter array stable between animation frames", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512");
        const blur = {};
        const grade = {};
        const installed = [blur, grade];
        const sprite = { filters: installed as object[] | null };
        const internals = unit as unknown as {
            sprite: typeof sprite;
            dodgeBlurFilter: object;
            installDodgeBlur(): void;
            removeDodgeBlur(): void;
        };
        internals.sprite = sprite;
        internals.dodgeBlurFilter = blur;

        internals.installDodgeBlur();
        expect(sprite.filters).toBe(installed);

        internals.removeDodgeBlur();
        expect(sprite.filters).toEqual([grade]);
        const withoutBlur = sprite.filters;
        internals.removeDodgeBlur();
        expect(sprite.filters).toBe(withoutBlur);
    });

    test("destroys a retired motion blur instead of retaining it for the tab lifetime", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512");
        let destroyCalls = 0;
        const filter = { destroy: () => destroyCalls++ };
        const sprite = { filters: [filter] };
        const internals = unit as unknown as {
            sprite: { filters: Array<typeof filter> | null };
            motionBlurFilter: typeof filter;
        };
        internals.sprite = sprite;
        internals.motionBlurFilter = filter;

        unit.setMotionBlur(0);

        expect(destroyCalls).toBe(1);
        expect(sprite.filters).toEqual([]);
        expect(internals.motionBlurFilter).toBeUndefined();
    });

    test("shares one immutable grayscale filter across the revealed opponent roster", () => {
        const first = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        const second = createRenderableUnit(TeamVals.RIGHT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        const root = new Container();
        first.setVisualRevealed(true);
        second.setVisualRevealed(true);
        first.ensureVisual(root, gridSettings);
        second.ensureVisual(root, gridSettings);

        type RevealedInternals = { desaturateFilter?: object };
        expect((first as unknown as RevealedInternals).desaturateFilter).toBe(
            (second as unknown as RevealedInternals).desaturateFilter,
        );
        first.destroyVisuals();
        second.destroyVisuals();
    });

    test("destroys every unit-owned filter without destroying the shared grayscale filter", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512");
        const destroyCalls = [0, 0, 0, 0, 0];
        const filters = destroyCalls.map((_, index) => ({ destroy: () => destroyCalls[index]++ }));
        const internals = unit as unknown as {
            motionBlurFilter?: (typeof filters)[number];
            dodgeBlurFilter?: (typeof filters)[number];
            desaturateFilter?: (typeof filters)[number];
            battlefieldStyleFilter?: (typeof filters)[number];
            silhouetteShadowBlurFilter?: (typeof filters)[number];
        };
        [
            internals.motionBlurFilter,
            internals.dodgeBlurFilter,
            internals.desaturateFilter,
            internals.battlefieldStyleFilter,
            internals.silhouetteShadowBlurFilter,
        ] = filters;

        unit.destroyVisuals();
        unit.destroyVisuals();

        expect(destroyCalls).toEqual([1, 1, 0, 1, 1]);
    });

    test("releases unit-owned filters when the shared battlefield container destroys its sprite", () => {
        const unit = createRenderableUnit(TeamVals.RIGHT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        const destroyCalls = [0, 0, 0, 0];
        const filters = destroyCalls.map((_, index) => ({ destroy: () => destroyCalls[index]++ }));
        const internals = unit as unknown as {
            sprite: { destroy(): void };
            isDestroyed: boolean;
            motionBlurFilter?: (typeof filters)[number];
            dodgeBlurFilter?: (typeof filters)[number];
            battlefieldStyleFilter?: (typeof filters)[number];
            silhouetteShadowBlurFilter?: (typeof filters)[number];
        };
        [
            internals.motionBlurFilter,
            internals.dodgeBlurFilter,
            internals.battlefieldStyleFilter,
            internals.silhouetteShadowBlurFilter,
        ] = filters;

        internals.sprite.destroy();
        unit.destroyVisuals();

        expect(internals.isDestroyed).toBe(true);
        expect(destroyCalls).toEqual([1, 1, 1, 1]);
        world.destroy({ children: true });
    });
});

/**
 * Rectangular footprints (2x1, 1x2 — any WxH). Mounted and long-bodied creatures now ship as 2x1.
 */
describe("rectangular footprints", () => {
    const spriteOf = (unit: RenderableUnit) =>
        (unit as unknown as { sprite?: { scale: { x: number; y: number }; texture: Texture; x: number; y: number } })
            .sprite!;

    const placedUnit = (
        name: string,
        faction: string,
        texture: string,
        position: { x: number; y: number },
    ): RenderableUnit => {
        const unit = createRenderableUnit(TeamVals.LEFT, faction, name, texture, () => Texture.WHITE);
        unit.setPosition(position.x, position.y);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    const withFootprintOverride = <T>(source: string, body: () => T): T => {
        const holder = globalThis as { __hocFootprintOverrides?: string };
        const previous = holder.__hocFootprintOverrides;
        holder.__hocFootprintOverrides = source;
        try {
            return body();
        } finally {
            holder.__hocFootprintOverrides = previous;
        }
    };

    test("carries the declared shape onto the unit itself", () => {
        const wide = withFootprintOverride("White Tiger=2x1", () =>
            createRenderableUnit(TeamVals.LEFT, "Nature", "White Tiger", "white_tiger_512"),
        );
        expect(wide.getFootprintWidth()).toBe(2);
        expect(wide.getFootprintHeight()).toBe(1);
        expect(wide.getCells()).toHaveLength(2);
        // The anchor is the footprint's top-right cell; the body extends towards -x.
        const anchor = wide.getBaseCell();
        expect(
            wide
                .getCells()
                .map((cell) => `${cell.x}:${cell.y}`)
                .sort(),
        ).toEqual([`${anchor.x - 1}:${anchor.y}`, `${anchor.x}:${anchor.y}`].sort());
    });

    test("keeps a two-cell-wide Mantis at its authored visual proportions", () => {
        const position = { x: 384, y: 640 };
        const unit = placedUnit("Mantis", "Nature", "mantis_512", position);
        const sprite = spriteOf(unit);
        const profile = refreshedBoardVisualProfileForUnit("Mantis");
        const perspective = battlefieldCreaturePerspectiveScale(position.y, 1, gridSettings);
        const renderedWidth = sprite.texture.width * Math.abs(sprite.scale.x);
        const renderedHeight = sprite.texture.height * Math.abs(sprite.scale.y);

        expect(unit.getFootprintWidth()).toBe(2);
        const expectedWidth =
            gridSettings.getCellSize() *
            profile.heightCells *
            profile.widthScale *
            BATTLEFIELD_CREATURE_FRAMING.Mantis.scaleX *
            perspective;
        const expectedHeight =
            gridSettings.getCellSize() * profile.heightCells * BATTLEFIELD_CREATURE_FRAMING.Mantis.scaleY * perspective;
        expect(renderedWidth).toBeCloseTo(expectedWidth, 6);
        expect(renderedHeight).toBeCloseTo(expectedHeight, 6);
    });

    test("plants a taller body on its own lower seam instead of floating in the upper cell", () => {
        expect(battlefieldFootLineOffsetCells(1)).toBeCloseTo(BATTLEFIELD_SINGLE_CELL_Y_OFFSET_RATIO, 8);
        expect(battlefieldFootLineOffsetCells(2)).toBeCloseTo(BATTLEFIELD_FOUR_CELL_Y_OFFSET_RATIO, 8);
        // A body two cells tall has its seam a full cell below the centre; a wide-but-short one does not.
        expect(battlefieldFootLineOffsetCells(3)).toBeCloseTo(1.2, 8);
    });

    test("keeps every row-derived quantity keyed on the footprint's height alone", () => {
        const rowPosition = (row: number) =>
            GridMath.getPositionForCell(
                { x: 4, y: row },
                gridSettings.getMinX(),
                gridSettings.getStep(),
                gridSettings.getHalfStep(),
            );
        // Standing on row 13 the furnace rim only softens once the body itself reaches into the top band:
        // a one-row-tall body does not, a two-row-tall one does. Width never enters the question, so a 2x1
        // reads exactly like a 1x1 and a 1x2 exactly like a 2x2.
        const centreOfRow13 = rowPosition(13).y;
        expect(battlefieldCreatureContourOpacity(centreOfRow13, 1, gridSettings)).toBe(1);
        expect(battlefieldCreatureContourOpacity(centreOfRow13 + gridSettings.getHalfStep(), 2, gridSettings)).toBe(
            0.6,
        );
        // The taller body also has one legal row fewer, so it reaches full attenuation sooner.
        expect(battlefieldCreaturePerspectiveScale(rowPosition(15).y, 1, gridSettings)).toBeCloseTo(
            BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
            8,
        );
        expect(battlefieldCreaturePerspectiveScale(rowPosition(15).y, 2, gridSettings)).toBeCloseTo(
            BATTLEFIELD_TOP_ROW_CREATURE_SCALE,
            8,
        );
        expect(battlefieldCreatureShadowProjection(centreOfRow13, 2, gridSettings).lengthScale).not.toBeCloseTo(
            battlefieldCreatureShadowProjection(centreOfRow13, 1, gridSettings).lengthScale,
            8,
        );
    });

    test("marks a revealed opponent's real rectangle rather than a square straddling the seam", () => {
        const wideCells = [
            { x: 12, y: 8 },
            { x: 13, y: 8 },
        ];
        const wideCenter = GridMath.getPositionForCells(gridSettings, wideCells)!;
        const step = gridSettings.getStep();
        expect(revealedOpponentFootprintPoints(wideCenter, 2, 1, gridSettings)).toEqual(
            projectedRectPoints(
                wideCenter.x - step,
                wideCenter.y - step / 2,
                wideCenter.x + step,
                wideCenter.y + step / 2,
                gridSettings,
            ),
        );

        const tallCells = [
            { x: 12, y: 8 },
            { x: 12, y: 9 },
        ];
        const tallCenter = GridMath.getPositionForCells(gridSettings, tallCells)!;
        expect(revealedOpponentFootprintPoints(tallCenter, 1, 2, gridSettings)).toEqual(
            projectedRectPoints(
                tallCenter.x - step / 2,
                tallCenter.y - step,
                tallCenter.x + step / 2,
                tallCenter.y + step,
                gridSettings,
            ),
        );
    });

    test("bands an attack from the rows a rectangular body really occupies", () => {
        const wideAttacker = [
            { x: 4, y: 6 },
            { x: 5, y: 6 },
        ];
        // Directly to the side of the right-hand cell: same row, so the side strike.
        expect(attackAnimationVerticalBandForFootprints(wideAttacker, [{ x: 6, y: 6 }])).toBe("side");
        // A target one row up is reached with the upward strike even though it is beyond the wide body's
        // left cell — only the row RANGES are compared.
        expect(attackAnimationVerticalBandForFootprints(wideAttacker, [{ x: 3, y: 7 }])).toBe("up");
        expect(attackAnimationVerticalBandForFootprints(wideAttacker, [{ x: 5, y: 5 }])).toBe("down");

        const tallAttacker = [
            { x: 4, y: 6 },
            { x: 4, y: 7 },
        ];
        // Both of a two-row body's rows are valid side-attack rows.
        expect(attackAnimationVerticalBandForFootprints(tallAttacker, [{ x: 5, y: 6 }])).toBe("side");
        expect(attackAnimationVerticalBandForFootprints(tallAttacker, [{ x: 5, y: 7 }])).toBe("side");
        expect(attackAnimationVerticalBandForFootprints(tallAttacker, [{ x: 5, y: 8 }])).toBe("up");
    });

    test("leaves the approved enlargement to the square footprints it was art-directed for", () => {
        expect(battlefieldCreatureScaleMultiplier("Black Dragon", 2, 2)).toBeCloseTo(1.32);
        expect(battlefieldCreatureScaleMultiplier("White Tiger", 2, 1)).toBe(1);
        expect(battlefieldCreatureScaleMultiplier("White Tiger", 1, 2)).toBe(1);
    });
});
