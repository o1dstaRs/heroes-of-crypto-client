import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { SpellTargetType } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { showsEnchantedSkinShield } from "./enchantedSkinVisual";

function fixture(active = true, name = "Black Dragon") {
    const unit = {
        getId: () => "dragon",
        getName: () => name,
        isDead: () => false,
        hasAbilityActive: (ability: string) => active && ability === "Enchanted Skin",
        getDamagePredictionAnchor: () => ({ x: 100, y: 200 }),
        getVisualCenter: () => ({ x: 100, y: 200 }),
        getTeam: () => 1,
        canFly: () => true,
        getBuff: () => undefined,
    };
    const pops: unknown[][] = [];
    const gs = {
        getCellSize: () => 64,
        getMinX: () => 0,
        getMaxX: () => 1024,
        getMinY: () => 0,
        getMaxY: () => 1024,
        getGridSize: () => 16,
        getStep: () => 64,
        getHalfStep: () => 32,
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["dragon", unit]]) },
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: {
            spawnCommonFlagPop: (...args: unknown[]) => pops.push(args),
            spawnMeteorShower: () => undefined,
            spawnFireBurn: () => undefined,
            spawnLightningStrike: () => undefined,
            showFloatingDamage: () => undefined,
        },
        showFleshShieldAbsorbedDamage: () => undefined,
        showShieldAbsorbs: () => undefined,
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
    });
    return { scene, unit, pops };
}
const impact = (name: string, amount = 0): GameEvent => ({
    type: "spell_cast",
    casterId: "caster",
    spellName: name,
    targetCell: { x: 4, y: 4 },
    unitIdsDied: [],
    animations: [],
    damaged: [{ unitId: "dragon", position: { x: 100, y: 200 }, amount, unitsDied: 0 }],
});

test("confirmed mass spells reach immune dragons only within their ally, enemy or flying scope", () => {
    for (const [target, casterTeam, expected] of [
        [SpellTargetType.ALL_ALLIES, 1, 1],
        [SpellTargetType.ALL_ALLIES, 2, 0],
        [SpellTargetType.ALL_ENEMIES, 1, 0],
        [SpellTargetType.ALL_ENEMIES, 2, 1],
        [SpellTargetType.ALL_FLYING, 1, 1],
        [SpellTargetType.ANY_ENEMY, 2, 0],
    ]) {
        const f = fixture();
        const caster = {
            ...f.unit,
            getTeam: () => casterTeam,
            getSpells: () => [{ getName: () => "Mass spell", getSpellTargetType: () => target }],
            hasAbilityActive: () => false,
        };
        f.scene.unitsHolder.getAllUnits = () =>
            new Map([
                ["dragon", f.unit],
                ["caster", caster],
            ]);
        f.scene.renderSpellDamageVfx([{ ...impact("Mass spell"), damaged: undefined }]);
        expect(f.pops).toHaveLength(expected);
    }
});

test("authoritative zero-damage area and indirect magic impacts activate Black Dragon's shield", () => {
    const f = fixture();
    f.scene.renderSpellDamageVfx([impact("Meteor Shower"), impact("Lightning Strike")]);
    expect(f.pops).toEqual([
        [f.unit, "enchanted_skin"],
        [f.unit, "enchanted_skin"],
    ]);
    for (const other of [fixture(false), fixture(true, "Magic Dragon")]) {
        other.scene.renderSpellDamageVfx([impact("Meteor Shower", 10)]);
        expect(other.pops).toHaveLength(0);
    }
});
test("a dead or broken immunity does not show the shield; lab uses the real flag pop", () => {
    const f = fixture();
    expect(showsEnchantedSkinShield({ ...f.unit, isDead: () => true })).toBe(false);
    expect(f.scene.playCreatureAnimationLabState("enchanted_skin").ok).toBe(true);
    expect(f.pops).toEqual([[f.unit, "enchanted_skin"]]);
    expect(fixture(false).scene.playCreatureAnimationLabState("enchanted_skin").ok).toBe(false);
});
