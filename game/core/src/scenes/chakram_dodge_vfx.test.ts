/*
 * What the disc must LOOK like when somebody steps out of its way.
 *
 * The engine ends a chakram's flight at the first dodge (chakram_ability.resolveChakramFlightMisses), so
 * the arcs it hands the client already stop there. What the arcs cannot say on their own is that the last
 * unit the disc reached was never actually cut: the hop is present either way. Blood and a shove on a unit
 * that dodged read as exactly the hit that did not happen — and, worse, as a reason the flight should have
 * carried on. These tests pin that the last hop pops MISS and draws no wound.
 */
import { describe, expect, test } from "bun:test";

import { GridConstants, GridSettings } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

const gridSettings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const unitStub = (id: string) => ({
    getId: () => id,
    getName: () => id,
    getVisualCenter: () => ({ x: 0, y: 0 }),
    getPosition: () => ({ x: 0, y: 0 }),
    getBaseCell: () => ({ x: 5, y: 5 }),
    isDead: () => false,
    isSmallSize: () => true,
    hasAbilityActive: () => true,
    applyRecoil: () => undefined,
});

/**
 * The method only reads from `this`, so a stand-in is a faithful harness — and far cheaper than booting a
 * Pixi scene to watch which visuals get asked for.
 */
const makeScene = () => {
    const calls: { visual: string; unitId: string }[] = [];
    const units = new Map<string, ReturnType<typeof unitStub>>();
    for (const id of ["Zena", "Primary", "Bounce"]) {
        units.set(id, unitStub(id));
    }
    // Every visual records WHICH unit it was aimed at; the stubs share a center, so the unit id is what
    // distinguishes "bled" from "dodged".
    let aimedAt = "";
    const record = (visual: string) => () => calls.push({ visual, unitId: aimedAt });
    const scene = {
        rangedProjectiles: { fireAlongPath: () => Promise.resolve() },
        sc_sceneSettings: { getGridSettings: () => gridSettings },
        unitsHolder: {
            getAllUnits: () => ({
                get: (id: string) => {
                    aimedAt = id;
                    return units.get(id);
                },
            }),
        },
        combatVisuals: {
            showFloatingDamage: record("damage"),
            showMissLabel: record("miss"),
            spawnBloodSpray: record("blood"),
            spawnSlash: record("slash"),
        },
        calls,
    };
    return scene;
};

const play = async (scene: object, splash: unknown[], arcs: unknown[]) => {
    const prototype = Sandbox.prototype as unknown as {
        playChakramArcs: (attacker: unknown, damage: unknown, primaryTarget: unknown) => Promise<void>;
        chakramWorldDir: (from: unknown, to: unknown) => unknown;
    };
    (scene as { chakramWorldDir?: unknown }).chakramWorldDir = prototype.chakramWorldDir;
    await prototype.playChakramArcs.call(scene, unitStub("Zena"), { splash, chakramArcs: arcs }, unitStub("Primary"));
};

const bounceArc = [
    {
        targetUnitId: "Bounce",
        hitUnitIds: ["Bounce"],
        cells: [
            { x: 5, y: 5 },
            { x: 7, y: 7 },
        ],
        mountainCells: [],
    },
];

describe("Zena's chakram, when a victim dodges", () => {
    test("cuts the bounce victim it actually struck", async () => {
        const scene = makeScene();

        await play(
            scene,
            [
                { unitId: "Primary", amount: 10, unitsDied: 0 },
                { unitId: "Bounce", amount: 10, unitsDied: 0 },
            ],
            bounceArc,
        );

        const onBounce = scene.calls.filter((call) => call.unitId === "Bounce").map((call) => call.visual);
        expect(onBounce).toContain("damage");
        expect(onBounce).toContain("blood");
        expect(onBounce).not.toContain("miss");
    });

    test("pops MISS and draws no wound on the bounce victim that dodged", async () => {
        const scene = makeScene();

        await play(
            scene,
            [
                { unitId: "Primary", amount: 10, unitsDied: 0 },
                { unitId: "Bounce", amount: 0, unitsDied: 0, missed: true },
            ],
            bounceArc,
        );

        const onBounce = scene.calls.filter((call) => call.unitId === "Bounce").map((call) => call.visual);
        expect(onBounce).toEqual(["miss"]);
    });

    test("does not open the primary's wound when the throw itself was dodged", async () => {
        const scene = makeScene();

        // A dodged primary ends the flight before the first bounce, so the engine sends no arcs at all —
        // and `missed` rides on the splash entry, never on the top-level damage, for a Chakram throw.
        await play(scene, [{ unitId: "Primary", amount: 0, unitsDied: 0, missed: true }], []);

        expect(scene.calls.filter((call) => call.visual === "blood")).toEqual([]);
        expect(scene.calls.filter((call) => call.visual === "slash")).toEqual([]);
    });
});
