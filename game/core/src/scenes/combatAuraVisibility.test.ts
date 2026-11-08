import { expect, spyOn, test } from "bun:test";
import {
    FightProperties,
    GridConstants,
    GridSettings,
    TeamVals,
    type Unit,
    type TeamType,
} from "@heroesofcrypto/common";
import { Graphics } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";

const names = ["Griffin", "Arachna Queen", "Abomination", "Wyvern", "Valkyrie", "Dryad", "White Tiger", "Champion"];
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
function creature(name: string, team: TeamType = TeamVals.LEFT): Unit {
    return {
        getId: () => name,
        getName: () => name,
        getTeam: () => team,
        getPosition: () => ({ x: 128, y: 256 }),
        getFootprintWidth: () => 2,
        getFootprintHeight: () => 1,
        getAuraRanges: () => [0, 2],
        getAuraIsBuff: () => [true, false],
    } as unknown as Unit;
}
type Context = IGameplayDrawContext & { auraUnits?: Unit[]; viewerTeam?: TeamType };
function context(): Context {
    const fightProps = new FightProperties();
    fightProps.startFight();
    return {
        fightProps,
        gridSettings: gs,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        hoverManager: { drawHoverBattlefieldFootprint: () => {} },
        // Even legacy roster context must not enable permanent overlays again.
        auraUnits: names.map((name) => creature(name)),
    } as unknown as Context;
}
const drawer = SandboxDrawer as unknown as { drawAuraAndAttackRanges: (...args: unknown[]) => void };

test("unselected sources cannot keep the drawer or scene's gameplay overlays alive", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).not.toHaveBeenCalled();
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => new Map(ctx.auraUnits!.map((unit) => [unit.getId(), unit])) },
            hoverManager: {},
            isActiveUnitMoving: false,
        });
        expect(scene.hasGameplayVisuals()).toBe(false);
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test.each(names)("%s follows main's selection, hover and active-turn rules", (name) => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        const unit = creature(name);
        const inspection = {
            xy: unit.getPosition(),
            footprint: { width: 2, height: 1 },
            auraOwner: { name, id: name },
            auraRanges: [{ range: 2, isBuff: false }],
        };
        ctx.sidebarUnitRanges = { ...inspection, attackRange: 7 };
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][2]).toBe(7);
        expect(spy.mock.calls[0][3]).toEqual(inspection.auraRanges);
        ctx.sidebarUnitRanges = undefined;
        ctx.hoveredAuraRanges = inspection;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).toHaveBeenCalledTimes(1);
        ctx.hoveredAuraRanges = undefined;
        ctx.currentActiveUnit = unit as IGameplayDrawContext["currentActiveUnit"];
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][1]).toEqual(unit.getPosition());
        expect(spy.mock.calls[0][7]).toBe(0.5);
        ctx.isActiveUnitMoving = true;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy.mock.calls).toHaveLength(name === "Abomination" ? 1 : 0);
        ctx.currentActiveUnit = undefined;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).not.toHaveBeenCalled();
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("Wyvern is not automatically drawn during another allied creature's turn", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const viewerTeam of [undefined, TeamVals.LEFT, TeamVals.RIGHT]) {
            const ctx = context();
            ctx.viewerTeam = viewerTeam;
            ctx.auraUnits = [creature("Wyvern")];
            ctx.currentActiveUnit = creature("Peasant") as IGameplayDrawContext["currentActiveUnit"];
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, ctx);
            expect(spy.mock.calls.some((call) => (call[8] as { name?: string })?.name === "Wyvern")).toBe(false);
        }
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});
