import { expect, mock, test } from "bun:test";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import type { FlagPopKind } from "./sandbox/CommonFlagPops";
import { Sandbox } from "./Sandbox";

function fixture() {
    const calls: string[] = [];
    const unit = {
        getId: () => "recipient",
        hasAbilityActive: () => false,
        getFlagEffectAnchor: () => ({ x: 100, y: 200 }),
        isDead: () => false,
        flashBuffApplied: () => undefined,
        flashDebuffDarken: () => undefined,
    };
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: {
            getGridSettings: () => ({ getCellSize: () => 64 }),
            getUnitsHolder: () => ({ getAllUnits: () => new Map([[unit.getId(), unit]]) }),
        },
        getCommonFlagPopLayer: (kind: string) => ({
            preload: () => calls.push(`preload:${kind}`),
            spawn: () => calls.push(`spawn:${kind}`),
        }),
    });
    return { visuals, unit, calls };
}

test.each([
    "shadow_touch",
    "small_specie",
    "backstab",
    "piercing_spear",
    "penetrating_bite",
    "leather_armor",
    "blind_fury",
    "bitter_experience",
    "multi_attack",
    "lucky_strike",
    "unicorn_retaliation",
    "enchanted_skin",
    "madness",
    "blacksmith_craft",
    "lucky",
    "miss",
    "resist",
    "heal",
    "absorb",
    "wild_regeneration",
] as const)("combat does not load or draw the %s badge; an explicit lab preview can still show it", (kind) => {
    const f = fixture();
    f.visuals.prepareCommonFlagPop(kind);
    f.visuals.spawnCommonFlagPop(f.unit, kind);
    expect(f.calls).toEqual([]);
    f.visuals.prepareCommonFlagPop(kind, "preview");
    f.visuals.spawnCommonFlagPop(f.unit, kind, "preview");
    expect(f.calls).toEqual([`preload:${kind}`, `spawn:${kind}`]);
});

test.each([
    ["Empower", "buff", "empower"],
    ["Riot", "buff", "ogre_riot"],
    ["Misfortune", "debuff", "mage_misfortune"],
    ["Wind Flow", "buff", "wind_flow"],
    ["Stun", "debuff", "stun"],
] as const)("only a confirmed %s application reaches its combat popup", (name, kind, expected) => {
    const f = fixture();
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([[f.unit.getId(), f.unit]]) },
        combatVisuals: f.visuals,
    });
    const event = (resisted: boolean) => [
        { type: "effects_applied", applications: [{ unitId: f.unit.getId(), name, kind, resisted }] },
    ];
    scene.renderCastOutcomes(undefined);
    scene.renderCastOutcomes(event(true));
    expect(f.calls).toEqual([]);
    scene.renderCastOutcomes(event(false));
    expect(f.calls).toEqual([`spawn:${expected}`]);
});

test.each([
    "hamstring",
    "shatter_armor",
    "dulling_defense",
    "miner",
    "unicorn_blindness",
    "made_of_fire",
    "absolving_arrow",
    "blacksmith_armor",
    "blacksmith_weapon",
    "blacksmith_double_punch",
] satisfies FlagPopKind[])("recorded status presentation keeps the %s recipient cue", (kind) => {
    const f = fixture();
    f.visuals.prepareCommonFlagPop(kind);
    f.visuals.spawnCommonFlagPop(f.unit, kind);
    expect(f.calls).toEqual([`preload:${kind}`, `spawn:${kind}`]);
});

test("dedicated passive, healing, resurrection, and damage badges also stay out of combat", async () => {
    const grid = mock(() => {
        throw new Error("A suppressed badge must not allocate a layer or read the board");
    });
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: { getGridSettings: grid },
    });
    const unit = {};
    visuals.spawnHealCross(unit);
    visuals.spawnCrusadePop(unit);
    visuals.spawnUnyieldingPowerPop(unit);
    visuals.spawnMagicReflectionPop(unit);
    visuals.spawnAngelResurrectionPop(unit);
    visuals.spawnDevourEssencePop(unit);
    visuals.preparePetrifyingGazePop();
    const finish = await visuals.spawnPetrifyingGazePop(unit);
    finish();
    expect(grid).not.toHaveBeenCalled();
});
