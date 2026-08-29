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

import { describe, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

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

import { RenderableUnit } from "./RenderableUnit";

/**
 * The death VFX must spawn ON the body the player is looking at.
 *
 * CombatVisuals.spawnShatter/spawnCleaveDeath tile the dying unit's texture across a
 * `|scaleX| * frameW` by `|scaleY| * frameH` rectangle CENTRED on the info x/y they are handed
 * ("outward burst from the unit centre"), and they attach that container to the world root — the same
 * untransformed coordinate space the units container draws sprites in. So the contract for
 * getShatterInfo() is exactly: the sprite's rendered CENTRE, in parent-space.
 *
 * That is not the unit's logical position. A drawn unit sits at its projected battlefield ground
 * reference plus authored/editor offsets, and its sprite's position is its ANCHOR — which for a
 * full-body model is the foot line, not the middle of the art. Handing the logical position over
 * therefore drops the trapezoid projection AND the foot-anchor offset, which is how the shatter ends
 * up rendering away from the unit that just died.
 */

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const renderableUnit = (factionName: string, creatureName: string): RenderableUnit => {
    const effectFactory = new EffectFactory();
    const base = Unit.createUnit(
        HoCConfig.getCreatureConfig(
            TeamVals.LOWER,
            factionName,
            creatureName,
            `${creatureName.toLowerCase().replace(/ /g, "_")}_512`,
            1,
        ),
        gridSettings,
        TeamVals.LOWER,
        UnitVals.CREATURE,
        new AbilityFactory(effectFactory),
        effectFactory,
        false,
    );
    return RenderableUnit.fromBase(base, () => Texture.WHITE);
};

/** The sprite's rendered centre in PARENT space — the frame of reference the VFX containers use. */
const renderedSpriteCentre = (unit: RenderableUnit): { x: number; y: number } => {
    const sprite = (
        unit as unknown as {
            sprite?: {
                x: number;
                y: number;
                rotation: number;
                anchor: { x: number; y: number };
                scale: { x: number; y: number };
                texture: Texture;
            };
        }
    ).sprite!;
    const frame = sprite.texture.frame;
    const offsetX = (0.5 - sprite.anchor.x) * frame.width * sprite.scale.x;
    const offsetY = (0.5 - sprite.anchor.y) * frame.height * sprite.scale.y;
    const cos = Math.cos(sprite.rotation);
    const sin = Math.sin(sprite.rotation);
    return { x: sprite.x + offsetX * cos - offsetY * sin, y: sprite.y + offsetX * sin + offsetY * cos };
};

describe("death VFX placement", () => {
    // Wolf is a full-body model AND ships 2x1, so it exercises both displacement sources at once.
    for (const [factionName, creatureName] of [
        ["Nature", "Wolf"],
        ["Life", "Peasant"],
    ] as const) {
        test(`${creatureName}'s shatter spawns on the drawn body, not the logical cell`, () => {
            const unit = renderableUnit(factionName, creatureName);
            unit.setBattlefieldVisualProjection(true);
            // Deliberately off the projection's neutral row: the trapezoid displaces this point.
            unit.setPosition(-512, 768);
            unit.ensureVisual(new Container(), gridSettings);

            const info = unit.getShatterInfo();
            expect(info).not.toBeNull();

            const centre = renderedSpriteCentre(unit);
            expect(info!.x).toBeCloseTo(centre.x, 3);
            expect(info!.y).toBeCloseTo(centre.y, 3);

            // Guard that this fixture actually exercises the bug: the logical position the old code
            // handed over is meaningfully far from the drawn body (a third of a cell or more).
            const logical = unit.getPosition();
            const drift = Math.hypot(centre.x - logical.x, centre.y - logical.y);
            expect(drift).toBeGreaterThan(gridSettings.getCellSize() / 3);

            // And the effect is still SIZED from the live sprite, which it already was.
            expect(info!.scaleX).toBeCloseTo(
                (unit as unknown as { sprite: { scale: { x: number } } }).sprite.scale.x,
                6,
            );
        });
    }

    test("a unit drawn without the battlefield projection still reports its own sprite centre", () => {
        const unit = renderableUnit("Life", "Peasant");
        unit.setBattlefieldVisualProjection(false);
        unit.setPosition(0, 0);
        unit.ensureVisual(new Container(), gridSettings);

        const info = unit.getShatterInfo();
        const centre = renderedSpriteCentre(unit);
        expect(info!.x).toBeCloseTo(centre.x, 3);
        expect(info!.y).toBeCloseTo(centre.y, 3);
    });

    test("no sprite yet means no shatter — the null contract callers rely on is unchanged", () => {
        const unit = renderableUnit("Life", "Peasant");
        expect(unit.getShatterInfo()).toBeNull();
    });
});
