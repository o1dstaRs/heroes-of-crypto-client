import { expect, spyOn, test } from "bun:test";
import { FightProperties, GridConstants, GridMath, GridSettings, TeamVals, type HoCMath } from "@heroesofcrypto/common";
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

type AuraDraw = (
    g: Graphics,
    xy: HoCMath.XY,
    attack: number,
    ranges: { range: number; isBuff: boolean }[],
    footprint: { width: number; height: number },
    ...rest: unknown[]
) => void;
const drawer = SandboxDrawer as unknown as { drawAuraAndAttackRanges: AuraDraw };

function fixture(width = 1, height = 1, name = "Valkyrie") {
    const fight = new FightProperties();
    fight.startFight();
    const origin = { x: 4, y: 4 },
        destination = { x: 10, y: 9 };
    const position = GridMath.getPositionForFootprintAnchor(gs, origin, width, height);
    const footprint = { width, height };
    const owner = { id: "active", name };
    const ghost = { visible: true };
    const hover = {
        hoverBattlefieldFootprintCells: GridMath.getFootprintCellsForAnchor(destination, width, height) as
            HoCMath.XY[] | undefined,
        getHoverSilhouette: () => ghost,
        drawHoverBattlefieldFootprint: () => {},
    };
    const ctx = {
        fightProps: fight,
        gridSettings: gs,
        hoverGlowPhase: 0,
        sc_isAnimating: false,
        isActiveUnitMoving: false,
        currentActiveUnit: {
            getId: () => owner.id,
            getName: () => name,
            getPosition: () => position,
            getFootprintWidth: () => width,
            getFootprintHeight: () => height,
            getAuraRanges: () => [0, 2],
            getAuraIsBuff: () => [false, false],
            getTeam: () => TeamVals.LEFT,
        },
        hoverManager: hover,
        sidebarUnitRanges: {
            xy: position,
            attackRange: 7,
            auraRanges: [{ range: 2, isBuff: false }],
            footprint,
            auraOwner: owner,
        },
        hoveredAuraRanges: { xy: position, auraRanges: [{ range: 2, isBuff: false }], footprint, auraOwner: owner },
    } as unknown as IGameplayDrawContext;
    return { ctx, hover, ghost, fight, position, destination, footprint };
}

test("only the visible landing ghost receives the active owner's aura, with exact rectangular-footprint center", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const [width, height, name] of [
            [1, 1, "Valkyrie"],
            [2, 1, "White Tiger"],
            [1, 2, "Valkyrie"],
        ] as const) {
            const f = fixture(width, height, name);
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, f.ctx);
            const auraCalls = spy.mock.calls.filter((c) => c[3].length);
            expect(auraCalls).toHaveLength(1);
            expect(auraCalls[0][1]).toEqual(GridMath.getPositionForFootprintAnchor(gs, f.destination, width, height));
            expect(auraCalls[0][4]).toEqual(f.footprint);
            expect(auraCalls[0][3]).toEqual([{ range: 2, isBuff: false }]);
            expect(spy.mock.calls[0][2]).toBe(7); // Shot-range inspection is independent.
            expect(f.ctx.currentActiveUnit!.getPosition()).toEqual(f.position); // No actual move.
        }
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("hidden/invalid ghost, animation and deployment restore origin; another inspected owner's aura remains", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        for (const mode of ["hidden", "invalid", "animating", "moving", "deployment"]) {
            const f = fixture();
            if (mode === "hidden") f.ghost.visible = false;
            if (mode === "invalid") f.hover.hoverBattlefieldFootprintCells = undefined;
            if (mode === "animating") f.ctx.sc_isAnimating = true;
            if (mode === "moving") f.ctx.isActiveUnitMoving = true;
            if (mode === "deployment") f.ctx.fightProps = new FightProperties();
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, f.ctx);
            expect(spy.mock.calls.filter((c) => c[3].length).every((c) => c[1] === f.position)).toBe(true);
        }
        const f = fixture();
        f.ctx.hoveredAuraRanges!.auraOwner = { id: "other", name: "White Tiger" };
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, f.ctx);
        expect(spy.mock.calls.filter((c) => c[3].length)).toHaveLength(2);
        f.ghost.visible = false;
        spy.mockClear();
        SandboxDrawer.drawGameplayVisuals(g, f.ctx);
        expect(spy.mock.calls.filter((c) => c[3].length).every((c) => c[1] === f.position)).toBe(true);
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});

test("Valkyrie combat and landing-preview aura use the same opacity as lab selection", () => {
    const spy = spyOn(drawer, "drawAuraAndAttackRanges").mockImplementation(() => {});
    const g = new Graphics();
    try {
        const f = fixture();
        for (const visible of [false, true]) {
            f.ghost.visible = visible;
            spy.mockClear();
            SandboxDrawer.drawGameplayVisuals(g, f.ctx);
            const auraCalls = spy.mock.calls.filter((c) => c[3].length);
            expect(auraCalls.length).toBeGreaterThan(0);
            for (const call of auraCalls) expect(call[7]).toBe(0.7);
        }
    } finally {
        spy.mockRestore();
        g.destroy();
    }
});
