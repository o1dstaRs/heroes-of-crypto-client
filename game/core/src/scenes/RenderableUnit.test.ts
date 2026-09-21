import { trollAttackBodyScale } from "./TrollLabAttackVisuals";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as leprechaunVisuals from "./LeprechaunLabWalkVisuals";
import * as mageIdleFire from "./WanderingMageIdleFire";
import { BattleMageIdleFilter } from "./BattleMageLabIdleVisuals";
import { ElfIdleCapeFilter } from "./ElfIdleCape";
import { BattleMageReactionFilter } from "./BattleMageLabReactions";
import { PikemanIdleFilter } from "./PikemanLabIdleVisuals";
import { PIKEMAN_IDLE_PERIOD_MS, PIKEMAN_IDLE_START_HOLD_MS, PIKEMAN_IDLE_MOTION_MS } from "./PikemanLabIdleMotion";

import { BufferImageSource, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { blacksmithWalkColorFilter } from "./BlacksmithWalkColorFilter";
import { healerLabWalkPalette } from "./HealerLabWalkPalette";
import { scavengerHitRegisteredSoles, SCAVENGER_IDLE_SOLES } from "./ScavengerHitRegistration";

import {
    AbilityFactory,
    AttackVals,
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
    SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO,
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
import { images } from "../generated/image_imports";
import { ArbalesterIdlePager, ArbalesterIdlePagePool, arbalesterIdlePages } from "./ArbalesterIdlePager";

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
import { SquireIdlePlumeFilter } from "./SquireIdlePlume";
const assetTest = test;

// A Squire also wears the idle plume filter. Contour assertions are about the contour alone, so the
// plume is filtered out rather than counted — and its position in the array is not a contract.
const contourFiltersOf = (sprite?: { filters?: unknown[] | null } | null): unknown[] =>
    ((sprite?.filters ?? []) as unknown[]).filter((filter) => !(filter instanceof SquireIdlePlumeFilter));

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

// Legacy/freeze coverage opts out; LevelOneAnimationRuntime.test.ts covers the default approved package.
beforeEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = false;
    document.cookie ??= "";
    // Exercise authored playback in its dedicated tests. Production keeps the master switch off; the
    // frozen-state test below explicitly returns to that temporary runtime mode.
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = true;
    COMMON_IDLE_BREATH_SETTINGS.enabled = false;
});

afterEach(() => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
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

describe("all-level generic whole-sprite motion gate", () => {
    test("disables shared movement/combat overlays for every creature level", () => {
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(1)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(2)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(3)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(4)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Squire", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Troglodyte", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Satyr", 2)).toBe(false);
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
        expect(contourFiltersOf(internals.sprite)).toHaveLength(1);
        expect(internals.silhouetteShadow?.texture).toBe(internals.sprite?.texture);
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
        const [regularContour] = contourFiltersOf(sprite());
        expect(contourFiltersOf(sprite())).toHaveLength(1);

        unit.setPosition(right.x, right.y);
        unit.ensureVisual(world, gridSettings);
        const [softenedContour] = contourFiltersOf(sprite());
        expect(contourFiltersOf(sprite())).toHaveLength(1);
        expect(softenedContour).not.toBe(regularContour);

        unit.setPosition(left.x, left.y);
        unit.ensureVisual(world, gridSettings);
        expect(contourFiltersOf(sprite())).toHaveLength(1);
        expect(contourFiltersOf(sprite())[0]).toBe(regularContour);
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
        expect(creatureOneShotAnimationEnabledForUnit("Squire", "hit")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Squire", "attack")).toBe(true);
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
        const expectedY = tallBoardModelFootLineY(1024, gridSettings.getCellSize());

        for (const [name, texture, actionStates] of cases) {
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
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "cast")).toBe(1);
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "attack")).toBe(0.5);
    expect(oneShotAnimationDurationMultiplier("Wandering Mage", "death")).toBeCloseTo(0.5 / 1.15);
});

test("keeps Wandering Mage cast and attack poses at its idle visual height", () => {
    expect(ashMothActionScaleMultiplier("cast", 0)).toBe(1);
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

    test("uses the current animation pose for every creature shadow", () => {
        const editorIdleFrame = { id: "editor-idle" };
        const combatFrame = { id: "combat" };

        for (const unitName of Object.keys(BATTLEFIELD_SHADOW_TUNING_BY_CREATURE)) {
            expect(battlefieldShadowSourceForUnit(unitName, editorIdleFrame, combatFrame)).toBe(combatFrame);
        }
    });

    test("updates a live shadow across differently sized poses without moving its floor attachment", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
        const world = new Container();
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);
        const internals = unit as unknown as {
            sprite: Sprite;
            silhouetteShadow: Sprite;
            oneShotAnim: { stateName: string; footAnchorY: number; frameIndex: number };
        };
        const pose = (width: number, height: number) =>
            new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(width * height * 4), width, height }),
            });
        const first = pose(64, 128);
        const second = pose(128, 256);
        internals.oneShotAnim = { stateName: "hit", footAnchorY: 0.8, frameIndex: 0 };
        internals.sprite.texture = first;
        unit.ensureVisual(world, gridSettings);
        expect(internals.silhouetteShadow.texture).toBe(first);
        expect(internals.silhouetteShadow.anchor.y).toBe(0.8);
        const attachment = { x: internals.silhouetteShadow.x, y: internals.silhouetteShadow.y };
        const firstScale = internals.silhouetteShadow.scale.y;
        internals.sprite.texture = second;
        internals.oneShotAnim.footAnchorY = 0.9;
        unit.ensureVisual(world, gridSettings);
        expect(internals.silhouetteShadow.texture).toBe(second);
        expect(internals.silhouetteShadow.anchor.y).toBe(0.9);
        expect(internals.silhouetteShadow.scale.y).toBeCloseTo(firstScale / 2);
        expect(internals.silhouetteShadow.x).toBeCloseTo(attachment.x);
        expect(internals.silhouetteShadow.y).toBeCloseTo(attachment.y);
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

    // Complete turn-in once, then run a full spatial gait before the turn-back.
    unit.stepSpawnAnimation(0.051);
    for (let index = 0; index <= 7; index++) {
        unit.setBoardWalkDistanceCells((index * 1.3) / 7);
        expect(internals.walkAnim?.frameIndex).toBe(1 + (index % 7));
    }
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(internals.walkAnim?.frameIndex).toBe(8);
    expect(internals.sprite?.texture).toBe(internals.walkAnim?.frames[8]);

    unit.stepSpawnAnimation(0.051);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("plays all three Wolf Rider bites with authored timing and returns to the matching idle", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const action of ["attack", "attack_up", "attack_down"]) {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const keys: string[] = [];
            const unit = createRenderableUnit(team, "Might", "Wolf Rider", "wolf_rider_512", (name) => {
                keys.push(name);
                return Texture.WHITE;
            });
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            const state = unit as unknown as {
                sprite: Sprite;
                oneShotAnim?: { frames: Texture[]; frameIndex: number; frameDurationsMs?: readonly number[] };
                selectionAnimFrames: Texture[];
            };
            const height = state.sprite.height;
            let completed = 0;
            expect(creatureOneShotAnimationEnabledForUnit("Wolf Rider", action)).toBe(true);
            expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
            expect(keys).toContain(`wolf_rider_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frames).toHaveLength(8);
            expect(state.oneShotAnim?.frameDurationsMs).toEqual([17.5, 20, 22.5, 27.5, 32.5, 27.5, 32.5, 30]);
            expect(state.sprite.height).toBeCloseTo(height);
            expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
            unit.stepOneShotAnimation(17.5);
            expect(state.oneShotAnim?.frameIndex).toBe(1);
            unit.stepOneShotAnimation(191.5);
            expect(completed).toBe(0);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            unit.stepOneShotAnimation(1);
            expect(completed).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.selectionAnimFrames).toContain(state.sprite.texture);
            unit.stepOneShotAnimation(1000);
            expect(completed).toBe(1);
        }
    }
});

assetTest("plays Wolf Rider hit and death with authored timing and a stable canvas", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const preview of [false, true]) {
        for (const action of ["hit", "death"]) {
            const keys: string[] = [];
            const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Wolf Rider", "wolf_rider_512", (name) => {
                keys.push(name);
                return Texture.WHITE;
            });
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            const state = unit as unknown as {
                sprite: Sprite;
                oneShotAnim?: { frames: Texture[]; frameIndex: number; frameDurationsMs?: readonly number[] };
                selectionAnimFrames: Texture[];
            };
            const height = state.sprite.height;
            let completed = 0;
            expect(creatureOneShotAnimationEnabledForUnit("Wolf Rider", action)).toBe(true);
            expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
            expect(keys).toContain(`wolf_rider_${action}_atlas_quarter`);
            const durations =
                action === "hit" ? [12.5, 17.5, 22.5, 27.5, 20, 17.5, 15, 17.5] : [17.5, 25, 30, 37.5, 30, 25, 35, 65];
            expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
            expect(state.sprite.height).toBeCloseTo(height);
            expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
            unit.stepOneShotAnimation(durations[0]);
            expect(state.oneShotAnim?.frameIndex).toBe(1);
            const total = durations.reduce((sum, duration) => sum + duration, 0);
            unit.stepOneShotAnimation(total - durations[0] - 1);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            expect(completed).toBe(0);
            unit.stepOneShotAnimation(1);
            expect(completed).toBe(1);
            if (preview && action === "death") {
                expect(state.oneShotAnim?.frameIndex).toBe(7);
                expect(state.oneShotAnim?.frames[7]).toBe(state.sprite.texture);
            } else {
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.selectionAnimFrames).toContain(state.sprite.texture);
            }
            unit.stepOneShotAnimation(2000);
            expect(completed).toBe(1);
        }
    }
    expect(creatureOneShotAnimationEnabledForUnit("Wolf Rider", "cast")).toBe(false);
});

assetTest("plays Troglodyte hit and death at authored timing and resumes the cloth idle without a size jump", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const preview of [false, true]) {
            for (const action of ["hit", "death"]) {
                const resolved: string[] = [];
                const unit = createRenderableUnit(team, "Chaos", "Troglodyte", "troglodyte_512", (key) => {
                    resolved.push(key);
                    return Texture.WHITE;
                });
                const world = new Container();
                unit.setPosition(0, 1024);
                unit.setBattlefieldVisualProjection(true);
                unit.ensureVisual(world, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    oneShotAnim?: { frames: Texture[]; frameIndex: number; frameDurationsMs?: readonly number[] };
                    selectionAnimFrames: Texture[];
                    troglodyteIdleResumeAtMs: number;
                };
                const scaleX = state.sprite.scale.x;
                const scaleY = state.sprite.scale.y;
                let completed = 0;
                expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", action)).toBe(true);
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(resolved).toContain(`troglodyte_${action}_atlas_quarter`);
                // Both reactions run another 15% faster while retaining their earlier speed adjustments.
                const durations = (
                    action === "hit" ? [15, 20, 25, 40, 30, 35, 25] : [20, 30, 40, 45, 45, 40, 50, 100]
                ).map((duration) => duration / 1.3 / (action === "hit" ? 1.4 : 1) / 1.15);
                expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
                expect(state.oneShotAnim?.frames).toHaveLength(durations.length);
                for (let frame = 0; frame < durations.length; frame++) {
                    unit.ensureVisual(world, gridSettings);
                    expect(state.oneShotAnim?.frameIndex).toBe(frame);
                    expect(state.sprite.scale.x).toBeCloseTo(scaleX);
                    expect(state.sprite.scale.y).toBeCloseTo(scaleY);
                    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                    unit.stepOneShotAnimation(durations[frame] - 1);
                    expect(state.oneShotAnim?.frameIndex).toBe(frame);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(1);
                }
                expect(completed).toBe(1);
                if (preview && action === "death") {
                    expect(state.oneShotAnim?.frameIndex).toBe(7);
                    const corpse = state.sprite.texture;
                    unit.stepOneShotAnimation(10_000);
                    expect(state.sprite.texture).toBe(corpse);
                    expect(completed).toBe(1);
                    unit.returnToIdleAnimation();
                } else {
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                }
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                unit.stepSelectionAnimation(state.troglodyteIdleResumeAtMs + 80);
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[1]);
                expect(state.sprite.scale.x).toBeCloseTo(scaleX);
                expect(state.sprite.scale.y).toBeCloseTo(scaleY);
                unit.stepOneShotAnimation(1000);
                expect(completed).toBe(1);
            }
        }
    }
    expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "attack")).toBe(true);
});

assetTest("plays all Troglodyte attacks with authored timing, stable padded canvas and seamless idle return", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const durations = [40, 55, 65, 35, 45, 55, 70, 35];
    for (const action of ["attack", "attack_up", "attack_down"]) {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const resolved: string[] = [];
                const unit = createRenderableUnit(team, "Chaos", "Troglodyte", "troglodyte_512", (key) => {
                    resolved.push(key);
                    return Texture.WHITE;
                });
                const world = new Container();
                unit.setPosition(0, 1024);
                unit.setBattlefieldVisualProjection(true);
                unit.ensureVisual(world, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    oneShotAnim?: { frames: Texture[]; frameIndex: number; frameDurationsMs?: readonly number[] };
                    selectionAnimFrames: Texture[];
                    troglodyteIdleResumeAtMs: number;
                };
                const idleScale = { x: state.sprite.scale.x, y: state.sprite.scale.y };
                let completed = 0;
                expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", action)).toBe(true);
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(resolved).toContain(`troglodyte_${action}_atlas_quarter`);
                expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
                expect(state.oneShotAnim?.frames).toHaveLength(8);
                const targetY = action === "attack_up" ? 2048 : action === "attack_down" ? 0 : 1024;
                expect(unit.getAttackAnimationStateForTarget({ x: 100, y: targetY }, "melee")).toBe(action);
                // Padding changes texture size and anchor together; the toe stays on the same ground plane.
                expect(state.sprite.scale.x).toBeCloseTo(idleScale.x, 6);
                expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                expect((1143 / 4 - state.sprite.anchor.y * 320) * state.sprite.scale.y).toBeCloseTo(
                    (759 / 4 - (730 / 768) * 192) * idleScale.y,
                    6,
                );
                for (let frame = 0; frame < durations.length; frame++) {
                    unit.ensureVisual(world, gridSettings);
                    expect(state.oneShotAnim?.frameIndex).toBe(frame);
                    expect(state.sprite.scale.x).toBeCloseTo(idleScale.x, 6);
                    expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                    expect(state.sprite.anchor.y).toBeCloseTo(1114 / 1280, 6);
                    unit.stepOneShotAnimation(durations[frame] - 1);
                    expect(state.oneShotAnim?.frameIndex).toBe(frame);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(1);
                }
                expect(completed).toBe(1);
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                expect(state.sprite.scale.x).toBeCloseTo(idleScale.x, 6);
                expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                unit.stepSelectionAnimation(state.troglodyteIdleResumeAtMs + 80);
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[1]);
                unit.playOneShotAnimation(action, undefined, true);
                unit.stepOneShotAnimation(200);
                unit.returnToIdleAnimation();
                expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                unit.playOneShotAnimation(action, undefined, true);
                unit.playOneShotAnimation("hit", undefined, true);
                expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
            }
        }
    }
    expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "cast")).toBe(false);
});

assetTest("Troglodyte attacks use 400 real milliseconds in the fixed simulation loop", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troglodyte", "troglodyte_512", () => Texture.WHITE);
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    let completed = 0;
    unit.playOneShotAnimation("attack", () => completed++);
    for (let tick = 0; tick < 23; tick++) unit.stepSpawnAnimation(1 / 240);
    expect(completed).toBe(0);
    for (let tick = 0; tick < 2; tick++) unit.stepSpawnAnimation(1 / 240);
    expect(completed).toBe(1);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
});

assetTest("plays Wolf Rider tail wag between idle flourishes without changing canvas scale", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Wolf Rider", "wolf_rider_512", (name) => {
        keys.push(name);
        return Texture.WHITE;
    });
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const idle = unit as unknown as {
        sprite: { texture: Texture; scale: { x: number; y: number } };
        selectionAnimFrames: Texture[];
        selectionAnimFrameDurationsMs: number[];
        selectionAnimFootAnchorY: number;
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };
    expect(creatureIdleAnimationEnabledForUnit("Wolf Rider")).toBe(true);
    expect(keys).toContain("wolf_rider_idle_atlas_quarter");
    expect(idle.selectionAnimFrames).toHaveLength(80);
    expect(idle.selectionAnimFootAnchorY).toBe(730 / 768);
    const started = idle.selectionAnimationStartedAtMs;
    const initialScale = [idle.sprite.scale.x, idle.sprite.scale.y];
    const tailFrameMs = 2800 / 72 / 0.9;
    const tailDurationMs = 2800 / 0.9;
    expect(idle.selectionAnimFrameDurationsMs[0]).toBeCloseTo(tailFrameMs);
    expect(idle.selectionAnimFrameDurationsMs.slice(72)).toEqual([100, 120, 120, 120, 240, 120, 120, 100]);
    unit.stepSelectionAnimation(started + tailFrameMs - 1);
    expect(idle.selectionAnimFrameIndex).toBe(0);
    unit.stepSelectionAnimation(started + tailFrameMs + 1);
    expect(idle.selectionAnimFrameIndex).toBe(1);
    unit.stepSelectionAnimation(started + tailDurationMs / 2 + 1);
    expect(idle.selectionAnimFrameIndex).toBe(36);
    unit.stepSelectionAnimation(started + tailDurationMs - 1);
    expect(idle.selectionAnimFrameIndex).toBe(71);
    unit.stepSelectionAnimation(started + tailDurationMs + 1);
    expect(idle.selectionAnimFrameIndex).toBe(72);
    unit.stepSelectionAnimation(started + tailDurationMs + 461);
    expect(idle.selectionAnimFrameIndex).toBe(76);
    expect(idle.sprite.texture).toBe(idle.selectionAnimFrames[76]);
    expect([idle.sprite.scale.x, idle.sprite.scale.y]).toEqual(initialScale);
    unit.stepSelectionAnimation(started + tailDurationMs + 1041);
    expect(idle.selectionAnimFrameIndex).toBe(0);
    unit.startBoardWalkAnimation(1);
    unit.stepSelectionAnimation(started + tailDurationMs + 461);
    expect(idle.sprite.texture).not.toBe(idle.selectionAnimFrames[76]);
});

assetTest("plays Wolf howl idle with the static figure canvas and foot anchor while animations are frozen", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const resolvedKeys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", (name) => {
        resolvedKeys.push(name);
        return Texture.WHITE;
    });
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const internals = unit as unknown as {
        selectionAnimFrames: Texture[];
        selectionAnimFrameDurationsMs: number[];
        selectionAnimFootAnchorY: number;
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };
    expect(creatureIdleAnimationEnabledForUnit("Wolf")).toBe(true);
    expect(resolvedKeys).toContain("wolf_idle_atlas_half");
    expect(internals.selectionAnimFrames).toHaveLength(31);
    expect(internals.selectionAnimFrames[0].width).toBe(768);
    expect(internals.selectionAnimFrames[0].height).toBe(768);
    expect(internals.selectionAnimFootAnchorY).toBe(730 / 768);
    const durations = internals.selectionAnimFrameDurationsMs;
    const cycleMs = durations.reduce((sum, duration) => sum + duration, 0);
    expect(cycleMs).toBeCloseTo(6330 / 1.3);
    const startedAt = internals.selectionAnimationStartedAtMs;
    unit.stepSelectionAnimation(startedAt);
    expect(internals.selectionAnimFrameIndex).toBe(0);
    unit.stepSelectionAnimation(startedAt + durations.slice(0, 6).reduce((sum, duration) => sum + duration, 0));
    expect(internals.selectionAnimFrameIndex).toBe(6);
    unit.stepSelectionAnimation(startedAt + cycleMs - 1);
    expect(internals.selectionAnimFrameIndex).toBe(30);
});

assetTest("keeps Wolf's opaque shadow and figure scale through every howl and tail frame", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.setBattlefieldVisualProjection(true);
    unit.ensureVisual(world, gridSettings);
    const idle = unit as unknown as {
        selectionAnimFrames: Texture[];
        selectionAnimFrameDurationsMs: number[];
        selectionAnimationStartedAtMs: number;
        sprite: Sprite;
        silhouetteShadow: Sprite;
        silhouetteShadowSegments: Sprite[];
    };
    const baseline = idle.selectionAnimFrames[0];
    const scale = { x: idle.sprite.scale.x, y: idle.sprite.scale.y };
    let elapsed = 0;
    for (const duration of idle.selectionAnimFrameDurationsMs) {
        idle.selectionAnimationStartedAtMs = performance.now() - elapsed - duration / 2;
        unit.ensureVisual(world, gridSettings);
        expect(idle.sprite.texture).toBe(baseline);
        expect(idle.sprite.children).toHaveLength(0);
        expect(idle.sprite.scale.x).toBeCloseTo(scale.x);
        expect(idle.sprite.scale.y).toBeCloseTo(scale.y);
        expect(idle.silhouetteShadow.texture).toBe(baseline);
        expect([idle.silhouetteShadow, ...idle.silhouetteShadowSegments].some((s) => s.visible && s.alpha > 0)).toBe(
            true,
        );
        elapsed += duration;
    }
});

assetTest("fits the approved ten-frame Wolf walk into exactly 1.3 travelled cells", () => {
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
    unit.setBoardWalkDistanceCells(0.13);
    expect(internals.walkAnim?.frameIndex).toBe(1);
    unit.setBoardWalkDistanceCells(1.17);
    expect(internals.walkAnim?.frameIndex).toBe(9);
    unit.setBoardWalkDistanceCells(1.3);
    expect(internals.walkAnim?.frameIndex).toBe(0);
    expect(internals.walkAnim?.completedCycles).toBe(1);
});

assetTest("matches Wolf reaction anatomy to idle while keeping the feet and shadow planted", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    expect(creatureOneShotAnimationEnabledForUnit("Wolf", "cast")).toBe(false);
    for (const action of ["hit", "death"] as const) {
        const meta = animationAtlases.Wolf[action];
        const durations = meta.frameDurationsMs!.map((duration) => duration / (action === "death" ? 1.12 : 1));
        expect(durations).toHaveLength(meta.frameCount);
        expect(meta.frameWidth / 2).toBe(768);
        expect(meta.frameHeight / 2).toBe(768);
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const keys: string[] = [];
                const unit = createRenderableUnit(team, "Nature", "Wolf", "wolf_512", (key) => {
                    keys.push(key);
                    return Texture.WHITE;
                });
                const world = new Container();
                unit.setPosition(0, 1024);
                unit.setBattlefieldVisualProjection(true);
                unit.ensureVisual(world, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    silhouetteShadow: Sprite;
                    silhouetteShadowSegments: Sprite[];
                    selectionAnimFrames: Texture[];
                    oneShotAnim?: {
                        frameIndex: number;
                        frames: Texture[];
                        frameDurationsMs?: readonly number[];
                        authoredRealTime?: boolean;
                    };
                };
                const base = state.selectionAnimFrames[0];
                const scale = [state.sprite.scale.x, state.sprite.scale.y];
                const shadowScale = [state.silhouetteShadow.scale.x, state.silhouetteShadow.scale.y];
                const assertRegistration = (factor: number) => {
                    expect(state.sprite.scale.x).toBeCloseTo(scale[0] * factor, 6);
                    expect(state.sprite.scale.y).toBeCloseTo(scale[1] * factor, 6);
                    expect(state.sprite.anchor.x).toBe(0.5);
                    expect((697 - state.sprite.anchor.y * 768) * state.sprite.scale.y).toBeCloseTo(
                        (697 - 730) * scale[1],
                        6,
                    );
                    expect(state.silhouetteShadow.anchor.y).toBeCloseTo(state.sprite.anchor.y, 8);
                    expect(state.silhouetteShadow.scale.x).toBeCloseTo(shadowScale[0] * factor, 6);
                    expect(state.silhouetteShadow.scale.y).toBeCloseTo(shadowScale[1] * factor, 6);
                    expect((697 - state.silhouetteShadow.anchor.y * 768) * state.silhouetteShadow.scale.y).toBeCloseTo(
                        (697 - 730) * shadowScale[1],
                        6,
                    );
                    for (const segment of state.silhouetteShadowSegments) {
                        expect(segment.anchor.y).toBeCloseTo(state.sprite.anchor.y, 8);
                        expect(segment.scale.x).toBeCloseTo(shadowScale[0] * factor, 6);
                    }
                };
                let completed = 0;
                expect(creatureOneShotAnimationEnabledForUnit("Wolf", action)).toBe(true);
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(keys).toContain(`wolf_${action}_atlas_half`);
                const animation = state.oneShotAnim!;
                expect(animation.frameDurationsMs).toEqual(durations);
                expect(animation.authoredRealTime).toBe(true);
                expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
                expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
                for (let frame = 0; frame < durations.length; frame++) {
                    const factor = frame < 2 || (action === "hit" && frame >= 7) ? 1 : frame === 7 ? 1.1 : 1.115;
                    // A frame tick must update registration before layout or the next render can run.
                    assertRegistration(factor);
                    expect(state.silhouetteShadow.texture).toBe(animation.frames[frame]);
                    unit.ensureVisual(world, gridSettings);
                    unit.ensureVisual(world, gridSettings);
                    expect(animation.frameIndex).toBe(frame);
                    expect(state.sprite.texture).toBe(animation.frames[frame]);
                    assertRegistration(factor);
                    expect(state.silhouetteShadow.texture).toBe(animation.frames[frame]);
                    expect(
                        [state.silhouetteShadow, ...state.silhouetteShadowSegments].some(
                            (shadow) => shadow.visible && shadow.alpha > 0,
                        ),
                    ).toBe(true);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(durations[frame]);
                }
                expect(completed).toBe(1);
                if (action === "death") {
                    assertRegistration(1.1);
                    expect(state.sprite.texture).toBe(animation.frames.at(-1)!);
                    unit.applyHitReaction(20, 0);
                    unit.stepOneShotAnimation(5000);
                    expect(state.sprite.texture).toBe(animation.frames.at(-1)!);
                    assertRegistration(1.1);
                } else {
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                    expect(state.sprite.texture).toBe(base);
                    assertRegistration(1);
                }
                expect(completed).toBe(1);
                unit.returnToIdleAnimation();
                expect(state.sprite.texture).toBe(base);
                assertRegistration(1);
            }
        }
    }
});

assetTest("uses the Wolf reaction's real duration through the legacy simulation clock", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const action of ["hit", "death"] as const) {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const sourceDuration = animationAtlases.Wolf[action].frameDurationsMs!.reduce(
            (sum, duration) => sum + duration,
            0,
        );
        const totalMs = sourceDuration / (action === "death" ? 1.12 : 1);
        expect(totalMs).toBeCloseTo(action === "death" ? 848.2142857142857 : 420, 8);
        let completed = 0;
        unit.playOneShotAnimation(action, () => completed++);
        const realFrameMs = 1000 / 60;
        const completeTicks = Math.ceil(totalMs / realFrameMs);
        for (let tick = 0; tick < completeTicks - 1; tick++) {
            unit.stepSpawnAnimation(1 / 240);
            expect(completed).toBe(0);
        }
        unit.stepSpawnAnimation(1 / 240 + 1e-9);
        expect(completed).toBe(1);
    }
});

assetTest("restores Wolf reaction registration on interruption and on a jump to the held corpse", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const hitDurations = animationAtlases.Wolf.hit.frameDurationsMs!;
    const deathDurations = animationAtlases.Wolf.death.frameDurationsMs!.map((duration) => duration / 1.12);
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            silhouetteShadow: Sprite;
            selectionAnimFrames: Texture[];
            oneShotAnim?: { frameIndex: number; frames: Texture[] };
            wolfRenderedCanvasHeight: number;
        };
        const baseScale = [state.sprite.scale.x, state.sprite.scale.y];
        const shadowScaleY = state.silhouetteShadow.scale.y;
        const assertScale = (factor: number) => {
            expect(state.sprite.scale.x).toBeCloseTo(baseScale[0] * factor, 6);
            expect(state.sprite.scale.y).toBeCloseTo(baseScale[1] * factor, 6);
            expect(state.silhouetteShadow.scale.y).toBeCloseTo(shadowScaleY * factor, 6);
            expect((697 - state.sprite.anchor.y * 768) * state.sprite.scale.y).toBeCloseTo(-33 * baseScale[1], 6);
            expect(state.silhouetteShadow.anchor.y).toBeCloseTo(state.sprite.anchor.y, 8);
            // Canvas-height bookkeeping tracks resolution, not the per-pose geometric correction.
            expect(state.wolfRenderedCanvasHeight).toBe(768);
        };
        for (const runLayoutBeforeInterruption of [false, true]) {
            expect(unit.playOneShotAnimation("hit")).toBe(true);
            unit.stepOneShotAnimation(hitDurations[0] + hitDurations[1] - 1);
            expect(state.oneShotAnim?.frameIndex).toBe(1);
            assertScale(1);
            unit.stepOneShotAnimation(1);
            expect(state.oneShotAnim?.frameIndex).toBe(2);
            assertScale(1.115);
            if (runLayoutBeforeInterruption) unit.ensureVisual(world, gridSettings);
            expect(unit.playOneShotAnimation("death")).toBe(true);
            assertScale(1);
            unit.stepOneShotAnimation(deathDurations.reduce((sum, duration) => sum + duration, 0) + 5000);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            expect(state.silhouetteShadow.texture).toBe(state.sprite.texture);
            assertScale(1.1);
            unit.ensureVisual(world, gridSettings);
            assertScale(1.1);
            expect(unit.playOneShotAnimation("hit")).toBe(true);
            assertScale(1);
            unit.stepOneShotAnimation(hitDurations.reduce((sum, duration) => sum + duration, 0) + 1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
            assertScale(1);
            unit.playOneShotAnimation("hit");
            unit.stepOneShotAnimation(hitDurations[0] + hitDurations[1]);
            assertScale(1.115);
            unit.returnToIdleAnimation();
            expect(state.silhouetteShadow.texture).toBe(state.selectionAnimFrames[0]);
            assertScale(1);
        }
    }
});

assetTest("plays all three Wolf attacks on their authored clock with stable size and shadow", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const durations = [30, 50, 55, 50, 60, 55, 65, 65, 40];
    for (const action of ["attack", "attack_up", "attack_down"] as const) {
        const meta = animationAtlases.Wolf[action];
        expect(meta.frameDurationsMs).toEqual(durations);
        expect(meta.frameCount).toBe(9);
        expect(meta.frameWidth / 2).toBe(1024);
        expect(meta.frameHeight / 2).toBe(1024);
        expect(meta.footAnchorY).toBeCloseTo(858 / 1024, 10);
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const resolved: string[] = [];
                const unit = createRenderableUnit(team, "Nature", "Wolf", "wolf_512", (key) => {
                    resolved.push(key);
                    return Texture.WHITE;
                });
                const world = new Container();
                unit.setPosition(0, 1024);
                unit.setBattlefieldVisualProjection(true);
                unit.ensureVisual(world, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    silhouetteShadow: Sprite;
                    silhouetteShadowSegments: Sprite[];
                    selectionAnimFrames: Texture[];
                    wolfRenderedCanvasHeight: number;
                    oneShotAnim?: {
                        frames: Texture[];
                        frameIndex: number;
                        frameDurationsMs?: readonly number[];
                        authoredRealTime?: boolean;
                    };
                };
                const baseScale = [state.sprite.scale.x, state.sprite.scale.y];
                const shadowScale = [state.silhouetteShadow.scale.x, state.silhouetteShadow.scale.y];
                const assertRegistration = (attack = true) => {
                    const frameSize = attack ? 1024 : 768;
                    const padding = attack ? 128 : 0;
                    const floor = 697 + padding;
                    expect(state.sprite.scale.x).toBeCloseTo(baseScale[0], 6);
                    expect(state.sprite.scale.y).toBeCloseTo(baseScale[1], 6);
                    expect(state.sprite.texture.width).toBe(frameSize);
                    expect(state.sprite.texture.height).toBe(frameSize);
                    expect(state.sprite.anchor.x).toBe(0.5);
                    expect(state.sprite.anchor.y).toBeCloseTo((730 + padding) / frameSize, 8);
                    expect(state.wolfRenderedCanvasHeight).toBe(768);
                    expect((floor - state.sprite.anchor.y * frameSize) * state.sprite.scale.y).toBeCloseTo(
                        -33 * baseScale[1],
                        8,
                    );
                    // Canonical eye pixel and floor remain at the same world-space offsets despite padding.
                    expect((651 + padding - state.sprite.anchor.x * frameSize) * state.sprite.scale.x).toBeCloseTo(
                        (651 - 384) * baseScale[0],
                        8,
                    );
                    expect((258 + padding - state.sprite.anchor.y * frameSize) * state.sprite.scale.y).toBeCloseTo(
                        (258 - 730) * baseScale[1],
                        8,
                    );
                    expect(state.silhouetteShadow.anchor.y).toBeCloseTo(state.sprite.anchor.y, 8);
                    expect(state.silhouetteShadow.scale.x).toBeCloseTo(shadowScale[0], 6);
                    expect(state.silhouetteShadow.scale.y).toBeCloseTo(shadowScale[1], 6);
                    expect(
                        (floor - state.silhouetteShadow.anchor.y * frameSize) * state.silhouetteShadow.scale.y,
                    ).toBeCloseTo(-33 * shadowScale[1], 8);
                    expect(
                        (state.sprite.filters ?? []).some((filter) => filter.constructor.name === "WolfReactionFilter"),
                    ).toBe(false);
                };
                const targetY = action === "attack_up" ? 2048 : action === "attack_down" ? 0 : 1024;
                expect(unit.getAttackAnimationStateForTarget({ x: 100, y: targetY }, "melee")).toBe(action);
                expect(creatureOneShotAnimationEnabledForUnit("Wolf", action)).toBe(true);
                // Interrupt a scaled damage pose: neither its size nor its palette may leak into the attack.
                unit.playOneShotAnimation("hit");
                unit.stepOneShotAnimation(64);
                let completed = 0;
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(resolved).toContain(`wolf_${action}_atlas_half`);
                const animation = state.oneShotAnim!;
                expect(animation.frameDurationsMs).toEqual(durations);
                expect(animation.authoredRealTime).toBe(true);
                for (let frame = 0; frame < durations.length; frame++) {
                    assertRegistration();
                    expect(state.silhouetteShadow.texture).toBe(animation.frames[frame]);
                    unit.ensureVisual(world, gridSettings);
                    unit.ensureVisual(world, gridSettings);
                    assertRegistration();
                    expect(animation.frameIndex).toBe(frame);
                    expect(state.sprite.texture).toBe(animation.frames[frame]);
                    expect(
                        [state.silhouetteShadow, ...state.silhouetteShadowSegments].some(
                            (shadow) => shadow.visible && shadow.alpha > 0,
                        ),
                    ).toBe(true);
                    unit.stepOneShotAnimation(durations[frame] - 1);
                    expect(animation.frameIndex).toBe(frame);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(1);
                }
                expect(completed).toBe(1);
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                expect(state.silhouetteShadow.texture).toBe(state.selectionAnimFrames[0]);
                assertRegistration(false);
                unit.playOneShotAnimation(action);
                unit.stepOneShotAnimation(185);
                expect(state.oneShotAnim?.frameIndex).toBe(4);
                unit.playOneShotAnimation("death");
                unit.stepOneShotAnimation(2000);
                unit.playOneShotAnimation(action);
                assertRegistration();
                unit.returnToIdleAnimation();
                assertRegistration(false);
            }
        }
    }
});

assetTest("uses 470 real milliseconds for Wolf attacks through the fixed simulation clock", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const action of ["attack", "attack_up", "attack_down"]) {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        let completed = 0;
        unit.playOneShotAnimation(action, () => completed++);
        for (let tick = 0; tick < 28; tick++) unit.stepSpawnAnimation(1 / 240);
        expect(completed).toBe(0);
        unit.stepSpawnAnimation(1 / 240);
        expect(completed).toBe(1);
    }
});

assetTest("registers Wolf actions and shadows immediately when they interrupt any displayed walk frame", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Nature", "Wolf", "wolf_512", () => Texture.WHITE);
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as { sprite: Sprite; silhouetteShadow: Sprite; selectionAnimFrames: Texture[] };
        const baseCanvasHeight = state.sprite.texture.height * state.sprite.scale.y;
        const baseShadowHeight = state.silhouetteShadow.texture.height * state.silhouetteShadow.scale.y;
        for (const action of ["hit", "attack", "attack_up", "attack_down"]) {
            const canvasScale = action === "hit" ? 1 : 4 / 3;
            for (const displayedWalk of [false, true]) {
                unit.startBoardWalkAnimation(team === TeamVals.LEFT ? 1 : -1);
                unit.setBoardWalkDistanceCells(1.29);
                if (displayedWalk) unit.ensureVisual(world, gridSettings);
                expect(unit.playOneShotAnimation(action)).toBe(true);
                expect((state.sprite.texture.height * state.sprite.scale.y) / canvasScale).toBeCloseTo(
                    baseCanvasHeight,
                    6,
                );
                expect(state.silhouetteShadow.texture).toBe(state.sprite.texture);
                expect(
                    (state.silhouetteShadow.texture.height * state.silhouetteShadow.scale.y) / canvasScale,
                ).toBeCloseTo(baseShadowHeight, 6);
                expect(state.silhouetteShadow.anchor.y).toBeCloseTo(state.sprite.anchor.y, 8);
                unit.returnToIdleAnimation();
                unit.ensureVisual(world, gridSettings);
            }
        }
    }
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

assetTest("plays the restored eight-frame Blacksmith idle 20% slower and resumes neutral after walking", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Blacksmith", "blacksmith_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, gridSettings);
    const idle = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameDurationsMs: number[];
        selectionAnimFootAnchorY: number;
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };
    expect(keys).toContain("blacksmith_idle_atlas");
    expect(keys).not.toContain("blacksmith_idle_atlas_quarter");
    expect(idle.selectionAnimFrames).toHaveLength(8);
    expect(idle.selectionAnimFrames[0].width).toBe(768);
    expect(idle.selectionAnimFrameDurationsMs).toEqual(Array(8).fill(300 / 1.3 / 0.8));
    expect(idle.selectionAnimFootAnchorY).toBe(730 / 768);
    const started = idle.selectionAnimationStartedAtMs;
    const scale = [idle.sprite.scale.x, idle.sprite.scale.y];
    for (let frame = 0; frame <= 16; frame++) {
        unit.stepSelectionAnimation(started + (frame * 300) / 1.3 / 0.8 + 0.001);
        expect(idle.selectionAnimFrameIndex).toBe(frame % 8);
        expect(idle.sprite.texture).toBe(idle.selectionAnimFrames[frame % 8]);
        expect([idle.sprite.scale.x, idle.sprite.scale.y]).toEqual(scale);
    }
    unit.startBoardWalkAnimation(1);
    unit.setBoardWalkDistanceCells(0.65);
    const walkTexture = idle.sprite.texture;
    unit.stepSelectionAnimation(started + 1500);
    expect(idle.sprite.texture).toBe(walkTexture);
    unit.stopBoardWalkAnimation();
    expect(idle.sprite.texture).toBe(idle.selectionAnimFrames[0]);
    expect(idle.sprite.filters ?? []).not.toContain(blacksmithWalkColorFilter(4));
    unit.ensureVisual(root, gridSettings);
    expect([idle.sprite.scale.x, idle.sprite.scale.y]).toEqual(scale);
    expect(idle.sprite.anchor.y).toBe(730 / 768);
});

assetTest("plays Blacksmith melee attacks and cast with stable scale, feet and overlap order", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const timings = {
        cast: [60, 110, 100, 55, 65, 90, 100, 100],
        melee_attack: [45, 75, 105, 45, 55, 70, 75, 70],
        melee_attack_up: [45, 85, 65, 60, 70, 75, 70, 70],
        melee_attack_down: [45, 85, 115, 40, 60, 80, 75, 80],
    };
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const atlas = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 4096, height: 2048 }),
        });
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Life", "Blacksmith", "blacksmith_512", (key) => {
            keys.push(key);
            return /^blacksmith_(?:melee_attack(?:_up|_down)?|cast)_atlas$/.test(key) ? atlas : Texture.WHITE;
        });
        const root = new Container();
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(root, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: { frameIndex: number; frames: Texture[]; frameDurationsMs: number[] };
            selectionAnimFrames: Texture[];
        };
        const scale = [state.sprite.scale.x, state.sprite.scale.y];
        for (const ranged of ["attack", "attack_up", "attack_down"]) {
            expect(unit.hasAnimationState(ranged)).toBe(false);
            expect(unit.playOneShotAnimation(ranged, undefined, true)).toBe(false);
            expect(creatureOneShotAnimationEnabledForUnit("Blacksmith", ranged)).toBe(false);
        }
        expect(unit.getAttackAnimationStateForTarget({ x: 100, y: 1024 }, "melee")).toBe("melee_attack");
        expect(unit.getAttackAnimationStateForTarget({ x: 100, y: 1100 }, "melee")).toBe("melee_attack_up");
        expect(unit.getAttackAnimationStateForTarget({ x: 100, y: 900 }, "melee")).toBe("melee_attack_down");

        for (const [action, durations] of Object.entries(timings)) {
            expect(creatureOneShotAnimationEnabledForUnit("Blacksmith", action)).toBe(true);
            let completed = 0;
            const beforeDepth = unit.getCreatureDepthSortCandidate(0)!;
            const restingBounds = { ...beforeDepth.bounds };
            const restingHead = { ...beforeDepth.headZone };
            const restingZ = state.sprite.zIndex;
            expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
            expect(unit.isPlayingForegroundAttackAnimation()).toBe(false);
            expect(keys).toContain(`blacksmith_${action}_atlas`);
            expect(keys).not.toContain(`blacksmith_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
            const frames = state.oneShotAnim!.frames;
            expect(frames).toHaveLength(8);
            expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
            expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
            expect(state.sprite.anchor.y).toBe(986 / 1024);
            expect(state.sprite.filters ?? []).not.toContain(blacksmithWalkColorFilter(0));
            for (const [i, frame] of frames.entries()) {
                expect(frame.source).toBe(atlas.source);
                expect(frame.frame.x).toBe((i % 4) * 1024);
                expect(frame.frame.y).toBe(Math.floor(i / 4) * 1024);
                expect(frame.frame.right).toBeLessThanOrEqual(4096);
                expect(frame.frame.bottom).toBeLessThanOrEqual(2048);
            }
            const seen = new Set([0]);
            const total = durations.reduce((a, b) => a + b, 0);
            for (let tick = 0; tick < Math.ceil(total / (1000 / 60)) - 1; tick++) {
                unit.stepSpawnAnimation(1 / 240);
                unit.syncVisual(root, gridSettings);
                const candidate = unit.getCreatureDepthSortCandidate(0)!;
                expect(candidate.bounds).toEqual(restingBounds);
                expect(candidate.headZone).toEqual(restingHead);
                expect(state.sprite.zIndex).toBe(restingZ);
                expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
                expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
                if (state.oneShotAnim) seen.add(state.oneShotAnim.frameIndex);
            }
            expect([...seen]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
            expect(completed).toBe(0);
            unit.stepSpawnAnimation(1 / 240);
            unit.stepSpawnAnimation(1 / 240);
            expect(completed).toBe(1);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
            expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
            expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
            expect(state.sprite.anchor.y).toBe(730 / 768);
        }
        unit.playOneShotAnimation("melee_attack_up");
        unit.playOneShotAnimation("melee_attack_down");
        unit.playOneShotAnimation("cast");
        unit.playOneShotAnimation("hit");
        expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
        unit.returnToIdleAnimation();
        expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
    }
});

