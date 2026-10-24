import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Container, Graphics } from "pixi.js";
import {
    Augment,
    FightStateManager,
    Grid,
    GridMath,
    GridSettings,
    GridVals,
    PathHelper,
    TeamVals,
    type TeamType,
    type UnitProperties,
} from "@heroesofcrypto/common";

import { HoverManager, type ISandboxHoverContext } from "./HoverManager";
import { PlacementManager } from "./PlacementManager";
import { SceneSettings } from "./SceneSettings";

const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
const originalFight = FightStateManager.getInstance().getFightProperties();
const roots: Container[] = [];
const resetFight = () => {
    FightStateManager.getInstance().reset();
    const fp = FightStateManager.getInstance().getFightProperties();
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        fp.setDefaultPlacementPerTeam(team, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
    }
};
beforeEach(resetFight);
afterEach(() => {
    for (const root of roots.splice(0)) root.destroy({ children: true });
    FightStateManager.getInstance().setFightProperties(originalFight);
});

describe("ranked placement geometry follows snapshot setup", () => {
    for (const team of [TeamVals.LEFT, TeamVals.RIGHT]) {
        for (const [width, height] of [
            [1, 1],
            [2, 1],
            [2, 2],
        ]) {
            test(`team ${team}, ${width}x${height}: an upgraded zone accepts repositioning at the stack cap`, () => {
                const manager = new PlacementManager(settings);
                const target = { x: team === TeamVals.LEFT ? 4 : 10, y: 7 };
                expect(manager.getAllowedPlacementCellHashesForTeam(team)?.has((target.x << 4) | target.y)).toBe(false);

                // Ranked receives setup separately from its board; no local augment picker runs on reconnect.
                const fp = FightStateManager.getInstance().getFightProperties();
                expect(fp.setAugmentPerTeam(team, { type: "Placement", value: Augment.PlacementAugment.LEVEL_3 })).toBe(
                    true,
                );
                expect(fp.getNumberOfUnitsAvailableForPlacement(team)).toBe(8);
                const root = new Container();
                roots.push(root);
                const selected = {
                    name: "Fairy",
                    size: 1,
                    team,
                    footprint_width: width,
                    footprint_height: height,
                } as UnitProperties;
                const hover = new HoverManager({
                    sceneSettings: new SceneSettings(settings, true),
                    placementManager: manager,
                    grid: new Grid(settings, GridVals.NORMAL),
                    pathHelper: new PathHelper(settings),
                    unitsHolder: {
                        getAllUnits: () => new Map(),
                        getAllAlliesPlaced: () => Array(8).fill({}),
                    },
                    getPlacement: (side: TeamType, index: number) => manager.getPlacement(side, index),
                    getSelectedUnitProperties: () => selected,
                    getDraggingUnitId: () => "existing-stack",
                    getDraggingUnitTeam: () => team,
                    getCurrentActiveUnit: () => undefined,
                    getPlacementPreviewUnit: () => undefined,
                    attachToWorldRoot: (child: Container) => root.addChild(child),
                    attachToCursorOverlay: (child: Container) => root.addChild(child),
                    texAny: () => undefined,
                } as unknown as ISandboxHoverContext);

                hover.updateHoverPlacementCell(
                    GridMath.getPositionForCell(target, settings.getMinX(), settings.getStep(), settings.getHalfStep()),
                );

                expect(hover.hoverPlacementCellTeam).toBe(team);
                expect(hover.hoverSelectedCellsSwitchToRed).toBe(false);
                expect(hover.hoverSelectedCells).toHaveLength(width * height);
                expect(hover.hoverSelectedCells).toContainEqual(target);
                expect(
                    hover.hoverSelectedCells?.every((cell) =>
                        manager
                            .getPlacement(team, 0)
                            ?.possibleCellHashes()
                            .has((cell.x << 4) | cell.y),
                    ),
                ).toBe(true);
                manager.releaseVisuals();
            });
        }
    }

    test("an idle redraw updates the visible zone and keeps its resources on repeated reads", () => {
        const manager = new PlacementManager(settings);
        const before = manager.getPlacement(TeamVals.LEFT, 0);
        const fp = FightStateManager.getInstance().getFightProperties();
        fp.setAugmentPerTeam(TeamVals.LEFT, { type: "Placement", value: Augment.PlacementAugment.LEVEL_3 });
        const graphics = new Graphics();
        const frames = new Container();
        roots.push(graphics, frames);

        manager.draw(graphics, frames, TeamVals.LEFT);

        const upgraded = manager.getPlacement(TeamVals.LEFT, 0);
        expect(upgraded).not.toBe(before);
        expect(upgraded?.possibleCellHashes().has((5 << 4) | 8)).toBe(true);
        expect(manager.getAllowedPlacementCellHashes().has((5 << 4) | 8)).toBe(true);
        expect(manager.getPlacement(TeamVals.LEFT, 0)).toBe(upgraded);
        expect(manager.getAllowedPlacementCellHashesForTeam(TeamVals.LEFT)?.has((5 << 4) | 8)).toBe(true);
        expect(manager.getPlacement(TeamVals.LEFT, 0)).toBe(upgraded);

        resetFight();
        expect(
            manager
                .getPlacement(TeamVals.LEFT, 0)
                ?.possibleCellHashes()
                .has((5 << 4) | 8),
        ).toBe(false);
        expect(manager.getAllowedPlacementCellHashesForTeam(TeamVals.LEFT)?.has((5 << 4) | 8)).toBe(false);
        manager.releaseVisuals();
    });
});
