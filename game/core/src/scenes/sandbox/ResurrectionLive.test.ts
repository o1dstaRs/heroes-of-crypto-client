import { expect, spyOn, test } from "bun:test";
import { Container, Graphics } from "pixi.js";
import { GridConstants, GridSettings, type GameEvent, type UnitsHolder } from "@heroesofcrypto/common";
import { Sandbox } from "../Sandbox";
import { CombatVisuals } from "./CombatVisuals";

function fixture(ranked = false) {
    const root = new Container();
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const unitsHolder = { getAllUnits: () => new Map() } as unknown as UnitsHolder;
    const visuals = new CombatVisuals({
        getGridSettings: () => gs,
        attachToWorldRoot: (container) => {
            root.addChild(container);
        },
        getUnitsHolder: () => unitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    const sounds: string[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        sc_gameActionTransport: ranked ? {} : undefined,
        unitsHolder,
        combatVisuals: visuals,
        sandboxPremiumRevision: 0,
        clearSandboxPremiumGuidance: () => {},
        refreshVisibleStateIfNeeded: () => {},
        updateLiveFightStats: () => {},
        reconcileEffectVisuals: () => {},
        flushPendingReplayRecords: () => {},
        playSceneGameSound: (name: string) => sounds.push(name),
    });
    return { root, visuals, scene, sounds };
}

function cast(amount: number, hp: number): GameEvent {
    return {
        type: "spell_cast",
        casterId: "caster",
        targetId: "recipient",
        spellName: "Resurrection",
        unitIdsDied: [],
        animations: [],
        resurrected: [{ unitId: "recipient", amount, hp, position: { x: 200, y: 300 } }],
    };
}

for (const ranked of [false, true]) {
    test(`${ranked ? "ranked" : "local"} HP-only resurrection draws recipient feedback without claiming raised creatures`, () => {
        const f = fixture(ranked);
        const count = spyOn(f.visuals, "showResurrectedCount");
        try {
            // The engine also emits a resurrection record when only restored HP is positive.
            f.scene.applyTurnEngineEvents([cast(0, 17)], new Map());
            expect(f.sounds).toEqual(["resurrection"]);
            expect(count).not.toHaveBeenCalled();
            expect(f.root.children).toHaveLength(1);
            const burst = f.root.children[0] as Graphics;
            f.visuals.update(0.1);
            expect(burst.context.instructions.length).toBeGreaterThan(0);
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(burst.destroyed).toBe(false);
            f.visuals.update(1.39);
            expect(burst.destroyed).toBe(false);
            f.visuals.update(0.02);
            expect(burst.destroyed).toBe(true);
            expect(f.root.children).toHaveLength(0);
        } finally {
            count.mockRestore();
            f.visuals.clear();
        }
    });
}

test("a successful resurrection with raised creatures keeps the recipient burst and positive head-count label", () => {
    const f = fixture(true);
    const count = spyOn(f.visuals, "showResurrectedCount");
    try {
        f.scene.applyTurnEngineEvents([cast(3, 25)], new Map());
        expect(count).toHaveBeenCalledTimes(1);
        expect(count.mock.calls[0][1]).toBe(3);
        expect(f.root.children).toHaveLength(2);
        expect(f.root.children[0]).toBeInstanceOf(Graphics);
        expect(f.sounds).toEqual(["resurrection"]);
    } finally {
        count.mockRestore();
        f.visuals.clear();
    }
});

test("a cast with no successful resurrection record does not fabricate recipient feedback", () => {
    const f = fixture();
    try {
        const event = cast(0, 0);
        if (event.type === "spell_cast") event.resurrected = [];
        f.scene.applyTurnEngineEvents([event], new Map());
        expect(f.root.children).toHaveLength(0);
        expect(f.sounds).toHaveLength(0);
    } finally {
        f.visuals.clear();
    }
});

test("clearing a scene removes an unfinished recipient resurrection burst", () => {
    const f = fixture();
    try {
        f.scene.applyTurnEngineEvents([cast(0, 17)], new Map());
        const burst = f.root.children[0];
        f.visuals.update(0.1);
        f.visuals.clear();
        f.visuals.update(2);
        expect(burst.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.visuals.clear();
    }
});