assetTest("plays Mermaid hit and death on the real clock, restores idle and holds the corpse", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    expect(creatureOneShotAnimationEnabledForUnit("Mermaid", "attack")).toBe(false);
    for (const action of ["hit", "death"] as const) {
        const durations =
            action === "hit"
                ? [22, 26, 49, 70, 70, 59, 53, 49, 43, 43, 38, 37, 32, 27]
                : [65, 85, 85, 90, 95, 100, 150, 300];
        const total = durations.reduce((sum, value) => sum + value, 0);
        expect(creatureOneShotAnimationEnabledForUnit("Mermaid", action)).toBe(true);
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const keys: string[] = [];
                const textures = new Map<string, Texture>();
                for (const state of ["idle", "walk", "hit", "death"]) {
                    const meta = animationAtlases.Mermaid[state];
                    textures.set(
                        `mermaid_${state}_atlas_quarter`,
                        new Texture({
                            source: new BufferImageSource({
                                resource: new Uint8Array(4),
                                width: meta.atlasWidth / 4,
                                height: meta.atlasHeight / 4,
                            }),
                        }),
                    );
                }
                const unit = createRenderableUnit(team, "Might", "Mermaid", "mermaid_512", (key) => {
                    keys.push(key);
                    return textures.get(key) ?? Texture.WHITE;
                });
                const root = new Container();
                unit.setPosition(0, 1024);
                unit.ensureVisual(root, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    selectionAnimFrames: Texture[];
                    oneShotAnim?: { frameIndex: number; frames: Texture[]; frameDurationsMs?: readonly number[] };
                };
                const scale = [state.sprite.scale.x, state.sprite.scale.y];
                const height = state.sprite.texture.height * state.sprite.scale.y;
                unit.startBoardWalkAnimation(team === TeamVals.LEFT ? 1 : -1);
                unit.setBoardWalkDistanceCells(0.3);
                let completed = 0;
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(keys).toContain(`mermaid_${action}_atlas_quarter`);
                expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
                const frames = state.oneShotAnim!.frames;
                expect(frames).toHaveLength(durations.length);
                expect(state.sprite.texture.height * state.sprite.scale.y).toBeCloseTo(height);
                const seen = new Set([0]);
                for (let tick = 0; tick < Math.ceil(total / (1000 / 60)) - 1; tick++) {
                    unit.stepSpawnAnimation(1 / 240);
                    unit.syncVisual(root, gridSettings);
                    expect(completed).toBe(0);
                    seen.add(state.oneShotAnim!.frameIndex);
                    expect(state.sprite.texture).toBe(frames[state.oneShotAnim!.frameIndex]);
                    expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
                    expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
                    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                }
                expect([...seen]).toEqual(durations.map((_, index) => index));
                unit.stepSpawnAnimation(1 / 240);
                expect(completed).toBe(1);
                if (action === "death") {
                    expect(state.sprite.texture).toBe(frames.at(-1)!);
                    unit.stepOneShotAnimation(5000);
                    expect(state.sprite.texture).toBe(frames.at(-1)!);
                } else {
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                    expect(state.selectionAnimFrames).toContain(state.sprite.texture);
                }
                expect(completed).toBe(1);
                unit.returnToIdleAnimation();
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
            }
        }
    }
});

assetTest("plays Blacksmith hit and death on the real clock with stable scale and correct completion", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    expect(creatureOneShotAnimationEnabledForUnit("Blacksmith", "cast")).toBe(true);
    for (const action of ["hit", "death"] as const) {
        expect(creatureOneShotAnimationEnabledForUnit("Blacksmith", action)).toBe(true);
        const durations =
            action === "hit"
                ? [35, 45, 55, 75, 75, 85, 110]
                : [60, 80, 95, 110, 100, 100, 130, 225].map((duration) => duration / 1.1);
        const total = durations.reduce((sum, ms) => sum + ms, 0);
        const atlasWidth = action === "hit" ? 3072 : 3584;
        const atlasTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: atlasWidth, height: 1536 }),
        });
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const keys: string[] = [];
                const unit = createRenderableUnit(team, "Life", "Blacksmith", "blacksmith_512", (key) => {
                    keys.push(key);
                    if (key === `blacksmith_${action}_atlas`) return atlasTexture;
                    return Texture.WHITE;
                });
                const root = new Container();
                unit.setPosition(0, 1024);
                unit.ensureVisual(root, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    oneShotAnim?: { frameIndex: number; frames: Texture[]; frameDurationsMs?: readonly number[] };
                    selectionAnimFrames: Texture[];
                };
                const scale = [state.sprite.scale.x, state.sprite.scale.y];
                unit.startBoardWalkAnimation(team === TeamVals.LEFT ? 1 : -1);
                unit.setBoardWalkDistanceCells(0.3);
                let completed = 0;
                expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                expect(keys).toContain(`blacksmith_${action}_atlas`);
                expect(keys).not.toContain(`blacksmith_${action}_atlas_quarter`);
                expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
                const frames = state.oneShotAnim!.frames;
                expect(frames).toHaveLength(durations.length);
                expect(frames[0].width).toBe(action === "hit" ? 768 : 896);
                expect(frames[0].height).toBe(768);
                for (const [index, frame] of frames.entries()) {
                    expect(frame.source).toBe(atlasTexture.source);
                    expect(frame.frame.x).toBe((index % 4) * (atlasWidth / 4));
                    expect(frame.frame.y).toBe(Math.floor(index / 4) * 768);
                    expect(frame.frame.right).toBeLessThanOrEqual(atlasWidth);
                    expect(frame.frame.bottom).toBeLessThanOrEqual(1536);
                }
                expect(state.sprite.filters ?? []).not.toContain(blacksmithWalkColorFilter(1));
                expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                const seen = new Set<number>([0]);
                const ticksBeforeEnd = Math.ceil(total / (1000 / 60)) - 1;
                for (let tick = 0; tick < ticksBeforeEnd; tick++) {
                    unit.stepSpawnAnimation(1 / 240);
                    unit.syncVisual(root, gridSettings);
                    expect(state.oneShotAnim).toBeDefined();
                    seen.add(state.oneShotAnim!.frameIndex);
                    expect(state.sprite.texture).toBe(frames[state.oneShotAnim!.frameIndex]);
                    expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
                    expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
                }
                expect(completed).toBe(0);
                expect([...seen]).toEqual(durations.map((_, index) => index));
                unit.stepSpawnAnimation(1 / 240);
                unit.stepSpawnAnimation(1 / 240);
                expect(completed).toBe(1);
                if (action === "death" && preview) {
                    expect(state.oneShotAnim?.frameIndex).toBe(frames.length - 1);
                    expect(state.sprite.texture).toBe(frames.at(-1)!);
                    unit.stepOneShotAnimation(5000);
                    expect(state.sprite.texture).toBe(frames.at(-1)!);
                } else {
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                    if (action === "hit") expect(state.selectionAnimFrames).toContain(state.sprite.texture);
                }
                expect(completed).toBe(1);
                unit.returnToIdleAnimation();
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                expect(state.sprite.scale.x).toBeCloseTo(scale[0], 6);
                expect(state.sprite.scale.y).toBeCloseTo(scale[1], 6);
            }
        }
    }
});

assetTest("rebuilds Blacksmith death frame rectangles after an atlas layout revision", () => {
    const meta = animationAtlases.Blacksmith.death as { frameWidth: number };
    const frameWidth = meta.frameWidth;
    const atlasTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 3584, height: 1536 }),
    });
    const playDeath = () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Blacksmith", "blacksmith_512", (key) =>
            key === "blacksmith_death_atlas" ? atlasTexture : Texture.WHITE,
        );
        unit.ensureVisual(new Container(), gridSettings);
        expect(unit.playOneShotAnimation("death", undefined, true)).toBe(true);
        return (unit as unknown as { oneShotAnim: { frames: Texture[] } }).oneShotAnim.frames;
    };
    try {
        meta.frameWidth = 768;
        const oldFrames = playDeath();
        meta.frameWidth = frameWidth;
        const currentFrames = playDeath();
        expect(currentFrames).not.toBe(oldFrames);
        expect(currentFrames[3].frame.x).toBe(2688);
        expect(currentFrames[3].frame.right).toBe(3584);
        expect(currentFrames[4].frame.x).toBe(0);
        expect(currentFrames[4].frame.y).toBe(768);
    } finally {
        meta.frameWidth = frameWidth;
    }
});

assetTest("plays eight HD Berserker frames only in the animation lab during the freeze", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Berserker", "berserker_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const internals = unit as unknown as {
        walkAnim?: { frames: Texture[]; loopStartFrame: number; loopEndFrame: number; durationPerFrameMs: number };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1);
    expect(keys).toContain("berserker_walk_atlas");
    expect(keys).not.toContain("berserker_walk_atlas_quarter");
    expect(internals.walkAnim?.frames).toHaveLength(8);
    expect(internals.walkAnim?.frames[0].width).toBe(1024);
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
    unit.stopBoardWalkAnimation();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("plays Berserker sword inspection with authored holds and restarts after travel", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Berserker", "berserker_512", () => testAtlasTexture);
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const state = unit as unknown as {
        selectionAnimFrames: Texture[];
        selectionAnimFrameDurationsMs: number[];
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
        sprite: Sprite;
    };
    expect(state.selectionAnimFrames).toHaveLength(1);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(state.selectionAnimFrames).toHaveLength(20);
    const durations = state.selectionAnimFrameDurationsMs;
    expect(durations[0]).toBe(3150);
    expect(durations[10]).toBe(1000);
    let elapsed = 0;
    for (let frame = 0; frame < durations.length; frame++) {
        unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + 1);
        expect(state.selectionAnimFrameIndex).toBe(frame);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[frame]);
        elapsed += durations[frame];
    }
    unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed);
    expect(state.selectionAnimFrameIndex).toBe(0);
    unit.startBoardWalkAnimation(1);
    const walkingTexture = state.sprite.texture;
    unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + 5500);
    expect(state.sprite.texture).toBe(walkingTexture);
    unit.returnToIdleAnimation();
    expect(state.selectionAnimFrameIndex).toBe(0);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.selectionAnimFrames).toHaveLength(1);
});

assetTest("keeps Berserker size and foot line stable at HD walk entry, across frames and on stop", () => {
    const idleTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Might", "Berserker", "berserker_512", (key) =>
            key === "berserker_walk_atlas" || key === "berserker_sword_idle_atlas" ? testAtlasTexture : idleTexture,
        );
        unit.setPosition(0, 1024);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        const internals = unit as unknown as { sprite: Sprite };
        const sprite = internals.sprite;
        const idleHeight = Math.abs(sprite.scale.y) * 765;
        const idleSoleOffset = (768 - sprite.anchor.y * 768) * Math.abs(sprite.scale.y);
        const idleCanvasWidth = Math.abs(sprite.scale.x) * 768;
        unit.setCreatureAnimationLabPreviewEnabled(true);
        expect(Math.abs(sprite.scale.y) * 765 * 0.75).toBeCloseTo(idleHeight, 8);
        unit.startBoardWalkAnimation(1);
        const checkWalkScale = () => {
            expect(Math.abs(sprite.scale.y) * 979).toBeCloseTo(idleHeight, 8);
            expect((1004 - sprite.anchor.y * 1024) * Math.abs(sprite.scale.y)).toBeCloseTo(idleSoleOffset, 8);
        };
        checkWalkScale();
        unit.ensureVisual(world, gridSettings);
        checkWalkScale();
        const walkScaleX = Math.abs(sprite.scale.x);
        for (let i = 0; i < 16; i++) {
            unit.setBoardWalkDistanceCells((i * 1.3) / 8);
            unit.setBoardFacingFromMovement(i % 2 ? -1 : 1);
            unit.ensureVisual(world, gridSettings);
            checkWalkScale();
            expect(Math.abs(sprite.scale.x)).toBeCloseTo(walkScaleX, 8);
        }
        unit.startBoardWalkAnimation(-1);
        checkWalkScale();
        unit.stopBoardWalkAnimation();
        expect(Math.abs(sprite.scale.y) * 765 * 0.75).toBeCloseTo(idleHeight, 8);
        expect(Math.abs(sprite.scale.x) * 576).toBeCloseTo(idleCanvasWidth, 8);
        expect((976 - sprite.anchor.y * 1024) * Math.abs(sprite.scale.y)).toBeCloseTo(idleSoleOffset, 8);
        unit.ensureVisual(world, gridSettings);
        expect(Math.abs(sprite.scale.y) * 765 * 0.75).toBeCloseTo(idleHeight, 8);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(Math.abs(sprite.scale.y) * 765).toBeCloseTo(idleHeight, 8);
    }
});

assetTest("Berserker has three distinct melee strikes with stable idle and walk transitions", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const states = ["melee_attack", "melee_attack_up", "melee_attack_down"];
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Might", "Berserker", "berserker_512", (key) => {
            keys.push(key);
            return testAtlasTexture;
        });
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.ensureVisual(world, gridSettings);
        const internals = unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: { frames: Texture[]; frameDurationsMs: number[]; frameIndex: number };
            selectionAnimFrames: Texture[];
        };
        const sprite = internals.sprite;
        const scale = { x: Math.abs(sprite.scale.x), y: Math.abs(sprite.scale.y), anchor: sprite.anchor.y };
        const sequences = new Set<Texture[]>();
        for (const state of states) {
            expect(unit.hasAnimationState(state)).toBe(true);
            expect(unit.playOneShotAnimation(state)).toBe(false);
            for (const walk of [false, true]) {
                if (walk) unit.startBoardWalkAnimation(-1);
                let completed = 0;
                expect(unit.playOneShotAnimation(state, () => completed++, true)).toBe(true);
                const action = internals.oneShotAnim!;
                sequences.add(action.frames);
                expect(action.frames).toHaveLength(7);
                expect(action.frames[0].width).toBe(1024);
                expect(action.frameDurationsMs).toHaveLength(7);
                for (const ms of action.frameDurationsMs) {
                    expect(Math.abs(sprite.scale.x)).toBeCloseTo(scale.x, 8);
                    expect(Math.abs(sprite.scale.y)).toBeCloseTo(scale.y, 8);
                    expect(sprite.anchor.y).toBeCloseTo(scale.anchor, 8);
                    unit.ensureVisual(world, gridSettings);
                    unit.stepOneShotAnimation(ms);
                }
                expect(completed).toBe(1);
                expect(internals.oneShotAnim).toBeUndefined();
                expect(sprite.texture).toBe(internals.selectionAnimFrames[0]);
                expect(Math.abs(sprite.scale.y)).toBeCloseTo(scale.y, 8);
            }
            expect(keys).toContain(`berserker_${state}_atlas`);
            expect(keys).not.toContain(`berserker_${state}_atlas_quarter`);
        }
        expect(sequences.size).toBe(3);
        expect(unit.getAttackAnimationStateForTarget({ x: 128, y: 1024 }, "melee")).toBe("melee_attack");
        expect(unit.getAttackAnimationStateForTarget({ x: 128, y: 1152 }, "melee")).toBe("melee_attack_up");
        expect(unit.getAttackAnimationStateForTarget({ x: 128, y: 896 }, "melee")).toBe("melee_attack_down");
    }
});

assetTest("Berserker damage returns to idle and death holds its last pose with stable reaction scale", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const resting = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Might", "Berserker", "berserker_512", (key) => {
            keys.push(key);
            return key.includes("atlas") ? testAtlasTexture : resting;
        });
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        expect(unit.playOneShotAnimation("hit")).toBe(false);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime: boolean;
            };
            selectionAnimFrames: Texture[];
        };
        const scaleX = Math.abs(state.sprite.scale.x);
        const scaleY = Math.abs(state.sprite.scale.y);
        const anchor = state.sprite.anchor.y;
        const check = () => {
            expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scaleX, 8);
            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scaleY, 8);
            expect(state.sprite.anchor.y).toBeCloseTo(anchor, 8);
        };
        for (const fromWalk of [false, true]) {
            if (fromWalk) unit.startBoardWalkAnimation(-1);
            let calls = 0;
            expect(unit.playOneShotAnimation("hit", () => calls++, true)).toBe(true);
            expect(state.oneShotAnim?.frames).toHaveLength(7);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            expect(state.oneShotAnim?.frameDurationsMs).toEqual([30, 45, 55, 75, 75, 90, 110]);
            const durations = state.oneShotAnim!.frameDurationsMs;
            check();
            for (const duration of durations) {
                unit.ensureVisual(world, gridSettings);
                check();
                unit.stepOneShotAnimation(duration);
                check();
            }
            expect(calls).toBe(1);
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        }
        let deaths = 0;
        expect(unit.playOneShotAnimation("death", () => deaths++, true)).toBe(true);
        check();
        const finalFrame = state.oneShotAnim!.frames.at(-1)!;
        unit.stepOneShotAnimation(5000);
        unit.ensureVisual(world, gridSettings);
        check();
        expect(state.sprite.texture).toBe(finalFrame);
        expect(state.oneShotAnim?.frameIndex).toBe(6);
        unit.stepOneShotAnimation(5000);
        expect(deaths).toBe(1);
        expect(state.sprite.texture).toBe(finalFrame);
        unit.returnToIdleAnimation();
        check();
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        expect(keys).toContain("berserker_hit_atlas");
        expect(keys).toContain("berserker_death_atlas");
        expect(keys).not.toContain("berserker_hit_atlas_quarter");
    }
});

assetTest("plays eight native Pikeman walk frames only in the lab over 1.3 cells", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Pikeman", "pikeman_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        walkAnim?: { frames: Texture[]; frameIndex: number; loopStartFrame: number; loopEndFrame: number };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("pikeman_walk_atlas");
    expect(keys).not.toContain("pikeman_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    expect(state.walkAnim?.loopStartFrame).toBe(0);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.stepSelectionAnimation(performance.now() + 1000);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor((Math.SQRT2 % 1.3) / (1.3 / 8)));
    unit.setBoardFacingFromMovement(-1);
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2 + 0.4);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor(((Math.SQRT2 + 0.4) % 1.3) / (1.3 / 8)));
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest("Pikeman idle keeps exact endpoint textures and yields immediately to walking", () => {
    const idleAtlas = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 7680, height: 5376 }),
    });
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Life", "Pikeman", "pikeman_512", (key) =>
            key === "pikeman_lab_idle_atlas" ? idleAtlas : Texture.WHITE,
        );
        const state = unit as unknown as { sprite: Sprite; selectionAnimationStartedAtMs: number };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const base = state.sprite.texture;
        const size = [state.sprite.scale.x, state.sprite.scale.y, state.sprite.anchor.x, state.sprite.anchor.y];
        const unrelated = new ColorMatrixFilter();
        state.sprite.filters = [unrelated];
        const idleFilters = () => (state.sprite.filters ?? []).filter((filter) => filter instanceof PikemanIdleFilter);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const started = state.selectionAnimationStartedAtMs;
        unit.stepSelectionAnimation(started);
        expect(state.sprite.filters).toEqual([unrelated]);
        expect(state.sprite.texture).toBe(base);
        unit.stepSelectionAnimation(started + 1400);
        expect(idleFilters()).toHaveLength(1);
        const idle = idleFilters()[0] as PikemanIdleFilter;
        expect(idle.resources.uAtlas).toBe(idleAtlas.source);
        expect(idle.resources.pikemanIdle.uniforms.uFrameRect[1]).toBeGreaterThan(0);
        expect(state.sprite.filters?.[0]).toBe(idle);
        expect(state.sprite.texture).toBe(base);
        expect([state.sprite.scale.x, state.sprite.scale.y, state.sprite.anchor.x, state.sprite.anchor.y]).toEqual(
            size,
        );
        for (const time of [
            PIKEMAN_IDLE_START_HOLD_MS + PIKEMAN_IDLE_MOTION_MS + 1,
            PIKEMAN_IDLE_PERIOD_MS - 1,
            PIKEMAN_IDLE_PERIOD_MS + 1,
            PIKEMAN_IDLE_PERIOD_MS + 100,
        ]) {
            unit.stepSelectionAnimation(started + time);
            expect(state.sprite.filters).toEqual([unrelated]);
            expect(state.sprite.texture).toBe(base);
        }
        unit.stepSelectionAnimation(started + 6200);
        expect(idleFilters()).toEqual([idle]);
        unit.startBoardWalkAnimation(1, 3);
        expect(state.sprite.filters).toEqual([unrelated]);
        unit.stopBoardWalkAnimation();
        unit.ensureVisual(world, gridSettings);
        expect(state.sprite.texture).toBe(base);
        expect(idleFilters()).toHaveLength(0);
        unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + 1400);
        expect(idleFilters()).toEqual([idle]);
        const otherFilters = (state.sprite.filters ?? []).filter((filter) => filter !== idle);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(state.sprite.filters).toEqual(otherFilters);
        expect(state.sprite.filters).toContain(unrelated);
        const destroy = spyOn(idle, "destroy");
        state.sprite.destroy();
        expect(destroy).toHaveBeenCalledTimes(1);
    }
});

assetTest("keeps Pikeman body width consistent through walk entry, retargeting and stop", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const staticTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Pikeman", "pikeman_512", (key) =>
        key === "pikeman_walk_atlas" ? testAtlasTexture : staticTexture,
    );
    const state = unit as unknown as { sprite: Sprite };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(world, gridSettings);
    const idleWidth = Math.abs(state.sprite.width);
    const idleHeight = Math.abs(state.sprite.height);
    const expectWalkSize = () => {
        expect(Math.abs(state.sprite.width)).toBeCloseTo(idleWidth * 1.1, 8);
        expect(Math.abs(state.sprite.height)).toBeCloseTo(idleHeight, 8);
    };
    const expectIdleSize = () => {
        expect(Math.abs(state.sprite.width)).toBeCloseTo(idleWidth, 8);
        expect(Math.abs(state.sprite.height)).toBeCloseTo(idleHeight, 8);
    };
    unit.startBoardWalkAnimation(1, 3);
    expectWalkSize();
    for (let frame = 0; frame < 16; frame++) {
        unit.setBoardWalkDistanceCells((frame * 1.3) / 8);
        unit.ensureVisual(world, gridSettings);
        expectWalkSize();
    }
    unit.startBoardWalkAnimation(-1, 3);
    expectWalkSize();
    unit.ensureVisual(world, gridSettings);
    expectWalkSize();
    unit.stopBoardWalkAnimation();
    expectIdleSize();
    unit.ensureVisual(world, gridSettings);
    expectIdleSize();
    unit.startBoardWalkAnimation(1, 1);
    expectWalkSize();
    unit.returnToIdleAnimation();
    expectIdleSize();
    unit.startBoardWalkAnimation(1, 1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expectIdleSize();
});

assetTest("White Tiger combat idle and walk preserve scale when lab preview is disabled", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const texture = (width: number, height: number) =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
    const base = texture(768, 768);
    const idle = texture(4608, 2304);
    const walk = texture(3072, 1536);
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "White Tiger", "white_tiger_512", (key) => {
        keys.push(key);
        return key === "white_tiger_lab_idle_atlas" ? idle : key === "white_tiger_lab_walk_atlas" ? walk : base;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    const scale = { x: Math.abs(state.sprite.scale.x), y: Math.abs(state.sprite.scale.y) };
    expect(state.selectionAnimFrames).toHaveLength(18);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(world, gridSettings);
    expect(unit.getAnimationTextureKey("idle")).toBe("white_tiger_lab_idle_atlas");
    expect(keys).toContain("white_tiger_lab_idle_atlas");
    expect(keys).not.toContain("white_tiger_lab_idle_atlas_quarter");
    expect(state.selectionAnimFrames).toHaveLength(18);
    const durations = animationAtlases["White Tiger Lab"].idle.frameDurationsMs!;
    expect(durations).toHaveLength(18);
    // Keep the authoring grid compatible with already-open lab instances during atlas updates.
    expect(animationAtlases["White Tiger Lab"].idle.layout).toEqual({ cols: 6, rows: 3 });
    expect(durations.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(2780 / 4.2 / 0.8);
    const tailFilter = state.sprite.filters?.[0];
    expect(tailFilter).toBeDefined();
    let elapsed = 0;
    const start = state.selectionAnimationStartedAtMs;
    unit.stepSelectionAnimation(start + 1);
    const heldTexture = state.sprite.texture;
    const heldTailPhase = tailFilter!.resources.tail.uniforms.uPhase;
    unit.stepSelectionAnimation(start + 20);
    expect(state.sprite.texture).toBe(heldTexture);
    expect(tailFilter!.resources.tail.uniforms.uPhase).not.toBe(heldTailPhase);
    for (let frame = 0; frame < durations.length; frame++) {
        unit.stepSelectionAnimation(start + elapsed + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(frame);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[frame]);
        expect(state.sprite.texture.width).toBe(768);
        unit.ensureVisual(world, gridSettings);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scale.x);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y);
        elapsed += durations[frame];
    }
    unit.stepSelectionAnimation(start + elapsed + 0.01);
    expect(state.selectionAnimFrameIndex).toBe(0);
    unit.startBoardWalkAnimation(-1, 2);
    unit.setBoardWalkDistanceCells(0.65);
    const walkingTexture = state.sprite.texture;
    expect(state.sprite.filters).not.toContain(tailFilter!);
    unit.stepSelectionAnimation(start + 100000);
    expect(state.sprite.texture).toBe(walkingTexture);
    unit.stopBoardWalkAnimation();
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    expect(state.sprite.filters).toContain(tailFilter!);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y);
    unit.startBoardWalkAnimation(1, 1);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.selectionAnimFrames).toHaveLength(18);
    unit.stopBoardWalkAnimation();
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(scale.x);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(scale.y);
});

