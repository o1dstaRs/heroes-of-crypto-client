import { GridConstants, GridSettings, SpellPowerType } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";

import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";

const fixture = (
    completed = true,
    authoritative = false,
    animated = true,
    { casterName = "Wandering Mage", spellName = "Misfortune", ranked = false } = {},
) => {
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
        getName: () => casterName,
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
    const gameSound = mock(() => undefined);
    const spellSound = mock(() => undefined);
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        currentActiveUnit: caster,
        currentActiveSpell: { getName: () => spellName, getPowerType: () => SpellPowerType.MIND },
        unitsHolder: { getAllUnits: () => units },
        grid: { getSettings: () => gs, getOccupantUnitId: () => undefined },
        sc_sceneSettings: { getGridSettings: () => gs },
        sc_sceneLog: { updateLog: () => undefined },
        throwTransparency: () => undefined,
        snapshotRenderableUnits: () => units,
        shouldDeferActionToAuthoritativeReplay: () => authoritative,
        canArmedSpellTarget: () => true,
        submitActionForAuthoritativeReplay: submit,
        createActionEngine: () => ({ apply }),
        playUnitCombatSound: sound,
        playSceneGameSound: gameSound,
        playSceneSpellSound: spellSound,
        playReplayOneShot: () => Promise.resolve(),
        renderHealVfx: () => undefined,
        renderSpellDamageVfx: () => undefined,
        spawnAbilityTransferVfx: () => undefined,
        renderCastOutcomes: () => undefined,
        renderSnareResistVfx: () => undefined,
        cleanupAfterSpell: () => undefined,
        applyReplayEvents: () => undefined,
        applyTurnEngineEvents: () => undefined,
        onReplaySpellImpact: () => undefined,
        getAreaSpellVisualCenter: () => ({ x: 200, y: 200 }),
        scheduleSceneTimeout: (callback: () => void) => callback(),
        delayReplay: () => Promise.resolve(),
    });
    const record = {
        action: {
            type: "cast_spell",
            casterId: "mage",
            spellName,
            ...(spellName === "Craft" ? { targetCell: { x: 2, y: 2 } } : { targetId: "target" }),
        },
        events: [],
        stateAfter: { units: [] },
    };
    return { scene, caster, target, apply, submit, sound, gameSound, spellSound, record };
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

const blacksmithSpells = ["Craft", "Armor Rune", "Weapon Rune"];
const castBlacksmithSpell = (f: ReturnType<typeof fixture>) =>
    f.record.action.spellName === "Craft"
        ? f.scene.castAreaSpellAtCell({ x: 2, y: 2 })
        : f.scene.castSpellOnTarget(f.target);

for (const animated of [true, false]) {
    test.each(blacksmithSpells)(`Blacksmith %s uses crafting audio with animation=${animated}`, (spellName) => {
        const f = fixture(true, false, animated, { casterName: "Blacksmith", spellName });
        expect(castBlacksmithSpell(f)).toBe(true);
        expect(f.gameSound).toHaveBeenCalledTimes(1);
        expect(f.gameSound).toHaveBeenCalledWith("blacksmith_cast");
        expect(f.sound).not.toHaveBeenCalled();
    });
}

test.each(blacksmithSpells)("rejected Blacksmith %s stays silent", (spellName) => {
    const f = fixture(false, false, true, { casterName: "Blacksmith", spellName });
    expect(castBlacksmithSpell(f)).toBe(false);
    expect(f.gameSound).not.toHaveBeenCalled();
    expect(f.sound).not.toHaveBeenCalled();
});

test.each(blacksmithSpells)("ranked Blacksmith %s plays once at authoritative replay", async (spellName) => {
    const f = fixture(false, true, true, { casterName: "Blacksmith", spellName, ranked: true });
    expect(castBlacksmithSpell(f)).toBe(true);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.gameSound).not.toHaveBeenCalled();
    expect(f.sound).not.toHaveBeenCalled();
    expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
    expect(f.gameSound).toHaveBeenCalledTimes(1);
    expect(f.gameSound).toHaveBeenCalledWith("blacksmith_cast");
    expect(f.sound).not.toHaveBeenCalled();
});

for (const [completed, authoritative] of [
    [true, false],
    [false, false],
    [true, true],
]) {
    test.each(blacksmithSpells)(
        `AI/Premium Blacksmith %s cast audio with completed=${completed}, authoritative=${authoritative}`,
        (spellName) => {
            const f = fixture(completed, authoritative, true, { casterName: "Blacksmith", spellName });
            expect(f.scene.applyGameAction(f.record.action)).toBe(completed);
            expect(f.gameSound).toHaveBeenCalledTimes(completed && !authoritative ? 1 : 0);
            expect(f.sound).not.toHaveBeenCalled();
        },
    );
}

const fireSpells = [
    { casterName: "Wandering Mage", spellName: "Fireball" },
    { casterName: "Battle Mage", spellName: "Fire Strike" },
];

for (const animated of [true, false]) {
    test.each(fireSpells)(`$spellName uses its own cast audio with animation=${animated}`, (spell) => {
        const f = fixture(true, false, animated, spell);
        expect(f.scene.castSpellOnTarget(f.target)).toBe(true);
        expect(f.spellSound).toHaveBeenCalledTimes(1);
        expect(f.spellSound).toHaveBeenCalledWith(f.caster, spell.spellName);
        expect(f.sound).not.toHaveBeenCalled();
        expect(f.gameSound).not.toHaveBeenCalled();
    });
}

test.each(fireSpells)("rejected $spellName stays silent", (spell) => {
    const f = fixture(false, false, true, spell);
    expect(f.scene.castSpellOnTarget(f.target)).toBe(false);
    expect(f.spellSound).not.toHaveBeenCalled();
    expect(f.sound).not.toHaveBeenCalled();
});

test.each(fireSpells)("ranked $spellName plays once at authoritative replay", async (spell) => {
    const f = fixture(false, true, true, { ...spell, ranked: true });
    expect(f.scene.castSpellOnTarget(f.target)).toBe(true);
    expect(f.submit).toHaveBeenCalledTimes(1);
    expect(f.spellSound).not.toHaveBeenCalled();
    expect(await f.scene.playReplayCastSpellAction(f.record)).toBe(true);
    expect(f.spellSound).toHaveBeenCalledTimes(1);
    expect(f.spellSound).toHaveBeenCalledWith(f.caster, spell.spellName);
    expect(f.sound).not.toHaveBeenCalled();
});

for (const [completed, authoritative] of [
    [true, false],
    [false, false],
    [true, true],
]) {
    test.each(fireSpells)(
        `AI/Premium $spellName audio with completed=${completed}, authoritative=${authoritative}`,
        (spell) => {
            const f = fixture(completed, authoritative, true, spell);
            expect(f.scene.applyGameAction(f.record.action)).toBe(completed);
            expect(f.spellSound).toHaveBeenCalledTimes(completed && !authoritative ? 1 : 0);
            expect(f.sound).not.toHaveBeenCalled();
        },
    );
}

test("a successful summon leaves its cue to the summon event", () => {
    const f = fixture(true, false, true, { casterName: "Satyr", spellName: "Summon Wolves" });
    f.scene.playUnitCastSound(f.caster, "Summon Wolves", [{ type: "unit_summoned", amount: 3 }]);
    expect(f.sound).not.toHaveBeenCalled();
    expect(f.gameSound).not.toHaveBeenCalled();
    expect(f.spellSound).not.toHaveBeenCalled();
});
