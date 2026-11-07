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
import { SandboxDrawer, hasVisiblePersistentAura, type IGameplayDrawContext } from "./SandboxDrawer";

const permanent = ["Griffin", "Arachna Queen", "Abomination"];
const interactive = ["Peasant", "Valkyrie", "Dryad", "White Tiger"];
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
function creature(name: string, dead = false, hidden = false, team: TeamType = TeamVals.LEFT): Unit {
    return {
        getId: () => name,
        getName: () => name,
        isDead: () => dead,
        hasBuffActive: () => hidden,
        getTeam: () => team,
        getPosition: () => ({ x: 128, y: 256 }),
        getFootprintWidth: () => 2,
        getFootprintHeight: () => 1,
        getAuraRanges: () => [0, 2],
        getAuraIsBuff: () => [true, false],
    } as unknown as Unit;
}
function context(): IGameplayDrawContext {
    const fightProps = new FightProperties();
    fightProps.startFight();
    return {
        fightProps,
        gridSettings: gs,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        hoverManager: { drawHoverBattlefieldFootprint: () => {} },
        auraUnits: [...permanent, ...interactive].map((name) => creature(name)),
    } as unknown as IGameplayDrawContext;
}
const drawer = SandboxDrawer as unknown as {
    drawAuraAndAttackRanges: (
        graphics: Graphics,
        position: { x: number; y: number },
        attackRange: number,
        auraRanges: { range: number; isBuff: boolean }[],
        footprint: { width: number; height: number },
        grid: GridSettings,
        phase: number,
        alpha: number,
        owner: { name: string; id: string },
    ) => void;
};