assetTest("White Tiger reactions keep idle scale, recover after a hit and hold the death pose", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const texture = (width: number, height: number) =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const base = texture(768, 768);
        const idle = texture(4608, 2304);
        const action = texture(3072, 1536);
        const unit = createRenderableUnit(team, "Nature", "White Tiger", "white_tiger_512", (key) =>
            key === "white_tiger_lab_idle_atlas" ? idle : key.startsWith("white_tiger_lab_") ? action : base,
        );
        const world = new Container();
        const internal = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            oneShotAnim?: { frames: Texture[]; frameDurationsMs: number[]; authoredRealTime: boolean };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        expect(unit.getAnimationTextureKey("hit")).toBe("white_tiger_lab_hit_atlas");
        unit.setCreatureAnimationLabPreviewEnabled(false);
        unit.ensureVisual(world, gridSettings);
        const sprite = internal.sprite;
        const resting = sprite.texture;
        const sx = Math.abs(sprite.scale.x);
        const sy = Math.abs(sprite.scale.y);
        const anchor = sprite.anchor.y;
        const tail = sprite.filters?.[0];
        for (const state of ["hit", "death"] as const) {
            expect(unit.getAnimationTextureKey(state)).toBe(`white_tiger_lab_${state}_atlas`);
            unit.startBoardWalkAnimation(team === TeamVals.LEFT ? 1 : -1, 1);
            unit.setBoardWalkDistanceCells(0.4);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            expect(internal.walkAnim).toBeUndefined();
            expect(sprite.filters ?? []).not.toContain(tail!);
            const animation = internal.oneShotAnim!;
            expect(animation.authoredRealTime).toBe(true);
            expect(animation.frames).toHaveLength(state === "hit" ? 6 : 7);
            expect(animation.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(
                state === "hit" ? 410 / 0.75 : 810 / 1.15,
                8,
            );
            for (let i = 0; i < animation.frames.length; i++) {
                unit.ensureVisual(world, gridSettings);
                expect(sprite.texture).toBe(animation.frames[i]);
                expect(sprite.texture.width).toBe(768);
                expect(sprite.texture.height).toBe(768);
                expect(Math.abs(sprite.scale.x)).toBeCloseTo(sx, 6);
                expect(Math.abs(sprite.scale.y)).toBeCloseTo(sy, 6);
                expect(sprite.anchor.y).toBeCloseTo(anchor, 8);
                unit.stepOneShotAnimation(animation.frameDurationsMs[i]);
            }
            expect(completed).toBe(1);
            expect(sprite.texture).toBe(state === "hit" ? resting : animation.frames.at(-1)!);
            if (state === "death") {
                unit.stepOneShotAnimation(10_000);
                expect(sprite.texture).toBe(animation.frames.at(-1)!);
                expect(sprite.filters ?? []).not.toContain(tail!);
                expect(completed).toBe(1);
                unit.returnToIdleAnimation();
            }
            expect(sprite.texture).toBe(resting);
            expect(sprite.filters).toContain(tail!);
        }
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.getAnimationTextureKey("death")).toBe("white_tiger_lab_death_atlas");
    }
});

assetTest("White Tiger directional attacks preserve idle scale on a padded canvas and recover immediately", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const texture = (width: number, height: number) =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const base = texture(768, 768);
        const idle = texture(4608, 2304);
        const attack = texture(4096, 1536);
        const unit = createRenderableUnit(team, "Nature", "White Tiger", "white_tiger_512", (key) =>
            key === "white_tiger_lab_idle_atlas" ? idle : key.includes("white_tiger_lab_melee_attack") ? attack : base,
        );
        const world = new Container();
        const internal = unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: { frames: Texture[]; frameDurationsMs: number[]; authoredRealTime: boolean };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        unit.ensureVisual(world, gridSettings);
        const sprite = internal.sprite;
        const idleTexture = sprite.texture;
        const sx = Math.abs(sprite.scale.x);
        const sy = Math.abs(sprite.scale.y);
        const anchor = sprite.anchor.y;
        for (const suffix of ["", "_up", "_down"]) {
            const state = `melee_attack${suffix}`;
            expect(unit.getAnimationTextureKey(`attack${suffix}`)).toBe(`white_tiger_lab_${state}_atlas`);
            let completed = 0;
            expect(unit.playOneShotAnimation(state, () => completed++)).toBe(true);
            const anim = internal.oneShotAnim!;
            expect(anim.authoredRealTime).toBe(true);
            expect(anim.frames).toHaveLength(8);
            expect(anim.frameDurationsMs.reduce((a, b) => a + b, 0)).toBe(630);
            for (let i = 0; i < anim.frames.length; i++) {
                unit.ensureVisual(world, gridSettings);
                expect(sprite.texture).toBe(anim.frames[i]);
                expect(sprite.texture.width).toBe(1024);
                expect(sprite.texture.height).toBe(768);
                expect(Math.abs(sprite.scale.x)).toBeCloseTo(sx, 6);
                expect(Math.abs(sprite.scale.y)).toBeCloseTo(sy, 6);
                expect(sprite.anchor.y).toBeCloseTo(anchor - 64 / 768, 8);
                expect(sprite.anchor.x).toBe(0.5);
                unit.stepOneShotAnimation(anim.frameDurationsMs[i]);
            }
            expect(completed).toBe(1);
            expect(sprite.texture).toBe(idleTexture);
            expect(sprite.anchor.y).toBeCloseTo(anchor, 8);
            expect(Math.abs(sprite.scale.x)).toBeCloseTo(sx, 6);
            expect(Math.abs(sprite.scale.y)).toBeCloseTo(sy, 6);
        }
    }
});

assetTest("White Tiger's rendered walk stays at canonical visible height through idle transitions", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const texture = (width: number, height: number) =>
        new Texture({ source: new BufferImageSource({ resource: new Uint8Array(4), width, height }) });
    const idle = texture(768, 768);
    const walk = texture(3072, 1536);
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "White Tiger", "white_tiger_512", (key) =>
        key === "white_tiger_lab_walk_atlas" ? walk : idle,
    );
    const state = unit as unknown as { sprite: Sprite };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.ensureVisual(world, gridSettings);
    const idleScaleY = Math.abs(state.sprite.scale.y);
    const heights = [348, 354, 363, 366, 351, 336, 330, 330];
    unit.startBoardWalkAnimation(1, 3);
    for (let step = 0; step < 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(Math.abs(state.sprite.scale.y) * heights[step % 8]).toBeCloseTo(idleScaleY * 379);
        unit.ensureVisual(world, gridSettings);
        expect(Math.abs(state.sprite.scale.y) * heights[step % 8]).toBeCloseTo(idleScaleY * 379);
    }
    unit.stopBoardWalkAnimation();
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY);
    unit.ensureVisual(world, gridSettings);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY);
    unit.startBoardWalkAnimation(-1, 1);
    unit.returnToIdleAnimation();
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleScaleY);
});

assetTest("plays White Tiger's eight HD walk frames in combat over 1.3 cells", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "White Tiger", "white_tiger_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as { walkAnim?: { frames: Texture[]; frameIndex: number } };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.startBoardWalkAnimation(1, 3);
    expect(state.walkAnim?.frames).toHaveLength(8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("white_tiger_lab_walk_atlas");
    expect(keys).not.toContain("white_tiger_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    const phase = state.walkAnim?.frameIndex;
    unit.ensureVisual(world, gridSettings);
    expect(state.walkAnim?.frameIndex).toBe(phase);
    unit.setBoardFacingFromMovement(-1);
    unit.setBoardWalkDistanceCells(Math.SQRT2 + 0.4);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor(((Math.SQRT2 + 0.4) % 1.3) / (1.3 / 8)));
    unit.stopBoardWalkAnimation();
    unit.startBoardWalkAnimation(-1, 0.2);
    unit.setBoardWalkDistanceCells(0.2);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 1);
    expect(state.walkAnim?.frames).toHaveLength(8);
});

assetTest("plays Elf breathing and bow inspection with exact endpoint timing and stable walk returns", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = true;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameDurationsMs: number[];
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    expect(keys).not.toContain("elf_lab_idle_atlas");
    const height = () => Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    const initialHeight = height();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(keys).toContain("elf_lab_idle_atlas");
    expect(keys).not.toContain("elf_lab_idle_atlas_quarter");
    expect(state.selectionAnimFrames).toHaveLength(96);
    expect(state.selectionAnimFrames[0].width).toBe(768);
    let elapsed = 0;
    for (let i = 0; i < state.selectionAnimFrames.length; i++) {
        unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(i);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[i]);
        expect(height()).toBeCloseTo(initialHeight, 8);
        elapsed += state.selectionAnimFrameDurationsMs[i];
    }
    expect(elapsed).toBeCloseTo(6144 / 1.4 / 1.3, 8);
    for (const pauseOffset of [0.01, 250, 499.99]) {
        unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + pauseOffset);
        expect(state.selectionAnimFrameIndex).toBe(0);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    }
    unit.stepSelectionAnimation(
        state.selectionAnimationStartedAtMs + elapsed + 1000 + state.selectionAnimFrameDurationsMs[0] + 0.01,
    );
    expect(state.selectionAnimFrameIndex).toBe(1);
    unit.startBoardWalkAnimation(1, 3);
    unit.setBoardWalkDistanceCells(0.5);
    unit.stopBoardWalkAnimation();
    expect(state.selectionAnimFrameIndex).toBe(0);
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    unit.ensureVisual(world, gridSettings);
    expect(height()).toBeCloseTo(initialHeight, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.selectionAnimFrames).toHaveLength(1);
});

assetTest("Elf cape keeps waving during the idle hold and yields to all actions on both teams", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Nature", "Elf", "elf_512", () => Texture.WHITE);
        const state = unit as unknown as {
            sprite: Sprite;
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameDurationsMs: number[];
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const cape = () => (state.sprite.filters ?? []).find((f) => f instanceof ElfIdleCapeFilter);
        expect(cape()).toBeUndefined();
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.stepSelectionAnimation();
        const filter = cape() as ElfIdleCapeFilter;
        expect(filter).toBeDefined();
        const height = state.sprite.height;
        const anchor = state.sprite.anchor.y;
        const holdStart =
            state.selectionAnimationStartedAtMs + state.selectionAnimFrameDurationsMs.reduce((a, b) => a + b, 0);
        unit.stepSelectionAnimation(holdStart + 100);
        const held = state.sprite.texture;
        const windTime = filter.resources.elfCape.uniforms.uTime;
        unit.stepSelectionAnimation(holdStart + 700);
        expect(state.sprite.texture).toBe(held);
        expect(filter.resources.elfCape.uniforms.uTime).not.toBe(windTime);
        expect(filter.resources.elfCape.uniforms.uStrength).toBe(1);
        expect(state.sprite.height).toBe(height);
        expect(state.sprite.anchor.y).toBe(anchor);
        unit.startBoardWalkAnimation(team === TeamVals.LEFT ? 1 : -1, 3);
        expect(cape()).toBeUndefined();
        unit.stopBoardWalkAnimation();
        expect(cape()).toBe(filter);
        for (const action of ["hit", "death", "attack", "attack_up", "attack_down", "melee_attack"]) {
            expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
            expect(cape()).toBeUndefined();
            unit.returnToIdleAnimation();
            unit.stepSelectionAnimation();
            expect(cape()).toBe(filter);
        }
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(cape()).toBeUndefined();
        const release = spyOn(filter, "destroy");
        state.sprite.destroy();
        expect(release).toHaveBeenCalledTimes(1);
    }
});

assetTest("plays Elf lab hit and death at authored timing, restores idle and holds the fallen pose", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    COMMON_IDLE_BREATH_SETTINGS.enabled = true;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: unknown;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            holdLastFrame: boolean;
        };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    expect(unit.getAnimationTextureKey("hit")).not.toBe("elf_lab_hit_atlas");
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idle = state.sprite.texture;
    const height = () => Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    const idleHeight = height();
    unit.startBoardWalkAnimation(1, 3);
    let hitDone = 0;
    expect(unit.playOneShotAnimation("hit", () => hitDone++, true)).toBe(true);
    expect(unit.getAnimationTextureKey("hit")).toBe("elf_lab_hit_atlas");
    expect(state.walkAnim).toBeUndefined();
    expect(keys).toContain("elf_lab_hit_atlas");
    expect(keys).not.toContain("elf_lab_hit_atlas_quarter");
    expect(state.oneShotAnim?.authoredRealTime).toBe(true);
    expect(state.oneShotAnim?.frames).toHaveLength(28);
    expect(state.oneShotAnim?.frames[0].height).toBe(768);
    expect(state.oneShotAnim!.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(560 / 1.35, 8);
    for (const duration of state.oneShotAnim!.frameDurationsMs) {
        unit.ensureVisual(world, gridSettings);
        expect(height()).toBeCloseTo(idleHeight, 8);
        unit.stepOneShotAnimation(duration);
    }
    expect(hitDone).toBe(1);
    expect(state.oneShotAnim).toBeUndefined();
    expect(state.sprite.texture).toBe(idle);
    let deathDone = 0;
    expect(unit.playOneShotAnimation("death", () => deathDone++, true)).toBe(true);
    expect(unit.getAnimationTextureKey("death")).toBe("elf_lab_death_atlas");
    expect(state.oneShotAnim?.holdLastFrame).toBe(true);
    expect(state.oneShotAnim?.frames).toHaveLength(8);
    expect(state.oneShotAnim!.frameDurationsMs.reduce((a, b) => a + b, 0)).toBe(1055);
    for (const duration of state.oneShotAnim!.frameDurationsMs) {
        unit.ensureVisual(world, gridSettings);
        expect(height()).toBeCloseTo(idleHeight, 8);
        unit.stepOneShotAnimation(duration);
    }
    expect(state.oneShotAnim?.frameIndex).toBe(7);
    expect(state.sprite.texture).toBe(state.oneShotAnim!.frames[7]);
    unit.stepOneShotAnimation(3000);
    expect(deathDone).toBe(1);
    expect(state.oneShotAnim?.frameIndex).toBe(7);
    unit.returnToIdleAnimation();
    expect(height()).toBeCloseTo(idleHeight, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("death")).not.toBe("elf_lab_death_atlas");
});

assetTest("plays the exact HD Elf walk only in the lab with eight native frames per 1.3 cells", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.startBoardWalkAnimation(1, 3);
    expect(state.walkAnim).toBeUndefined();
    expect(creatureWalkAnimationEnabledForUnit("Elf")).toBe(false);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("elf_lab_walk_atlas");
    expect(keys).not.toContain("elf_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(1024);
    for (let step = 0; step <= 16; step++) {
        const distance = (step * 1.3) / 8;
        unit.setBoardWalkDistanceCells(distance + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.setBoardWalkDistanceCells(distance + 1.3 / 8 - 1e-5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    const phase = state.walkAnim?.frameIndex;
    unit.ensureVisual(world, gridSettings);
    unit.ensureVisual(world, gridSettings);
    expect(state.walkAnim?.frameIndex).toBe(phase);
    unit.setBoardFacingFromMovement(-1);
    expect(state.walkAnim?.frameIndex).toBe(phase);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.startBoardWalkAnimation(-1, 0.2);
    unit.setBoardWalkDistanceCells(0.2);
    unit.stopBoardWalkAnimation();
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest(
    "plays Healer breathing and page-turn poses at authored durations and resumes canonical idle after walking",
    () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
        COMMON_IDLE_BREATH_SETTINGS.enabled = true;
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Healer", "healer_512", () => Texture.WHITE);
        const state = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            selectionAnimFrameIndex: number;
            selectionAnimationStartedAtMs: number;
            selectionAnimFrameDurationsMs: number[];
            stepSelectionAnimation(now: number): void;
        };
        unit.setPosition(0, 1024);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        expect(state.selectionAnimFrames).toHaveLength(10);
        expect(state.selectionAnimFrames[0].width).toBe(768);
        expect(state.selectionAnimFrameDurationsMs.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(3480 / 1.07, 8);
        const height = () => Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
        const initialHeight = height();
        let elapsed = 0;
        for (let i = 0; i < 10; i++) {
            state.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + 0.01);
            expect(state.selectionAnimFrameIndex).toBe(i);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[i]);
            expect(height()).toBeCloseTo(initialHeight, 8);
            expect(state.sprite.filters ?? []).not.toContain(healerLabWalkPalette());
            elapsed += state.selectionAnimFrameDurationsMs[i];
        }
        state.stepSelectionAnimation(state.selectionAnimationStartedAtMs + elapsed + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(0);
        unit.startBoardWalkAnimation(1, 3);
        unit.setBoardWalkDistanceCells(0.5);
        expect(state.sprite.filters).toContain(healerLabWalkPalette());
        unit.stopBoardWalkAnimation();
        expect(state.selectionAnimFrameIndex).toBe(0);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        expect(state.sprite.filters ?? []).not.toContain(healerLabWalkPalette());
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(state.selectionAnimFrames).toHaveLength(10);
    },
);

assetTest("plays the repaired Healer walk in regular combat with eight frames per 1.3 cells", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Healer", "healer_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number; gaitDistanceCells?: number };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    unit.startBoardWalkAnimation(1, 3);
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(creatureWalkAnimationEnabledForUnit("Healer")).toBe(true);
    unit.stopBoardWalkAnimation();
    const unrelatedPalette = new ColorMatrixFilter();
    state.sprite.filters = [unrelatedPalette];
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("healer_lab_walk_atlas");
    expect(state.sprite.filters).toContain(healerLabWalkPalette());
    expect(keys).not.toContain("healer_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    for (let step = 0; step <= 16; step++) {
        const distance = (step * 1.3) / 8;
        unit.setBoardWalkDistanceCells(distance + 1e-8);
        expect(state.sprite.filters).toContain(healerLabWalkPalette());
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.setBoardWalkDistanceCells(distance + 1.3 / 8 - 1e-5);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    const phase = state.walkAnim?.frameIndex;
    unit.setBoardFacingFromMovement(-1);
    expect(state.walkAnim?.frameIndex).toBe(phase);
    unit.stopBoardWalkAnimation();
    expect(state.sprite.filters ?? []).not.toContain(healerLabWalkPalette());
    expect(state.sprite.filters).toContain(unrelatedPalette);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1, 0.2);
    expect(state.walkAnim?.frames).toHaveLength(8);
    unit.stopBoardWalkAnimation();
});

assetTest("plays all eight HD Leprechaun lab frames over 1.3 cells without legacy turn phases", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Leprechaun", "leprechaun_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            introComplete: boolean;
            gaitDistanceCells?: number;
        };
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idleCanvasHeight = Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("leprechaun_lab_walk_atlas");
    expect(keys).not.toContain("leprechaun_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(1024);
    expect(state.walkAnim?.loopStartFrame).toBe(0);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    expect(state.walkAnim?.introComplete).toBe(true);
    expect(state.walkAnim?.outroFrame).toBeUndefined();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(idleCanvasHeight, 8);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        expect(state.walkAnim?.gaitDistanceCells).toBeCloseTo((step * 1.3) / 8, 6);
    }
    unit.setBoardFacingFromMovement(-1);
    expect(state.walkAnim?.gaitDistanceCells).toBeCloseTo(2.6, 6);
    unit.stopBoardWalkAnimation();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(idleCanvasHeight, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest("keeps the shared Leprechaun palette on idle, walking and immediate stop", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const calls: Array<{ frame: number; idle: boolean; texture: Texture }> = [];
    const sync = spyOn(leprechaunVisuals, "syncLeprechaunLabWalkVisuals").mockImplementation(
        (sprite, frame, _distance, _frames, idle = false) => {
            calls.push({ frame, idle, texture: sprite.texture });
        },
    );
    try {
        const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Leprechaun", "leprechaun_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.ensureVisual(new Container(), gridSettings);
        expect(calls.at(-1)?.idle).toBe(true);
        const idleTexture = calls.at(-1)?.texture;
        unit.startBoardWalkAnimation(1, 3);
        expect(calls.at(-1)?.frame).toBe(0);
        expect(calls.at(-1)?.idle).toBe(false);
        unit.setBoardWalkDistanceCells(1.3);
        expect(calls.at(-1)?.idle).toBe(false);
        unit.stopBoardWalkAnimation();
        expect(calls.at(-1)?.idle).toBe(true);
        expect(calls.at(-1)?.texture).toBe(idleTexture);
    } finally {
        sync.mockRestore();
    }
});

assetTest("plays eight HD Centaur frames only in the animation lab during the freeze", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const internals = unit as unknown as {
        walkAnim?: { frames: Texture[]; loopStartFrame: number; loopEndFrame: number; durationPerFrameMs: number };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1);
    expect(keys).toContain("centaur_lab_walk_atlas");
    expect(keys).not.toContain("centaur_lab_walk_atlas_quarter");
    expect(internals.walkAnim?.frames).toHaveLength(8);
    expect(internals.walkAnim?.frames[0].width).toBe(1024);
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
    unit.stopBoardWalkAnimation();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("preserves Centaur calibrated run height and restores its palette across HD walk transitions", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const idle = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(768 * 768 * 4), width: 768, height: 768 }),
    });
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => idle);
    const world = new Container();
    const internals = unit as unknown as { sprite: Sprite; walkAnim: { frameIndex: number } };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(world, gridSettings);
    const sprite = internals.sprite;
    const restingTexture = sprite.texture;
    const visibleHeight = () => Math.abs(sprite.scale.y) * sprite.texture.height;
    const idleHeight = visibleHeight() * (730 / 768);
    const idleScaleX = Math.abs(sprite.scale.x);
    const unrelated = new ColorMatrixFilter();
    sprite.filters = [unrelated];
    const measuredFrameHeights = [904, 895, 882, 900, 908, 895, 883, 903];
    const walkHeight = idleHeight * 0.97;

    unit.startBoardWalkAnimation(1);
    const grade = sprite.filters?.find((filter) => filter !== unrelated) as ColorMatrixFilter;
    expect(grade).toBeDefined();
    // Two cycles, including the instant texture swap before the next layout pass.
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8);
        const frameHeight = measuredFrameHeights[step % 8] / 1024;
        expect(visibleHeight() * frameHeight).toBeCloseTo(walkHeight, 5);
        unit.ensureVisual(world, gridSettings);
        expect(visibleHeight() * frameHeight).toBeCloseTo(walkHeight, 5);
        expect(sprite.filters).toContain(grade);
    }
    // Restarting toward another target must not compound the enlargement.
    unit.startBoardWalkAnimation(-1);
    expect(visibleHeight() * (904 / 1024)).toBeCloseTo(walkHeight, 5);
    unit.stopBoardWalkAnimation();
    expect(sprite.texture).toBe(restingTexture);
    expect(visibleHeight() * (730 / 768)).toBeCloseTo(idleHeight, 5);
    expect(Math.abs(sprite.scale.x)).toBeCloseTo(idleScaleX, 5);
    expect(sprite.filters).toContain(unrelated);
    expect(sprite.filters).not.toContain(grade);
    expect(sprite.filters).toHaveLength(2);
    unit.ensureVisual(world, gridSettings);
    expect(visibleHeight() * (730 / 768)).toBeCloseTo(idleHeight, 5);
});

assetTest("plays Centaur tail and hair idle only in the lab and resumes it after walking", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
    const world = new Container();
    const internals = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameIndex: number;
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    expect(internals.selectionAnimFrames).toHaveLength(1);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(internals.selectionAnimFrames).toHaveLength(8);
    const frames = internals.selectionAnimFrames;
    const wind = internals.sprite.filters?.[0];
    expect(wind).toBeDefined();
    const start = internals.selectionAnimationStartedAtMs;
    unit.setBoardSelected(false);
    unit.stepSelectionAnimation(start + 600);
    expect(internals.sprite.texture).toBe(frames[1]);
    unit.stepSelectionAnimation(start + 4080);
    expect(internals.sprite.texture).toBe(frames[4]);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    expect(internals.selectionAnimationStartedAtMs).toBe(start);
    unit.startBoardWalkAnimation(1);
    const walkingTexture = internals.sprite.texture;
    expect(internals.sprite.filters).not.toContain(wind);
    unit.stepSelectionAnimation(start + 4280);
    expect(internals.sprite.texture).toBe(walkingTexture);
    unit.stopBoardWalkAnimation();
    expect(internals.sprite.texture).toBe(frames[0]);
    expect(internals.sprite.filters).toContain(wind);
    unit.stepSelectionAnimation(internals.selectionAnimationStartedAtMs + 4340);
    expect(internals.sprite.texture).toBe(frames[5]);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(internals.selectionAnimFrames).toHaveLength(1);
    expect(internals.sprite.filters ?? []).not.toContain(wind);
    unit.ensureVisual(world, gridSettings);
    expect(internals.selectionAnimFrameIndex).toBe(0);
});

assetTest("Centaur lab reactions preserve registration, recover from hits and hold the final death pose", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
    const world = new Container();
    const internals = unit as unknown as {
        sprite: Sprite;
        walkAnim?: unknown;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
        };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    expect(unit.getAnimationTextureKey("hit")).not.toBe("centaur_lab_hit_atlas");
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(world, gridSettings);
    const sprite = internals.sprite;
    const idle = sprite.texture;
    const height = () => Math.abs(sprite.texture.height * sprite.scale.y);
    const restingHeight = height();
    const anchor = sprite.anchor.y;
    const wind = sprite.filters?.[0];
    expect(unit.getAnimationTextureKey("hit")).toBe("centaur_lab_hit_atlas");
    expect(unit.getAnimationTextureKey("death")).toBe("centaur_lab_death_atlas");
    unit.startBoardWalkAnimation(1);
    let hitsFinished = 0;
    expect(unit.playOneShotAnimation("hit", () => hitsFinished++, true)).toBe(true);
    expect(internals.walkAnim).toBeUndefined();
    expect(sprite.filters ?? []).not.toContain(wind);
    expect(height()).toBeCloseTo(restingHeight, 5);
    expect(sprite.anchor.y).toBeCloseTo(anchor, 8);
    const hit = internals.oneShotAnim!;
    expect(hit.authoredRealTime).toBe(true);
    expect(hit.frameDurationsMs).toHaveLength(hit.frames.length);
    for (const duration of hit.frameDurationsMs) {
        unit.ensureVisual(world, gridSettings);
        expect(height()).toBeCloseTo(restingHeight, 5);
        unit.stepOneShotAnimation(duration);
    }
    expect(hitsFinished).toBe(1);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    expect(sprite.texture).toBe(idle);
    expect(sprite.filters).toContain(wind);
    let deathsFinished = 0;
    expect(unit.playOneShotAnimation("death", () => deathsFinished++, true)).toBe(true);
    const death = internals.oneShotAnim!;
    expect(death.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(1240 / 1.08 / 1.08, 8);
    for (const duration of death.frameDurationsMs) {
        unit.ensureVisual(world, gridSettings);
        expect(height()).toBeCloseTo(restingHeight, 5);
        expect(sprite.anchor.y).toBeCloseTo(anchor, 8);
        unit.stepOneShotAnimation(duration);
    }
    expect(sprite.texture).toBe(death.frames.at(-1)!);
    expect(deathsFinished).toBe(1);
    unit.stepOneShotAnimation(10_000);
    expect(sprite.texture).toBe(death.frames.at(-1)!);
    expect(deathsFinished).toBe(1);
    unit.returnToIdleAnimation();
    expect(sprite.texture).toBe(idle);
    expect(height()).toBeCloseTo(restingHeight, 5);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("death")).not.toBe("centaur_lab_death_atlas");
});

assetTest("Centaur attack directions keep native scale through padded attacks, interruption and idle recovery", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
    const world = new Container();
    const internals = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frames: Texture[]; frameDurationsMs: number[]; authoredRealTime: boolean };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(world, gridSettings);
    const sprite = internals.sprite;
    const idle = sprite.texture;
    const scaleX = Math.abs(sprite.scale.x);
    const scaleY = Math.abs(sprite.scale.y);
    const floorOffset = (744 - sprite.anchor.y * idle.height) * sprite.scale.y;
    const wind = sprite.filters?.[0];
    for (const state of [
        "melee_attack",
        "melee_attack_up",
        "melee_attack_down",
        "attack",
        "attack_up",
        "attack_down",
    ]) {
        expect(unit.hasAnimationState(state)).toBe(true);
        expect(unit.getAnimationTextureKey(state)).toBe(`centaur_lab_${state}_atlas`);
        unit.startBoardWalkAnimation(1);
        let completed = 0;
        expect(unit.playOneShotAnimation(state, () => completed++, true)).toBe(true);
        const action = internals.oneShotAnim!;
        expect(action.frames).toHaveLength(6);
        expect(action.authoredRealTime).toBe(true);
        expect(sprite.texture.width).toBe(1536);
        expect(sprite.texture.height).toBe(1024);
        expect(Math.abs(sprite.scale.y)).toBeCloseTo(scaleY, 5);
        expect(sprite.filters ?? []).not.toContain(wind);
        for (const duration of action.frameDurationsMs) {
            unit.ensureVisual(world, gridSettings);
            expect(Math.abs(sprite.scale.x)).toBeCloseTo(scaleX, 5);
            expect(Math.abs(sprite.scale.y)).toBeCloseTo(scaleY, 5);
            expect((1000 - sprite.anchor.y * 1024) * sprite.scale.y).toBeCloseTo(floorOffset, 5);
            unit.stepOneShotAnimation(duration);
        }
        expect(completed).toBe(1);
        expect(sprite.texture).toBe(idle);
        expect(Math.abs(sprite.scale.y)).toBeCloseTo(scaleY, 5);
        expect(sprite.filters).toContain(wind);
        unit.playOneShotAnimation(state, undefined, true);
        unit.playOneShotAnimation("hit", undefined, true);
        expect(Math.abs(sprite.scale.y)).toBeCloseTo(scaleY, 5);
        unit.returnToIdleAnimation();
        unit.playOneShotAnimation(state, undefined, true);
        unit.startBoardWalkAnimation(-1);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        unit.stopBoardWalkAnimation();
        expect(Math.abs(sprite.scale.y)).toBeCloseTo(scaleY, 5);
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("melee_attack")).not.toBe("centaur_lab_melee_attack_atlas");
});

assetTest("Centaur ranged release follows the empty-hand frame and cancels before a shot", () => {
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Centaur", "centaur_512", () => Texture.WHITE);
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(world, gridSettings);
    for (const state of ["attack", "attack_up", "attack_down"]) {
        let released = 0,
            cancelled = 0;
        expect(
            unit.playCentaurLabRangedThrow(
                state,
                () => released++,
                () => cancelled++,
            ),
        ).toBe(true);
        unit.stepOneShotAnimation(339);
        expect(released).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(released).toBe(1);
        const origin = unit.getRangedProjectileOrigin({ x: 500, y: 1500 }, gridSettings);
        expect(Number.isFinite(origin.x) && Number.isFinite(origin.y)).toBe(true);
        unit.stepOneShotAnimation(1000);
        expect(released).toBe(1);
        expect(cancelled).toBe(0);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        unit.playCentaurLabRangedThrow(
            state,
            () => released++,
            () => cancelled++,
        );
        unit.stepOneShotAnimation(200);
        unit.returnToIdleAnimation();
        unit.stepOneShotAnimation(1000);
        expect(released).toBe(1);
        expect(cancelled).toBe(1);
    }
});

assetTest("plays Medusa's eight archive poses 10% slower and enters moving idle immediately on arrival", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const resolvedKeys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Medusa", "medusa_512", (key) => {
        resolvedKeys.push(key);
        return Texture.WHITE;
    });
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    expect(creatureWalkAnimationEnabledForUnit("Medusa", false)).toBe(false);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 5);
    const state = unit as unknown as {
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            distanceDriven: boolean;
            completedCycles: number;
            loopEndFrame: number;
            outroFrame?: number;
        };
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameDurationsMs: number[];
    };
    expect(resolvedKeys).toContain("medusa_lab_walk_atlas");
    expect(state.walkAnim?.frames).toHaveLength(9);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    expect(state.walkAnim?.outroFrame).toBeUndefined();
    expect(state.walkAnim?.distanceDriven).toBe(true);
    unit.setBoardWalkDistanceCells(1.3);
    expect(state.walkAnim?.completedCycles).toBe(0);
    expect(state.walkAnim?.frameIndex).toBe(7);
    for (let phase = 0; phase <= 16; phase++) {
        unit.setBoardWalkDistanceCells((phase * 1.3) / 0.9 / 8);
        expect(state.walkAnim?.frameIndex).toBe(phase % 8);
        expect(state.walkAnim?.completedCycles).toBe(Math.floor(phase / 8));
        unit.stepSpawnAnimation(0.1);
        unit.setBoardFacingFromMovement(phase < 8 ? 1 : -1);
        expect(state.walkAnim?.frameIndex).toBe(phase % 8);
    }
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(state.walkAnim).toBeUndefined();
    expect(state.selectionAnimFrameIndex).toBe(1);
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[1]);
    unit.stepSelectionAnimation(
        state.selectionAnimationStartedAtMs + state.selectionAnimFrameDurationsMs[0] * 2 + 0.01,
    );
    expect(state.selectionAnimFrameIndex).toBe(2);
});

assetTest("Medusa lab idle loops authored snake and arm poses and preserves scale through walking", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Medusa", "medusa_512", () => Texture.WHITE);
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    const state = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        selectionAnimFrameDurationsMs: number[];
        stepSelectionAnimation(now: number): void;
    };
    expect(unit.getAnimationTextureKey("idle")).toBe("medusa_lab_idle_atlas");
    expect(state.selectionAnimFrames).toHaveLength(24);
    const height = () => Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    const initialHeight = height();
    const duration = state.selectionAnimFrameDurationsMs.reduce((sum, ms) => sum + ms, 0);
    expect(duration).toBeCloseTo(2400 / 0.9 / 1.1 / 1.13, 6);
    expect(state.selectionAnimFrameDurationsMs).toEqual(Array(24).fill(1000 / (9.9 * 1.13)));
    for (let frame = 0; frame <= 48; frame++) {
        state.stepSelectionAnimation(state.selectionAnimationStartedAtMs + (frame * 1000) / (9.9 * 1.13) + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(frame % 24);
        expect(height()).toBeCloseTo(initialHeight, 8);
    }
    unit.startBoardWalkAnimation(1, 3);
    unit.setBoardWalkDistanceCells(Math.SQRT2);
    expect(height()).toBeCloseTo(initialHeight, 8);
    unit.stopBoardWalkAnimation();
    unit.ensureVisual(world, gridSettings);
    expect(state.selectionAnimFrames).toContain(state.sprite.texture);
    expect(height()).toBeCloseTo(initialHeight, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("idle")).not.toBe("medusa_lab_idle_atlas");
});

