import { expect, mock, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import type { GameEvent } from "@heroesofcrypto/common";

function fixture() {
    const render = mock<(events: readonly GameEvent[]) => void>(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabEnabled: true,
        combatVisuals: { setFireSpellRenderMode: mock(() => undefined) },
        sc_sceneSettings: {
            getGridSettings: () => ({
                getGridSize: () => 16,
                getCellSize: () => 64,
                getStep: () => 64,
                getHalfStep: () => 32,
                getMinX: () => -512,
                getMaxX: () => 512,
            }),
        },
        grid: {
            getOccupantUnitId: (cell: { x: number; y: number }) =>
                cell.x === 2 && cell.y === 3 ? "target" : undefined,
        },
        renderSpellDamageVfx: render,
        sc_sceneLog: { updateLog: mock(() => undefined) },
        placeCreatureAnimationLabUnit: mock(() => undefined),
        selectionFromOverlay: true,
    });
    return { scene, render };
}

test("magic lab previews without a creature, through the shared renderer and with zero damage", () => {
    const { scene, render } = fixture();
    for (const spell of ["Lightning Strike", "Whirlpool", "Ring of Fire", "Meteor Shower"] as const) {
        scene.setCreatureAnimationLabSpell(spell);
        expect(scene.castCreatureAnimationLabSpell().ok).toBe(true);
        const event = render.mock.calls.at(-1)![0][0] as Extract<GameEvent, { type: "spell_cast" }>;
        expect(event.spellName).toBe(spell);
        expect(event.targetCell).toEqual({ x: 8, y: 8 });
        expect(event.damaged?.length ?? 0).toBe(spell === "Meteor Shower" ? 9 : spell === "Lightning Strike" ? 1 : 0);
        expect(event.damaged?.every((hit) => hit.amount === 0 && hit.unitsDied === 0) ?? true).toBe(true);
    }
});

test("magic clicks take priority over placement; repeat casts remember the clicked cell and target", () => {
    const { scene, render } = fixture();
    scene.setCreatureAnimationLabSpell("Lightning Strike");
    expect(scene.handleCreatureAnimationLabBoardClick({ x: -352, y: 224 })).toBe(true);
    expect(scene.placeCreatureAnimationLabUnit).not.toHaveBeenCalled();
    scene.castCreatureAnimationLabSpell();
    const event = render.mock.calls.at(-1)![0][0] as Extract<GameEvent, { type: "spell_cast" }>;
    expect(event.targetCell).toEqual({ x: 2, y: 3 });
    expect(event.damaged?.[0].unitId).toBe("target");
    expect(event.targetId).toBe("target");
    scene.setCreatureAnimationLabSpell(undefined);
    scene.handleCreatureAnimationLabBoardClick({ x: -352, y: 224 });
    expect(scene.placeCreatureAnimationLabUnit).toHaveBeenCalledTimes(1);
    expect(scene.castCreatureAnimationLabSpell().ok).toBe(false);
});

test("meteor clips to board edges and magic remains unavailable outside the lab", () => {
    const { scene, render } = fixture();
    scene.setCreatureAnimationLabSpell("Meteor Shower");
    scene.handleCreatureAnimationLabBoardClick({ x: -480, y: 32 });
    const event = render.mock.calls[0][0][0] as Extract<GameEvent, { type: "spell_cast" }>;
    expect(event.damaged).toHaveLength(4);
    expect(scene.handleCreatureAnimationLabBoardClick({ x: -600, y: -40 })).toBe(false);
    expect(render).toHaveBeenCalledTimes(1);
    scene.creatureAnimationLabEnabled = false;
    expect(scene.castCreatureAnimationLabSpell().ok).toBe(false);
    scene.setCreatureAnimationLabSpell("Whirlpool");
    expect(scene.creatureAnimationLabSpell).toBeUndefined();
});

test("render mode reaches combat visuals only inside the animation lab", () => {
    const { scene } = fixture();
    scene.setCreatureAnimationLabFireMode("particles");
    expect(scene.combatVisuals.setFireSpellRenderMode).toHaveBeenLastCalledWith("particles");
    scene.setCreatureAnimationLabFireMode("sprites");
    expect(scene.combatVisuals.setFireSpellRenderMode).toHaveBeenLastCalledWith("sprites");
    scene.creatureAnimationLabEnabled = false;
    scene.setCreatureAnimationLabFireMode("particles");
    expect(scene.combatVisuals.setFireSpellRenderMode).toHaveBeenLastCalledWith("sprites");
});

test("fire wall lab previews three cells, rotates with Shift and clears on leaving magic", () => {
    const { scene, render } = fixture();
    scene.setCreatureAnimationLabSpell("Fire Wall");
    const before = performance.now();
    expect(scene.castCreatureAnimationLabSpell().ok).toBe(true);
    expect(scene.creatureAnimationLabFireCells).toEqual([
        { x: 7, y: 8, l: 3 },
        { x: 8, y: 8, l: 3 },
        { x: 9, y: 8, l: 3 },
    ]);
    expect(scene.creatureAnimationLabFireUntil).toBeGreaterThanOrEqual(before + 6000);
    expect(render).not.toHaveBeenCalled();
    scene.shiftHeld = false;
    scene.getLogicalBattlefieldPoint = (point: { x: number; y: number }) => point;
    scene.ShiftMouseDown({ x: 32, y: 544 });
    expect(scene.creatureAnimationLabFireCells).toEqual([
        { x: 8, y: 7, l: 3 },
        { x: 8, y: 8, l: 3 },
        { x: 8, y: 9, l: 3 },
    ]);
    scene.creatureAnimationLabSpellCell = { x: 0, y: 0 };
    expect(scene.castCreatureAnimationLabSpell().ok).toBe(false);
    scene.setCreatureAnimationLabSpell(undefined);
    expect(scene.creatureAnimationLabFireCells).toEqual([]);
});
