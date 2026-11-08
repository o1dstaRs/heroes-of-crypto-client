import { expect, spyOn, test } from "bun:test";
import { FightProperties, GridConstants, GridMath, GridSettings, TeamVals } from "@heroesofcrypto/common";
import { Graphics } from "pixi.js";
import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const drawer = SandboxDrawer as unknown as { drawAuraAndAttackRanges: (...args: unknown[]) => void };

test("a landing ghost does not move the active aura away from its real source", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const [width, height] of [
            [1, 1],
            [2, 1],
            [1, 2],
        ]) {
            const fight = new FightProperties();
            fight.startFight();
            const origin = GridMath.getPositionForFootprintAnchor(gs, { x: 4, y: 4 }, width, height);
            const unit = {
                getId: () => "active",
                getName: () => "Valkyrie",
                getPosition: () => origin,
                getFootprintWidth: () => width,
                getFootprintHeight: () => height,
                getAuraRanges: () => [0, 2],
                getAuraIsBuff: () => [false, false],
                getTeam: () => TeamVals.LEFT,
            };
            const ctx = {
                fightProps: fight,
                gridSettings: gs,
                hoverGlowPhase: 0,
                sc_isAnimating: false,
                isActiveUnitMoving: false,
                currentActiveUnit: unit,
                hoverManager: {
                    hoverBattlefieldFootprintCells: GridMath.getFootprintCellsForAnchor({ x: 10, y: 9 }, width, height),
                    getHoverSilhouette: () => ({ visible: true }),
                    drawHoverBattlefieldFootprint: () => {},
                },
            } as unknown as IGameplayDrawContext;
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, ctx);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][1]).toEqual(origin);
            expect(spy.mock.calls[0][4]).toEqual({ width, height });
            expect(spy.mock.calls[0][7]).toBe(0.5);
            ctx.isActiveUnitMoving = true;
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, ctx);
            expect(spy).not.toHaveBeenCalled();
        }
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});