assetTest("Medusa lab actions keep padded anatomy registered and complete back into idle", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Chaos", "Medusa", "medusa_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frameIndex: number;
                frames: Texture[];
                frameDurationsMs?: number[];
                authoredRealTime?: boolean;
            };
        };
        const scale = state.sprite.scale.y;
        for (const action of [
            "hit",
            "melee_attack",
            "attack",
            "melee_attack_up",
            "melee_attack_down",
            "attack_up",
            "attack_down",
        ]) {
            const authored = action;
            const durations = animationAtlases["Medusa Lab"][authored].frameDurationsMs!;
            let complete = 0;
            expect(unit.hasAnimationState(action)).toBe(true);
            expect(unit.getAnimationTextureKey(action)).toBe(`medusa_lab_${authored}_atlas`);
            expect(unit.playOneShotAnimation(action, () => complete++, true)).toBe(true);
            const anim = state.oneShotAnim!;
            expect(anim.authoredRealTime).toBe(true);
            expect(anim.frameDurationsMs).toEqual(durations);
            for (let i = 0; i < durations.length; i++) {
                expect(anim.frameIndex).toBe(i);
                unit.ensureVisual(world, gridSettings);
                expect(state.sprite.scale.y).toBeCloseTo(scale, 8);
                expect(state.sprite.anchor.y).toBeCloseTo(870 / 1024, 8);
                expect(state.sprite.texture).toBe(anim.frames[i]);
                expect(complete).toBe(0);
                unit.stepOneShotAnimation(durations[i]);
            }
            expect(complete).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.selectionAnimFrames).toContain(state.sprite.texture);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[1]);
            expect(state.sprite.scale.y).toBeCloseTo(scale, 8);
            expect(state.sprite.anchor.y).toBeCloseTo(742 / 768, 8);
        }
    }
});

assetTest("Medusa releases the arm serpent once from the empty palm and cancels interrupted shots", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Chaos", "Medusa", "medusa_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        const view = unit as unknown as { sprite: Sprite; oneShotAnim?: { frameIndex: number } };
        for (const state of ["attack", "attack_up", "attack_down"]) {
            const meta = animationAtlases["Medusa Lab"][state];
            expect(meta.frameDurationsMs!.reduce((total, ms) => total + ms, 0)).toBeCloseTo(700 / 1.2, 6);
            expect(meta.frameDurationsMs!.slice(0, 5).reduce((total, ms) => total + ms, 0)).toBeCloseTo(425 / 1.2, 6);
            const shot = unit.prepareDryadRangedShot()!;
            expect(shot).toBeDefined();
            let releases = 0;
            expect(
                unit.playDryadRangedShot(state, shot, () => {
                    releases++;
                    expect(view.oneShotAnim?.frameIndex).toBe(5);
                    const hand = meta.projectileOrigin as { x: number; y: number };
                    const expected = world.toLocal(
                        view.sprite.toGlobal({
                            x: hand.x - view.sprite.anchor.x * view.sprite.texture.width,
                            y: hand.y - view.sprite.anchor.y * view.sprite.texture.height,
                        }),
                    );
                    const origin = unit.getRangedProjectileOrigin({ x: 1000, y: 1000 }, gridSettings);
                    expect(origin.x).toBeCloseTo(expected.x, 6);
                    expect(origin.y).toBeCloseTo(expected.y, 6);
                    const target = unit.getElfLabFreeShotTarget(origin, 400)!;
                    expect(Math.hypot(target.x - origin.x, target.y - origin.y)).toBeCloseTo(400, 6);
                    expect(unit.getDryadArrowLength()).toBeCloseTo(480 * Math.abs(view.sprite.scale.x), 6);
                }),
            ).toBe(true);
            for (const [i, ms] of meta.frameDurationsMs!.entries()) {
                expect(releases).toBe(i < 5 ? 0 : 1);
                unit.stepOneShotAnimation(ms);
            }
            expect(releases).toBe(1);
            expect(shot.signal.aborted).toBe(false);
            unit.finishDryadRangedShot(shot);
        }
        for (const cancel of [
            () => unit.returnToIdleAnimation(),
            () => unit.playOneShotAnimation("hit", undefined, true),
        ]) {
            unit.returnToIdleAnimation();
            const shot = unit.prepareDryadRangedShot()!;
            let releases = 0;
            unit.playDryadRangedShot("attack", shot, () => releases++);
            unit.stepOneShotAnimation(200);
            cancel();
            unit.stepOneShotAnimation(2000);
            expect(shot.signal.aborted).toBe(true);
            expect(releases).toBe(0);
        }
    }
});

assetTest("Medusa lab stone death keeps its scale and holds the final rubble cel", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Chaos", "Medusa", "medusa_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const world = new Container();
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            oneShotAnim?: { frameIndex: number; frames: Texture[]; finished?: boolean };
        };
        const scale = state.sprite.scale.y;
        const durations = animationAtlases["Medusa Lab"].death.frameDurationsMs!;
        let complete = 0;
        expect(unit.getAnimationTextureKey("death")).toBe("medusa_lab_death_atlas");
        expect(unit.playOneShotAnimation("death", () => complete++, true)).toBe(true);
        const anim = state.oneShotAnim!;
        for (let i = 0; i < durations.length; i++) {
            unit.ensureVisual(world, gridSettings);
            expect(anim.frameIndex).toBe(i);
            expect(state.sprite.texture === anim.frames[i]).toBe(true);
            expect(state.sprite.scale.y).toBeCloseTo(scale, 8);
            expect(state.sprite.anchor.y).toBeCloseTo(870 / 1024, 8);
            unit.stepOneShotAnimation(durations[i]);
        }
        expect(complete).toBe(1);
        expect(anim.finished).toBe(true);
        unit.stepOneShotAnimation(5000);
        unit.ensureVisual(world, gridSettings);
        expect(complete).toBe(1);
        expect(state.sprite.texture === anim.frames.at(-1)!).toBe(true);
        expect(state.sprite.scale.y).toBeCloseTo(scale, 8);
        unit.returnToIdleAnimation(true);
        unit.ensureVisual(world, gridSettings);
        expect(state.selectionAnimFrames.includes(state.sprite.texture)).toBe(true);
        expect(state.sprite.scale.y).toBeCloseTo(scale, 8);
        expect(state.sprite.anchor.y).toBeCloseTo(742 / 768, 8);
    }
});

assetTest("uses one 1.3-cell cadence for every locomotion family and holds poses without travel", () => {
    const creatures = [
        ["Might", "Berserker"],
        ["Might", "Centaur"],
        ["Might", "Mermaid"],
        ["Might", "Wolf Rider"],
        ["Life", "Peasant"],
        ["Life", "Squire"],
        ["Life", "Arbalester"],
        ["Life", "Blacksmith"],
        ["Chaos", "Orc"],
        ["Chaos", "Troglodyte"],
        ["Chaos", "Scavenger"],
        ["Chaos", "Troll"],
        ["Nature", "Wolf"],
        ["Nature", "Fairy"],
        ["Nature", "Dryad"],
        ["Nature", "Leprechaun"],
    ];
    for (const [faction, name] of creatures) {
        const unit = createRenderableUnit(
            TeamVals.LEFT,
            faction,
            name,
            `${name.toLowerCase().replaceAll(" ", "_")}_512`,
            () => Texture.WHITE,
        );
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        unit.startBoardWalkAnimation(1, 6);
        const walk = (
            unit as unknown as {
                walkAnim?: {
                    frameIndex: number;
                    loopStartFrame: number;
                    loopEndFrame: number;
                    completedCycles: number;
                    introComplete: boolean;
                    introDistanceCells?: number;
                    gaitStartDistanceCells: number;
                    distanceDriven: boolean;
                };
            }
        ).walkAnim;
        expect(walk, name).toBeDefined();
        if (!walk) continue;
        expect(walk.distanceDriven, name).toBe(true);
        if (walk.introDistanceCells !== undefined) unit.setBoardWalkDistanceCells(walk.introDistanceCells);
        for (let i = 0; !walk.introComplete && i < 20; i++) unit.stepSpawnAnimation(1);
        expect(walk.introComplete, name).toBe(true);
        const n = walk.loopEndFrame - walk.loopStartFrame + 1;
        for (let i = 0; i <= n * 2; i++) {
            const distance = walk.gaitStartDistanceCells + (i * 1.3) / n;
            unit.setBoardWalkDistanceCells(distance);
            expect(walk.frameIndex, name).toBe(walk.loopStartFrame + (i % n));
            expect(walk.completedCycles, name).toBe(Math.floor(i / n));
            unit.stepSpawnAnimation(2);
            unit.setBoardFacingFromMovement(i % 2 ? -1 : 1);
            expect(walk.frameIndex, name).toBe(walk.loopStartFrame + (i % n));
            unit.setBoardWalkDistanceCells(distance + 1.3 / n - 0.00001);
            expect(walk.frameIndex, name).toBe(walk.loopStartFrame + (i % n));
        }
        unit.finishBoardWalkAnimationAfterFullCycle();
        for (let i = 0; i < 20; i++) unit.stepSpawnAnimation(1);
        expect((unit as unknown as { walkAnim?: unknown }).walkAnim, name).toBeUndefined();
    }
});

// The authored gait metadata is committed with the client, so these timings also exercise the CI stubs.
assetTest("plays all eight detailed Blacksmith frames every 1.3 cells using the full-resolution atlas", () => {
    document.cookie ??= "";
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Blacksmith", "blacksmith_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const internals = unit as unknown as {
        sprite: Sprite;
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
    const idleTexture = internals.sprite.texture;
    unit.startBoardWalkAnimation(1);
    expect(creatureWalkAnimationEnabledForUnit("Blacksmith")).toBe(true);
    expect(creatureIdleAnimationEnabledForUnit("Blacksmith")).toBe(true);
    expect(keys).toContain("blacksmith_walk_atlas");
    expect(keys).not.toContain("blacksmith_walk_atlas_quarter");
    expect(internals.walkAnim?.frames).toHaveLength(8);
    expect(internals.walkAnim?.frames[0].width).toBe(768);
    expect(internals.sprite.texture.source.scaleMode).toBe("linear");
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.outroFrame).toBeUndefined();
    expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
    expect(internals.sprite.filters?.[0] === blacksmithWalkColorFilter(0)).toBe(true);
    unit.stepSpawnAnimation(0.5);
    expect(internals.walkAnim?.frameIndex).toBe(0);
    for (let index = 1; index <= 16; index += 1) {
        unit.setBoardWalkDistanceCells((index * 1.3) / 8 - 0.0001);
        expect(internals.walkAnim?.frameIndex).toBe((index - 1) % 8);
        unit.setBoardWalkDistanceCells((index * 1.3) / 8);
        expect(internals.walkAnim?.frameIndex).toBe(index % 8);
        expect(internals.sprite.filters?.[0] === blacksmithWalkColorFilter(index % 8)).toBe(true);
        expect(internals.sprite.filters?.filter((filter) => filter instanceof ColorMatrixFilter)).toHaveLength(1);
        unit.stepSpawnAnimation(0.1001);
        expect(internals.walkAnim?.frameIndex).toBe(index % 8);
    }
    unit.stopBoardWalkAnimation();
    expect(internals.walkAnim).toBeUndefined();
    expect(internals.sprite.texture).toBe(idleTexture);
    expect(internals.sprite.filters ?? []).not.toContain(blacksmithWalkColorFilter(0));
});

assetTest(
    "plays three Mermaid strikes at canonical body scale and restores idle after completion or interruption",
    () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const actions = ["melee_attack", "melee_attack_up", "melee_attack_down"] as const;
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const preview of [false, true]) {
                const textures = new Map<string, Texture>();
                for (const name of ["idle", "walk", "hit", ...actions]) {
                    const meta = animationAtlases.Mermaid[name];
                    textures.set(
                        `mermaid_${name}_atlas_quarter`,
                        new Texture({
                            source: new BufferImageSource({
                                resource: new Uint8Array(4),
                                width: meta.atlasWidth / 4,
                                height: meta.atlasHeight / 4,
                            }),
                        }),
                    );
                }
                const unit = createRenderableUnit(
                    team,
                    "Might",
                    "Mermaid",
                    "mermaid_512",
                    (key) => textures.get(key) ?? Texture.WHITE,
                );
                const root = new Container();
                unit.setPosition(0, 1024);
                unit.ensureVisual(root, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    selectionAnimFrames: Texture[];
                    oneShotAnim?: { frames: Texture[]; frameIndex: number };
                };
                const idleHeight = state.sprite.height;
                const idleScale = [state.sprite.scale.x, state.sprite.scale.y];
                for (const action of actions) {
                    expect(creatureOneShotAnimationEnabledForUnit("Mermaid", action)).toBe(true);
                    let completed = 0;
                    expect(unit.playOneShotAnimation(action, () => completed++, preview)).toBe(true);
                    expect(state.oneShotAnim?.frames).toHaveLength(19);
                    // Extra canvas space allows the weapon to extend without resizing the creature.
                    expect(state.sprite.height * (768 / 1152)).toBeCloseTo(idleHeight, 6);
                    expect(state.sprite.anchor.y).toBe(986 / 1152);
                    const seen = new Set([0]);
                    for (let tick = 0; tick < 34; tick++) {
                        unit.stepSpawnAnimation(1 / 240);
                        unit.syncVisual(root, gridSettings);
                        expect(completed).toBe(0);
                        seen.add(state.oneShotAnim!.frameIndex);
                        expect(state.sprite.height * (768 / 1152)).toBeCloseTo(idleHeight, 6);
                        expect(state.sprite.anchor.y).toBe(986 / 1152);
                    }
                    expect(seen.size).toBe(19);
                    unit.stepSpawnAnimation(1 / 240);
                    expect(completed).toBe(1);
                    expect(state.oneShotAnim).toBeUndefined();
                    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                    expect(state.sprite.scale.x).toBeCloseTo(idleScale[0], 6);
                    expect(state.sprite.scale.y).toBeCloseTo(idleScale[1], 6);
                    expect(state.sprite.anchor.y).toBe(730 / 768);
                }
                unit.playOneShotAnimation("melee_attack_up", undefined, preview);
                unit.stepSpawnAnimation(1 / 240);
                unit.playOneShotAnimation("melee_attack_down", undefined, preview);
                expect(state.sprite.height * (768 / 1152)).toBeCloseTo(idleHeight, 6);
                unit.playOneShotAnimation("hit", undefined, preview);
                expect(state.sprite.height).toBeCloseTo(idleHeight, 6);
                unit.returnToIdleAnimation();
                expect(state.sprite.scale.y).toBeCloseTo(idleScale[1], 6);
            }
        }
    },
);

assetTest("cycles Mermaid idle with independently accelerated hair and resumes it after walking", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Mermaid", "mermaid_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const internals = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
    };
    expect(creatureIdleAnimationEnabledForUnit("Mermaid")).toBe(true);
    expect(keys).toContain("mermaid_idle_atlas_quarter");
    expect(internals.selectionAnimFrames).toHaveLength(320);
    const frameDurationMs = 50 / 1.35 / 1.07;
    const idleScale = { x: internals.sprite.scale.x, y: internals.sprite.scale.y };
    const idleAnchor = internals.sprite.anchor.y;
    for (let step = 0; step <= 640; step++) {
        unit.stepSelectionAnimation(internals.selectionAnimationStartedAtMs + step * frameDurationMs + 1);
        expect(internals.selectionAnimFrameIndex).toBe(step % 320);
        expect(internals.sprite.texture).toBe(internals.selectionAnimFrames[step % 320]);
        expect(internals.sprite.scale.x).toBe(idleScale.x);
        expect(internals.sprite.scale.y).toBe(idleScale.y);
        expect(internals.sprite.anchor.y).toBe(idleAnchor);
    }
    unit.startBoardWalkAnimation(1, 3);
    unit.setBoardWalkDistanceCells(0.65);
    unit.stopBoardWalkAnimation();
    unit.stepSelectionAnimation(internals.selectionAnimationStartedAtMs + frameDurationMs + 1);
    expect(internals.selectionAnimFrameIndex).toBe(1);
    expect(internals.sprite.scale.y).toBeCloseTo(idleScale.y);
});

assetTest("cycles Mermaid through all eight slither poses and restores idle while other animations are frozen", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Mermaid", "mermaid_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    const internals = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number; loopStartFrame: number; loopEndFrame: number };
    };
    const idleTexture = internals.sprite.texture;
    const idleScaleY = internals.sprite.scale.y;
    unit.startBoardWalkAnimation(1, 3);
    expect(creatureWalkAnimationEnabledForUnit("Mermaid")).toBe(true);
    expect(keys).toContain("mermaid_walk_atlas_quarter");
    expect(internals.walkAnim?.frames).toHaveLength(8);
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.sprite.scale.y * internals.sprite.texture.height).toBeCloseTo(idleScaleY * idleTexture.height);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8);
        expect(internals.walkAnim?.frameIndex).toBe(step % 8);
        expect(internals.sprite.texture).toBe(internals.walkAnim!.frames[step % 8]!);
    }
    unit.stopBoardWalkAnimation();
    expect(internals.walkAnim).toBeUndefined();
    expect(internals.sprite.texture).toBe(idleTexture);
    expect(internals.sprite.scale.y).toBeCloseTo(idleScaleY);
});

assetTest("cycles Wolf Rider gait every 1.3 cells while other animations are frozen", () => {
    document.cookie ??= "";
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Might", "Wolf Rider", "wolf_rider_512", () => Texture.WHITE);
    const internals = unit as unknown as {
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
    expect(creatureWalkAnimationEnabledForUnit("Wolf Rider")).toBe(true);
    expect(internals.walkAnim?.frames).toHaveLength(8);
    expect(internals.walkAnim?.loopStartFrame).toBe(0);
    expect(internals.walkAnim?.loopEndFrame).toBe(7);
    expect(internals.walkAnim?.outroFrame).toBeUndefined();
    expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
    for (let index = 1; index <= 8; index += 1) {
        unit.setBoardWalkDistanceCells((index * 1.3) / 8);
        expect(internals.walkAnim?.frameIndex).toBe(index % 8);
        unit.stepSpawnAnimation(0.5);
        expect(internals.walkAnim?.frameIndex).toBe(index % 8);
    }
    unit.setBoardWalkDistanceCells(2.6);
    expect(internals.walkAnim?.frameIndex).toBe(0);
    unit.setBoardWalkDistanceCells(2.6 + 1.3 / 2);
    expect(internals.walkAnim?.frameIndex).toBe(4);
    unit.finishBoardWalkAnimationAfterFullCycle();
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

    unit.startBoardWalkAnimation(1);
    // The authored run is four cells: a start pose, two looping strides and a finish pose.
    expect(internals.walkAnim?.frames).toHaveLength(4);
    expect(internals.walkAnim?.loopStartFrame).toBe(1);
    expect(internals.walkAnim?.loopEndFrame).toBe(2);
    expect(internals.walkAnim?.outroFrame).toBe(3);
    const runFrameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
    expect(runFrameMs).toBeGreaterThan(0);

    unit.finishBoardWalkAnimationAfterFullCycle();
    const frameSeconds = (runFrameMs + 0.1) / 1000;
    // The run ends on its finish pose, whatever number of strides the loop still owed.
    let lastFrameIndex: number | undefined;
    for (let index = 0; index < 8 && internals.walkAnim; index += 1) {
        lastFrameIndex = internals.walkAnim?.frameIndex;
        unit.stepSpawnAnimation(frameSeconds);
    }
    expect(lastFrameIndex).toBe(3);
    expect(internals.walkAnim).toBeUndefined();
});

assetTest("preserves Fairy take-off and landing timing while flight cycles every 1.3 cells", () => {
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
    for (let index = 1; index <= 6; index++) {
        unit.setBoardWalkDistanceCells(introDistanceCells + (index * 1.3) / 3);
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
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            durationPerFrame: number;
            frameDurationsMs?: number[];
            holdLastFrame?: boolean;
        };
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

    assetTest("keeps the flag height through authored walk frames, turns and the return to idle", () => {
        const unit = createWanderingMage();
        const root = new Container();
        unit.ensureVisual(root, gridSettings);
        const internals = unit as unknown as AnimationInternals & { badgeContainer: Container };
        const initialOffset = internals.badgeContainer.y - unit.getPosition().y;
        unit.startBoardWalkAnimation(1);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        for (let frame = 0; frame < 16; frame++) {
            unit.setPosition(frame * 20, 1024 + frame * 8);
            unit.setBoardWalkDistanceCells((frame * 1.3) / 8);
            if (frame === 8) unit.setBoardFacingFromMovement(-1);
            unit.ensureVisual(root, gridSettings);
            expect(internals.badgeContainer.y - unit.getPosition().y).toBeCloseTo(initialOffset, 7);
        }
        unit.stopBoardWalkAnimation();
        unit.ensureVisual(root, gridSettings);
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.badgeContainer.y - unit.getPosition().y).toBeCloseTo(initialOffset, 7);
    });

    assetTest("starts its 120-frame breathing/fire cycle without requiring selection", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        expect(internals.selectionAnimFrames).toHaveLength(120);
        expect(internals.sprite?.texture.width).toBe(192);
        expect(internals.sprite?.texture.height).toBe(192);
    });

    assetTest("plays a two-second authored idle with fixed scale and unobstructed boots", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        COMMON_IDLE_BREATH_SETTINGS.enabled = true;
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;
        Object.assign(unit, { refreshedIdlePhaseRatio: 0 });
        const sprite = internals.sprite!;
        const root = new Container();
        for (const direction of [1, -1]) {
            unit.faceBoardTarget({ x: direction * 1024, y: 1024 });
            unit.ensureVisual(root, gridSettings);
            const initialScale = { x: sprite.scale.x, y: sprite.scale.y };
            for (let index = 0; index <= 120; index++) {
                unit.ensureVisual(root, gridSettings);
                unit.stepSelectionAnimation((index * 1000) / 60 + 0.001);
                expect(sprite.texture).toBe(internals.selectionAnimFrames![index % 120]);
                expect(sprite.scale.x).toBe(initialScale.x);
                expect(sprite.scale.y).toBe(initialScale.y);
                unit.stepSelectionAnimation((index * 1000) / 60 + 16);
                expect(sprite.texture).toBe(internals.selectionAnimFrames![index % 120]);
            }
        }
        expect(internals.stackPowerPips).toHaveLength(0);
        expect(internals.stackPowerContainer).toBeUndefined();
    });

    assetTest("temporarily switches to walk, mirrors left, then resumes idle", () => {
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(-1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.loopStartFrame).toBe(0);
        expect(internals.walkAnim?.loopEndFrame).toBe(7);
        expect(internals.walkAnim?.outroFrame).toBeUndefined();
        expect(internals.walkAnim?.durationPerFrameMs).toBeCloseTo(74.4048, 3);
        expect(internals.walkAnim?.distanceDriven).toBe(true);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);

        const walkFrameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        unit.stepSpawnAnimation((walkFrameMs + 1) / 1000);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        unit.setBoardWalkDistanceCells(0);
        expect(internals.walkAnim?.frameIndex).toBe(0);

        unit.stopBoardWalkAnimation();
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
    });

    assetTest("preserves Wandering Mage visible width and height when entering and leaving its HD walk", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        const root = new Container();
        unit.ensureVisual(root, gridSettings);
        const internals = unit as unknown as AnimationInternals;
        const sprite = internals.sprite!;
        const idleCanvasWidth = sprite.texture.width * Math.abs(sprite.scale.x);
        const idleCanvasHeight = sprite.texture.height * Math.abs(sprite.scale.y);
        // Measured opaque bounds of the 768px battlefield reference and the matching opening walk pose.
        const idleVisibleWidth = idleCanvasWidth * (697 / 768);

        for (const direction of [1, -1]) {
            unit.startBoardWalkAnimation(direction);
            unit.ensureVisual(root, gridSettings);
            const walkVisibleWidth = sprite.texture.width * Math.abs(sprite.scale.x) * (517 / 768);
            expect(walkVisibleWidth).toBeCloseTo(idleVisibleWidth, 5);
            expect(sprite.texture.height * Math.abs(sprite.scale.y)).toBeCloseTo(idleCanvasHeight, 5);
            const walkScaleX = Math.abs(sprite.scale.x);
            for (let index = 0; index < 8; index++) {
                unit.setBoardWalkDistanceCells((index * 1.3) / 8);
                unit.ensureVisual(root, gridSettings);
                expect(Math.abs(sprite.scale.x)).toBeCloseTo(walkScaleX, 5);
                expect(Math.sign(sprite.scale.x)).toBe(direction);
            }
            unit.stopBoardWalkAnimation();
            unit.ensureVisual(root, gridSettings);
            expect(sprite.texture.width * Math.abs(sprite.scale.x)).toBeCloseTo(idleCanvasWidth, 5);
            expect(sprite.texture.height * Math.abs(sprite.scale.y)).toBeCloseTo(idleCanvasHeight, 5);
        }
    });

    assetTest("maps all eight Wandering Mage gait frames to exactly 1.3 cells during the global freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        expect(creatureWalkAnimationEnabledForUnit("Wandering Mage")).toBe(true);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.frames[0].width).toBe(192);
        expect(internals.walkAnim?.frames[0].height).toBe(192);
        const shownFrames: number[] = [];
        for (let index = 0; index < 8; index++) {
            unit.setBoardWalkDistanceCells((index * 1.3) / 8);
            shownFrames.push(internals.walkAnim?.frameIndex ?? -1);
        }
        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        unit.stepSpawnAnimation(1);
        expect(internals.walkAnim?.frameIndex).toBe(7);
        unit.setBoardFacingFromMovement(-1);
        expect(internals.walkAnim?.frameIndex).toBe(7);
        unit.setBoardWalkDistanceCells(1.3);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        expect(internals.walkAnim?.completedCycles).toBe(1);
        unit.setBoardWalkDistanceCells(2.6);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        expect(internals.walkAnim?.completedCycles).toBe(2);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
    });

    assetTest("plays Mage melee and book cast at idle scale and returns without a texture-size jump", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        for (const state of ["melee_attack_up", "melee_attack", "melee_attack_down", "cast"]) {
            const durations =
                state === "cast"
                    ? [80, 140, 160, 220, 200, 160, 140, 100].map((duration) => duration / 1.15)
                    : [50, 110, 130, 60, 70, 90, 140, 70];
            for (const direction of [-1, 1]) {
                const unit = createWanderingMage();
                unit.setBoardFacing(direction);
                const root = new Container();
                unit.ensureVisual(root, gridSettings);
                const internals = unit as unknown as AnimationInternals;
                const sprite = internals.sprite!;
                const scale = { x: sprite.scale.x, y: sprite.scale.y };
                let completions = 0;
                expect(unit.playOneShotAnimation(state, () => completions++)).toBe(true);
                expect(internals.oneShotAnim?.frames).toHaveLength(8);
                expect(internals.oneShotAnim?.frameDurationsMs).toEqual(durations);
                expect(sprite.texture.width).toBe(256);
                expect(sprite.scale.x).toBeCloseTo(scale.x, 8);
                expect(sprite.scale.y).toBeCloseTo(scale.y, 8);
                for (let index = 0; index < durations.length; index++) {
                    unit.ensureVisual(root, gridSettings);
                    expect(internals.oneShotAnim?.frameIndex).toBe(index);
                    expect(sprite.scale.x).toBeCloseTo(scale.x, 8);
                    expect(sprite.scale.y).toBeCloseTo(scale.y, 8);
                    unit.stepOneShotAnimation(durations[index]);
                }
                expect(completions).toBe(1);
                expect(internals.oneShotAnim).toBeUndefined();
                expect(sprite.texture.width).toBe(192);
                expect(internals.selectionAnimFrames).toContain(sprite.texture);
                expect(sprite.scale.x).toBeCloseTo(scale.x, 8);
                expect(sprite.scale.y).toBeCloseTo(scale.y, 8);
            }
        }
    });

    assetTest("routes Mage melee to three authored variants while keeping ranged attacks separate", () => {
        const unit = createWanderingMage();
        for (const [y, suffix] of [
            [2048, "_up"],
            [1024, ""],
            [0, "_down"],
        ] as const) {
            const target = { x: 1024, y };
            expect(unit.getAttackAnimationStateForTarget(target, "melee")).toBe(`melee_attack${suffix}`);
            expect(unit.getAttackAnimationStateForTarget(target, "range")).toBe(`attack${suffix}`);
        }
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        let completed = false;
        expect(
            unit.playOneShotAnimation("melee_attack", () => {
                completed = true;
            }),
        ).toBe(true);
        for (let i = 0; i < 43; i++) unit.stepSpawnAnimation(1 / 240);
        expect(completed).toBe(false);
        unit.stepSpawnAnimation(1 / 240);
        expect(completed).toBe(true);
    });

    assetTest("plays the 600ms Mage hit once and restores idle in the completion tick", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;
        const sprite = internals.sprite!;
        const scale = { x: sprite.scale.x, y: sprite.scale.y };
        let completions = 0;
        expect(unit.playOneShotAnimation("hit", () => completions++)).toBe(true);
        expect(internals.oneShotAnim?.frames).toHaveLength(24);
        expect(internals.oneShotAnim?.frameDurationsMs).toEqual(Array(24).fill(25));
        for (let index = 0; index < 24; index++) {
            expect(internals.oneShotAnim?.frameIndex).toBe(index);
            unit.ensureVisual(new Container(), gridSettings);
            expect(sprite.scale.x).toBe(scale.x);
            expect(sprite.scale.y).toBe(scale.y);
            unit.stepOneShotAnimation(25);
        }
        expect(completions).toBe(1);
        expect(internals.oneShotAnim).toBeUndefined();
        expect(internals.selectionAnimFrames).toContain(sprite.texture);
        unit.stepOneShotAnimation(1000);
        expect(completions).toBe(1);
    });

    assetTest("applies Mage fire retiming only while idle and detaches it during cast", () => {
        const sync = spyOn(mageIdleFire, "syncWanderingMageIdleFire").mockImplementation(() => {});
        try {
            const unit = createWanderingMage();
            const root = new Container();
            unit.ensureVisual(root, gridSettings);
            expect(sync.mock.calls.at(-1)?.[1]).toBeGreaterThanOrEqual(0);
            expect(sync.mock.calls.at(-1)?.[3]).toHaveLength(120);
            expect(unit.playOneShotAnimation("cast")).toBe(true);
            unit.ensureVisual(root, gridSettings);
            expect(sync.mock.calls.at(-1)?.[1]).toBe(-1);
            unit.stepOneShotAnimation(1200 / 1.15 + 0.001);
            unit.ensureVisual(root, gridSettings);
            expect(sync.mock.calls.at(-1)?.[1]).toBeGreaterThanOrEqual(0);
        } finally {
            sync.mockRestore();
        }
    });

    assetTest("finishes Mage book ignition 15% faster during the animation freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        let completions = 0;
        expect(unit.playOneShotAnimation("cast", () => completions++)).toBe(true);
        for (let tick = 0; tick < 62; tick++) unit.stepSpawnAnimation(1 / 240);
        expect(completions).toBe(0);
        expect(unit.isPlayingOneShotAnimation("cast")).toBe(true);
        // 62 render ticks are 1033ms; the shortened cast ends at 1043.478ms.
        unit.stepSpawnAnimation((1200 / 1.15 - (62 * 1000) / 60) / 4000 + 1e-9);
        expect(completions).toBe(1);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        const internals = unit as unknown as AnimationInternals;
        expect(internals.selectionAnimFrames).toContain(internals.sprite!.texture);
    });

    assetTest("uses authored Mage death timing and keeps the final pose after completing once", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createWanderingMage();
        const internals = unit as unknown as AnimationInternals;
        const durations = [40, 50, 60, 80, 100, 100, 100, 100, 100, 100, 120, 250];
        let completions = 0;
        expect(unit.playOneShotAnimation("death", () => completions++)).toBe(true);
        expect(internals.oneShotAnim?.frames).toHaveLength(12);
        expect(internals.oneShotAnim?.frameDurationsMs).toEqual(durations);
        for (let index = 0; index < durations.length; index++) {
            expect(internals.oneShotAnim?.frameIndex).toBe(index);
            unit.stepOneShotAnimation(durations[index] - 1);
            expect(internals.oneShotAnim?.frameIndex).toBe(index);
            expect(completions).toBe(0);
            unit.stepOneShotAnimation(1);
        }
        expect(completions).toBe(1);
        expect(internals.oneShotAnim?.holdLastFrame).toBe(true);
        expect(internals.sprite?.texture).toBe(internals.oneShotAnim?.frames[11]);
        unit.stepOneShotAnimation(5000);
        expect(internals.oneShotAnim?.frameIndex).toBe(11);
        expect(completions).toBe(1);
    });

    assetTest("matches Mage reaction previews to the game's 60Hz loop with its legacy 1/240 step", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        for (const [state, steps] of [
            ["hit", 36],
            ["death", 72],
        ] as const) {
            const unit = createWanderingMage();
            let completions = 0;
            expect(unit.playOneShotAnimation(state, () => completions++)).toBe(true);
            for (let index = 0; index < steps - 1; index++) unit.stepSpawnAnimation(1 / 240);
            expect(completions).toBe(0);
            unit.stepSpawnAnimation(1 / 240 + 0.000001);
            expect(completions).toBe(1);
        }
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

        const idleScale = { x: internals.sprite!.scale.x, y: internals.sprite!.scale.y };
        expect(unit.playOneShotAnimation("cast")).toBe(true);
        unit.ensureVisual(new Container(), gridSettings);
        expect(unit.isPlayingOneShotAnimation("cast")).toBe(true);
        expect(internals.oneShotAnim?.frameDurationsMs).toEqual(
            [80, 140, 160, 220, 200, 160, 140, 100].map((duration) => duration / 1.15),
        );
        expect(internals.sprite?.texture.width).toBe(256);
        expect(internals.sprite?.texture.height).toBe(256);
        expect(Math.abs(internals.sprite!.scale.x)).toBeCloseTo(Math.abs(idleScale.x));
        expect(internals.sprite!.scale.y).toBeCloseTo(idleScale.y);

        unit.stepOneShotAnimation(1200);
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

    assetTest("plays Orc hit and death with authored timing, fixed scale, and one completion callback", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        for (const action of ["hit", "death"] as const) {
            for (const direction of [-1, 1] as const) {
                const unit = createOrc();
                unit.setBoardFacingFromMovement(direction);
                const state = unit as unknown as {
                    sprite: Sprite;
                    selectionAnimFrames: Texture[];
                    oneShotAnim?: { frames: Texture[]; frameIndex: number; frameDurationsMs?: readonly number[] };
                };
                const scale = { x: state.sprite.scale.x, y: state.sprite.scale.y };
                const durations =
                    action === "hit"
                        ? [40, 45, 75, 55, 55, 65, 70, 45]
                        : [60, 90, 120, 140, 130, 100, 120, 240].map((duration) => duration / 1.15);
                let calls = 0;
                expect(creatureOneShotAnimationEnabledForUnit("Orc", action)).toBe(true);
                expect(unit.playOneShotAnimation(action, () => calls++)).toBe(true);
                const frames = state.oneShotAnim!.frames;
                expect(state.oneShotAnim?.frameDurationsMs).toEqual(durations);
                for (let frame = 0; frame < frames.length; frame++) {
                    expect(state.sprite.texture).toBe(frames[frame]);
                    expect(state.sprite.texture.height).toBe(768);
                    expect(state.sprite.scale.x).toBeCloseTo(scale.x);
                    expect(state.sprite.scale.y).toBeCloseTo(scale.y);
                    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                    expect(calls).toBe(0);
                    unit.stepOneShotAnimation(durations[frame]);
                }
                expect(calls).toBe(1);
                if (action === "hit") {
                    expect(state.oneShotAnim).toBeUndefined();
                    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                } else {
                    expect(state.sprite.texture).toBe(frames[7]);
                    unit.stepSelectionAnimation(performance.now() + 5000);
                    unit.stepOneShotAnimation(10000);
                    expect(state.sprite.texture).toBe(frames[7]);
                    expect(calls).toBe(1);
                    unit.returnToIdleAnimation();
                    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                }
            }
        }
    });

    assetTest("releases each Orc throw once at the empty-hand frame and holds until impact", () => {
        for (const direction of [-1, 1]) {
            for (const action of ["attack", "attack_up", "attack_down"]) {
                const unit = createOrc();
                const world = new Container();
                unit.setBoardFacing(direction);
                unit.ensureVisual(world, gridSettings);
                const state = unit as unknown as {
                    sprite: Sprite;
                    oneShotAnim?: { frameIndex: number; frames: Texture[] };
                };
                const scale = { x: state.sprite.scale.x, y: state.sprite.scale.y };
                const idle = state.sprite.texture;
                let releases = 0;
                let cancels = 0;
                expect(
                    unit.playOrcRangedThrow(
                        action,
                        () => releases++,
                        () => cancels++,
                    ),
                ).toBe(true);
                unit.stepOneShotAnimation(284);
                expect(releases).toBe(0);
                unit.stepOneShotAnimation(1);
                expect(releases).toBe(1);
                expect(state.oneShotAnim?.frameIndex).toBe(4);
                const origin = unit.getRangedProjectileOrigin({ x: direction * 500, y: 1024 }, gridSettings);
                expect(Number.isFinite(origin.x)).toBe(true);
                expect(Number.isFinite(origin.y)).toBe(true);
                expect(unit.getOrcProjectileAppearance()?.facing).toBe(direction);
                const expectedLength = action === "attack_up" ? 336.69 : action === "attack_down" ? 254.72 : 301.75;
                expect(unit.getOrcProjectileAppearance()?.length).toBeCloseTo(Math.abs(scale.y) * expectedLength);
                unit.stepOneShotAnimation(5000);
                unit.ensureVisual(world, gridSettings);
                expect(releases).toBe(1);
                expect(state.oneShotAnim?.frameIndex).toBe(6);
                expect(state.sprite.scale.x).toBeCloseTo(scale.x);
                expect(state.sprite.scale.y).toBeCloseTo(scale.y);
                unit.finishOrcRangedThrow();
                expect(state.oneShotAnim).toBeUndefined();
                expect(state.sprite.texture).toBe(idle);
                expect(state.sprite.scale.y).toBeCloseTo(scale.y);
                expect(
                    unit.playOrcRangedThrow(
                        action,
                        () => releases++,
                        () => cancels++,
                    ),
                ).toBe(true);
                unit.returnToIdleAnimation();
                unit.stepOneShotAnimation(1000);
                expect(releases).toBe(1);
                expect(cancels).toBe(2);
            }
        }
    });

    assetTest("plays three Orc melee attacks without resizing the body or drifting on return to idle", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        for (const direction of [-1, 1]) {
            const unit = createOrc();
            unit.setBoardFacingFromMovement(direction);
            const world = new Container();
            unit.ensureVisual(world, gridSettings);
            const internals = unit as unknown as {
                sprite: Sprite;
                oneShotAnim?: { frames: Texture[]; frameIndex: number; elapsed: number; frameDurationsMs: number[] };
            };
            const scale = { x: internals.sprite.scale.x, y: internals.sprite.scale.y };
            const idle = internals.sprite.texture;
            for (const action of ["melee_attack_up", "melee_attack", "melee_attack_down"] as const) {
                let completed = 0;
                expect(creatureOneShotAnimationEnabledForUnit("Orc", action)).toBe(true);
                expect(unit.playOneShotAnimation(action, () => completed++)).toBe(true);
                const frames = internals.oneShotAnim!.frames;
                const durations = internals.oneShotAnim!.frameDurationsMs;
                expect(frames).toHaveLength(8);
                expect(frames[0].width).toBe(1280);
                expect(frames[0].height).toBe(1024);
                expect(durations).toEqual(animationAtlases.Orc[action].frameDurationsMs!);
                for (let frame = 0; frame < 8; frame++) {
                    unit.ensureVisual(world, gridSettings);
                    expect(internals.sprite.texture).toBe(frames[frame]);
                    expect(internals.sprite.scale.x).toBeCloseTo(scale.x);
                    expect(internals.sprite.scale.y).toBeCloseTo(scale.y);
                    expect(internals.sprite.anchor.y).toBe(970 / 1024);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(durations[frame]);
                }
                expect(completed).toBe(1);
                expect(internals.sprite.texture).toBe(idle);
                expect(internals.sprite.scale.x).toBeCloseTo(scale.x);
                expect(internals.sprite.scale.y).toBeCloseTo(scale.y);
                expect(internals.sprite.anchor.y).toBe(730 / 768);
                unit.stepOneShotAnimation(9999);
                expect(completed).toBe(1);
                unit.playOneShotAnimation(action);
                unit.stepSpawnAnimation(1 / 240);
                expect(internals.oneShotAnim!.elapsed).toBeCloseTo(1000 / 60);
                unit.returnToIdleAnimation();
                expect(internals.sprite.scale.y).toBeCloseTo(scale.y);
            }
        }
    });

    assetTest("plays every Orc breathing sprite over 3 seconds with fixed scale and foot anchor", () => {
        for (const enabled of [false, true]) {
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = enabled;
            const unit = createOrc();
            const internals = unit as unknown as AnimationInternals;
            const startedAt = internals.selectionAnimationStartedAtMs;
            const scaleX = internals.sprite?.scale.x;
            const scaleY = internals.sprite?.scale.y;
            expect(creatureIdleAnimationEnabledForUnit("Orc")).toBe(true);
            expect(internals.selectionAnimFrames).toHaveLength(24);
            expect(internals.orcIdleAxeTwirlFrames).toBeUndefined();
            expect(internals.orcActiveBattleCryFrames).toBeUndefined();
            for (let frame = 0; frame < 24; frame++) {
                unit.stepSelectionAnimation(startedAt + frame * 125 + 0.001);
                expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[frame]);
                expect(internals.sprite?.texture.height).toBe(768);
                expect(internals.sprite?.scale.x).toBe(scaleX);
                expect(internals.sprite?.scale.y).toBe(scaleY);
                expect(internals.sprite?.anchor.y).toBeCloseTo(730 / 768);
            }
            unit.stepSelectionAnimation(startedAt + 3000 + 0.001);
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[0]);
            unit.setActiveTurn(true);
            unit.stepSelectionAnimation(internals.selectionAnimationStartedAtMs + 3000 + 12 * 125 + 0.001);
            expect(internals.sprite?.texture).toBe(internals.selectionAnimFrames?.[12]);
            expect(internals.isShowingOrcBattleCryFrame).toBe(false);
        }
    });

    test("retains legacy Orc battle-cry timing helpers", () => {
        const cryWindow = ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS * 6;
        const breathingWindow = ORC_IDLE_BREATH_PERIOD_MS * ORC_ACTIVE_BATTLE_CRY_BREATH_CYCLES;

        for (let frame = 0; frame < 6; frame += 1) {
            expect(orcActiveBattleCryFrameForElapsed(frame * ORC_ACTIVE_BATTLE_CRY_FRAME_DURATION_MS)).toBe(frame);
        }
        expect(orcActiveBattleCryFrameForElapsed(cryWindow)).toBeUndefined();
        expect(orcActiveBattleCryBreathElapsed(cryWindow)).toBe(0);
        expect(orcActiveBattleCryBreathElapsed(cryWindow + breathingWindow - 1)).toBe(breathingWindow - 1);
        expect(orcActiveBattleCryFrameForElapsed(cryWindow + breathingWindow)).toBe(0);
    });

    assetTest("prefers the authored idle loop and exposes the complete ranged and melee action sets", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;

        expect(internals.selectionAnimFrames).toHaveLength(24);
        expect(internals.orcIdleAxeTwirlFrames).toBeUndefined();
        expect(internals.orcActiveBattleCryFrames).toBeUndefined();
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
        expect(internals.oneShotAnim?.frames).toHaveLength(7);
        expect(unit.isPlayingOneShotAnimation("attack")).toBe(true);
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Orc.scaleX / BATTLEFIELD_CREATURE_FRAMING.Orc.scaleY,
        );
    });

    assetTest("loops all eight Orc poses during the freeze and keeps size on walk/idle transitions", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;
        const idleTexture = internals.sprite?.texture;
        const idleScreenHeight = (idleTexture?.height ?? 0) * Math.abs(internals.sprite?.scale.y ?? 0);

        unit.startBoardWalkAnimation(-1);
        expect(creatureWalkAnimationEnabledForUnit("Orc")).toBe(true);
        expect((internals.sprite?.texture.height ?? 0) * Math.abs(internals.sprite?.scale.y ?? 0)).toBeCloseTo(
            idleScreenHeight,
        );
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.frames[0].height).toBe(768);
        expect(internals.walkAnim?.loopStartFrame).toBe(0);
        expect(internals.walkAnim?.loopEndFrame).toBe(7);
        expect(internals.walkAnim?.outroFrame).toBeUndefined();
        expect(internals.walkAnim?.distanceDriven).toBe(true);
        expect(internals.walkAnim?.frameIndex).toBe(0);
        expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);

        const shownFrames = [];
        const walkScaleX = internals.sprite?.scale.x;
        const walkScaleY = internals.sprite?.scale.y;
        for (let index = 0; index < 8; index++) {
            unit.setBoardWalkDistanceCells((index * 1.3) / 8);
            shownFrames.push(internals.walkAnim?.frameIndex);
            expect(internals.sprite?.scale.x).toBe(walkScaleX);
            expect(internals.sprite?.scale.y).toBe(walkScaleY);
        }
        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        unit.setBoardWalkDistanceCells(1.3);
        expect(internals.walkAnim?.frameIndex).toBe(0);

        unit.setBoardFacingFromMovement(1);
        unit.ensureVisual(new Container(), gridSettings);
        expect(internals.facingDirection).toBe(1);
        expect(internals.sprite?.scale.x).toBeGreaterThan(0);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.sprite?.texture).toBe(idleTexture);
        expect((internals.sprite?.texture.height ?? 0) * Math.abs(internals.sprite?.scale.y ?? 0)).toBeCloseTo(
            idleScreenHeight,
        );
    });

    assetTest("leaves the level-one Orc walk entirely to its authored sprite frames", () => {
        const unit = createOrc();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        unit.ensureVisual(new Container(), gridSettings);
        const frameMs = internals.walkAnim?.durationPerFrameMs ?? 0;
        const baseScaleX = internals.sprite?.scale.x;
        const baseScaleY = internals.sprite?.scale.y;
        expect(frameMs).toBe(100);

        unit.setBoardWalkDistanceCells((2 * 1.3) / 8);
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

assetTest("plays the eight native Troll lab frames every 1.3 cells and stops on arrival", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troll", "troll_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        walkAnim?: { frames: Texture[]; frameIndex: number; distanceDriven: boolean; loopEndFrame: number };
    };
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("troll_lab_walk_atlas");
    expect(keys).not.toContain("troll_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    expect(state.walkAnim?.distanceDriven).toBe(true);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        unit.stepSelectionAnimation(performance.now() + 1000);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor((Math.SQRT2 % 1.3) / (1.3 / 8)));
    unit.setBoardFacingFromMovement(-1);
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2 + 0.4);
    expect(state.walkAnim?.frameIndex).toBe(Math.floor(((Math.SQRT2 + 0.4) % 1.3) / (1.3 / 8)));
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(state.walkAnim).toBeUndefined();
    unit.startBoardWalkAnimation(1, 0.1);
    unit.setBoardWalkDistanceCells(0.1);
    unit.finishBoardWalkAnimationAfterFullCycle();
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest("keeps Troll lab walk size matched to the base figure through re-routes and idle", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const staticTexture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troll", "troll_512", (key) =>
        key === "troll_battlefield_side_right_final_v1" ? staticTexture : Texture.WHITE,
    );
    const root = new Container();
    const state = unit as unknown as { sprite: Sprite; walkAnim?: { frameIndex: number } };
    unit.setPosition(0, 1024);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, gridSettings);
    const idleX = Math.abs(state.sprite.scale.x);
    const idleY = Math.abs(state.sprite.scale.y);
    const idleFilters = [...(state.sprite.filters ?? [])];
    unit.startBoardWalkAnimation(1, 4);
    expect(Math.abs(state.sprite.scale.x) * 432).toBeCloseTo(idleX * 514);
    expect(Math.abs(state.sprite.scale.y) * 688).toBeCloseTo(idleY * 698);
    unit.ensureVisual(root, gridSettings);
    expect(Math.abs(state.sprite.scale.x) * 432).toBeCloseTo(idleX * 514);
    expect(Math.abs(state.sprite.scale.y) * 688).toBeCloseTo(idleY * 698);
    const walkX = Math.abs(state.sprite.scale.x);
    const walkY = Math.abs(state.sprite.scale.y);
    for (let i = 0; i < 8; i++) {
        unit.setBoardWalkDistanceCells((i * 1.3) / 8);
        unit.ensureVisual(root, gridSettings);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkX);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(walkY);
    }
    unit.startBoardWalkAnimation(-1, 2);
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(walkX);
    unit.stopBoardWalkAnimation();
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleX);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleY);
    expect(state.sprite.filters ?? []).toEqual(idleFilters);
    unit.startBoardWalkAnimation(1, 0.1);
    unit.returnToIdleAnimation();
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleX);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleY);
    unit.startBoardWalkAnimation(1, 2);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.walkAnim).toBeUndefined();
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(idleX);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(idleY);
});