test("three persistent auras remain visible without an active or hovered creature", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy.mock.calls.map((call) => call[8].name)).toEqual(permanent);
        for (const call of spy.mock.calls) {
            expect(call[1]).toEqual({ x: 128, y: 256 });
            expect(call[3]).toEqual([{ range: 2, isBuff: false }]);
            expect(call[4]).toEqual({ width: 2, height: 1 });
        }
        spy.mockClear();
        ctx.fightProps = new FightProperties();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).not.toHaveBeenCalled();
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test.each(interactive)("%s aura appears on its turn or hover, never from sidebar selection alone", (name) => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        ctx.auraUnits = [creature(name)];
        const inspection = {
            xy: { x: 128, y: 256 },
            footprint: { width: 2, height: 1 },
            auraOwner: { name, id: name },
            auraRanges: [{ range: 2, isBuff: false }],
        };
        ctx.sidebarUnitRanges = { ...inspection, attackRange: 7 };
        const auras = () => spy.mock.calls.filter((call) => call[3].length);
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(auras()).toHaveLength(0);
        expect(spy.mock.calls[0][2]).toBe(7);
        spy.mockClear();
        ctx.hoveredAuraRanges = inspection;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(auras()).toHaveLength(1);
        spy.mockClear();
        ctx.currentActiveUnit = creature(name) as IGameplayDrawContext["currentActiveUnit"];
        ctx.isActiveUnitMoving = true;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(auras()).toHaveLength(1);
        spy.mockClear();
        ctx.currentActiveUnit = undefined;
        ctx.hoveredAuraRanges = undefined;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(auras()).toHaveLength(0);
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test.each(permanent)(
    "%s aura stays at the real position and is drawn once while active, hovered and selected",
    (name) => {
        const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
        const g = new Graphics();
        try {
            const ctx = context();
            const unit = creature(name);
            ctx.auraUnits = [unit];
            ctx.currentActiveUnit = unit as IGameplayDrawContext["currentActiveUnit"];
            ctx.hoveredAuraRanges = {
                xy: unit.getPosition(),
                footprint: { width: 2, height: 1 },
                auraOwner: { name, id: name },
                auraRanges: [{ range: 2, isBuff: false }],
            };
            ctx.sidebarUnitRanges = { ...ctx.hoveredAuraRanges, attackRange: 0 };
            ctx.hoverManager.hoverBattlefieldFootprintCells = [{ x: 10, y: 10 }];
            ctx.hoverManager.getHoverSilhouette = () => ({ visible: true }) as never;
            for (const moving of [false, true]) {
                spy.mockClear();
                ctx.isActiveUnitMoving = moving;
                SandboxDrawer.drawGameplayVisuals(g, ctx);
                const calls = spy.mock.calls.filter((call) => call[3].length);
                expect(calls).toHaveLength(1);
                expect(calls[0][1]).toEqual(unit.getPosition());
            }
        } finally {
            spy.mockRestore();
            g.destroy();
        }
    },
);

test("dead and concealed enemy sources do not reveal persistent auras", () => {
    for (const name of permanent) {
        expect(hasVisiblePersistentAura(creature(name, true))).toBe(false);
        expect(hasVisiblePersistentAura(creature(name, false, true), TeamVals.RIGHT)).toBe(false);
        expect(hasVisiblePersistentAura(creature(name, false, true), TeamVals.LEFT)).toBe(true);
    }
});

test("Wyvern automatic aura follows ownership and the active player's team, including another allied creature's turn", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const owner of [TeamVals.LEFT, TeamVals.RIGHT]) {
            for (const viewer of [undefined, TeamVals.LEFT, TeamVals.RIGHT]) {
                for (const active of [undefined, TeamVals.LEFT, TeamVals.RIGHT]) {
                    const ctx = context();
                    ctx.auraUnits = [creature("Wyvern", false, false, owner)];
                    ctx.viewerTeam = viewer;
                    ctx.currentActiveUnit =
                        active === undefined
                            ? undefined
                            : (creature("Peasant", false, false, active) as IGameplayDrawContext["currentActiveUnit"]);
                    spy.mockClear();
                    SandboxDrawer.drawGameplayVisuals(g, ctx);
                    const wyverns = spy.mock.calls.filter((call) => call[8]?.name === "Wyvern" && call[3].length);
                    expect(wyverns).toHaveLength(viewer !== undefined && viewer === owner && active === owner ? 1 : 0);
                }
            }
        }
        // Its own active turn must not fall through to the generic active-unit aura path for an enemy viewer.
        const ctx = context();
        const wyvern = creature("Wyvern", false, false, TeamVals.RIGHT);
        ctx.auraUnits = [wyvern];
        ctx.viewerTeam = TeamVals.LEFT;
        ctx.currentActiveUnit = wyvern as IGameplayDrawContext["currentActiveUnit"];
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).not.toHaveBeenCalled();
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("explicit Wyvern selection and hover work for either side and disappear when inspection ends", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const owner of [TeamVals.LEFT, TeamVals.RIGHT]) {
            const ctx = context();
            const wyvern = creature("Wyvern", false, false, owner);
            ctx.auraUnits = [wyvern];
            ctx.viewerTeam = TeamVals.LEFT;
            ctx.currentActiveUnit = wyvern as IGameplayDrawContext["currentActiveUnit"];
            const inspection = {
                xy: wyvern.getPosition(),
                footprint: { width: 2, height: 1 },
                auraOwner: { name: "Wyvern", id: "Wyvern", team: owner },
                auraRanges: [{ range: 2, isBuff: false }],
            };
            for (const mode of ["selected", "hovered", "both"] as const) {
                ctx.sidebarUnitRanges = mode === "hovered" ? undefined : { ...inspection, attackRange: 0 };
                ctx.hoveredAuraRanges = mode === "selected" ? undefined : inspection;
                spy.mockClear();
                SandboxDrawer.drawGameplayVisuals(g, ctx);
                expect(spy.mock.calls.filter((call) => call[3].length)).toHaveLength(1);
            }
            ctx.sidebarUnitRanges = undefined;
            ctx.hoveredAuraRanges = undefined;
            ctx.currentActiveUnit = undefined;
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, ctx);
            expect(spy).not.toHaveBeenCalled();
        }
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});
