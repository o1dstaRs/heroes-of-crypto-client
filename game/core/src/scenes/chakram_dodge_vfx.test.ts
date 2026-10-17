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
    getDamagePredictionAnchor: () => ({ x: 0, y: 0 }),
    getRangedProjectileOrigin: () => ({ x: 0, y: 0 }),
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
    const flightEvents: string[] = [];
    const scene = {
        flightEvents,
        isSceneDestroyed: () => false,
        rangedProjectiles: {
            prepare: async () => undefined,
            fireAlongPath: async (points: unknown[], opts: { onWaypoint?: (index: number) => void }) => {
                flightEvents.push("flight");
                for (let index = 0; index < points.length - 1; index++) opts.onWaypoint?.(index);
            },
            showChakramBounce: async () => {
                flightEvents.push("burst");
            },
        },
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

test("contact flashes only before connecting ricochets, never on the final return", async () => {
    const scene = makeScene();
    await play(
        scene,
        [
            { unitId: "Primary", amount: 10 },
            { unitId: "Bounce", amount: 10 },
        ],
        [...bounceArc, ...bounceArc],
    );
    expect(scene.flightEvents).toEqual(["burst", "flight", "burst", "flight", "flight"]);
});
test("no ricochet means no contact flare", async () => {
    const scene = makeScene();
    await play(scene, [{ unitId: "Primary", amount: 10 }], []);
    expect(scene.flightEvents).toEqual(["flight"]);
});

test("the initial shot, adjacent bounce and return share one flight with contact-time effects", async () => {
    const scene = makeScene();
    let flightPoints: unknown[] = [];
    let contact!: (index: number) => void;
    let finish!: () => void;
    scene.rangedProjectiles.fireAlongPath = (points, options) => {
        flightPoints = points;
        contact = options.onWaypoint!;
        return new Promise<void>((resolve) => {
            finish = resolve;
        });
    };
    const prototype = Sandbox.prototype as unknown as {
        playChakramArcs: (...args: unknown[]) => Promise<void>;
        chakramWorldDir: (from: unknown, to: unknown) => unknown;
    };
    Object.assign(scene, { chakramWorldDir: prototype.chakramWorldDir });
    let primaryHits = 0;
    const pending = prototype.playChakramArcs.call(
        scene,
        unitStub("Zena"),
        {
            splash: [
                { unitId: "Primary", amount: 10 },
                { unitId: "Bounce", amount: 10 },
            ],
            chakramArcs: [{ ...bounceArc[0], cells: [{ x: 6, y: 5 }] }],
        },
        unitStub("Primary"),
        undefined,
        false,
        undefined,
        {
            from: { x: 25, y: 80 },
            to: { x: 100, y: 0 },
            onImpact: () => primaryHits++,
        },
    );
    await Promise.resolve();
    expect(flightPoints).toHaveLength(4);
    expect(flightPoints.at(-1)).toEqual({ x: 25, y: 80 });
    expect(scene.calls).toEqual([]);
    expect(primaryHits).toBe(0);
    contact(0);
    expect(primaryHits).toBe(1);
    expect(scene.flightEvents).toEqual(["burst"]);
    expect(scene.calls.some((call) => call.unitId === "Bounce")).toBe(false);
    contact(1);
    expect(scene.calls.filter((call) => call.unitId === "Bounce").map((call) => call.visual)).toEqual([
        "damage",
        "blood",
        "slash",
    ]);
    contact(2);
    finish();
    await pending;
    expect(primaryHits).toBe(1);
});