assetTest("plays Troll lab breathing and club-stroke sprites without changing scale or overriding movement", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const native = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
    });
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troll", "troll_512", (key) => {
        keys.push(key);
        return key === "troll_battlefield_side_right_final_v1" ? native : Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        selectionAnimFrames: Texture[];
        selectionAnimFrameIndex: number;
        selectionAnimationStartedAtMs: number;
        walkAnim?: { frameIndex: number };
    };
    const root = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(root, gridSettings);
    const originalScale = { x: Math.abs(state.sprite.scale.x), y: Math.abs(state.sprite.scale.y) };
    expect(state.selectionAnimFrames).toHaveLength(1);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.ensureVisual(root, gridSettings);
    expect(unit.getAnimationTextureKey("idle")).toBe("troll_lab_idle_atlas");
    expect(keys).toContain("troll_lab_idle_atlas");
    expect(keys).not.toContain("troll_lab_idle_atlas_quarter");
    expect(state.selectionAnimFrames.length).toBeGreaterThanOrEqual(8);
    expect(state.selectionAnimFrames[0].width).toBe(768);
    const durations = animationAtlases["Troll Lab"].idle.frameDurationsMs!;
    expect(durations).toHaveLength(state.selectionAnimFrames.length);
    const start = state.selectionAnimationStartedAtMs;
    let elapsed = 0;
    for (let frame = 0; frame < durations.length; frame++) {
        unit.stepSelectionAnimation(start + elapsed + 0.01);
        expect(state.selectionAnimFrameIndex).toBe(frame);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[frame]);
        unit.ensureVisual(root, gridSettings);
        expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(originalScale.x);
        expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(originalScale.y);
        elapsed += durations[frame];
    }
    unit.stepSelectionAnimation(start + elapsed + 0.01);
    expect(state.selectionAnimFrameIndex).toBe(0);
    const cycleEndPauseMs = animationAtlases["Troll Lab"].idle.cycleEndPauseMs!;
    expect(cycleEndPauseMs).toBe(1000);
    unit.stepSelectionAnimation(start + elapsed + cycleEndPauseMs - 0.01);
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    unit.stepSelectionAnimation(start + elapsed + cycleEndPauseMs + durations[0] + 0.01);
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[1]);
    unit.startBoardWalkAnimation(-1, 2);
    unit.setBoardWalkDistanceCells(0.65);
    const walkingTexture = state.sprite.texture;
    unit.stepSelectionAnimation(start + 100000);
    expect(state.sprite.texture).toBe(walkingTexture);
    unit.stopBoardWalkAnimation();
    expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(originalScale.x);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(originalScale.y);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(state.selectionAnimFrames).toHaveLength(1);
    expect(state.sprite.texture).toBe(native);
    expect(Math.abs(state.sprite.scale.x)).toBeCloseTo(originalScale.x);
    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(originalScale.y);
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
        // The refreshed Troll is part of the approved base package, which this file's beforeEach turns
        // off for the legacy coverage around it.
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
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

    assetTest("uses the refreshed authored idle and walk atlases at exactly one by one-and-a-half cells", () => {
        const unit = createTroll();
        const internals = unit as unknown as AnimationInternals;
        const cellSize = gridSettings.getCellSize();

        expect(unit.hasAnimationState("idle")).toBe(true);
        expect(unit.hasAnimationState("walk")).toBe(true);
        expect(internals.selectionAnimFrames).toHaveLength(8);
        // The lab sheet ships at its authored 768px; only the older quarter atlases were 192.
        expect(internals.sprite?.texture.width).toBe(768);
        expect(internals.sprite?.texture.height).toBe(768);
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Troll.scaleX / BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        expect(Math.abs(internals.sprite?.scale.y ?? 0) * 768).toBeCloseTo(
            cellSize * 1.5 * BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        // The lab sheet plants the soles on row 730 of its 768px cell; the previous sheet used 742.
        expect(internals.sprite?.anchor.y).toBeCloseTo(730 / 768);
        expect(internals.sprite?.y).toBeCloseTo(tallBoardModelFootLineY(1024, cellSize));

        unit.startBoardWalkAnimation(-1);
        unit.ensureVisual(new Container(), gridSettings);
        // The lab walk is eight cells; the superseded sheet had nine.
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.loopStartFrame).toBe(0);
        expect(internals.walkAnim?.loopEndFrame).toBe(7);
        expect(internals.walkAnim?.outroFrame).toBeUndefined();
        // Authored cadence of the lab walk sheet (8 fps), not the 50ms of the superseded one.
        expect(internals.walkAnim?.durationPerFrameMs).toBe(125);
        expect(internals.walkAnim?.distanceDriven).toBe(true);
        expect(internals.facingDirection).toBe(-1);
        expect(internals.sprite?.scale.x).toBeLessThan(0);
        expect(Math.abs(internals.sprite?.scale.x ?? 0) / Math.abs(internals.sprite?.scale.y ?? 1)).toBeCloseTo(
            BATTLEFIELD_CREATURE_FRAMING.Troll.scaleX / BATTLEFIELD_CREATURE_FRAMING.Troll.scaleY,
        );
        expect(Math.abs(internals.sprite?.scale.y ?? 0) * 768).toBeCloseTo(
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
            // No creature grows into its landing any more: creatureGenericWholeSpriteMotionEnabledForLevel
            // is off for every level, so the whole-sprite scale-up never starts. What this test still
            // guards is that landing leaves the authored proportions and size exactly as they were.
            expect(internals.spawnAnim).toBeUndefined();
            expect(internals.sprite?.scale.x).toBe(initialScaleX);
            expect(internals.sprite?.scale.y).toBe(initialScaleY);
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

    assetTest("Troglodyte completes eight stable-head walk frames every 1.3 cells during the freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createTroglodyte();
        const internals = unit as unknown as AnimationInternals;
        unit.startBoardWalkAnimation(1);
        const firstTexture = internals.sprite?.texture;
        const baseScaleX = internals.sprite?.scale.x;
        const baseScaleY = internals.sprite?.scale.y;

        expect(creatureWalkAnimationEnabledForUnit("Troglodyte")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Troglodyte")).toBe(true);
        expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "attack")).toBe(true);
        expect(internals.walkAnim?.frames).toHaveLength(8);
        expect(internals.walkAnim?.durationPerFrameMs).toBe(100);
        const walk = internals.walkAnim as typeof internals.walkAnim & {
            distanceDriven: boolean;
            completedCycles: number;
        };
        expect(walk?.distanceDriven).toBe(true);
        // Pausing movement must hold the current pose even as the simulation clock advances.
        unit.stepSpawnAnimation(1);
        expect(walk?.frameIndex).toBe(0);
        expect(internals.sprite?.texture).toBe(firstTexture);
        for (let cycle = 0; cycle < 2; cycle++) {
            for (let frame = 0; frame < 8; frame++) {
                const distance = cycle * 1.3 + (frame * 1.3) / 8;
                unit.setBoardWalkDistanceCells(distance);
                expect(walk?.frameIndex).toBe(frame);
                expect(walk?.completedCycles).toBe(cycle);
                expect(internals.sprite?.texture).toBe(walk?.frames[frame]);
                unit.setBoardWalkDistanceCells(distance + 1.3 / 8 - 0.00001);
                expect(walk?.frameIndex).toBe(frame);
                unit.setBoardFacingFromMovement(frame % 2 === 0 ? -1 : 1);
                expect(walk?.frameIndex).toBe(frame);
            }
        }
        unit.setBoardWalkDistanceCells(2.6);
        expect(walk?.frameIndex).toBe(0);
        expect(walk?.completedCycles).toBe(2);
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

    test("holds the neutral pose after the complete authored idle cycle", () => {
        const durations = [260, 160, 160, 180, 340, 240, 280, 340];
        expect(authoredIdleFrameForElapsed(1959, durations, 1000)).toBe(7);
        expect(authoredIdleFrameForElapsed(1960, durations, 1000)).toBe(0);
        expect(authoredIdleFrameForElapsed(2959, durations, 1000)).toBe(0);
        expect(authoredIdleFrameForElapsed(2960, durations, 1000)).toBe(0);
        expect(authoredIdleFrameForElapsed(3220, durations, 1000)).toBe(1);
        expect(authoredIdleFrameForElapsed(2220, durations, 0)).toBe(1);
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

    assetTest("Troglodyte keeps cloth moving through the Heroes III idle hold and resumes it after walking", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const first = createRenderableUnit(TeamVals.LEFT, "Chaos", "Troglodyte", "troglodyte_512", () => Texture.WHITE);
        const second = createRenderableUnit(
            TeamVals.LEFT,
            "Chaos",
            "Troglodyte",
            "troglodyte_512",
            () => Texture.WHITE,
        );
        first.setPosition(0, 1024);
        second.setPosition(128, 1024);
        first.ensureVisual(new Container(), gridSettings);
        second.ensureVisual(new Container(), gridSettings);
        const firstInternals = first as unknown as IdleInternals;
        const secondInternals = second as unknown as IdleInternals;

        expect(REFRESHED_IDLE_ANIMATION_SPEED_MULTIPLIER).toBe(0.77);
        const frameDurationsMs = [...Array(17).fill(80), 40, 40, 80, 20, 60, 80, 80, 60, 20, ...Array(9).fill(80)];
        expect(firstInternals.selectionAnimFrameDurationMs).toBeCloseTo(2560 / 35);
        expect(firstInternals.selectionAnimFrames).toHaveLength(35);
        expect(firstInternals.selectionAnimFrameDurationsMs).toEqual(frameDurationsMs);
        expect(firstInternals.refreshedIdlePhaseRatio).toBe(
            refreshedIdlePhaseRatio(first.getId(), first.getUnitProperties().name),
        );
        expect(secondInternals.refreshedIdlePhaseRatio).toBe(
            refreshedIdlePhaseRatio(second.getId(), second.getUnitProperties().name),
        );
        expect(firstInternals.refreshedIdlePhaseRatio).not.toBe(secondInternals.refreshedIdlePhaseRatio);
        firstInternals.refreshedIdlePhaseRatio = 0;
        const scaleX = Math.abs(firstInternals.sprite?.scale.x ?? 0);
        const scaleY = firstInternals.sprite?.scale.y;
        // The weapon still holds for 1400 ms, while new cloth poses advance throughout that hold.
        first.stepSelectionAnimation(80);
        expect(firstInternals.sprite?.texture).toBe(firstInternals.selectionAnimFrames?.[1]);
        let elapsedMs = 0;
        for (let frame = 0; frame < frameDurationsMs.length; frame++) {
            first.stepSelectionAnimation(elapsedMs);
            expect(firstInternals.sprite?.texture).toBe(firstInternals.selectionAnimFrames?.[frame]);
            first.stepSelectionAnimation(elapsedMs + frameDurationsMs[frame] - 1);
            expect(firstInternals.sprite?.texture).toBe(firstInternals.selectionAnimFrames?.[frame]);
            elapsedMs += frameDurationsMs[frame];
        }
        expect(elapsedMs).toBe(2560);
        first.stepSelectionAnimation(elapsedMs);
        expect(firstInternals.sprite?.texture).toBe(firstInternals.selectionAnimFrames?.[0]);
        first.startBoardWalkAnimation(1);
        first.setBoardWalkDistanceCells(1.3);
        first.stopBoardWalkAnimation();
        first.ensureVisual(new Container(), gridSettings);
        first.stepSelectionAnimation(1540);
        expect(firstInternals.sprite?.texture).toBe(firstInternals.selectionAnimFrames?.[21]);
        expect(Math.abs(firstInternals.sprite?.scale.x ?? 0)).toBeCloseTo(scaleX);
        expect(firstInternals.sprite?.scale.y).toBeCloseTo(scaleY ?? 0);
        expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "attack")).toBe(true);
    });

    assetTest("plays Orc's approved combat action alongside its breathing idle and corrected walk", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Orc", "orc_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const internals = unit as unknown as IdleInternals;
        const firstIdleFrame = internals.selectionAnimFrames?.[0];

        expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
        expect(firstIdleFrame).toBeDefined();
        unit.stepSelectionAnimation(10_000);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
        unit.stepSelectionAnimation(60_000);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);

        unit.startBoardWalkAnimation(1);
        expect((unit as unknown as { walkAnim?: unknown }).walkAnim).toBeDefined();
        unit.stopBoardWalkAnimation();
        let actionCompleted = false;
        // Orc now belongs to the approved packages, so its attack plays in ordinary combat instead of
        // being skipped with an immediate completion. The global freeze no longer silences it.
        expect(unit.playOneShotAnimation("attack", () => (actionCompleted = true))).toBe(true);
        expect(unit.isPlayingOneShotAnimation("attack")).toBe(true);
        unit.returnToIdleAnimation();
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);

        // The local Animation Lab plays the same authored atlas on demand, and leaving the preview must
        // restore the permanent idle immediately.
        expect(unit.playOneShotAnimation("attack", undefined, true)).toBe(true);
        expect(unit.isPlayingOneShotAnimation("attack")).toBe(true);
        unit.returnToIdleAnimation();
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internals.selectionAnimFrames).toContain(internals.sprite?.texture);
        // Returning to idle interrupts the action, so its completion callback never fires.
        expect(actionCompleted).toBe(false);
    });

    assetTest("keeps Arbalester on its static figure with the matching shadow", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const resolvedKeys: string[] = [];
        const world = new Container();
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) => {
            resolvedKeys.push(name);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.setBattlefieldVisualProjection(true);
        unit.ensureVisual(world, gridSettings);
        const idle = unit as unknown as IdleInternals & { sprite: Sprite; silhouetteShadow: Sprite };
        const texture = idle.sprite.texture;
        expect(creatureIdleAnimationEnabledForUnit("Arbalester")).toBe(false);
        expect(resolvedKeys).toContain("arbalester_battlefield_side_right_distance_readable_v1");
        expect(resolvedKeys).not.toContain("arbalester_idle_atlas_quarter");
        expect(idle.selectionAnimFrames).toHaveLength(1);
        for (const elapsed of [0, 125, 1000, 2500]) {
            unit.stepSelectionAnimation(elapsed);
            unit.ensureVisual(world, gridSettings);
            expect(idle.sprite.texture).toBe(texture);
            expect(idle.silhouetteShadow.texture).toBe(texture);
            expect(idle.silhouetteShadow.anchor.x).toBe(idle.sprite.anchor.x);
            expect(idle.silhouetteShadow.anchor.y).toBe(idle.sprite.anchor.y);
        }
    });

    assetTest("streams native Arbalester idle only in the lab and preserves registration through actions", async () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const staticTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const world = new Container();
        const resolved: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) => {
            resolved.push(name);
            return name.includes("_atlas") ? Texture.WHITE : staticTexture;
        });
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const idle = unit as unknown as IdleInternals & {
            sprite: Sprite;
            arbalesterIdlePager?: ArbalesterIdlePager;
            selectionAnimFrameIndex: number;
            selectionAnimFootAnchorY: number;
            selectionAnimationStartedAtMs: number;
        };
        const baseHeight = idle.sprite.texture.height * Math.abs(idle.sprite.scale.y);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const native = arbalesterIdlePages(animationAtlases.Arbalester.idle)!;
        expect(native).toBeDefined();
        idle.arbalesterIdlePager?.dispose();
        const pool = new ArbalesterIdlePagePool(async (page) => ({
            frames: Array.from(
                { length: page.frameCount },
                () =>
                    new Texture({
                        source: new BufferImageSource({ resource: new Uint8Array(4), width: 384, height: 384 }),
                    }),
            ),
            async unload() {},
        }));
        idle.arbalesterIdlePager = new ArbalesterIdlePager(native, pool);
        idle.selectionAnimationStartedAtMs = 0;
        for (let tick = 0; tick < 12; tick++) await Promise.resolve();
        const labScale = 727 / 688;
        expect(idle.selectionAnimFrames).toHaveLength(1);
        expect(idle.selectionAnimFrames![0].height).toBe(384);
        expect(native.durations).toEqual(Array(1354).fill(20));
        expect(native.durations.reduce((sum, duration) => sum + duration, 0)).toBe(27080);
        expect(idle.selectionAnimFootAnchorY).toBeCloseTo(369 / 384 - 32 / (768 * labScale));
        expect(idle.sprite.texture.height * Math.abs(idle.sprite.scale.y)).toBeCloseTo(baseHeight * labScale);
        for (const elapsed of [0, 1200, 1280, 27079, 27080]) {
            unit.stepSelectionAnimation(elapsed);
            for (let tick = 0; tick < 12; tick++) await Promise.resolve();
            unit.stepSelectionAnimation(elapsed);
            expect(idle.selectionAnimFrameIndex).toBe(Math.floor(elapsed / 20) % 1354);
            expect(idle.sprite.texture.height).toBe(384);
            expect(idle.sprite.texture.height * Math.abs(idle.sprite.scale.y)).toBeCloseTo(baseHeight * labScale);
        }
        unit.startBoardWalkAnimation(1);
        expect(idle.sprite.texture.height).toBe(768);
        unit.setBoardWalkDistanceCells(0.75);
        unit.stopBoardWalkAnimation();
        unit.ensureVisual(world, gridSettings);
        expect(idle.sprite.texture.height).toBe(384);
        expect(idle.sprite.texture.height * Math.abs(idle.sprite.scale.y)).toBeCloseTo(baseHeight * labScale);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(idle.arbalesterIdlePager).toBeUndefined();
        expect(idle.selectionAnimFrames).toHaveLength(1);
        expect(idle.sprite.texture.height * Math.abs(idle.sprite.scale.y)).toBeCloseTo(baseHeight);
        expect(creatureIdleAnimationEnabledForUnit("Arbalester")).toBe(false);
        expect(resolved).not.toContain("arbalester_idle_atlas_quarter");
        expect(resolved).toContain("arbalester_hit_atlas");
        expect(resolved).toContain("arbalester_walk_atlas");
    });

    assetTest("keeps Arbalester lab reactions on authored time, planted scale and a held corpse", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const staticTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const world = new Container();
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) =>
            name.includes("_atlas") ? Texture.WHITE : staticTexture,
        );
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const state = unit as unknown as IdleInternals & {
            sprite: Sprite;
            selectionAnimationStartedAtMs: number;
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs?: readonly number[];
                authoredRealTime?: boolean;
            };
        };
        const soleY = (row: number): number =>
            state.sprite.y + (row - state.sprite.anchor.y * state.sprite.texture.height) * state.sprite.scale.y;
        const baseSoleY = soleY(762);
        const baseVisibleHeight = 727 * Math.abs(state.sprite.scale.y);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const expectLabRegistration = (): void => {
            expect(soleY(369)).toBeCloseTo(baseSoleY, 8);
            expect(344 * Math.abs(state.sprite.scale.y)).toBeCloseTo(baseVisibleHeight, 8);
        };
        expectLabRegistration();
        unit.ensureVisual(world, gridSettings);
        expectLabRegistration();
        unit.startBoardWalkAnimation(1);
        expect(soleY(191 * 4)).toBeCloseTo(baseSoleY, 8);
        expect((191 - 10) * 4 * Math.abs(state.sprite.scale.y)).toBeCloseTo(baseVisibleHeight, 8);
        unit.returnToIdleAnimation();
        expectLabRegistration();

        for (const action of ["hit", "death"]) {
            let completed = 0;
            expect(creatureOneShotAnimationEnabledForUnit("Arbalester", action)).toBe(false);
            expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            expect(state.oneShotAnim?.frameDurationsMs).toEqual(animationAtlases.Arbalester[action].frameDurationsMs);
            expectLabRegistration();
            unit.ensureVisual(world, gridSettings);
            expectLabRegistration();
            unit.playOneShotAnimation(action, () => completed++, true);
            const durationMs = animationAtlases.Arbalester[action].frameDurationsMs!.reduce(
                (sum, duration) => sum + duration,
                0,
            );
            const fullTicks = Math.floor(durationMs / (1000 / 60));
            for (let tick = 0; tick < fullTicks; tick++) unit.stepSpawnAnimation(1 / 240);
            expect(completed).toBe(0);
            unit.stepSpawnAnimation(1 / 240);
            expect(completed).toBe(1);
            if (action === "death") {
                expect(state.oneShotAnim?.frameIndex).toBe(12);
                const corpse = state.sprite.texture;
                for (let tick = 0; tick < 180; tick++) unit.stepSpawnAnimation(1 / 240);
                expect(state.sprite.texture).toBe(corpse);
                expect(completed).toBe(1);
                unit.returnToIdleAnimation();
            }
            expect(state.oneShotAnim).toBeUndefined();
            expect(state.sprite.texture).toBe(state.selectionAnimFrames![0]);
            expectLabRegistration();
        }
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(soleY(762)).toBeCloseTo(baseSoleY, 8);
        for (const action of ["hit", "death"]) expect(unit.playOneShotAnimation(action)).toBe(false);
    });

    assetTest(
        "registers all six Arbalester lab attacks at native size and releases a cancellable shot on its authored frame",
        () => {
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
            const states = [
                "attack",
                "attack_up",
                "attack_down",
                "melee_attack",
                "melee_attack_up",
                "melee_attack_down",
            ];
            const metas = animationAtlases.Arbalester as Record<string, typeof animationAtlases.Arbalester.attack>;
            const imageEntries = images as Record<string, string>;
            const originals = states.map((state) => ({
                state,
                meta: metas[state],
                image: imageEntries[`arbalester_${state}_atlas`],
            }));
            const durations = [60, 70, 80, 90, 100, 50, 60, 70, 80, 90, 100, 110];
            try {
                for (const state of states) {
                    metas[state] = {
                        ...metas.hit,
                        frameWidth: 512,
                        frameHeight: 512,
                        atlasWidth: 2048,
                        atlasHeight: 1536,
                        frameCount: 12,
                        layout: { cols: 4, rows: 3 },
                        frameDurationsMs: durations,
                        releaseFrameIndex: 5,
                        projectileOrigin: { x: 425, y: 190 },
                    };
                    imageEntries[`arbalester_${state}_atlas`] = `test-native-arbalester-${state}`;
                }
                const staticTexture = new Texture({
                    source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
                });
                const resolved: string[] = [];
                const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (key) => {
                    resolved.push(key);
                    return key.includes("_atlas") ? Texture.WHITE : staticTexture;
                });
                const world = new Container();
                unit.setPosition(0, 1024);
                unit.ensureVisual(world, gridSettings);
                unit.setCreatureAnimationLabPreviewEnabled(true);
                const runtime = unit as unknown as {
                    sprite: Sprite;
                    oneShotAnim?: {
                        frameIndex: number;
                        elapsed: number;
                        frames: Texture[];
                        frameDurationsMs: number[];
                        authoredRealTime: boolean;
                    };
                };
                const scale = { x: runtime.sprite.scale.x, y: runtime.sprite.scale.y };
                const sole = runtime.sprite.y + (369 - runtime.sprite.anchor.y * 384) * scale.y;
                for (const state of states) {
                    expect(unit.hasAnimationState(state)).toBe(true);
                    expect(creatureOneShotAnimationEnabledForUnit("Arbalester", state)).toBe(false);
                    expect(unit.playOneShotAnimation(state, undefined, true)).toBe(true);
                    expect(runtime.oneShotAnim?.frames).toHaveLength(12);
                    expect(runtime.oneShotAnim?.frameDurationsMs).toEqual(durations);
                    expect(runtime.oneShotAnim?.authoredRealTime).toBe(true);
                    for (let frame = 0; frame < 12; frame++) {
                        unit.ensureVisual(world, gridSettings);
                        expect(runtime.sprite.texture.height).toBe(512);
                        expect(runtime.sprite.scale.x).toBeCloseTo(scale.x);
                        expect(runtime.sprite.scale.y).toBeCloseTo(scale.y);
                        expect(
                            runtime.sprite.y + (433 - runtime.sprite.anchor.y * 512) * runtime.sprite.scale.y,
                        ).toBeCloseTo(sole);
                        unit.stepOneShotAnimation(durations[frame]);
                    }
                    expect(runtime.oneShotAnim).toBeUndefined();
                    expect(runtime.sprite.texture.height).toBe(384);
                    expect(runtime.sprite.scale.y).toBeCloseTo(scale.y);
                    expect(resolved).toContain(`arbalester_${state}_atlas`);
                    expect(resolved).not.toContain(`arbalester_${state}_atlas_quarter`);
                }
                for (let frame = 0; frame < 8; frame++) {
                    unit.startBoardWalkAnimation(1);
                    unit.setBoardWalkDistanceCells(((frame + 0.1) / 8) * 1.3);
                    unit.playOneShotAnimation("melee_attack", undefined, true);
                    expect(Math.abs(runtime.sprite.scale.x)).toBeCloseTo(Math.abs(scale.x));
                    expect(runtime.sprite.scale.y).toBeCloseTo(scale.y);
                    expect(
                        runtime.sprite.y + (433 - runtime.sprite.anchor.y * 512) * runtime.sprite.scale.y,
                    ).toBeCloseTo(sole);
                    unit.returnToIdleAnimation();
                }
                for (const facing of [-1, 1]) {
                    for (const action of states.slice(0, 3)) {
                        unit.setBoardFacing(facing);
                        const shot = unit.prepareArbalesterRangedShot()!;
                        expect(shot).toBeDefined();
                        expect(unit.prepareArbalesterRangedShot()).toBeUndefined();
                        let releases = 0;
                        let point = { x: 0, y: 0 };
                        expect(
                            unit.playArbalesterRangedShot(action, shot, () => {
                                releases++;
                                expect(runtime.oneShotAnim?.frameIndex).toBe(5);
                                point = unit.getRangedProjectileOrigin({ x: facing * 1000, y: 1024 }, gridSettings);
                            }),
                        ).toBe(true);
                        unit.stepOneShotAnimation(399);
                        expect(releases).toBe(0);
                        unit.stepOneShotAnimation(1);
                        expect(releases).toBe(1);
                        const expected = world.toLocal(
                            runtime.sprite.toGlobal({
                                x: 425 - runtime.sprite.anchor.x * 512,
                                y: 190 - runtime.sprite.anchor.y * 512,
                            }),
                        );
                        expect(point.x).toBeCloseTo(expected.x);
                        expect(point.y).toBeCloseTo(expected.y);
                        unit.stepOneShotAnimation(10000);
                        expect(releases).toBe(1);
                        expect(runtime.oneShotAnim).toBeUndefined();
                        expect(shot.signal.aborted).toBe(false); // Recovery may finish before a long flight.
                        unit.returnToIdleAnimation();
                        expect(shot.signal.aborted).toBe(true);
                    }
                }
                for (const cancel of [
                    () => unit.returnToIdleAnimation(),
                    () => unit.playOneShotAnimation("death", undefined, true),
                    () => unit.startBoardWalkAnimation(1),
                    () => unit.setCreatureAnimationLabPreviewEnabled(false),
                ]) {
                    unit.returnToIdleAnimation();
                    unit.setCreatureAnimationLabPreviewEnabled(true);
                    const shot = unit.prepareArbalesterRangedShot()!;
                    let released = 0;
                    unit.playArbalesterRangedShot("attack", shot, () => released++);
                    cancel();
                    unit.stepOneShotAnimation(10000);
                    expect(shot.signal.aborted).toBe(true);
                    expect(released).toBe(0);
                }
                unit.returnToIdleAnimation();
                unit.setCreatureAnimationLabPreviewEnabled(true);
                const pending = unit.prepareArbalesterRangedShot()!;
                unit.returnToIdleAnimation();
                expect(unit.playArbalesterRangedShot("attack", pending, () => {})).toBe(false);
                const finalShot = unit.prepareArbalesterRangedShot()!;
                let largeStepReleases = 0;
                unit.playArbalesterRangedShot("attack", finalShot, () => largeStepReleases++);
                unit.stepSpawnAnimation(1 / 240);
                expect(runtime.oneShotAnim?.elapsed).toBeCloseTo(1000 / 60);
                unit.stepOneShotAnimation(10000);
                expect(largeStepReleases).toBe(1);
                unit.destroyVisuals();
                expect(finalShot.signal.aborted).toBe(true);
            } finally {
                for (const original of originals) {
                    if (original.meta) metas[original.state] = original.meta;
                    else delete metas[original.state];
                    const key = `arbalester_${original.state}_atlas`;
                    if (original.image) imageEntries[key] = original.image;
                    else delete imageEntries[key];
                }
            }
        },
    );

    assetTest("widens only Arbalester walking and removes the correction on every exit", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const staticTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        for (const lab of [false, true]) {
            const world = new Container();
            const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) =>
                name.includes("_atlas") ? Texture.WHITE : staticTexture,
            );
            unit.setPosition(0, 1024);
            unit.ensureVisual(world, gridSettings);
            if (lab) unit.setCreatureAnimationLabPreviewEnabled(true);
            unit.ensureVisual(world, gridSettings);
            const state = unit as unknown as { sprite: Sprite; walkAnim?: { frameIndex: number } };
            const aspect = (): number => Math.abs(state.sprite.scale.x / state.sprite.scale.y);
            const idleAspect = aspect();
            const idleScaleY = state.sprite.scale.y;
            const expectWalkingWidth = (): void => expect(aspect()).toBeCloseTo(idleAspect * 1.08, 8);
            const expectIdleWidth = (): void => expect(aspect()).toBeCloseTo(idleAspect, 8);
            // Restarts and repeated frame changes must never apply the 8% more than once.
            for (let restart = 0; restart < 4; restart++) {
                unit.startBoardWalkAnimation(restart % 2 ? -1 : 1);
                expectWalkingWidth();
                for (let frame = 0; frame < 8; frame++) {
                    unit.setBoardWalkDistanceCells(((frame + 0.01) * 1.3) / 8);
                    expect(state.walkAnim?.frameIndex).toBe(frame);
                    expectWalkingWidth();
                    unit.ensureVisual(world, gridSettings);
                    expectWalkingWidth();
                }
            }
            unit.stopBoardWalkAnimation();
            expectIdleWidth();
            expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 8);
            unit.stopBoardWalkAnimation();
            expectIdleWidth();
            unit.startBoardWalkAnimation(1);
            unit.returnToIdleAnimation();
            expectIdleWidth();
            expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 8);
            for (const action of ["hit", "death"]) {
                unit.startBoardWalkAnimation(1);
                unit.setBoardWalkDistanceCells(0.5);
                expectWalkingWidth();
                expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
                expectIdleWidth();
                unit.ensureVisual(world, gridSettings);
                expectIdleWidth();
                unit.returnToIdleAnimation();
                expectIdleWidth();
                unit.ensureVisual(world, gridSettings);
                expect(state.sprite.scale.y).toBeCloseTo(idleScaleY, 8);
            }
            // A frozen non-preview reaction also cancels its walk without retaining the wider shape.
            unit.startBoardWalkAnimation(1);
            expect(unit.playOneShotAnimation("hit")).toBe(false);
            expectIdleWidth();
        }
    });

    assetTest(
        "keeps Arbalester height and soles matched to the static figure through every walk frame and stop",
        () => {
            CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
            const staticTexture = new Texture({
                source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
            });
            const world = new Container();
            const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Arbalester", "arbalester_512", (name) =>
                name.includes("_atlas") ? Texture.WHITE : staticTexture,
            );
            const internals = unit as unknown as { sprite: Sprite };
            const soleY = (row: number) => {
                const sprite = internals.sprite;
                return sprite.y + (row - sprite.anchor.y * sprite.texture.height) * sprite.scale.y;
            };
            const soleRows = [191, 189, 183, 183, 183, 188, 190, 190].map((row) => row * 4);
            const topRows = [10, 11, 10, 8, 11, 10, 9, 9].map((row) => row * 4);
            const visibleHeight = (height: number) => height * Math.abs(internals.sprite.scale.y);
            for (const projected of [false, true]) {
                unit.setBattlefieldVisualProjection(projected);
                for (const y of [256, 1024]) {
                    unit.setPosition(0, y);
                    unit.ensureVisual(world, gridSettings);
                    const restingSoleY = soleY(762);
                    const restingScale = internals.sprite.scale.y;
                    const restingHeight = visibleHeight(762 - 35);
                    for (const direction of [-1, 1]) {
                        for (let frame = 0; frame < soleRows.length; frame++) {
                            unit.startBoardWalkAnimation(direction, 2, 1);
                            expect(soleY(soleRows[0])).toBeCloseTo(restingSoleY, 8);
                            expect(visibleHeight(soleRows[0] - topRows[0])).toBeCloseTo(restingHeight, 8);
                            unit.setBoardWalkDistanceCells((frame * 1.3) / 8);
                            expect(soleY(soleRows[frame])).toBeCloseTo(restingSoleY, 8);
                            expect(visibleHeight(soleRows[frame] - topRows[frame])).toBeCloseTo(restingHeight, 8);
                            unit.ensureVisual(world, gridSettings);
                            expect(soleY(soleRows[frame])).toBeCloseTo(restingSoleY, 8);
                            expect(visibleHeight(soleRows[frame] - topRows[frame])).toBeCloseTo(restingHeight, 8);
                            unit.stopBoardWalkAnimation();
                            expect(soleY(762)).toBeCloseTo(restingSoleY, 8);
                            expect(internals.sprite.scale.y).toBeCloseTo(restingScale, 8);
                            expect(visibleHeight(762 - 35)).toBeCloseTo(restingHeight, 8);
                            unit.ensureVisual(world, gridSettings);
                            expect(soleY(762)).toBeCloseTo(restingSoleY, 8);
                        }
                    }
                }
            }
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
        expect(resolvedKeys).toContain("arbalester_walk_atlas");
        expect(resolvedKeys).not.toContain("arbalester_walk_atlas_quarter");
        expect(walk?.frames[0].height).toBe(768);
        expect(walk?.frames).toHaveLength(8);
        expect(walk?.frameIndex).toBe(0);
        expect(walk?.durationPerFrameMs).toBe(125);
        expect(walk?.distanceDriven).toBe(true);
        const openingFrame = walk?.frames[0];
        unit.setBoardWalkDistanceCells(1.3 / 8 + 0.001);
        expect(walk?.frameIndex).toBe(1);
        expect((unit as unknown as { sprite?: { texture: Texture } }).sprite?.texture).not.toBe(openingFrame);
        unit.setBoardWalkDistanceCells(1.3);
        expect(walk?.completedCycles).toBe(1);
        expect(walk?.frameIndex).toBe(0);
    });

    assetTest("shares Peasant idle on both teams with a 700ms upright rest", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        let sharedFrames: Texture[] | undefined;
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const resolvedKeys: string[] = [];
            const unit = createRenderableUnit(team, "Life", "Peasant", "peasant_512", (key) => {
                resolvedKeys.push(key);
                return Texture.WHITE;
            });
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            const idle = unit as unknown as IdleInternals;
            expect(resolvedKeys).toContain("peasant_idle_red_atlas_quarter");
            expect(idle.selectionAnimFrames).toHaveLength(12);
            expect(idle.selectionAnimFrameDurationMs).toBeCloseTo(1000 / (6 * 1.15) / 0.77);
            expect(idle.selectionAnimFrameDurationsMs).toEqual(
                Array.from({ length: 12 }, (_, frame) => idle.selectionAnimFrameDurationMs + (frame === 5 ? 700 : 0)),
            );
            if (sharedFrames) expect(idle.selectionAnimFrames).toBe(sharedFrames);
            sharedFrames = idle.selectionAnimFrames;
            idle.refreshedIdlePhaseRatio = 0;
            const duration = idle.selectionAnimFrameDurationMs;
            const cycle = duration * 12 + 700;
            for (let loop = 0; loop < 2; loop++) {
                const start = loop * cycle;
                for (let frame = 0; frame < 12; frame++) {
                    const delay = frame > 5 ? 700 : 0;
                    unit.stepSelectionAnimation(start + delay + frame * duration + 0.01);
                    expect(idle.sprite?.texture).toBe(idle.selectionAnimFrames?.[frame]);
                }
                for (const offset of [0.01, 350, 699.99]) {
                    unit.stepSelectionAnimation(start + 6 * duration + offset);
                    expect(idle.sprite?.texture).toBe(idle.selectionAnimFrames?.[5]);
                }
                unit.stepSelectionAnimation(start + 6 * duration + 700.01);
                expect(idle.sprite?.texture).toBe(idle.selectionAnimFrames?.[6]);
            }
        }
    });

    assetTest("keeps approved idles and walks active during the global freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureIdleAnimationEnabledForUnit("Peasant")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Beholder")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Squire")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Arbalester")).toBe(false);
        expect(creatureIdleAnimationEnabledForUnit("Troglodyte")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Peasant")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Squire")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Wolf")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Arbalester")).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Troglodyte")).toBe(true);

        const greenResolvedKeys: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", (name) => {
            greenResolvedKeys.push(name);
            return Texture.WHITE;
        });
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        const idle = unit as unknown as IdleInternals;
        expect(greenResolvedKeys).toContain("peasant_idle_red_atlas_quarter");
        expect(idle.selectionAnimFrames).toHaveLength(12);
        expect(idle.selectionAnimFrameDurationMs).toBeCloseTo(1000 / (6 * 1.15) / 0.77);
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
        expect(redResolvedKeys).toContain("peasant_idle_red_atlas_quarter");
        const redIdle = redUnit as unknown as IdleInternals;
        expect(redIdle.selectionAnimFrames).toHaveLength(12);
        expect(redIdle.selectionAnimFrames).toBe(idle.selectionAnimFrames);
        expect(redIdle.selectionAnimFrameDurationMs).toBeCloseTo(1000 / (6 * 1.15) / 0.77);
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

        unit.setBoardWalkDistanceCells(1.3 / 8 - 0.00001);
        expect(walk?.frameIndex).toBe(0);
        unit.setBoardWalkDistanceCells(1.3 / 8);
        expect(walk?.frameIndex).toBe(1);
        unit.setBoardWalkDistanceCells((1.3 * 7) / 8);
        expect(walk?.frameIndex).toBe(7);
        unit.setBoardWalkDistanceCells(1.3);
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
        expect(Math.abs(walkScaleX) * (408 / 4)).toBeCloseTo(Math.abs(idleScaleX) * (426 / 4), 1);
        squire.applyMoveEffect(0.37);
        expect(squireInternals.sprite?.rotation).toBe(0);
        expect(squireInternals.sprite?.scale.x).toBe(walkScaleX);
        expect(squireInternals.sprite?.scale.y).toBe(walkScaleY);
        const firstSquireTexture = squireInternals.sprite?.texture;
        const squireCycleDistance = 1.3;
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
        expect(creatureOneShotAnimationEnabledForUnit("Troglodyte", "attack")).toBe(true);
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
            attack: [265, 265.34, 265, 264, 211, 226, 265, 265],
            attack_up: [265, 265, 265, 265, 265, 265, 265, 265],
            attack_down: [265, 265, 265.04, 265, 265, 265, 265, 265],
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
                    // Rendering may happen before the next layout pass: texture and foot anchor must agree now.
                    expect(attackInternals.sprite?.anchor.x).toBeCloseTo(peasantAttackAnchorX(state, frameIndex));
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
            const resumed = unit as unknown as {
                sprite: Sprite;
                selectionAnimFrames: Texture[];
                peasantIdleResumeAtMs: number;
            };
            expect(resumed.sprite.texture).toBe(resumed.selectionAnimFrames[5]);
            expect(resumed.sprite.anchor.x).toBe(0.5);
            expect(resumed.sprite.anchor.y).toBeCloseTo(730 / 768);
            unit.stepSelectionAnimation(resumed.peasantIdleResumeAtMs + 350);
            expect(resumed.sprite.texture).toBe(resumed.selectionAnimFrames[5]);
            unit.syncVisual(worldRoot, gridSettings);
            expect((unit as unknown as { sprite?: Sprite }).sprite?.anchor.y).toBeCloseTo(730 / 768);
        }
    });

    assetTest("plays Squire damage in half a real second through the fixed simulation clock", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Squire", "squire_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            oneShotAnim?: { frameIndex: number; elapsed: number };
        };
        unit.applyHitReaction(40, -20);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        const hit = state.oneShotAnim;
        for (let tick = 0; tick < 6; tick++) unit.stepSpawnAnimation(1 / 240);
        expect(state.oneShotAnim?.frameIndex).toBeGreaterThanOrEqual(2);
        unit.applyHitReaction(40, -20);
        expect(state.oneShotAnim).toBe(hit);
        for (let tick = 6; tick < 29; tick++) unit.stepSpawnAnimation(1 / 240);
        expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
        unit.stepSpawnAnimation(1 / 240);
        unit.stepSpawnAnimation(1 / 240); // floating-point boundary: at most one extra 60 Hz tick
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
    });

    assetTest("plays Squire hit with authored holds in combat and animation lab, then restores idle", () => {
        for (const preview of [false, true]) {
            const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Squire", "squire_512", () => Texture.WHITE);
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            let completed = 0;
            expect(unit.playOneShotAnimation("hit", () => completed++, preview)).toBe(true);
            const state = unit as unknown as {
                sprite: Sprite;
                oneShotAnim?: { frameIndex: number; frameDurationsMs?: readonly number[] };
                selectionAnimFrames: Texture[];
            };
            expect(state.oneShotAnim?.frameDurationsMs).toEqual([40, 45, 55, 90, 80, 75, 65, 50]);
            expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
            unit.stepOneShotAnimation(39);
            expect(state.oneShotAnim?.frameIndex).toBe(0);
            unit.stepOneShotAnimation(1);
            expect(state.oneShotAnim?.frameIndex).toBe(1);
            unit.stepOneShotAnimation(99);
            expect(state.oneShotAnim?.frameIndex).toBe(2);
            unit.stepOneShotAnimation(1);
            expect(state.oneShotAnim?.frameIndex).toBe(3);
            unit.stepOneShotAnimation(359);
            expect(completed).toBe(0);
            expect(state.oneShotAnim?.frameIndex).toBe(7);
            unit.stepOneShotAnimation(1);
            expect(completed).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.selectionAnimFrames).toContain(state.sprite.texture);
            unit.stepOneShotAnimation(1000);
            expect(completed).toBe(1);
            expect(unit.playOneShotAnimation("hit", undefined, preview)).toBe(true);
            unit.stepOneShotAnimation(10000);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
        }
    });

    assetTest("keeps Squire melee-only while resolving its legacy attack atlases for all three directions", () => {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const unit = createRenderableUnit(team, "Life", "Squire", "squire_512", () => Texture.WHITE);
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            unit.refreshPossibleAttackTypes(true);
            expect(unit.getAttackType()).toBe(AttackVals.MELEE);
            expect(unit.getPossibleAttackTypes()).toEqual([AttackVals.MELEE]);
            expect(unit.getRangeShots()).toBe(0);
            expect(unit.selectAttackType(AttackVals.RANGE)).toBe(false);
            expect(unit.getAttackTypeSelection()).toBe(AttackVals.MELEE);
            for (const [y, state] of [
                [1152, "attack_up"],
                [1024, "attack"],
                [896, "attack_down"],
            ] as const) {
                expect(unit.getAttackAnimationStateForTarget({ x: 128, y }, "melee")).toBe(state);
                expect(unit.hasAnimationState(state)).toBe(true);
                expect(unit.hasAnimationState(state.replace("attack", "melee_attack"))).toBe(false);
                expect(unit.playOneShotAnimation(state, undefined, true)).toBe(true);
                expect(unit.getAttackTypeSelection()).toBe(AttackVals.MELEE);
                unit.returnToIdleAnimation();
            }
            unit.destroyVisuals();
        }
    });

    assetTest("plays all Squire attacks on the real clock with stable size, planted feet and an idle return", () => {
        const states = ["attack", "attack_up", "attack_down"] as const;
        const openingTextures = new Set<Texture>();
        for (const attack of states) {
            expect(creatureOneShotAnimationEnabledForUnit("Squire", attack)).toBe(true);
            for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
                for (const preview of [false, true]) {
                    const unit = createRenderableUnit(team, "Life", "Squire", "squire_512", () => Texture.WHITE);
                    const root = new Container();
                    unit.setPosition(0, 1024);
                    unit.ensureVisual(root, gridSettings);
                    const state = unit as unknown as {
                        sprite: Sprite;
                        oneShotAnim?: { frameIndex: number; frames: Texture[]; frameDurationsMs?: readonly number[] };
                        selectionAnimFrames: Texture[];
                    };
                    const idleScale = { x: state.sprite.scale.x, y: state.sprite.scale.y };
                    let completed = 0;
                    expect(unit.playOneShotAnimation(attack, () => completed++, preview)).toBe(true);
                    expect(state.oneShotAnim?.frames).toHaveLength(8);
                    expect(state.oneShotAnim?.frameDurationsMs).toEqual([40, 60, 90, 40, 70, 60, 100, 80]);
                    const frames = state.oneShotAnim!.frames;
                    openingTextures.add(frames[0]);
                    expect(state.sprite.scale.x).toBeCloseTo(idleScale.x, 6);
                    expect(state.sprite.scale.y).toBeCloseTo(idleScale.y, 6);
                    expect(state.sprite.anchor.y).toBeCloseTo(858 / 1024);
                    // Padding moves the foot pixels and anchor together, preserving their world offset.
                    expect((879 / 4 - state.sprite.anchor.y * 256) * state.sprite.scale.y).toBeCloseTo(
                        (751 / 4 - (730 / 768) * 192) * idleScale.y,
                        6,
                    );
                    const seen = new Set<number>([0]);
                    for (let tick = 0; tick < 32; tick++) {
                        unit.stepSpawnAnimation(1 / 240);
                        unit.syncVisual(root, gridSettings);
                        if (state.oneShotAnim) {
                            seen.add(state.oneShotAnim.frameIndex);
                            expect(state.sprite.texture).toBe(frames[state.oneShotAnim.frameIndex]);
                            expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(Math.abs(idleScale.y), 6);
                        }
                    }
                    expect(completed).toBe(0);
                    expect([...seen]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
                    unit.stepSpawnAnimation(1 / 240);
                    expect(completed).toBe(1);
                    expect(unit.isPlayingOneShotAnimation()).toBe(false);
                    expect(state.selectionAnimFrames).toContain(state.sprite.texture);
                    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(Math.abs(idleScale.y), 6);
                    unit.stepSpawnAnimation(1 / 240);
                    expect(completed).toBe(1);
                    // Manual cancellation in the lab must also undo the padded canvas ratio.
                    unit.playOneShotAnimation(attack, undefined, true);
                    unit.stepOneShotAnimation(250);
                    unit.returnToIdleAnimation();
                    expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
                    expect(Math.abs(state.sprite.scale.y)).toBeCloseTo(Math.abs(idleScale.y), 6);
                }
            }
        }
        expect(openingTextures.size).toBe(3);
    });

    assetTest("starts Peasant's downward strike without the upward wind-up", () => {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const unit = createRenderableUnit(team, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
            unit.setPosition(0, 1024);
            unit.ensureVisual(new Container(), gridSettings);
            expect(unit.playOneShotAnimation("attack_down", undefined, true)).toBe(true);
            const state = unit as unknown as {
                sprite: Sprite;
                oneShotAnim: { frames: Texture[]; durationPerFrame: number };
            };
            const expectedSourceFrames = [0, 3, 4, 5, 5, 6, 6, 7];
            expect(state.oneShotAnim.frames).toHaveLength(8);
            for (const [index, source] of expectedSourceFrames.entries()) {
                if (index) unit.stepOneShotAnimation(state.oneShotAnim.durationPerFrame);
                const frame = state.sprite.texture.frame;
                expect(frame.x / frame.width).toBe(source % 4);
                expect(frame.y / frame.height).toBe(Math.floor(source / 4));
                expect(state.sprite.anchor.x).toBeCloseTo(peasantAttackAnchorX("attack_down", index));
            }
        }
    });

    assetTest("holds the death preview on the ground until idle is explicitly requested", () => {
        const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        const worldRoot = new Container();
        unit.ensureVisual(worldRoot, gridSettings);
        expect(unit.playOneShotAnimation("death", undefined, true)).toBe(true);
        unit.syncVisual(worldRoot, gridSettings);
        const state = unit as unknown as {
            sprite: Sprite;
            oneShotAnim: { frames: Texture[]; frameIndex: number; footAnchorY: number };
            selectionAnimFrames: Texture[];
        };
        const deathScale = state.sprite.scale.y;
        unit.stepOneShotAnimation(10_000);
        expect(state.oneShotAnim.frameIndex).toBe(11);
        expect(state.sprite.texture).toBe(state.oneShotAnim.frames[11]);
        expect(state.sprite.anchor.y).toBeCloseTo(state.oneShotAnim.footAnchorY - 30 / 768);
        const settledAnchor = state.sprite.anchor.y;
        unit.syncVisual(worldRoot, gridSettings);
        expect(state.sprite.anchor.y).toBe(settledAnchor);
        unit.stepSelectionAnimation();
        unit.stepOneShotAnimation(10_000);
        expect(state.sprite.texture).toBe(state.oneShotAnim.frames[11]);
        expect(state.sprite.scale.y).toBe(deathScale);
        expect(state.sprite.anchor.y).toBe(settledAnchor);
        unit.returnToIdleAnimation();
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(state.sprite.texture).toBe(state.selectionAnimFrames[5]);
        expect(state.sprite.scale.y).toBeCloseTo(deathScale / PEASANT_DEATH_RENDER_SCALE);
        expect(state.sprite.anchor.y).toBeCloseTo(730 / 768);
    });

    assetTest("registers Peasant's settling body before rendering each final death frame", () => {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const unit = createRenderableUnit(team, "Life", "Peasant", "peasant_512", () => Texture.WHITE);
            unit.setPosition(0, 1024);
            const worldRoot = new Container();
            unit.ensureVisual(worldRoot, gridSettings);
            unit.playOneShotAnimation("death", undefined, true);
            unit.syncVisual(worldRoot, gridSettings);
            const state = unit as unknown as {
                sprite: Sprite;
                oneShotAnim: { frames: Texture[]; frameIndex: number; durationPerFrame: number; footAnchorY: number };
            };
            const scaleY = state.sprite.scale.y;
            const groundY = state.sprite.y;
            // Body/forearm contacts in the shipped atlas; pitchfork tips extend below them.
            const bodyContacts = [686, 648, 656];
            const groundContacts: number[] = [];
            for (let frame = 0; frame < 12; frame++) {
                if (frame) unit.stepOneShotAnimation(state.oneShotAnim.durationPerFrame);
                expect(state.oneShotAnim.frameIndex).toBe(frame);
                expect(state.sprite.texture).toBe(state.oneShotAnim.frames[frame]);
                const anchorBeforeLayout = state.sprite.anchor.y;
                unit.syncVisual(worldRoot, gridSettings);
                expect(state.sprite.anchor.y).toBe(anchorBeforeLayout);
                expect(state.sprite.scale.y).toBeCloseTo(scaleY);
                expect(state.sprite.y).toBe(groundY);
                if (frame >= 9) {
                    groundContacts.push(bodyContacts[frame - 9] - state.sprite.anchor.y * 768);
                } else {
                    expect(state.sprite.anchor.y).toBe(state.oneShotAnim.footAnchorY);
                }
            }
            expect(Math.max(...groundContacts) - Math.min(...groundContacts)).toBeLessThan(0.01);
        }
    });

    assetTest("keeps Peasant authored motion isolated from generic combat overlays", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(1)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(2)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(3)).toBe(false);
        expect(creatureGenericWholeSpriteMotionEnabledForLevel(4)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Peasant", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Troglodyte", 1)).toBe(false);
        expect(creatureGenericCombatMotionEnabledForUnit("Satyr", 2)).toBe(false);

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

    test("loads Orc breathing sprites without requesting the legacy flourish sheets", () => {
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
        expect(requestedKeys).toContain("orc_idle_atlas");
    });
});

