import { expect, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";

test("spellbook sounds follow real transitions, with no repeated open/close sounds and no late open after closing", () => {
    const sounds: { name: string; alive: () => boolean }[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_renderSpellBookOverlay: false,
        buttonManager: { sc_renderSpellBookOverlay: false },
        spellBookOverlay: { setOpen: () => {} },
        spellBookContainer: { visible: true },
        ensureSpellBookBackground: () => {},
        setSpellBookWorldBlur: () => {},
        setHoveredSpell: () => {},
        playSceneGameSound: (name: string, alive: () => boolean) => sounds.push({ name, alive }),
    });
    scene.setSpellBookOverlayState(true);
    scene.setSpellBookOverlayState(true);
    expect(sounds.map((s) => s.name)).toEqual(["spellbook_open"]);
    expect(sounds[0].alive()).toBe(true);
    scene.closeSpellBook();
    scene.closeSpellBook();
    expect(sounds.map((s) => s.name)).toEqual(["spellbook_open", "spellbook_close"]);
    expect(sounds[0].alive()).toBe(false);
    expect(scene.spellBookContainer.visible).toBe(false);
});

test("a mass heal plays once for positive healing, and a fully resisted or dead-target heal stays quiet", () => {
    const sounds: string[] = [],
        restored: number[] = [];
    const alive = { isDead: () => false, getVisualCenter: () => ({ x: 0, y: 0 }) };
    const dead = { isDead: () => true };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["a", alive],
                    ["b", alive],
                    ["dead", dead],
                ]),
        },
        combatVisuals: { showFloatingHeal: (_pos: unknown, amount: number) => restored.push(amount) },
        playSceneGameSound: (name: string) => sounds.push(name),
    });
    scene.renderHealVfx([
        {
            type: "spell_cast",
            healed: [
                { unitId: "a", amount: 20 },
                { unitId: "b", amount: 10 },
            ],
        },
    ]);
    expect(sounds).toEqual(["heal"]);
    expect(restored).toEqual([20, 10]);
    scene.renderHealVfx([
        {
            type: "spell_cast",
            healed: [
                { unitId: "a", amount: 0 },
                { unitId: "dead", amount: 10 },
            ],
        },
    ]);
    expect(sounds).toEqual(["heal"]);
});

test("passive resurrection restores the unit and plays the same sound as the Angel's resurrection burst", () => {
    const sounds: string[] = [];
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    let restored = 0;
    const unit = {
        getAmountAlive: () => 0,
        getAmountDied: () => 3,
        setPosition: () => {},
        setRemainingStats: (amount: number) => {
            restored = amount;
        },
        syncVisual: () => {},
        playOneShotAnimation: () => {},
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        drawer: { getUnitsContainer: () => undefined },
        unitsHolder: { getAllUnits: () => new Map([["u", unit]]) },
        combatVisuals: { spawnResurrectionBurst: () => {}, showResurrectedCount: () => {} },
        playSceneGameSound: (name: string) => sounds.push(name),
    });
    scene.syncResurrectedUnit({ unitId: "u", position: { x: 100, y: 100 }, amount: 2, hp: 10 }, new Map());
    expect(restored).toBe(2);
    expect(sounds).toEqual(["resurrection"]);
    scene.renderResurrectionVfx({ x: 100, y: 100 }, 2);
    expect(sounds).toEqual(["resurrection", "resurrection"]);
});
