import { describe, expect, test } from "bun:test";
import { Container, Graphics } from "pixi.js";
import { Augment, FightStateManager, GridConstants, GridSettings, TeamVals } from "@heroesofcrypto/common";

import type { IDrawablePlacement } from "../pixi/PixiDrawablePlacement";
import { PlacementManager } from "./PlacementManager";
import { SandboxDrawer } from "./SandboxDrawer";
import type { HoverManager } from "./HoverManager";

const settings = () =>
    new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );

describe("PlacementManager visual lifecycle", () => {
    test("releases old placement visuals before rebuilding their geometry", () => {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.RIGHT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        const manager = new PlacementManager(settings());
        let releases = 0;
        const placement = { releaseVisuals: () => releases++ } as unknown as IDrawablePlacement;
        const internals = manager as unknown as {
            leftPlacements: [IDrawablePlacement?, IDrawablePlacement?];
            rightPlacements: [IDrawablePlacement?, IDrawablePlacement?];
        };
        internals.leftPlacements = [placement];
        internals.rightPlacements = [placement];

        manager.rebuildFromFightProps();

        expect(releases).toBe(2);
    });

    test("a redraw keeps the zone wash, and an undrawn team does not", () => {
        const fightProps = FightStateManager.getInstance().getFightProperties();
        fightProps.setDefaultPlacementPerTeam(TeamVals.LEFT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        fightProps.setDefaultPlacementPerTeam(TeamVals.RIGHT, Augment.DefaultPlacementLevel1.THREE_BY_THREE);
        const sideOriented = fightProps.isSideOrientedPlacement();
        fightProps.setSideOrientedPlacement(true);
        const manager = new PlacementManager(settings());
        const graphics = new Graphics();
        const frames = new Container();
        const wash = new Container();

        manager.draw(graphics, frames, undefined, wash);
        const children = [...wash.children];
        expect(children.length).toBeGreaterThan(0);
        expect(children.every((child) => child.visible)).toBe(true);

        manager.draw(graphics, frames, undefined, wash);
        expect(wash.children).toEqual(children);

        manager.draw(graphics, frames, TeamVals.LEFT, wash);
        const visible = wash.children.filter((child) => child.visible);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThan(wash.children.length);

        const started = fightProps.hasFightStarted();
        if (!started) fightProps.startFight();
        try {
            SandboxDrawer.drawPlacements({
                fightProps,
                placementManager: manager,
                hoverManager: { drawHoverPlacementCell() {} } as unknown as HoverManager,
                placementGraphics: graphics,
                placementFrameContainer: frames,
                placementWashContainer: wash,
            });
            expect(wash.visible).toBe(false);
            expect(wash.children.every((child) => !child.visible)).toBe(true);
        } finally {
            (fightProps as unknown as { fightStarted: boolean }).fightStarted = started;
            fightProps.setSideOrientedPlacement(sideOriented);
        }

        graphics.destroy();
        frames.destroy({ children: true });
        wash.destroy({ children: true });
    });
});
