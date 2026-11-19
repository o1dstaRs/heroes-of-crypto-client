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
        getFlagEffectAnchor: () => ({ x: 100, y: 350 }),
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
    const forges = mock(() => 900);
    const outcomes = mock(() => undefined);
    const delay = mock(() => Promise.resolve());
    const submit = mock(() => true);
    const sound = mock(() => undefined);
    const gameSound = mock(() => undefined);
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
        playSceneGameSound: gameSound,
        playReplayOneShot: () => Promise.resolve(),
        renderHealVfx: () => undefined,
        renderSpellDamageVfx: () => undefined,
        spawnAbilityTransferVfx: () => undefined,
        sc_sceneLog: { updateLog: () => undefined },
        scheduleSceneTimeout: (callback: () => void, ms: number) => pending.push({ callback, ms }),
        combatVisuals: { prepareCommonFlagPop: () => undefined, spawnCommonFlagPop: pops, spawnCraftForge: forges },
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
    return {
        scene,
        caster,
        target,
        apply,
        submit,
        sound,
        gameSound,
        record,
        pending,
        pops,
        forges,
        outcomes,
        delay,
        localEvents,
    };
};

test.each(["Craft", "Armor Rune", "Weapon Rune"])(
    "local %s presents its recorded outcomes and keeps the Craft cast cue",
    (spellName) => {
        const f = fixture(spellName);
        const run = () =>
            spellName === "Craft" ? f.scene.castAreaSpellAtCell({ x: 2, y: 2 }) : f.scene.castSpellOnTarget(f.target);
        expect(run()).toBe(true);
        expect(f.forges).toHaveBeenCalledTimes(spellName === "Craft" ? 1 : 0);
        if (spellName === "Craft")
            expect(f.forges).toHaveBeenCalledWith({ x: 100, y: 350 }, expect.any(Number), expect.any(Function));
        expect(f.pops).not.toHaveBeenCalled();
        expect(f.pending).toEqual([]);
        expect(f.outcomes).toHaveBeenCalledWith(f.localEvents);
    },
);

test.each(["Craft", "Armor Rune", "Weapon Rune"])("rejected local %s does not forge", (spellName) => {
    const f = fixture(spellName, false);
    const accepted =
        spellName === "Craft" ? f.scene.castAreaSpellAtCell({ x: 2, y: 2 }) : f.scene.castSpellOnTarget(f.target);
    expect(accepted).toBe(false);
    expect(f.pops).not.toHaveBeenCalled();
    expect(f.forges).not.toHaveBeenCalled();
    expect(f.pending).toEqual([]);
});

for (const completed of [true, false]) {
    test.each(["Craft", "Armor Rune", "Weapon Rune"])(
        `recorded %s keeps authoritative outcomes and the Craft cue with reapply=${completed}`,
        async (spellName) => {
            const f = fixture(spellName, completed);
            expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
            expect(f.forges).toHaveBeenCalledTimes(spellName === "Craft" ? 1 : 0);
            expect(f.pops).not.toHaveBeenCalled();
            expect(f.pending).toEqual([]);
            expect(f.delay).toHaveBeenCalledWith(150);
            expect(f.outcomes).toHaveBeenCalledWith(f.record.events);
            expect(f.outcomes).not.toHaveBeenCalledWith(f.localEvents);
        },
    );
}

test("ranked Craft waits for an accepted record before showing a forge", () => {
    const f = fixture("Craft", false, true);
    expect(f.scene.castAreaSpellAtCell({ x: 2, y: 2 })).toBe(true);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.forges).not.toHaveBeenCalled();
    expect(f.outcomes).not.toHaveBeenCalled();
});

test("a disposed scene cannot start a late recorded Craft", async () => {
    const f = fixture("Craft");
    f.scene.isSceneDestroyed = () => true;
    expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(false);
    expect(f.forges).not.toHaveBeenCalled();
    expect(f.gameSound).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.outcomes).not.toHaveBeenCalled();
});

test("recorded Craft starts one forge with its cast and retains recorded results after recovery", async () => {
    const f = fixture("Craft", false);
    f.caster.hasAnimationState = () => true;
    let finishCast!: () => void;
    f.scene.playReplayOneShot = () =>
        new Promise<void>((resolve) => {
            finishCast = resolve;
        });
    const playback = f.scene.playReplayCastSpellAction(f.record);
    expect(f.gameSound).toHaveBeenCalledWith("blacksmith_cast");
    expect(f.forges).toHaveBeenCalledTimes(1);
    expect(f.outcomes).not.toHaveBeenCalled();
    finishCast();
    expect(await playback).toBe(true);
    expect(f.forges).toHaveBeenCalledTimes(1);
    expect(f.outcomes).toHaveBeenCalledWith(f.record.events);
    expect(f.outcomes).not.toHaveBeenCalledWith(f.localEvents);
});
