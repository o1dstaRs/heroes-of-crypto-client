import { expect, spyOn, test } from "bun:test";
import { Container, Mesh } from "pixi.js";
import { GridConstants, GridSettings, type GameEvent, type UnitsHolder } from "@heroesofcrypto/common";
import { Sandbox } from "../Sandbox";
import { CombatVisuals } from "./CombatVisuals";
import { RESURRECTION_BURST_DURATION_MS } from "../../settings/statusEffectTiming";

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
        attachToWorldRoot: (container, zIndex) => {
            container.zIndex = zIndex ?? 0;
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

/** The pillar (over the figures) and the floor sigil, in attach order. */
function layers(root: Container) {
    const [pillar, sigil] = root.children as Container[];
    const light = pillar.children[0] as Mesh;
    return { pillar, sigil, progress: () => light.shader!.resources.resurrection.uniforms.uProgress as number };
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
        let now = 0;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const count = spyOn(f.visuals, "showResurrectedCount");
        try {
            // The engine also emits a resurrection record when only restored HP is positive.
            f.scene.applyTurnEngineEvents([cast(0, 17)], new Map());
            expect(f.sounds).toEqual(["resurrection"]);
            expect(count).not.toHaveBeenCalled();
            // A pillar of light over the figures and a sigil on the floor under them.
            expect(f.root.children).toHaveLength(2);
            const { pillar, sigil, progress } = layers(f.root);
            expect(pillar.zIndex).toBeGreaterThan(sigil.zIndex);
            expect(sigil.children[0]).toBeInstanceOf(Mesh);
            now = RESURRECTION_BURST_DURATION_MS / 4;
            f.visuals.update(0.1);
            expect(progress()).toBeCloseTo(0.25);
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(pillar.destroyed).toBe(false);
            now = RESURRECTION_BURST_DURATION_MS - 1;
            f.visuals.update(1.39);
            expect(pillar.destroyed).toBe(false);
            now = RESURRECTION_BURST_DURATION_MS;
            f.visuals.update(0);
            expect(pillar.destroyed).toBe(true);
            expect(sigil.destroyed).toBe(true);
            expect(f.root.children).toHaveLength(0);
        } finally {
            count.mockRestore();
            f.visuals.clear();
            clock.mockRestore();
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
        expect(f.root.children).toHaveLength(3);
        expect(layers(f.root).pillar.label).toBe("resurrection");
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
        const { pillar, sigil } = layers(f.root);
        f.visuals.update(0.1);
        f.visuals.clear();
        f.visuals.update(2);
        expect(pillar.destroyed).toBe(true);
        expect(sigil.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.visuals.clear();
    }
});