describe("Scavenger thief visual replacement", () => {
    assetTest("previews new Scavenger idle, hit and held death only in the animation lab", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const world = new Container();
        const staticTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const requested: string[] = [];
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Scavenger", "scavenger_512", (key) => {
            requested.push(key);
            return key.includes("_atlas") ? Texture.WHITE : staticTexture;
        });
        const internals = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            selectionAnimFrameIndex: number;
            refreshedIdlePhaseRatio: number;
            oneShotAnim?: { frameIndex: number; durationPerFrame: number; frames: Texture[] };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const initialHeight = Math.abs(internals.sprite.scale.y) * 757;
        expect(internals.selectionAnimFrames).toHaveLength(1);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.ensureVisual(world, gridSettings);
        expect(requested).toContain("scavenger_homm_idle_atlas_quarter");
        expect(requested).toContain("scavenger_battlefield_side_right_distance_readable_v1");
        expect(internals.selectionAnimFrames).toHaveLength(12);
        const originalIdleTexture = internals.selectionAnimFrames[0];
        const idleGrade = internals.sprite.filters?.[0];
        expect(idleGrade).toBeDefined();
        expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
        internals.refreshedIdlePhaseRatio = 0;
        unit.stepSelectionAnimation(0);
        expect(internals.sprite.texture).toBe(originalIdleTexture);
        unit.stepSelectionAnimation(100);
        expect(internals.sprite.texture).toBe(internals.selectionAnimFrames[1]);
        unit.stepSelectionAnimation(1200);
        expect(internals.sprite.texture).not.toBe(originalIdleTexture);
        // The final pose lasts 100ms plus the requested 1600ms pause before the loop restarts.
        unit.stepSelectionAnimation(1330);
        expect(internals.sprite.texture).toBe(internals.selectionAnimFrames[11]);
        unit.stepSelectionAnimation(3029);
        expect(internals.sprite.texture).toBe(internals.selectionAnimFrames[11]);
        unit.stepSelectionAnimation(3030);
        expect(internals.sprite.texture).toBe(originalIdleTexture);
        unit.startBoardWalkAnimation(1);
        expect(internals.sprite.filters ?? []).not.toContain(idleGrade);
        expect(Math.abs(internals.sprite.scale.y) * (741 / 4)).toBeCloseTo(initialHeight, 5);
        unit.stopBoardWalkAnimation();
        expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
        const renderedSole = (sole: readonly number[]) =>
            internals.sprite.toGlobal({
                x: (sole[0] / 768 - internals.sprite.anchor.x) * internals.sprite.texture.width,
                y: (sole[1] / 768 - internals.sprite.anchor.y) * internals.sprite.texture.height,
            });
        const idleSoles = SCAVENGER_IDLE_SOLES.map(renderedSole);
        expect(unit.playOneShotAnimation("hit", undefined, true)).toBe(true);
        expect(requested).toContain("scavenger_combat_hit_atlas_quarter");
        expect(internals.sprite.filters ?? []).not.toContain(idleGrade);
        expect(internals.oneShotAnim?.durationPerFrame).toBe(80);
        expect(internals.oneShotAnim?.frames).toHaveLength(8);
        expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
        for (let frame = 0; frame < 8; frame++) {
            unit.ensureVisual(world, gridSettings);
            expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
            expect(Math.abs(internals.sprite.scale.x)).toBeCloseTo(Math.abs(internals.sprite.scale.y), 5);
            expect(internals.sprite.skew.y).toBe(0);
            scavengerHitRegisteredSoles(frame).forEach((sole, index) => {
                const actual = renderedSole(sole);
                expect(actual.x).toBeCloseTo(idleSoles[index].x, 5);
                expect(actual.y).toBeCloseTo(idleSoles[index].y, 5);
            });
            unit.stepOneShotAnimation(80);
        }
        expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        for (const action of ["attack", "attack_up", "attack_down"]) {
            expect(unit.playOneShotAnimation(action, undefined, true)).toBe(true);
            expect(requested).toContain(`scavenger_combat_${action}_atlas_quarter`);
            expect(internals.oneShotAnim?.frames).toHaveLength(8);
            expect(internals.sprite.texture.height).toBe(256);
            expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
            expect(Math.abs(internals.sprite.scale.x)).toBeCloseTo(Math.abs(internals.sprite.scale.y), 5);
            unit.stepOneShotAnimation(320);
            unit.ensureVisual(world, gridSettings);
            expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
            expect(Math.abs(internals.sprite.scale.x)).toBeCloseTo(Math.abs(internals.sprite.scale.y), 5);
            unit.stepOneShotAnimation(320);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(Math.abs(internals.sprite.scale.y) * 175).toBeCloseTo(initialHeight, 5);
        }
        expect(unit.playOneShotAnimation("death", undefined, true)).toBe(true);
        expect(requested).toContain("scavenger_combat_death_atlas_quarter");
        expect(internals.oneShotAnim?.durationPerFrame).toBe(125);
        unit.stepOneShotAnimation(3000);
        expect(internals.oneShotAnim?.frameIndex).toBe(7);
        expect(unit.isPlayingOneShotAnimation("death")).toBe(true);
        unit.returnToIdleAnimation();
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(internals.selectionAnimFrames).toContain(internals.sprite.texture);
        expect(internals.sprite.filters ?? []).toContain(idleGrade);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(internals.sprite.filters ?? []).not.toContain(idleGrade);
        unit.ensureVisual(world, gridSettings);
        expect(internals.selectionAnimFrames).toHaveLength(1);
        expect(Math.abs(internals.sprite.scale.y) * 757).toBeCloseTo(initialHeight, 5);
    });

    assetTest("plays the approved original Scavenger loop with stable size and feet during the global freeze", () => {
        CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
        const world = new Container();
        const staticTexture = new Texture({
            source: new BufferImageSource({ resource: new Uint8Array(4), width: 768, height: 768 }),
        });
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Scavenger", "scavenger_512", (name) =>
            name.includes("_atlas") ? Texture.WHITE : staticTexture,
        );
        const internals = unit as unknown as {
            sprite: { texture: Texture; anchor: { x: number; y: number }; scale: { x: number; y: number }; y: number };
            walkAnim?: {
                frames: Texture[];
                frameIndex: number;
                loopStartFrame: number;
                loopEndFrame: number;
                outroFrame?: number;
                durationPerFrameMs: number;
                footAnchorY: number;
                distanceDriven?: boolean;
            };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const idleTexture = internals.sprite.texture;
        const idleScale = Math.abs(internals.sprite.scale.y);
        const idleVisibleHeight = 757 * idleScale;
        const idleFeetY = internals.sprite.y + (768 - 730) * internals.sprite.scale.y;
        expect(creatureWalkAnimationEnabledForUnit("Scavenger")).toBe(true);
        expect(creatureIdleAnimationEnabledForUnit("Scavenger")).toBe(false);
        expect(creatureWalkAnimationEnabledForUnit("Troglodyte")).toBe(true);

        unit.startBoardWalkAnimation(1);
        // Texture changes must preserve size immediately, before the next visual synchronization.
        expect((247 / 256) * 192 * Math.abs(internals.sprite.scale.y)).toBeCloseTo(idleVisibleHeight);
        unit.ensureVisual(world, gridSettings);
        const walk = internals.walkAnim!;
        expect(walk.frames).toHaveLength(8);
        expect(walk.loopStartFrame).toBe(0);
        expect(walk.loopEndFrame).toBe(7);
        expect(walk.outroFrame).toBeUndefined();
        expect(walk.distanceDriven).toBe(true);
        expect(internals.sprite.texture.width).toBe(192);
        expect(internals.sprite.texture.height).toBe(192);
        expect(Math.abs(internals.sprite.scale.x)).toBeCloseTo(Math.abs(internals.sprite.scale.y));
        expect((247 / 256) * 192 * Math.abs(internals.sprite.scale.y)).toBeCloseTo(idleVisibleHeight);
        const walkFeetY = internals.sprite.y + ((254 / 256) * 192 - walk.footAnchorY * 192) * internals.sprite.scale.y;
        expect(walkFeetY).toBeCloseTo(idleFeetY);

        for (let index = 1; index <= 10; index += 1) {
            unit.setBoardWalkDistanceCells((index * 1.3) / 8);
            unit.stepSpawnAnimation(0.25);
            expect(internals.walkAnim?.frameIndex).toBe(index % 8);
        }
        unit.setBoardFacingFromMovement(-1);
        unit.ensureVisual(world, gridSettings);
        expect(internals.walkAnim?.frameIndex).toBe(2);
        expect(internals.sprite.scale.x).toBeLessThan(0);
        expect((247 / 256) * 192 * Math.abs(internals.sprite.scale.y)).toBeCloseTo(idleVisibleHeight);

        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.sprite.texture).toBe(idleTexture);
        expect(Math.abs(internals.sprite.scale.y)).toBeCloseTo(idleScale);
        unit.ensureVisual(world, gridSettings);
        expect(internals.walkAnim).toBeUndefined();
        expect(internals.sprite.texture).toBe(idleTexture);
        expect(Math.abs(internals.sprite.scale.y)).toBeCloseTo(idleScale);
        expect(CREATURE_SPRITE_ANIMATION_SETTINGS.enabled).toBe(false);
    });

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
        // The restyled set is the approved base package, which this file's beforeEach turns off for the
        // legacy/freeze coverage around it. These two tests are about that package, so they ask for it.
        CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
        const unit = createRenderableUnit(TeamVals.LEFT, "Chaos", "Scavenger", "scavenger_512", () => Texture.WHITE);
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        return unit;
    };

    assetTest("keeps the restyled static figure undistorted on the existing foot line", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        // One cell of the approved idle sheet, which ships at quarter resolution: 768 / 4.
        expect(internals.sprite?.texture.width).toBe(192);
        expect(internals.sprite?.texture.height).toBe(192);
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(Math.abs(internals.sprite?.scale.y ?? 0));
        expect(internals.sprite?.y).toBeCloseTo(
            tallBoardModelFootLineY(1024, gridSettings.getCellSize()) - gridSettings.getCellSize() * 0.03,
        );
    });

    assetTest("uses the complete thief animation set at Squire's visible height", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        // Twelve idle cells from the approved `Scavenger Homm` sheet, each one quarter of its 768px
        // source. The old thief set was eight 160x192 cells.
        expect(internals.selectionAnimFrames).toHaveLength(12);
        expect(internals.sprite?.texture.width).toBe(192);
        expect(internals.sprite?.texture.height).toBe(192);
        // The approved sheet's figure fills less of its cell than the old thief cutout did, so the scale
        // comes off the same measured ratio the renderer uses rather than the thief's 186px literal.
        const expectedUniformScale =
            ((gridSettings.getCellSize() * SCAVENGER_BOARD_MODEL_HEIGHT_CELLS) /
                (192 * SCAVENGER_LAB_VISIBLE_HEIGHT_RATIO)) *
            BATTLEFIELD_CREATURE_FRAMING.Scavenger.scaleY;
        expect(Math.abs(internals.sprite?.scale.x ?? 0)).toBeCloseTo(expectedUniformScale);
        expect(Math.abs(internals.sprite?.scale.y ?? 0)).toBeCloseTo(expectedUniformScale);
        expect(internals.sprite?.y).toBeCloseTo(tallBoardModelFootLineY(1024, gridSettings.getCellSize()));
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

    assetTest("twirls both blades after four inactive breaths and battle-cries immediately on its active turn", () => {
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
            expect(internals.sprite?.texture).toBe(internals.scavengerIdleBladeTwirlFrames?.[frame]);
        }
        expect(scavengerIdleBladeTwirlFrameForElapsed(idleWindow + cryWindow)).toBeUndefined();

        unit.setActiveTurn(true);
        const activeStartedAt = internals.activeTurnAnimationStartedAtMs;
        let frameStartMs = 0;
        for (let frame = 0; frame < 6; frame += 1) {
            expect(scavengerActiveBattleCryFrameForElapsed(frameStartMs)).toBe(frame);
            unit.stepSelectionAnimation(activeStartedAt + frameStartMs);
            expect(internals.sprite?.texture).toBe(internals.scavengerActiveBattleCryFrames?.[frame]);
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
        expect(internals.sprite?.texture).toBe(internals.scavengerActiveBattleCryFrames?.[0]);
    });

    assetTest("repeats all eight original Scavenger walking poses every 1.3 cells", () => {
        const unit = createScavenger();
        const internals = unit as unknown as AnimationInternals;

        unit.startBoardWalkAnimation(1);
        const shownFrames = [internals.walkAnim?.frameIndex];
        for (let index = 1; index <= 9; index++) {
            unit.setBoardWalkDistanceCells((index * 1.3) / 8 - 0.00001);
            expect(internals.walkAnim?.frameIndex).toBe((index - 1) % 8);
            unit.setBoardWalkDistanceCells((index * 1.3) / 8);
            unit.stepSpawnAnimation(0.5);
            shownFrames.push(internals.walkAnim?.frameIndex);
        }

        expect(shownFrames).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 1]);
        unit.setBoardFacingFromMovement(-1);
        expect(internals.walkAnim?.frameIndex).toBe(1);
        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
        unit.startBoardWalkAnimation(-1);
        unit.setBoardWalkDistanceCells(0.2);
        expect(internals.walkAnim?.frameIndex).toBe(1);
        unit.finishBoardWalkAnimationAfterFullCycle();
        expect(internals.walkAnim).toBeUndefined();
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

    test.each([false, true])(
        "keeps moving flags at a fixed ground offset despite pose changes (projection=%s)",
        (projected) => {
            const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Satyr", "satyr_512", () => Texture.WHITE);
            const worldRoot = new Container();
            worldRoot.scale.set(0.8, -0.8);
            unit.setBattlefieldVisualProjection(projected);
            unit.setPosition(0, 1024);
            unit.ensureVisual(worldRoot, gridSettings);
            const internals = unit as unknown as OverlayInternals;
            const groundY = () =>
                projected ? projectBattlefieldPoint(unit.getPosition(), gridSettings).y : unit.getPosition().y;
            const initialOffset = internals.badgeContainer!.y - groundY();

            // This creature has no enabled authored walk: the fallback motion must be stable too.
            unit.startBoardWalkAnimation(1);
            const heights: number[] = [];
            for (let frame = 0; frame < 8; frame++) {
                unit.setPosition(frame * 24, 1024 + (frame > 3 ? (frame - 3) * 16 : 0));
                unit.setSpriteRotation(frame % 2 ? 0.15 : -0.08);
                if (frame === 4) unit.startBoardWalkAnimation(-1);
                if (frame === 6) worldRoot.scale.set(1.2, -1.2);
                unit.ensureVisual(worldRoot, gridSettings);
                heights.push(internals.sprite!.getBounds().height);
                expect(internals.badgeContainer!.y - groundY()).toBeCloseTo(initialOffset, 7);
            }
            expect(new Set(heights).size).toBeGreaterThan(1);

            // Finishing a fallback move must release the anchor for later framing changes.
            unit.finishBoardWalkAnimationAfterFullCycle();
            unit.setSpriteRotation(0);
            unit.setVisualScaleMultiplier(0.6);
            unit.ensureVisual(worldRoot, gridSettings);
            const resizedOffset = internals.badgeContainer!.y - groundY();
            expect(resizedOffset).not.toBeCloseTo(initialOffset, 3);
            unit.startBoardWalkAnimation(-1);
            unit.setSpriteRotation(0.2);
            unit.ensureVisual(worldRoot, gridSettings);
            expect(internals.badgeContainer!.y - groundY()).toBeCloseTo(resizedOffset, 7);
            unit.stopBoardWalkAnimation();
        },
    );

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

        expect(internals.activeAura?.visible).toBe(true);
        expect(internals.activeTurnFireSprite).toBeUndefined();
        expect(internals.badgeFlagGlow?.visible).toBe(true);
        expect(flagStrokeColors.at(-1)).toBe(0xb08a45);
        expect(pointerStrokeColors).toContain(0x100d08);
        expect(flagGlowStrokes).toHaveLength(2);
        expect(flagGlowStyles.every(({ color }) => color === 0xffd05a)).toBe(true);
        expect(flagGlowStyles.every(({ alpha }) => alpha > 0)).toBe(true);

        // Board motion also includes creatures without an authored walk atlas. The entire ring,
        // including its glow, disappears while travelling and returns when the active unit stops.
        unit.syncVisual(worldRoot, gridSettings, true);
        expect(internals.activeAura?.visible).toBe(false);
        unit.syncVisual(worldRoot, gridSettings, false);
        expect(internals.activeAura?.visible).toBe(true);

        // Placement hover no longer adds a separate effect beneath the creature.
        unit.setActiveTurn(false);
        unit.setHoverTurnAura(true);
        unit.syncVisual(worldRoot, gridSettings);
        expect(internals.activeAura?.visible ?? false).toBe(false);
        expect(internals.badgeFlagGlow?.visible).toBe(false);
    });

    test("does not draw a hover aura beneath a two-by-two creature", () => {
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
        expect(unit.getCells()).toHaveLength(4);
        expect(internals.activeAura?.visible ?? false).toBe(false);
        expect(internals.activeTurnFireSprite?.visible ?? false).toBe(false);
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

assetTest("plays all eight HD Dryad lab frames over 1.3 cells without legacy turn phases", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: {
            frames: Texture[];
            frameIndex: number;
            loopStartFrame: number;
            loopEndFrame: number;
            outroFrame?: number;
            introComplete: boolean;
        };
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idleCanvasHeight = Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    unit.startBoardWalkAnimation(1, 3);
    expect(keys).toContain("dryad_lab_walk_atlas");
    expect(keys).not.toContain("dryad_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(1024);
    expect(state.walkAnim?.loopStartFrame).toBe(0);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    expect(state.walkAnim?.introComplete).toBe(true);
    expect(state.walkAnim?.outroFrame).toBeUndefined();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(idleCanvasHeight, 8);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        unit.ensureVisual(world, gridSettings);
        unit.stepSpawnAnimation(1 / 60);
        expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(idleCanvasHeight, 8);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
    }
    unit.stopBoardWalkAnimation();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(idleCanvasHeight, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest("Dryad lab idle pauses for walking and reactions, restores size, and leaves gameplay static", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", () => Texture.WHITE);
    const state = unit as unknown as { sprite: Sprite; selectionAnimationStartedAtMs: number };
    const idleFilter = () =>
        (state.sprite.filters ?? []).find((filter) => filter.constructor.name === "DryadIdleFilter");
    unit.setPosition(0, 1024);
    unit.ensureVisual(new Container(), gridSettings);
    expect(idleFilter()).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    unit.stepSelectionAnimation(state.selectionAnimationStartedAtMs + 2200);
    expect(idleFilter()).toBeDefined();
    expect(idleFilter()?.resources.idle.uniforms.uMotion[2]).toBe(18);
    const height = Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    unit.startBoardWalkAnimation(1, 3);
    expect(idleFilter()).toBeUndefined();
    unit.returnToIdleAnimation();
    expect(idleFilter()).toBeDefined();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(height, 8);
    expect(idleFilter()?.resources.idle.uniforms.uMotion[2]).toBe(0);
    expect(unit.playOneShotAnimation("hit", undefined, true)).toBe(true);
    expect(idleFilter()).toBeUndefined();
    unit.returnToIdleAnimation();
    expect(idleFilter()).toBeDefined();
    unit.startBoardWalkAnimation(-1, 3);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(idleFilter()).toBeUndefined();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(height, 8);
});

assetTest("Dryad lab uses the new hit and death clips with authored timing and a held corpse", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            holdLastFrame: boolean;
            footAnchorY: number;
        };
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const height = state.sprite.texture.height * Math.abs(state.sprite.scale.y);
    const idle = state.sprite.texture;
    unit.startBoardWalkAnimation(1, 3);
    expect(unit.playOneShotAnimation("hit", undefined, true)).toBe(true);
    expect(unit.getAnimationTextureKey("hit")).toBe("dryad_lab_hit_atlas");
    expect(keys).toContain("dryad_lab_hit_atlas");
    expect(state.oneShotAnim?.frames).toHaveLength(9);
    expect(state.oneShotAnim?.frames[0].height).toBe(768);
    expect(state.oneShotAnim?.authoredRealTime).toBe(true);
    expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBe(560);
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    const hitCanvasWidth = state.sprite.texture.width * Math.abs(state.sprite.scale.x);
    const hitCanvasHeight = state.sprite.texture.height * Math.abs(state.sprite.scale.y);
    const hitAnchor = state.sprite.anchor.y;
    const hitDurations = state.oneShotAnim!.frameDurationsMs;
    for (let frame = 0; frame < hitDurations.length; frame++) {
        unit.ensureVisual(world, gridSettings);
        expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(hitCanvasWidth, 8);
        expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(hitCanvasHeight, 8);
        expect(state.sprite.anchor.y).toBe(hitAnchor);
        unit.stepOneShotAnimation(hitDurations[frame] - (frame === hitDurations.length - 1 ? 1 : 0));
    }
    expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
    unit.stepOneShotAnimation(1);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    expect(state.sprite.texture).toBe(idle);
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    let done = 0;
    expect(unit.playOneShotAnimation("death", () => done++, true)).toBe(true);
    expect(unit.getAnimationTextureKey("death")).toBe("dryad_lab_death_atlas");
    expect(state.oneShotAnim?.frames).toHaveLength(8);
    expect(state.oneShotAnim?.holdLastFrame).toBe(true);
    expect(state.oneShotAnim!.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)).toBeCloseTo(
        1140 / 1.07,
        8,
    );
    for (const [frame, previousDuration] of [65, 115, 135, 145, 135, 135, 150, 260].entries()) {
        expect(state.oneShotAnim!.frameDurationsMs[frame]).toBeCloseTo(previousDuration / 1.07, 8);
    }
    const deathCanvasWidth = state.sprite.texture.width * Math.abs(state.sprite.scale.x);
    const deathCanvasHeight = state.sprite.texture.height * Math.abs(state.sprite.scale.y);
    const deathAnchor = state.sprite.anchor.y;
    for (const duration of state.oneShotAnim!.frameDurationsMs) {
        unit.ensureVisual(world, gridSettings);
        expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(deathCanvasWidth, 8);
        expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(deathCanvasHeight, 8);
        expect(state.sprite.anchor.y).toBe(deathAnchor);
        unit.stepOneShotAnimation(duration);
    }
    expect(state.oneShotAnim?.frameIndex).toBe(7);
    expect(state.sprite.texture).toBe(state.oneShotAnim!.frames[7]);
    unit.stepOneShotAnimation(3000);
    expect(done).toBe(1);
    expect(state.oneShotAnim?.frameIndex).toBe(7);
    expect((state.sprite.filters ?? []).some((f) => f.constructor.name === "DryadIdleFilter")).toBe(false);
    unit.returnToIdleAnimation();
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("hit")).not.toBe("dryad_lab_hit_atlas");
});

