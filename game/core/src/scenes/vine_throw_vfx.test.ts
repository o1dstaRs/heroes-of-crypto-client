import { describe, expect, mock, test } from "bun:test";
import { GridConstants, GridSettings, type GameEvent } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { FIGHT_EVENT_VFX } from "./testSupport/fightVfxCatalog";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);

const vinePlaced = (snareResisted: boolean): GameEvent => ({
    type: "vine_placed",
    casterId: "trent",
    targetId: "target",
    cells: [
        { x: 2, y: 2 },
        { x: 3, y: 3 },
    ],
    lapsRemaining: 2,
    snareResisted,
});

const fixture = (replayPlaybackActive = false) => {
    const caster = {
        getId: () => "trent",
        getName: () => "Trent",
        getBaseCell: () => ({ x: 1, y: 1 }),
        getPosition: () => ({ x: 100, y: 100 }),
        getVisualCenter: () => ({ x: 110, y: 120 }),
        faceBoardTarget: () => undefined,
        hasAnimationState: () => false,
    };
    const target = { getId: () => "target", getBaseCell: () => ({ x: 3, y: 3 }), getPosition: () => ({ x: 0, y: 0 }) };
    const units = new Map<string, unknown>([
        ["trent", caster],
        ["target", target],
    ]);
    const showSnareResistedVfx = mock((_targetId: string, _from?: unknown) => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        replayPlaybackActive,
        unitsHolder: { getAllUnits: () => units },
        sc_sceneSettings: { getGridSettings: () => gs },
        sc_sceneLog: { updateLog: () => undefined },
        vineLayer: { delayGrowth: () => undefined, previewCast: () => undefined },
        showSnareResistedVfx,
    });
    return { scene, showSnareResistedVfx };
};

describe("Vine Throw snare-save VFX", () => {
    test("the catalog records how the save reaches ranked", () => {
        expect(FIGHT_EVENT_VFX.vine_placed.rendered).toBe(true);
        expect(FIGHT_EVENT_VFX.vine_placed.note).toContain("RESISTED");
    });

    test("the record renderer pops only a resisted throw, from the caster", () => {
        const { scene, showSnareResistedVfx } = fixture();
        scene.renderSnareResistVfx([
            vinePlaced(false),
            { type: "vine_expired", cells: [{ x: 0, y: 0 }] },
            vinePlaced(true),
        ]);
        expect(showSnareResistedVfx.mock.calls).toEqual([["target", { x: 110, y: 120 }]]);
    });

    // The save is an outcome-dependent roll. Ranked replays every cast (including the local player's own)
    // and re-applies it locally on a best-effort basis — that re-apply RE-ROLLS the magic-armor save, so a
    // pop driven from it would show the two players different outcomes. Live sandbox pops from its own
    // (authoritative) events; replay pops from the record.
    test.each([
        [false, 1],
        [true, 0],
    ])("live engine events pop the save unless a replay is playing (replay=%p)", (replay, pops) => {
        const { scene, showSnareResistedVfx } = fixture(replay);
        // Post-event presentation is not under test.
        Object.assign(scene, {
            refreshVisibleStateIfNeeded: () => undefined,
            updateLiveFightStats: () => undefined,
            reconcileEffectVisuals: () => undefined,
            flushPendingReplayRecords: () => undefined,
        });
        scene.applyTurnEngineEvents([vinePlaced(true)], new Map());
        expect(showSnareResistedVfx).toHaveBeenCalledTimes(pops);
    });

    test("a replayed Vine Throw renders the save from the authoritative record", async () => {
        const { scene } = fixture(true);
        const renderSnareResistVfx = mock((_events: readonly GameEvent[]) => undefined);
        const events = [vinePlaced(true)];
        Object.assign(scene, {
            renderSnareResistVfx,
            grid: { getSettings: () => gs, getOccupantUnitId: () => undefined },
            throwTransparency: () => undefined,
            snapshotRenderableUnits: () => new Map(),
            // The local re-apply re-rolls the save; it must not be what the replay shows.
            createActionEngine: () => ({ apply: () => ({ completed: true, events: [vinePlaced(false)] }) }),
            playUnitCombatSound: () => undefined,
            playSceneSpellSound: () => undefined,
            playReplayOneShot: () => Promise.resolve(),
            renderHealVfx: () => undefined,
            renderSpellDamageVfx: () => undefined,
            spawnAbilityTransferVfx: () => undefined,
            renderCastOutcomes: () => undefined,
            cleanupAfterSpell: () => undefined,
            applyReplayEvents: () => undefined,
            applyTurnEngineEvents: () => undefined,
            onReplaySpellImpact: () => undefined,
            scheduleSceneTimeout: (callback: () => void) => callback(),
            delayReplay: () => Promise.resolve(),
        });

        expect(
            await scene.playReplayCastSpellAction({
                action: { type: "cast_spell", casterId: "trent", spellName: "Vine Throw", targetId: "target" },
                events,
                stateAfter: { units: [] },
            }),
        ).toBe(true);
        expect(renderSnareResistVfx.mock.calls).toEqual([[events]]);
    });
});
