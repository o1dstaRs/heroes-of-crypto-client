import { GridConstants, GridSettings, SpellPowerType } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";

import { Sandbox } from "./Sandbox";

const fixture = (spellName: string, completed = true, authoritative = false) => {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const caster = {
        getId: () => "smith",
        getName: () => "Blacksmith",
        getBaseCell: () => ({ x: 1, y: 1 }),
        getPosition: () => ({ x: 100, y: 100 }),
        getVisualCenter: () => ({ x: 100, y: 100 }),
        faceBoardTarget: mock(() => undefined),
        hasAnimationState: () => false,
        playOneShotAnimation: mock(() => undefined),
    };
    const target = {
        getId: () => "target",
        getBaseCell: () => ({ x: 2, y: 2 }),
        getPosition: () => ({ x: 200, y: 200 }),
    };
    const units = new Map<string, unknown>([
        ["smith", caster],
        ["target", target],
    ]);
    const authoritativeEvents = [
        {
            type: "spell_cast",
            casterId: "smith",
            spellName,
            unitIdsDied: [],
            animations: [],
            outcomes: [{ unitId: "target", outcome: "nothing" }],
        },
    ];
    // A replay must never display this deliberately conflicting local roll.
    const localEvents = [
        {
            ...authoritativeEvents[0],
            outcomes: [{ unitId: "target", outcome: "double", grantedAbility: "Crafted Double Punch" }],
        },
    ];
    const apply = mock(() => ({ completed, events: localEvents }));
    const pending: { callback: () => void; ms: number }[] = [];
    const pops = mock(() => undefined);
    const outcomes = mock(() => undefined);
    const delay = mock(() => Promise.resolve());
    const submit = mock(() => true);
    const sound = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: caster,
        currentActiveSpell: { getName: () => spellName, getPowerType: () => SpellPowerType.MIND },
        unitsHolder: { getAllUnits: () => units },
        grid: { getSettings: () => gs, getOccupantUnitId: () => undefined },
        sc_sceneSettings: { getGridSettings: () => gs },
        throwTransparency: () => undefined,
        snapshotRenderableUnits: () => units,
        shouldDeferActionToAuthoritativeReplay: () => authoritative,
        canArmedSpellTarget: () => true,
        submitActionForAuthoritativeReplay: submit,
        createActionEngine: () => ({ apply }),
        playUnitCombatSound: sound,
        playReplayOneShot: () => Promise.resolve(),
        renderHealVfx: () => undefined,
        renderSpellDamageVfx: () => undefined,
        spawnAbilityTransferVfx: () => undefined,
        sc_sceneLog: { updateLog: () => undefined },
        scheduleSceneTimeout: (callback: () => void, ms: number) => pending.push({ callback, ms }),
        combatVisuals: { prepareCommonFlagPop: () => undefined, spawnCommonFlagPop: pops },
        renderCastOutcomes: outcomes,
        renderSnareResistVfx: () => undefined,
        cleanupAfterSpell: () => undefined,
        applyReplayEvents: () => undefined,
        delayReplay: delay,
    });
    const record = {
        action: { type: "cast_spell", casterId: "smith", spellName, targetId: "target" },
        events: authoritativeEvents,
        stateAfter: { units: [] },
    };
    return { scene, caster, target, apply, submit, sound, record, pending, pops, outcomes, delay, localEvents };
};

test.each(["Craft", "Armor Rune", "Weapon Rune"])("local %s forges before showing its outcomes", (spellName) => {
    const f = fixture(spellName);
    const run = () =>
        spellName === "Craft" ? f.scene.castAreaSpellAtCell({ x: 2, y: 2 }) : f.scene.castSpellOnTarget(f.target);
    expect(run()).toBe(true);
    expect(f.pops).toHaveBeenCalledWith(f.caster, "blacksmith_craft");
    expect(f.outcomes).not.toHaveBeenCalled();
    expect(f.pending[0].ms).toBe(730);
    f.pending[0].callback();
    expect(f.outcomes).toHaveBeenCalledWith(f.localEvents);
});

test.each(["Craft", "Armor Rune", "Weapon Rune"])("rejected local %s does not forge", (spellName) => {
    const f = fixture(spellName, false);
    const accepted =
        spellName === "Craft" ? f.scene.castAreaSpellAtCell({ x: 2, y: 2 }) : f.scene.castSpellOnTarget(f.target);
    expect(accepted).toBe(false);
    expect(f.pops).not.toHaveBeenCalled();
    expect(f.pending).toEqual([]);
});

for (const completed of [true, false]) {
    test.each(["Craft", "Armor Rune", "Weapon Rune"])(
        `recorded %s forges and keeps authoritative outcomes with reapply=${completed}`,
        async (spellName) => {
            const f = fixture(spellName, completed);
            expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
            expect(f.pops).toHaveBeenCalledTimes(1);
            expect(f.pops).toHaveBeenCalledWith(f.caster, "blacksmith_craft");
            expect(f.outcomes).not.toHaveBeenCalled();
            expect(f.delay).toHaveBeenCalledWith(1380);
            f.pending[0].callback();
            expect(f.outcomes).toHaveBeenCalledWith(f.record.events);
        },
    );
}