assetTest("Dryad ranged arrows release exactly on the empty-bow frame and cancel cleanly", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", () => Texture.WHITE);
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frameIndex: number; frameDurationsMs: number[] };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idle = state.sprite.texture;
    const idleWidth = idle.width * Math.abs(state.sprite.scale.x);
    for (const action of ["attack", "attack_up", "attack_down"] as const) {
        const shot = unit.prepareDryadRangedShot()!;
        expect(shot).toBeDefined();
        expect(unit.prepareDryadRangedShot()).toBeUndefined();
        let releases = 0;
        let origin: { x: number; y: number } | undefined;
        expect(
            unit.playDryadRangedShot(action, shot, () => {
                expect(state.oneShotAnim?.frameIndex).toBe(3);
                origin = unit.getRangedProjectileOrigin({ x: 1000, y: 1000 }, gridSettings);
                releases++;
            }),
        ).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`dryad_lab_${action}_atlas`);
        const releaseMs = state.oneShotAnim!.frameDurationsMs.slice(0, 3).reduce((a, b) => a + b, 0);
        unit.stepOneShotAnimation(releaseMs - 1);
        expect(releases).toBe(0);
        unit.stepOneShotAnimation(1);
        expect(releases).toBe(1);
        expect(Number.isFinite(origin?.x)).toBe(true);
        expect(unit.getDryadArrowLength()).toBeGreaterThan(0);
        expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(idleWidth, 8);
        unit.stepOneShotAnimation(5000);
        expect(releases).toBe(1);
        expect(state.sprite.texture).toBe(idle);
        expect(shot.signal.aborted).toBe(false);
        unit.finishDryadRangedShot(shot);
        expect(unit.hasPendingDryadRangedShot()).toBe(false);
    }
    for (const cancel of [
        () => unit.returnToIdleAnimation(),
        () => unit.startBoardWalkAnimation(1, 2),
        () => unit.playOneShotAnimation("hit", undefined, true),
    ]) {
        unit.returnToIdleAnimation();
        const shot = unit.prepareDryadRangedShot()!;
        let releases = 0;
        unit.playDryadRangedShot("attack", shot, () => releases++);
        cancel();
        unit.stepOneShotAnimation(5000);
        expect(shot.signal.aborted).toBe(true);
        expect(releases).toBe(0);
    }
    unit.returnToIdleAnimation();
    const pending = unit.prepareDryadRangedShot()!;
    unit.returnToIdleAnimation();
    expect(unit.playDryadRangedShot("attack", pending, () => {})).toBe(false);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.prepareDryadRangedShot()).toBeUndefined();
});

assetTest("Dryad lab has three bow melee clips with stable scale and clean return to idle", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Dryad", "dryad_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: {
            frames: Texture[];
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            holdLastFrame: boolean;
        };
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const idle = state.sprite.texture;
    const idleWidth = idle.width * Math.abs(state.sprite.scale.x);
    const idleHeight = idle.height * Math.abs(state.sprite.scale.y);
    for (const [action, authoredState, totalMs] of [
        ["melee_attack", "melee_attack", 540],
        ["melee_attack_up", "melee_attack_down", 570],
        ["melee_attack_down", "melee_attack_up", 590],
    ] as const) {
        unit.startBoardWalkAnimation(1, 3);
        let completions = 0;
        expect(unit.playOneShotAnimation(action, () => completions++, true)).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`dryad_lab_${authoredState}_atlas`);
        expect(keys).toContain(`dryad_lab_${authoredState}_atlas`);
        expect(keys).not.toContain(`dryad_lab_${authoredState}_atlas_quarter`);
        expect(state.oneShotAnim?.frames).toHaveLength(8);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        expect(state.oneShotAnim?.holdLastFrame).toBe(false);
        expect(state.oneShotAnim!.frameDurationsMs.reduce((sum, duration) => sum + duration, 0)).toBe(totalMs);
        const durations = [...state.oneShotAnim!.frameDurationsMs];
        for (const duration of durations) {
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.texture.width).toBe(768);
            expect(state.sprite.texture.height).toBe(768);
            expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(idleWidth, 8);
            expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(idleHeight, 8);
            expect(state.sprite.anchor.y).toBe(730 / 768);
            expect((state.sprite.filters ?? []).some((f) => f.constructor.name === "DryadIdleFilter")).toBe(false);
            unit.stepOneShotAnimation(duration);
        }
        expect(completions).toBe(1);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(state.sprite.texture).toBe(idle);
        expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(idleWidth, 8);
        expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(idleHeight, 8);
    }
    unit.setCreatureAnimationLabPreviewEnabled(false);
    for (const action of ["melee_attack", "melee_attack_up", "melee_attack_down"]) {
        expect(unit.getAnimationTextureKey(action)).not.toBe(`dryad_lab_${action}_atlas`);
    }
});

assetTest("Leprechaun directional attacks retain physical scale and ground through padded-canvas transitions", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const base = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 768, 768) });
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Leprechaun", "leprechaun_512", (key) =>
        key.includes("atlas") ? Texture.WHITE : base,
    );
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frameIndex: number; frameDurationsMs: number[]; authoredRealTime: boolean };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const sx = state.sprite.scale.x;
    const sy = state.sprite.scale.y;
    const soleY = (row: number) =>
        state.sprite.y + (row - state.sprite.anchor.y * state.sprite.texture.height) * state.sprite.scale.y;
    const ground = soleY(741);
    const check = (padded: boolean) => {
        expect(state.sprite.scale.x).toBeCloseTo(sx, 8);
        expect(state.sprite.scale.y).toBeCloseTo(sy, 8);
        expect(state.sprite.texture.height).toBe(padded ? 1024 : 768);
        expect(soleY(padded ? 869 : 741)).toBeCloseTo(ground, 8);
    };
    for (const [action, duration] of [
        ["melee_attack", 590],
        ["melee_attack_up", 620],
        ["melee_attack_down", 615],
    ] as const) {
        unit.startBoardWalkAnimation(1, 2);
        let done = 0;
        expect(unit.playOneShotAnimation(action, () => done++, true)).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`leprechaun_lab_${action}_atlas`);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        const durations = state.oneShotAnim!.frameDurationsMs.slice();
        expect(durations.reduce((sum, ms) => sum + ms, 0)).toBe(duration);
        check(true);
        for (const [frame, ms] of durations.entries()) {
            unit.ensureVisual(world, gridSettings);
            expect(state.oneShotAnim?.frameIndex).toBe(frame);
            check(true);
            unit.stepOneShotAnimation(ms);
        }
        expect(done).toBe(1);
        expect(state.oneShotAnim).toBeUndefined();
        check(false);
        unit.ensureVisual(world, gridSettings);
        check(false);
    }
    unit.playOneShotAnimation("melee_attack_up", undefined, true);
    unit.stepOneShotAnimation(200);
    unit.playOneShotAnimation("melee_attack_down", undefined, true);
    check(true);
    unit.playOneShotAnimation("hit", undefined, true);
    check(false);
    unit.ensureVisual(world, gridSettings);
    check(false);
    unit.returnToIdleAnimation();
    check(false);
});

assetTest("Leprechaun lab reactions preserve size, return from hit and hold the final death pose", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const base = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 768, 768) });
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Leprechaun", "leprechaun_512", (key) =>
        key.includes("atlas") ? Texture.WHITE : base,
    );
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: {
            frames: Texture[];
            frameIndex: number;
            frameDurationsMs: number[];
            authoredRealTime: boolean;
            holdLastFrame: boolean;
        };
    };
    unit.setPosition(0, 1024);
    const world = new Container();
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const height = state.sprite.texture.height * Math.abs(state.sprite.scale.y);
    const idle = state.sprite.texture;
    const width = state.sprite.texture.width * Math.abs(state.sprite.scale.x);
    const idleAnchor = state.sprite.anchor.y;
    const soleY = () =>
        state.sprite.y + (741 / 768 - state.sprite.anchor.y) * state.sprite.texture.height * state.sprite.scale.y;
    const ground = soleY();
    const checkRegistration = () => {
        expect(state.sprite.texture.width * Math.abs(state.sprite.scale.x)).toBeCloseTo(width, 8);
        expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
        expect(state.sprite.anchor.y).toBeCloseTo(idleAnchor, 8);
        expect(soleY()).toBeCloseTo(ground, 8);
    };
    unit.startBoardWalkAnimation(1, 3);
    expect(unit.playOneShotAnimation("hit", undefined, true)).toBe(true);
    expect(unit.getAnimationTextureKey("hit")).toBe("leprechaun_lab_hit_atlas");
    expect(state.oneShotAnim?.frames).toHaveLength(8);
    expect(state.oneShotAnim?.authoredRealTime).toBe(true);
    expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(650 / 1.08 / 1.08 / 1.1, 8);
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    checkRegistration();
    const hitDurations = state.oneShotAnim!.frameDurationsMs.slice();
    for (const [frame, duration] of hitDurations.entries()) {
        unit.ensureVisual(world, gridSettings);
        checkRegistration();
        expect(state.oneShotAnim?.frameIndex).toBe(frame);
        unit.stepOneShotAnimation(duration - (frame === hitDurations.length - 1 ? 1 : 0));
    }
    expect(unit.isPlayingOneShotAnimation("hit")).toBe(true);
    unit.stepOneShotAnimation(1);
    expect(unit.isPlayingOneShotAnimation()).toBe(false);
    expect(state.sprite.texture).toBe(idle);
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    let done = 0;
    expect(unit.playOneShotAnimation("death", () => done++, true)).toBe(true);
    expect(unit.getAnimationTextureKey("death")).toBe("leprechaun_lab_death_atlas");
    expect(state.oneShotAnim?.frames).toHaveLength(6);
    expect(state.oneShotAnim?.holdLastFrame).toBe(true);
    expect(state.oneShotAnim!.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(
        1140 / 1.1 / 1.09 / 1.07,
        8,
    );
    checkRegistration();
    const deathDurations = state.oneShotAnim!.frameDurationsMs.slice();
    for (const [frame, duration] of deathDurations.entries()) {
        unit.ensureVisual(world, gridSettings);
        checkRegistration();
        expect(state.oneShotAnim?.frameIndex).toBe(frame);
        unit.stepOneShotAnimation(duration);
    }
    unit.stepOneShotAnimation(3000);
    expect(state.oneShotAnim?.frameIndex).toBe(5);
    unit.stepOneShotAnimation(3000);
    expect(done).toBe(1);
    expect(state.sprite.texture).toBe(state.oneShotAnim!.frames[5]);
    unit.returnToIdleAnimation();
    unit.ensureVisual(world, gridSettings);
    checkRegistration();
    expect(state.sprite.texture.height * Math.abs(state.sprite.scale.y)).toBeCloseTo(height, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.getAnimationTextureKey("hit")).not.toBe("leprechaun_lab_hit_atlas");
});

assetTest("Battle Mage combat enables the complete approved package without entering the lab", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Life", "Battle Mage", "battle_mage_512", () => Texture.WHITE);
        const state = unit as unknown as { sprite: Sprite; walkAnim?: { frames: Texture[] } };
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        unit.stepSelectionAnimation();
        expect(state.sprite.filters?.some((filter) => filter instanceof BattleMageIdleFilter)).toBe(true);
        unit.startBoardWalkAnimation(1, 3);
        expect(state.walkAnim?.frames).toHaveLength(8);
        unit.stopBoardWalkAnimation();
        for (const action of ["hit", "death", "melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
            expect(unit.getAnimationTextureKey(action)).toBe(`battle_mage_lab_${action}_atlas`);
            expect(unit.playOneShotAnimation(action)).toBe(true);
            unit.stepOneShotAnimation(2000);
            unit.returnToIdleAnimation();
        }
        state.sprite.destroy();
    }
});

assetTest("Battle Mage lab uses eight HD walk frames with distance cadence and a stable canvas", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const keys: string[] = [];
    const unit = createRenderableUnit(TeamVals.LEFT, "Life", "Battle Mage", "battle_mage_512", (key) => {
        keys.push(key);
        return Texture.WHITE;
    });
    const state = unit as unknown as {
        sprite: Sprite;
        walkAnim?: { frames: Texture[]; frameIndex: number; loopStartFrame: number; loopEndFrame: number };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const height = Math.abs(state.sprite.scale.y) * state.sprite.texture.height;
    const idleWidth = state.sprite.width;
    // Measured opaque spans at y=180..359: torso, arms and book; exclude swinging coat/feet.
    const upperWidths = [405, 408, 408, 405, 411, 414, 414, 405];
    const idleUpperWidth = (idleWidth * 462) / 768;
    unit.startBoardWalkAnimation(1, 4);
    expect(keys).toContain("battle_mage_lab_walk_atlas");
    expect((state.sprite.width * 453) / 768).toBeCloseTo((idleWidth * 516) / 768, 8);
    const walkWidth = state.sprite.width;
    unit.startBoardWalkAnimation(-1, 4);
    expect(state.sprite.width).toBeCloseTo(walkWidth, 8);
    unit.startBoardWalkAnimation(1, 4);
    expect(state.sprite.width).toBeCloseTo(walkWidth, 8);
    expect(keys).not.toContain("battle_mage_lab_walk_atlas_quarter");
    expect(state.walkAnim?.frames).toHaveLength(8);
    expect(state.walkAnim?.frames[0].width).toBe(768);
    expect(state.walkAnim?.loopStartFrame).toBe(0);
    expect(state.walkAnim?.loopEndFrame).toBe(7);
    for (let step = 0; step <= 16; step++) {
        unit.setBoardWalkDistanceCells((step * 1.3) / 8 + 1e-8);
        unit.stepSpawnAnimation(1 / 60);
        expect(state.walkAnim?.frameIndex).toBe(step % 8);
        expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(height, 8);
        expect(state.sprite.width).toBeCloseTo(walkWidth, 8);
        expect(Math.abs((state.sprite.width * upperWidths[step % 8]) / 768 / idleUpperWidth - 1)).toBeLessThan(0.03);
        unit.ensureVisual(world, gridSettings);
        expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(height, 8);
        expect(state.sprite.width).toBeCloseTo(walkWidth, 8);
    }
    unit.setBoardWalkDistanceCells(2.6 + Math.SQRT2);
    const diagonalFrame = Math.floor((2.6 + Math.SQRT2) / (1.3 / 8)) % 8;
    expect(state.walkAnim?.frameIndex).toBe(diagonalFrame);
    unit.stepSpawnAnimation(0.5);
    expect(state.walkAnim?.frameIndex).toBe(diagonalFrame);
    unit.stopBoardWalkAnimation();
    expect(Math.abs(state.sprite.scale.y) * state.sprite.texture.height).toBeCloseTo(height, 8);
    expect(state.sprite.width).toBeCloseTo(idleWidth, 8);
    unit.ensureVisual(world, gridSettings);
    expect(state.sprite.width).toBeCloseTo(idleWidth, 8);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    unit.startBoardWalkAnimation(1);
    expect(state.walkAnim).toBeUndefined();
});

