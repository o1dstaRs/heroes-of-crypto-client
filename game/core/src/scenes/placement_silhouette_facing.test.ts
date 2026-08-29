/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Texture } from "pixi.js";

import { FightStateManager, GridConstants, GridSettings, TeamVals } from "@heroesofcrypto/common";
import type { UnitProperties } from "@heroesofcrypto/common";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";
import { SceneSettings } from "./SceneSettings";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const props = (team: number): UnitProperties =>
    ({
        name: "White Tiger",
        size: 1,
        footprint_width: 2,
        footprint_height: 1,
        team,
    }) as unknown as UnitProperties;

/**
 * A unit whose live sprite faces SCREEN-RIGHT (positive scaleX), whatever team it belongs to. This is the
 * shape of the real bug: the live-preview branch clones the source sprite's transform, so a source that
 * happens to face right hands the silhouette a right-facing ghost for a red/RIGHT unit that will turn left
 * the instant it is dropped.
 */
const rightFacingSource = (team: number) => ({
    getUnitProperties: () => props(team),
    getBattlefieldPreviewAt: () => ({
        texture: Texture.WHITE,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 2,
        scaleY: -2,
        x: 0,
        y: 0,
        rotation: 0,
    }),
});

const makeContext = (activeUnit?: unknown): ISandboxHoverContext =>
    ({
        sceneSettings: new SceneSettings(gridSettings, true),
        texAny: () => Texture.WHITE,
        attachToWorldRoot: () => undefined,
        getCurrentActiveUnit: () => activeUnit,
        getPlacementPreviewUnit: () => undefined,
        getSelectedUnitProperties: () => undefined,
        getCurrentActivePathHashes: () => undefined,
        getCurrentActiveKnownPaths: () => undefined,
        getDraggingUnitId: () => undefined,
        getDraggingUnitTeam: () => undefined,
        getMouseWorld: () => ({ x: 0, y: 0 }),
        hasActiveSelection: () => false,
    }) as unknown as ISandboxHoverContext;

// The fight state is a process-wide SINGLETON and bun runs many test files per process, so a file that
// leaves it dirty breaks whichever file happens to follow it. Reset on the way OUT as well as in: the
// last test here starts a fight, and leaving that set made mountainHitBarLayout's collapse test fail
// whenever it was scheduled after this file — an order-dependent failure that looks exactly like CI flake.
beforeEach(() => {
    FightStateManager.getInstance().reset();
});

afterEach(() => {
    FightStateManager.getInstance().reset();
});

describe("placement silhouette facing", () => {
    /**
     * Placement is a face-off — red/RIGHT looks left toward green, green/LEFT looks right — and the board
     * re-asserts exactly that on every placed unit every frame. The preview of a placement has to obey the
     * same rule, or the ghost points one way and the unit turns the other the moment it lands (live report).
     *
     * The branch under test is the LIVE-preview one, which clones the source sprite's transform. It is the
     * branch placement actually takes, and the one that carried the bug: the texture branch had been given
     * the team facing, this one silently inherited whatever the source held.
     */
    for (const [team, label, expected] of [
        [TeamVals.RIGHT, "RIGHT deploys on the right and looks left", -1],
        [TeamVals.LEFT, "LEFT deploys on the left and looks right", 1],
    ] as const) {
        test(`${label}, even when the live source sprite faces the other way`, () => {
            const hover = new HoverManager(makeContext(rightFacingSource(team)));
            hover.hoverSelectedCells = [{ x: 5, y: 5 }];

            hover.updateHoverSilhouette({ x: 0, y: 0 });

            const sprite = hover.getHoverSilhouette();
            expect(sprite).toBeDefined();
            expect(Math.sign(sprite!.scale.x)).toBe(expected);
        });
    }

    /**
     * …and once the fight is on, facing follows movement and the strike target instead. Forcing the team
     * direction there would spin a mid-combat preview back to its deployment pose, so the source's facing
     * must survive untouched.
     */
    test("leaves a combat preview alone: the source's own facing survives once the fight has started", () => {
        FightStateManager.getInstance().getFightProperties().startFight();
        const hover = new HoverManager(makeContext(rightFacingSource(TeamVals.RIGHT)));
        hover.hoverSelectedCells = [{ x: 5, y: 5 }];

        hover.updateHoverSilhouette({ x: 0, y: 0 });

        expect(Math.sign(hover.getHoverSilhouette()!.scale.x)).toBe(1);
    });
});
