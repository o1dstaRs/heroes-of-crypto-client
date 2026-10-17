import { GridConstants, GridSettings, SpellPowerType } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";

import { Sandbox } from "./Sandbox";

const fixture = (completed = true, authoritative = false, animated = true) => {
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
        getId: () => "mage",
        getName: () => "Wandering Mage",
        getBaseCell: () => ({ x: 1, y: 1 }),
        getPosition: () => ({ x: 100, y: 100 }),
        getVisualCenter: () => ({ x: 100, y: 100 }),
        faceBoardTarget: mock(() => undefined),
        hasAnimationState: () => animated,
        playOneShotAnimation: mock(() => undefined),
    };
    const target = {
        getId: () => "target",
        getBaseCell: () => ({ x: 2, y: 2 }),
        getPosition: () => ({ x: 200, y: 200 }),
    };
    const units = new Map<string, unknown>([
        ["mage", caster],
        ["target", target],
    ]);
    const apply = mock(() => ({ completed, events: [] }));
    const submit = mock(() => true);
    const sound = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: caster,
        currentActiveSpell: { getName: () => "Misfortune", getPowerType: () => SpellPowerType.MIND },
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
        renderCastOutcomes: () => undefined,
        renderSnareResistVfx: () => undefined,
        cleanupAfterSpell: () => undefined,
        applyReplayEvents: () => undefined,
        delayReplay: () => Promise.resolve(),
    });
    const record = {
        action: { type: "cast_spell", casterId: "mage", spellName: "Misfortune", targetId: "target" },
        events: [],
        stateAfter: { units: [] },
    };
    return { scene, caster, target, apply, submit, sound, record };
};

test.each([true, false])("an accepted targeted cast plays its caster sound with animation=%s", (animated) => {
    const f = fixture(true, false, animated);
    expect(f.scene.castSpellOnTarget(f.target)).toBe(true);
    expect(f.sound).toHaveBeenCalledTimes(1);
    expect(f.sound).toHaveBeenCalledWith(f.caster, "attack");
});

test("a rejected targeted cast stays silent", () => {
    const f = fixture(false);
    expect(f.scene.castSpellOnTarget(f.target)).toBe(false);
    expect(f.sound).not.toHaveBeenCalled();
});

test("an authoritative targeted cast waits for its replay before playing its sound", async () => {
    const f = fixture(false, true);
    expect(f.scene.castSpellOnTarget(f.target)).toBe(true);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.sound).not.toHaveBeenCalled();
    expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
    expect(f.sound).toHaveBeenCalledTimes(1);
    expect(f.sound).toHaveBeenCalledWith(f.caster, "attack");
});

test.each([true, false])("recorded spell audio survives a local reapply completed=%s", async (completed) => {
    const f = fixture(completed);
    expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
    expect(f.sound).toHaveBeenCalledTimes(1);
    expect(f.sound).toHaveBeenCalledWith(f.caster, "attack");
});

test.each([true, false])("directional attack playback owns its sound only for melee=%s", async (melee) => {
    const f = fixture();
    f.scene.prepareDirectionalAttackState = () => "attack";
    await f.scene.playDirectionalAttackOneShot(f.caster, f.target, 360, melee);
    if (melee) {
        expect(f.sound).toHaveBeenCalledTimes(1);
        expect(f.sound).toHaveBeenCalledWith(f.caster, "attack", true);
    } else {
        expect(f.sound).not.toHaveBeenCalled();
    }
});
