import { describe, expect, test } from "bun:test";
import { Augment, FightStateManager, GridConstants, GridSettings, TeamVals } from "@heroesofcrypto/common";

import type { IDrawablePlacement } from "../pixi/PixiDrawablePlacement";
import { PlacementManager } from "./PlacementManager";

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
});
