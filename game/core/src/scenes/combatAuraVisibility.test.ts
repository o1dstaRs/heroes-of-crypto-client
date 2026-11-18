import { expect, spyOn, test } from "bun:test";
import {
    FightProperties,
    GridConstants,
    GridSettings,
    TeamVals,
    type Unit,
    type TeamType,
} from "@heroesofcrypto/common";
import { Container, DOMAdapter, Graphics } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { SandboxDrawer, type IGameplayDrawContext } from "./SandboxDrawer";

const names = [
    "Griffin",
    "Arachna Queen",
    "Abomination",
    "Wyvern",
    "Valkyrie",
    "Dryad",
    "White Tiger",
    "Champion",
    "Pegasus",
    "Crusader",
    "Zena",
    "Wolf Rider",
];
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

test.each(names)("%s follows selection, hover and active-turn visibility rules", (name) => {
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
        expect(spy).not.toHaveBeenCalled();
        ctx.currentActiveUnit = undefined;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).not.toHaveBeenCalled();
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("Abomination's existing floor and foreground aura disappear during movement and return at rest", () => {
    const adapter = DOMAdapter.get();
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
    const clock = spyOn(performance, "now");
    let now = 1000;
    clock.mockImplementation(() => now);
    const floor = new Container();
    const units = new Container();
    const g = new Graphics();
    try {
        const ctx = context();
        const unit = creature("Abomination");
        let moving = false;
        ctx.currentActiveUnit = unit as IGameplayDrawContext["currentActiveUnit"];
        ctx.isAuraOwnerMoving = () => moving;
        ctx.arachnaWebAuraContainer = floor;
        ctx.getAbominationSandForeground = () => ({ container: units, depth: 4000 });
        ctx.sidebarUnitRanges = {
            xy: unit.getPosition(),
            attackRange: 0,
            footprint: { width: 2, height: 1 },
            auraOwner: { name: unit.getName(), id: unit.getId() },
            auraRanges: [{ range: 2, isBuff: false }],
        };
        ctx.hoveredAuraRanges = ctx.sidebarUnitRanges;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(floor.children.some((child) => child.visible)).toBe(true);
        expect(units.children.some((child) => child.visible)).toBe(true);
        moving = true;
        now += 16;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(floor.children.every((child) => !child.visible)).toBe(true);
        expect(units.children.every((child) => !child.visible)).toBe(true);
        moving = false;
        now += 16;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(floor.children.some((child) => child.visible)).toBe(true);
        expect(units.children.some((child) => child.visible)).toBe(true);
    } finally {
        floor.destroy({ children: true });
        units.destroy({ children: true });
        g.destroy();
        clock.mockRestore();
        DOMAdapter.set(adapter);
    }
});

test.each(names)("%s cannot regain its moving aura through sidebar selection or hover", (name) => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        const unit = creature(name);
        const inspection = {
            xy: unit.getPosition(),
            footprint: { width: 2, height: 1 },
            auraOwner: { name, id: unit.getId() },
            auraRanges: [{ range: 2, isBuff: false }],
        };
        let moving = true;
        ctx.isAuraOwnerMoving = (id) => moving && id === unit.getId();
        ctx.sidebarUnitRanges = { ...inspection, attackRange: 7 };
        ctx.hoveredAuraRanges = inspection;
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        // Sidebar attack reach is independent; neither path may re-enable the moving aura.
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][2]).toBe(7);
        expect(spy.mock.calls[0][3]).toEqual([]);

        moving = false;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy.mock.calls.every((call) => call[3] === inspection.auraRanges)).toBe(true);
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("movement suppresses only its owner, including a swapped unit outside the active turn", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const ctx = context();
        const stationary = creature("Wyvern");
        const moving = creature("Abomination");
        ctx.currentActiveUnit = stationary as IGameplayDrawContext["currentActiveUnit"];
        ctx.isActiveUnitMoving = true;
        ctx.isAuraOwnerMoving = (id) => id === moving.getId();
        ctx.hoveredAuraRanges = {
            xy: moving.getPosition(),
            footprint: { width: 2, height: 1 },
            auraOwner: { name: moving.getName(), id: moving.getId() },
            auraRanges: [{ range: 2, isBuff: false }],
        };
        SandboxDrawer.drawGameplayVisuals(g, ctx);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][8]).toMatchObject({ id: stationary.getId() });
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