assetTest("Battle Mage lab idle yields to walking and reactions, resumes, and releases its filter", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Life", "Battle Mage", "battle_mage_512", () => Texture.WHITE);
        const state = unit as unknown as { sprite: Sprite };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const idleFilters = () => (state.sprite.filters ?? []).filter((f) => f instanceof BattleMageIdleFilter);
        expect(idleFilters()).toHaveLength(0);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        unit.stepSelectionAnimation();
        expect(idleFilters()).toHaveLength(1);
        const filter = idleFilters()[0] as BattleMageIdleFilter;
        const height = state.sprite.height;
        const anchor = state.sprite.anchor.y;
        const texture = state.sprite.texture;
        unit.stepSelectionAnimation(performance.now() + 1500);
        expect(filter.resources.mageIdle.uniforms.uTime).toBeGreaterThan(1);
        expect(filter.resources.mageIdle.uniforms.uFireTime).toBeCloseTo(
            filter.resources.mageIdle.uniforms.uTime * 2.6,
            8,
        );
        filter.update(2000);
        expect(filter.resources.mageIdle.uniforms.uTime).toBe(2.5);
        expect(filter.resources.mageIdle.uniforms.uFireTime).toBe(6.5);
        expect(state.sprite.texture).toBe(texture);
        expect(state.sprite.height).toBe(height);
        expect(state.sprite.anchor.y).toBe(anchor);
        unit.startBoardWalkAnimation(-1, 3);
        expect(idleFilters()).toHaveLength(0);
        unit.stopBoardWalkAnimation();
        expect(idleFilters()).toEqual([filter]);
        expect(unit.playOneShotAnimation("hit", undefined, true)).toBe(true);
        expect(idleFilters()).toHaveLength(0);
        unit.returnToIdleAnimation();
        unit.ensureVisual(world, gridSettings);
        expect(idleFilters()).toEqual([filter]);
        expect(unit.playOneShotAnimation("death", undefined, true)).toBe(true);
        unit.stepOneShotAnimation(10000);
        expect(idleFilters()).toHaveLength(0);
        unit.returnToIdleAnimation();
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(idleFilters()).toHaveLength(0);
        const release = spyOn(filter, "destroy");
        state.sprite.destroy();
        expect(release).toHaveBeenCalledTimes(1);
    }
});

assetTest("Battle Mage lab redrawn reactions preserve scale, settle hits and hold the final corpse", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Life", "Battle Mage", "battle_mage_512", () => Texture.WHITE);
        const world = new Container();
        const state = unit as unknown as {
            sprite: Sprite;
            shadow: Graphics;
            silhouetteShadow: Sprite;
            badgeContainer: Container;
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                elapsed: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
                finished?: boolean;
            };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        const reactionFilter = () => state.sprite.filters?.find((f) => f instanceof BattleMageReactionFilter);
        let hits = 0,
            deaths = 0;
        unit.startBoardWalkAnimation(-1, 3);
        expect(unit.playOneShotAnimation("hit", () => hits++, true)).toBe(true);
        expect(unit.getAnimationTextureKey("hit")).toBe("battle_mage_lab_hit_atlas");
        expect(state.oneShotAnim?.frames).toHaveLength(7);
        const hitDuration = 520 / 1.15 / 1.07;
        expect(state.oneShotAnim?.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(hitDuration, 10);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        expect(state.sprite.width).toBeCloseTo(width, 8);
        expect(state.sprite.height).toBeCloseTo(height, 8);
        expect(state.sprite.anchor.y).toBe(anchor);
        expect(reactionFilter()).toBeUndefined();
        const opening = state.sprite.texture;
        unit.stepOneShotAnimation(105);
        expect(state.oneShotAnim!.frameIndex).toBeGreaterThan(0);
        expect(state.sprite.texture).not.toBe(opening);
        expect(hits).toBe(0);
        unit.stepOneShotAnimation(hitDuration - 105 - 1);
        expect(hits).toBe(0);
        unit.stepOneShotAnimation(1.000001);
        expect(hits).toBe(1);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(state.sprite.width).toBeCloseTo(width, 8);
        expect(state.sprite.height).toBeCloseTo(height, 8);
        expect(unit.playOneShotAnimation("death", () => deaths++, true)).toBe(true);
        expect(unit.getAnimationTextureKey("death")).toBe("battle_mage_lab_death_atlas");
        expect(state.oneShotAnim?.frames).toHaveLength(9);
        const deathDuration = 1450 / 1.2 / 1.22 / 1.22;
        expect(state.oneShotAnim?.frameDurationsMs.reduce((sum, ms) => sum + ms, 0)).toBeCloseTo(deathDuration, 10);
        for (let i = 0; i < 16; i++) {
            unit.stepOneShotAnimation(50);
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
            expect(reactionFilter()).toBeUndefined();
        }
        expect(deaths).toBe(0);
        expect(state.oneShotAnim!.frameIndex).toBeGreaterThan(5);
        unit.stepOneShotAnimation(deathDuration - 800 - 1);
        expect(deaths).toBe(0);
        unit.stepOneShotAnimation(1.000001);
        unit.ensureVisual(world, gridSettings);
        expect(deaths).toBe(1);
        expect(state.oneShotAnim?.finished).toBe(true);
        expect(state.oneShotAnim?.frameIndex).toBe(8);
        const corpse = state.sprite.texture;
        expect(state.sprite.alpha).toBe(1);
        expect(reactionFilter()).toBeUndefined();
        expect(state.shadow.alpha).toBe(0);
        expect(state.silhouetteShadow.alpha).toBe(0);
        expect(state.badgeContainer.visible).toBe(false);
        unit.stepOneShotAnimation(10000);
        expect(deaths).toBe(1);
        expect(state.sprite.texture).toBe(corpse);
        unit.returnToIdleAnimation();
        unit.ensureVisual(world, gridSettings);
        expect(state.sprite.width).toBeCloseTo(width, 8);
        expect(state.sprite.height).toBeCloseTo(height, 8);
        expect(state.sprite.anchor.y).toBe(anchor);
        expect(state.shadow.alpha).toBeGreaterThan(0);
        unit.playOneShotAnimation("death", undefined, true);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.isPlayingOneShotAnimation()).toBe(false);
        expect(reactionFilter()).toBeUndefined();
        state.sprite.destroy();
    }
});

assetTest(
    "Battle Mage lab melee attacks and cast preserve body scale and restore idle after completion or interruption",
    () => {
        for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const unit = createRenderableUnit(team, "Life", "Battle Mage", "battle_mage_512", () => Texture.WHITE);
            const world = new Container();
            const state = unit as unknown as {
                sprite: Sprite;
                walkAnim?: unknown;
                oneShotAnim?: {
                    frames: Texture[];
                    frameIndex: number;
                    frameDurationsMs: number[];
                    authoredRealTime?: boolean;
                };
            };
            unit.setPosition(0, 1024);
            unit.ensureVisual(world, gridSettings);
            unit.setCreatureAnimationLabPreviewEnabled(true);
            const width = state.sprite.width,
                height = state.sprite.height,
                anchor = state.sprite.anchor.y;
            for (const action of ["melee_attack", "melee_attack_up", "melee_attack_down", "cast"]) {
                let completed = 0;
                unit.startBoardWalkAnimation(-1, 3);
                expect(unit.playOneShotAnimation(action, () => completed++, true)).toBe(true);
                expect(unit.getAnimationTextureKey(action)).toBe(`battle_mage_lab_${action}_atlas`);
                expect(state.walkAnim).toBeUndefined();
                expect(state.oneShotAnim?.frames).toHaveLength(8);
                expect(state.oneShotAnim?.authoredRealTime).toBe(true);
                const durations = state.oneShotAnim!.frameDurationsMs;
                expect(durations.reduce((sum, ms) => sum + ms, 0)).toBe(action === "cast" ? 840 : 620);
                for (let frame = 0; frame < durations.length; frame++) {
                    unit.ensureVisual(world, gridSettings);
                    expect(state.oneShotAnim!.frameIndex).toBe(frame);
                    // The larger canvas reserves spell space while preserving the 768px body size.
                    expect(state.sprite.width / 1.5).toBeCloseTo(width, 8);
                    expect(state.sprite.height / 1.5).toBeCloseTo(height, 8);
                    expect((state.sprite.anchor.y * 1152 - 192) / 768).toBeCloseTo(anchor, 8);
                    unit.stepOneShotAnimation(durations[frame] - 0.01);
                    expect(completed).toBe(0);
                    unit.stepOneShotAnimation(0.010001);
                }
                expect(completed).toBe(1);
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.sprite.width).toBeCloseTo(width, 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.anchor.y).toBe(anchor);
                unit.playOneShotAnimation(action, undefined, true);
                unit.stepOneShotAnimation(250);
                unit.playOneShotAnimation("hit", undefined, true);
                unit.ensureVisual(world, gridSettings);
                expect(state.sprite.width).toBeCloseTo(width, 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                unit.returnToIdleAnimation();
                unit.playOneShotAnimation(action, undefined, true);
                unit.stepOneShotAnimation(250);
                unit.startBoardWalkAnimation(-1, 3);
                expect(unit.isPlayingOneShotAnimation()).toBe(false);
                expect(state.walkAnim).toBeDefined();
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.width / (516 / 453)).toBeCloseTo(width, 8);
                unit.stopBoardWalkAnimation();
                unit.returnToIdleAnimation();
            }
            state.sprite.destroy();
        }
    },
);

assetTest("Healer combat reactions return from hit and hold the final death pose on both teams", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Life", "Healer", "healer_512", (key) => {
            keys.push(key);
            return Texture.WHITE;
        });
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
                finished?: boolean;
            };
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        for (const [action, count, total] of [
            ["hit", 6, 450],
            ["death", 8, 1150],
        ] as const) {
            let completions = 0;
            unit.startBoardWalkAnimation(-1, 3);
            expect(unit.playOneShotAnimation(action, () => completions++)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(unit.getAnimationTextureKey(action)).toBe(`healer_lab_${action}_atlas`);
            expect(keys).toContain(`healer_lab_${action}_atlas`);
            expect(keys).not.toContain(`healer_lab_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frames).toHaveLength(count);
            expect(state.oneShotAnim?.frames[0].width).toBe(768);
            expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 8);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            expect(state.sprite.filters ?? []).not.toContain(healerLabWalkPalette());
            const durations = state.oneShotAnim!.frameDurationsMs.slice();
            for (let frame = 0; frame < count; frame++) {
                unit.ensureVisual(world, gridSettings);
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(768);
                expect(state.sprite.texture.height).toBe(768);
                expect(state.sprite.width).toBeCloseTo(width, 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.anchor.y).toBe(anchor);
                expect(completions).toBe(0);
                unit.stepOneShotAnimation(durations[frame]);
            }
            unit.ensureVisual(world, gridSettings);
            expect(completions).toBe(1);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
            expect(state.sprite.anchor.y).toBe(anchor);
            if (action === "death") {
                expect(state.oneShotAnim?.finished).toBe(true);
                expect(state.oneShotAnim?.frameIndex).toBe(count - 1);
                const corpse = state.sprite.texture;
                unit.stepOneShotAnimation(10000);
                unit.stepSelectionAnimation(performance.now() + 10000);
                expect(state.sprite.texture).toBe(corpse);
                expect(completions).toBe(1);
            } else expect(unit.isPlayingOneShotAnimation()).toBe(false);
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        }
    }
});

assetTest("Healer combat attacks and cast preserve scale, authored timing and return to idle on both teams", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Life", "Healer", "healer_512", (key) => {
            keys.push(key);
            return Texture.WHITE;
        });
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
                finished?: boolean;
            };
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        for (const [action, count, total] of [
            ["attack", 8, 700],
            ["attack_up", 8, 700],
            ["attack_down", 8, 700],
            ["cast", 8, 1080],
        ] as const) {
            let completions = 0;
            unit.startBoardWalkAnimation(-1, 3);
            expect(unit.playOneShotAnimation(action, () => completions++)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(unit.getAnimationTextureKey(action)).toBe(`healer_lab_${action}_atlas`);
            expect(keys).toContain(`healer_lab_${action}_atlas`);
            expect(keys).not.toContain(`healer_lab_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frames).toHaveLength(count);
            expect(state.oneShotAnim?.frames[0].width).toBe(768);
            expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 8);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            expect(state.sprite.filters ?? []).not.toContain(healerLabWalkPalette());
            const durations = state.oneShotAnim!.frameDurationsMs.slice();
            for (let frame = 0; frame < count; frame++) {
                unit.ensureVisual(world, gridSettings);
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(768);
                expect(state.sprite.texture.height).toBe(768);
                expect(state.sprite.width).toBeCloseTo(width, 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.anchor.y).toBe(anchor);
                expect(completions).toBe(0);
                unit.stepOneShotAnimation(durations[frame]);
            }
            unit.ensureVisual(world, gridSettings);
            expect(completions).toBe(1);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
            expect(state.sprite.anchor.y).toBe(anchor);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            if (action !== "cast")
                expect(unit.getAnimationTextureKey(`melee_${action}`)).toBe(`healer_lab_${action}_atlas`);
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        }
    }
});

assetTest("Troll lab attacks and reactions preserve scale, return to idle and hold death on both teams", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Chaos", "Troll", "troll_512", (key) => {
            keys.push(key);
            return Texture.WHITE;
        });
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
                finished?: boolean;
            };
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const baseFilters = [...(state.sprite.filters ?? [])];
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        for (const [action, count, total, canvas] of [
            ["hit", 4, 450 / 1.2, 768],
            ["death", 7, 1160 / 1.15 / 1.17, 768],
            ["melee_attack", 6, 600, 1152],
            ["melee_attack_up", 6, 600, 1152],
            ["melee_attack_down", 6, 600, 1152],
            ["cast", 8, 1240, 1152],
        ] as const) {
            let completions = 0;
            unit.startBoardWalkAnimation(-1, 3);
            expect(unit.playOneShotAnimation(action, () => completions++, true)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(unit.getAnimationTextureKey(action)).toBe(`troll_lab_${action}_atlas`);
            expect(keys).toContain(`troll_lab_${action}_atlas`);
            expect(keys).not.toContain(`troll_lab_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frames).toHaveLength(count);
            expect(state.oneShotAnim?.frames[0].width).toBe(canvas);
            expect(state.sprite.width).toBeCloseTo((width * canvas) / 768, 8);
            expect(state.sprite.height).toBeCloseTo((height * canvas) / 768, 8);
            expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 8);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            if (canvas === 1152) {
                expect(state.sprite.filters).toHaveLength(baseFilters.length + 1);
                expect(state.oneShotAnim!.frames[0].source).toBe(state.selectionAnimFrames[0].source);
                expect(state.oneShotAnim!.frames[0].frame).toEqual(state.selectionAnimFrames[0].frame);
                expect(state.oneShotAnim!.frames[0].trim?.x).toBe(192);
                expect(state.oneShotAnim!.frames[count - 1]).toBe(state.oneShotAnim!.frames[0]);
            } else expect(state.sprite.filters ?? []).toEqual(baseFilters);
            const durations = state.oneShotAnim!.frameDurationsMs.slice();
            for (let frame = 0; frame < count; frame++) {
                unit.ensureVisual(world, gridSettings);
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(canvas);
                expect(state.sprite.texture.height).toBe(canvas);
                const bodyScale = canvas === 1152 ? trollAttackBodyScale(action, frame) : 1;
                expect(state.sprite.width).toBeCloseTo((width * canvas * bodyScale) / 768, 8);
                expect(state.sprite.height).toBeCloseTo((height * canvas * bodyScale) / 768, 8);
                expect(state.sprite.anchor.y).toBe(canvas === 1152 ? 922 / 1152 : anchor);
                expect(completions).toBe(0);
                if (action === "cast" && frame === 3) {
                    unit.stepOneShotAnimation(durations[frame] / 2);
                    const glow = state.sprite.parent!.children.find((child) => child.label === "troll-cast-fist-glow");
                    expect(glow?.visible).toBe(true);
                    expect(glow?.alpha).toBeCloseTo(0.4);
                    unit.stepOneShotAnimation(durations[frame] / 2);
                } else unit.stepOneShotAnimation(durations[frame]);
            }
            if (canvas === 1152) {
                expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
                expect(state.sprite.width).toBeCloseTo(width, 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
            }
            unit.ensureVisual(world, gridSettings);
            expect(completions).toBe(1);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
            expect(state.sprite.anchor.y).toBe(anchor);
            if (action === "cast")
                expect(
                    state.sprite.parent!.children.find((child) => child.label === "troll-cast-fist-glow")?.visible,
                ).toBe(false);
            if (action === "death") {
                expect(state.oneShotAnim?.finished).toBe(true);
                expect(state.oneShotAnim?.frameIndex).toBe(count - 1);
                const corpse = state.sprite.texture;
                unit.stepOneShotAnimation(10000);
                unit.stepSelectionAnimation(performance.now() + 10000);
                expect(state.sprite.texture).toBe(corpse);
                expect(completions).toBe(1);
            } else expect(unit.isPlayingOneShotAnimation()).toBe(false);
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
        }
    }
});

assetTest("Pikeman lab reactions return from hit and hold the final death pose on both teams", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Life", "Pikeman", "pikeman_512", (key) => {
            keys.push(key);
            return Texture.WHITE;
        });
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
                finished?: boolean;
            };
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(true);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        for (const [action, count, total] of [
            ["hit", 12, 500],
            ["death", 8, 1250],
        ] as const) {
            let completions = 0;
            unit.startBoardWalkAnimation(-1, 3);
            expect(unit.playOneShotAnimation(action, () => completions++, true)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(unit.getAnimationTextureKey(action)).toBe(`pikeman_lab_${action}_atlas`);
            expect(keys).toContain(`pikeman_lab_${action}_atlas`);
            expect(keys).not.toContain(`pikeman_lab_${action}_atlas_quarter`);
            expect(state.oneShotAnim?.frames).toHaveLength(count);
            expect(state.oneShotAnim?.frames[0].width).toBe(action === "death" ? 1024 : 768);
            expect(state.oneShotAnim?.frameDurationsMs.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 8);
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            const durations = state.oneShotAnim!.frameDurationsMs.slice();
            for (let frame = 0; frame < count; frame++) {
                unit.ensureVisual(world, gridSettings);
                expect(state.oneShotAnim!.frameIndex).toBe(frame);
                expect(state.sprite.texture.width).toBe(action === "death" ? 1024 : 768);
                expect(state.sprite.texture.height).toBe(768);
                expect(state.sprite.width).toBeCloseTo(width * (action === "death" ? 1024 / 768 : 1), 8);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.anchor.y).toBe(anchor);
                expect(completions).toBe(0);
                unit.stepOneShotAnimation(durations[frame]);
            }
            unit.ensureVisual(world, gridSettings);
            expect(completions).toBe(1);
            expect(state.sprite.width).toBeCloseTo(width * (action === "death" ? 1024 / 768 : 1), 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
            expect(state.sprite.anchor.y).toBe(anchor);
            if (action === "death") {
                expect(state.oneShotAnim?.finished).toBe(true);
                expect(state.oneShotAnim?.frameIndex).toBe(count - 1);
                const corpse = state.sprite.texture;
                unit.stepOneShotAnimation(10000);
                unit.stepSelectionAnimation(performance.now() + 10000);
                expect(state.sprite.texture).toBe(corpse);
                expect(completions).toBe(1);
            } else expect(unit.isPlayingOneShotAnimation()).toBe(false);
            unit.returnToIdleAnimation();
            unit.ensureVisual(world, gridSettings);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
        }
    }
});

assetTest("Pikeman lab attacks preserve registration and return to idle in all three directions", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const keys: string[] = [];
        const unit = createRenderableUnit(team, "Life", "Pikeman", "pikeman_512", (key) => {
            keys.push(key);
            return Texture.WHITE;
        });
        const state = unit as unknown as {
            sprite: Sprite;
            walkAnim?: unknown;
            selectionAnimFrames: Texture[];
            oneShotAnim?: {
                frames: Texture[];
                frameIndex: number;
                frameDurationsMs: number[];
                authoredRealTime?: boolean;
            };
        };
        const world = new Container();
        unit.setPosition(0, 1024);
        unit.ensureVisual(world, gridSettings);
        const width = state.sprite.width,
            height = state.sprite.height,
            anchor = state.sprite.anchor.y;
        unit.setCreatureAnimationLabPreviewEnabled(true);
        for (const action of ["attack", "attack_up", "attack_down"]) {
            const melee = action.replace("attack", "melee_attack");
            expect(unit.hasAnimationState(melee)).toBe(true);
            expect(unit.getAnimationTextureKey(melee)).toBe("pikeman_lab_" + action + "_atlas");
            expect(unit.getAnimationTextureKey(action)).toBe(unit.getAnimationTextureKey(melee));
            unit.startBoardWalkAnimation(-1, 3);
            let completions = 0;
            expect(unit.playOneShotAnimation(melee, () => completions++, true)).toBe(true);
            expect(state.walkAnim).toBeUndefined();
            expect(keys).toContain("pikeman_lab_" + action + "_atlas");
            expect(keys).not.toContain("pikeman_lab_" + action + "_atlas_quarter");
            expect(state.oneShotAnim?.authoredRealTime).toBe(true);
            const durations = state.oneShotAnim!.frameDurationsMs.slice();
            expect(durations.reduce((a, b) => a + b, 0)).toBeCloseTo(720 / 1.12, 8);
            [60, 120, 70, 130, 190, 150].forEach((duration, index) => {
                expect(durations[index]).toBeCloseTo(duration / 1.12, 8);
            });
            for (let i = 0; i < durations.length; i++) {
                unit.ensureVisual(world, gridSettings);
                expect(state.oneShotAnim!.frameIndex).toBe(i);
                expect(state.sprite.height).toBeCloseTo(height, 8);
                expect(state.sprite.width).toBeCloseTo((width * 1280) / 768, 8);
                expect(state.sprite.anchor.y).toBe(anchor);
                expect(completions).toBe(0);
                unit.stepOneShotAnimation(durations[i]);
            }
            unit.ensureVisual(world, gridSettings);
            expect(completions).toBe(1);
            expect(unit.isPlayingOneShotAnimation()).toBe(false);
            expect(state.sprite.texture).toBe(state.selectionAnimFrames[0]);
            expect(state.sprite.width).toBeCloseTo(width, 8);
            expect(state.sprite.height).toBeCloseTo(height, 8);
        }
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(unit.getAnimationTextureKey("attack")).not.toBe("pikeman_lab_attack_atlas");
    }
});

assetTest("Elf directional attacks retain physical scale and ground through padded-canvas transitions", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const base = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 768, 768) });
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) =>
        key.includes("atlas") ? Texture.WHITE : base,
    );
    const state = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frameIndex: number; frameDurationsMs: number[]; authoredRealTime: boolean };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const sx = state.sprite.scale.x;
    const sy = state.sprite.scale.y;
    const soleY = (row: number) =>
        state.sprite.y + (row - state.sprite.anchor.y * state.sprite.texture.height) * state.sprite.scale.y;
    const soleX = (column: number) =>
        state.sprite.x + (column - state.sprite.anchor.x * state.sprite.texture.width) * state.sprite.scale.x;
    const groundX = soleX(382.77);
    const ground = soleY(741);
    const check = (padded: boolean) => {
        expect(state.sprite.scale.x).toBeCloseTo(sx, 8);
        expect(state.sprite.scale.y).toBeCloseTo(sy, 8);
        expect(state.sprite.texture.height).toBe(padded ? 1024 : 768);
        expect(state.sprite.texture.width).toBe(padded ? 1664 : 768);
        expect(soleX(padded ? 830.77 : 382.77)).toBeCloseTo(groundX, 8);
        expect(soleY(padded ? 869 : 741)).toBeCloseTo(ground, 8);
    };
    for (const [action, duration] of [
        ["melee_attack", 540],
        ["melee_attack_up", 570],
        ["melee_attack_down", 590],
    ] as const) {
        unit.startBoardWalkAnimation(1, 2);
        let done = 0;
        expect(unit.playOneShotAnimation(action, () => done++, true)).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`elf_lab_${action}_atlas`);
        expect(state.oneShotAnim?.authoredRealTime).toBe(true);
        const durations = state.oneShotAnim!.frameDurationsMs.slice();
        expect(durations.reduce((sum, ms) => sum + ms, 0)).toBe(duration);
        check(true);
        for (const [frame, ms] of durations.entries()) {
            unit.ensureVisual(world, gridSettings);
            expect(state.oneShotAnim?.frameIndex).toBe(frame);
            check(true);
            unit.stepOneShotAnimation(ms);
        }
        expect(done).toBe(1);
        expect(state.oneShotAnim).toBeUndefined();
        check(false);
        unit.ensureVisual(world, gridSettings);
        check(false);
    }
    unit.playOneShotAnimation("melee_attack_up", undefined, true);
    unit.stepOneShotAnimation(200);
    unit.playOneShotAnimation("melee_attack_down", undefined, true);
    check(true);
    unit.playOneShotAnimation("hit", undefined, true);
    check(false);
    unit.ensureVisual(world, gridSettings);
    check(false);
    unit.returnToIdleAnimation();
    check(false);
});

assetTest("Elf full archery keeps scale and support through every phase and releases once at frame ten", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    const base = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 768, 768) });
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) =>
        key.includes("atlas") ? Texture.WHITE : base,
    );
    const view = unit as unknown as {
        sprite: Sprite;
        oneShotAnim?: { frameIndex: number; frameDurationsMs: number[]; authoredRealTime: boolean };
    };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(false);
    const sx = view.sprite.scale.x,
        sy = view.sprite.scale.y;
    const soleY = (row: number) =>
        view.sprite.y + (row - view.sprite.anchor.y * view.sprite.texture.height) * view.sprite.scale.y;
    const soleX = (x: number) =>
        view.sprite.x + (x - view.sprite.anchor.x * view.sprite.texture.width) * view.sprite.scale.x;
    const ground = soleY(741),
        center = soleX(382.77);
    for (const action of ["attack", "attack_up", "attack_down"]) {
        const shot = unit.prepareDryadRangedShot()!;
        let releases = 0;
        expect(
            unit.playDryadRangedShot(action, shot, () => {
                expect(view.oneShotAnim?.frameIndex).toBe(10);
                expect(unit.getDryadArrowLength()).toBeCloseTo(350 * Math.abs(sx), 8);
                const origin = unit.getRangedProjectileOrigin({ x: 1000, y: 1000 }, gridSettings);
                expect(Number.isFinite(origin.x) && Number.isFinite(origin.y)).toBe(true);
                const target = unit.getElfLabFreeShotTarget(origin, 400)!;
                expect(target).toBeDefined();
                expect(Math.hypot(target.x - origin.x, target.y - origin.y)).toBeCloseTo(400, 6);
                const slope = Math.abs((target.y - origin.y) / (target.x - origin.x));
                expect(slope).toBeGreaterThan(0);
                if (action === "attack") expect(slope).toBeLessThan(0.1);
                releases++;
            }),
        ).toBe(true);
        expect(unit.getAnimationTextureKey(action)).toBe(`elf_lab_${action}_atlas`);
        expect(view.oneShotAnim?.authoredRealTime).toBe(true);
        const durations = view.oneShotAnim!.frameDurationsMs.slice();
        expect(durations).toHaveLength(14);
        expect(durations.reduce((a, b) => a + b, 0)).toBe(1323);
        expect(durations.slice(0, 10).reduce((a, b) => a + b, 0)).toBe(993);
        for (const [frame, ms] of durations.entries()) {
            unit.ensureVisual(world, gridSettings);
            expect(view.oneShotAnim?.frameIndex).toBe(frame);
            expect(releases).toBe(frame < 10 ? 0 : 1);
            expect(view.sprite.texture.width).toBe(1664);
            expect(view.sprite.texture.height).toBe(1152);
            expect(view.sprite.scale.x).toBeCloseTo(sx, 8);
            expect(view.sprite.scale.y).toBeCloseTo(sy, 8);
            expect(soleY(997)).toBeCloseTo(ground, 8);
            expect(soleX(830.77)).toBeCloseTo(center, 8);
            unit.stepOneShotAnimation(ms);
        }
        expect(releases).toBe(1);
        expect(view.oneShotAnim).toBeUndefined();
        expect(view.sprite.texture.height).toBe(768);
        expect(soleY(741)).toBeCloseTo(ground, 8);
        unit.finishDryadRangedShot(shot);
    }
    unit.setBoardFacing(-1);
    unit.ensureVisual(world, gridSettings);
    const mirroredShot = unit.prepareDryadRangedShot()!;
    let mirroredRelease = false;
    unit.playDryadRangedShot("attack", mirroredShot, () => {
        const origin = unit.getRangedProjectileOrigin({ x: -1000, y: 1000 }, gridSettings);
        expect(unit.getElfLabFreeShotTarget(origin, 400)!.x).toBeLessThan(origin.x);
        mirroredRelease = true;
    });
    unit.stepOneShotAnimation(992);
    expect(mirroredRelease).toBe(false);
    unit.stepOneShotAnimation(1);
    expect(mirroredRelease).toBe(true);
    unit.returnToIdleAnimation();
    for (const cancel of [
        () => unit.returnToIdleAnimation(),
        () => unit.startBoardWalkAnimation(1, 2),
        () => unit.playOneShotAnimation("hit", undefined, true),
    ]) {
        unit.returnToIdleAnimation();
        const shot = unit.prepareDryadRangedShot()!;
        let releases = 0;
        unit.playDryadRangedShot("attack", shot, () => releases++);
        unit.stepOneShotAnimation(500);
        cancel();
        unit.stepOneShotAnimation(5000);
        expect(shot.signal.aborted).toBe(true);
        expect(releases).toBe(0);
    }
    unit.returnToIdleAnimation();
    unit.setCreatureAnimationLabPreviewEnabled(false);
    expect(unit.prepareDryadRangedShot()).toBeDefined();
    expect(unit.getAnimationTextureKey("attack")).toBe("elf_lab_attack_atlas");
});

assetTest("Elf walk keeps the idle ground plane at every source frame and on hit interruption", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    const base = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 768, 768) });
    const unit = createRenderableUnit(TeamVals.LEFT, "Nature", "Elf", "elf_512", (key) =>
        key.includes("atlas") ? Texture.WHITE : base,
    );
    const state = unit as unknown as { sprite: Sprite };
    const world = new Container();
    unit.setPosition(0, 1024);
    unit.ensureVisual(world, gridSettings);
    unit.setCreatureAnimationLabPreviewEnabled(true);
    const soleY = (row: number) =>
        state.sprite.y + (row - state.sprite.anchor.y * state.sprite.texture.height) * state.sprite.scale.y;
    const ground = soleY(741);
    const idleScale = Math.abs(state.sprite.scale.y);
    unit.startBoardWalkAnimation(1, 3);
    for (let frame = 0; frame <= 16; frame++) {
        unit.setBoardWalkDistanceCells((frame * 1.3) / 8 + 1e-8);
        unit.ensureVisual(world, gridSettings);
        expect(soleY(988)).toBeCloseTo(ground, 8);
        expect(Math.abs(state.sprite.scale.y) * (4 / 3)).toBeCloseTo(idleScale, 8);
    }
    unit.playOneShotAnimation("hit", undefined, true);
    expect(soleY(741)).toBeCloseTo(ground, 8);
    unit.ensureVisual(world, gridSettings);
    expect(soleY(741)).toBeCloseTo(ground, 8);
    unit.returnToIdleAnimation();
    expect(soleY(741)).toBeCloseTo(ground, 8);
});

assetTest("Elf approved combat package plays every action with the lab disabled", () => {
    CREATURE_SPRITE_ANIMATION_SETTINGS.approvedBaseEnabled = true;
    CREATURE_SPRITE_ANIMATION_SETTINGS.enabled = false;
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        const unit = createRenderableUnit(team, "Nature", "Elf", "elf_512", () => Texture.WHITE);
        const view = unit as unknown as {
            sprite: Sprite;
            selectionAnimFrames: Texture[];
            walkAnim?: { frames: Texture[] };
            oneShotAnim?: { frames: Texture[]; frameDurationsMs: number[] };
        };
        unit.setPosition(0, 1024);
        unit.ensureVisual(new Container(), gridSettings);
        unit.setCreatureAnimationLabPreviewEnabled(false);
        expect(creatureIdleAnimationEnabledForUnit("Elf")).toBe(true);
        expect(view.selectionAnimFrames).toHaveLength(96);
        unit.stepSelectionAnimation();
        expect(view.sprite.filters?.some((f) => f instanceof ElfIdleCapeFilter)).toBe(true);
        expect(creatureWalkAnimationEnabledForUnit("Elf")).toBe(true);
        unit.startBoardWalkAnimation(1, 3);
        expect(view.walkAnim?.frames).toHaveLength(8);
        unit.stopBoardWalkAnimation();
        for (const action of [
            "hit",
            "attack",
            "attack_up",
            "attack_down",
            "melee_attack",
            "melee_attack_up",
            "melee_attack_down",
            "death",
        ]) {
            expect(creatureOneShotAnimationEnabledForUnit("Elf", action)).toBe(true);
            expect(unit.getAnimationTextureKey(action)).toBe(`elf_lab_${action}_atlas`);
            expect(unit.playOneShotAnimation(action)).toBe(true);
            expect(view.oneShotAnim?.frames.length).toBeGreaterThan(1);
            unit.stepOneShotAnimation(5000);
            unit.returnToIdleAnimation();
        }
    }
});
