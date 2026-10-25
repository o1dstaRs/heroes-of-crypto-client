import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";

function fixture() {
    const casualties: number[] = [];
    const presentCasualties = () => undefined;
    const unit = {
        getId: () => "unit",
        getName: () => "Magic Dragon",
        getTeam: () => 1,
        isDead: () => false,
        isSmallSize: () => false,
        getVisualCenter: () => ({ x: 100, y: 200 }),
        getPosition: () => ({ x: 100, y: 200 }),
        playDodgeAnimation: () => {
            throw new Error("Miss must not move the figure");
        },
        flashLuckyStrike: () => undefined,
        flashBuffApplied: () => undefined,
        captureDamageCasualties: (amount: number) => {
            casualties.push(amount);
            return presentCasualties;
        },
    };
    const calls: { kind: string; args: unknown[] }[] = [];
    const record =
        (kind: string) =>
        (...args: unknown[]) =>
            calls.push({ kind, args });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["unit", unit]]) },
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        combatVisuals: {
            showMissLabel: record("miss"),
            showLuckyLabel: record("lucky"),
            showResistLabel: record("resist"),
            showFloatingHeal: record("heal"),
            showFloatingAbsorbed: record("absorb"),
            spawnCommonFlagPop: record("pop"),
        },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    return { scene, unit, calls, casualties, presentCasualties };
}

test("confirmed misses, luck and snare saves pass the actual recipient to the common flag layer", () => {
    const f = fixture();
    f.scene.showAttackMissedVfx(f.unit, f.unit, { missed: false });
    f.scene.spawnLuckyStrikeVfx({ luckyStrikeBy: [] });
    expect(f.calls).toHaveLength(0);
    f.scene.showAttackMissedVfx(f.unit, f.unit, { missed: true, unitId: "unit" });
    f.scene.spawnLuckyStrikeVfx({ luckyStrikeBy: ["unit"] });
    f.scene.showSnareResistedVfx("unit");
    expect(f.calls.map((c) => c.kind)).toEqual(["miss", "lucky", "resist"]);
    for (const c of f.calls) expect(c.args.at(-1)).toBe(f.unit);
});

test("authoritative healing and both shield sources retain numbers and identify the flag owner", () => {
    const f = fixture();
    f.scene.renderHealVfx([
        {
            type: "spell_cast",
            healed: [
                { unitId: "unit", amount: 0 },
                { unitId: "unit", amount: 17 },
            ],
        },
    ]);
    f.scene.showFleshShieldAbsorbedDamage([
        { source: "flesh_shield", unitId: "unit", position: { x: 100, y: 200 }, amount: 23, unitsDied: 1 },
    ]);
    f.scene.showShieldAbsorbs([{ source: "water_shield", unitId: "unit", position: { x: 100, y: 200 }, amount: 31 }]);
    expect(f.calls.map((c) => c.kind)).toEqual(["heal", "absorb", "absorb"]);
    expect(f.calls.map((c) => c.args[1])).toEqual([17, 23, 31]);
    expect(f.calls[0].args[2]).toBe(f.unit);
    for (const c of f.calls.slice(1)) expect(c.args[4]).toBe(f.unit);
    expect(f.calls[1].args[3]).toBe(1);
    expect(f.calls[1].args[5]).toBe(f.presentCasualties);
    expect(f.casualties).toEqual([1]);
});

test("resisted debuff records coalesce per recipient; successful debuffs stay silent", () => {
    const f = fixture();
    f.scene.renderCastOutcomes([
        {
            type: "effects_applied",
            applications: [{ unitId: "unit", name: "Weakness", kind: "debuff", resisted: false }],
        },
    ]);
    expect(f.calls).toHaveLength(0);
    f.scene.renderCastOutcomes([
        {
            type: "effects_applied",
            applications: [
                { unitId: "unit", name: "Weakness", kind: "debuff", resisted: true },
                { unitId: "unit", name: "Sadness", kind: "debuff", resisted: true },
            ],
        },
    ]);
    expect(f.calls).toEqual([{ kind: "pop", args: [f.unit, "resist"] }]);
});

test("Ember Covenant labels only authoritative blocked damage, with its own impact burst", () => {
    const f = fixture();
    f.scene.showShieldAbsorbs([
        { source: "ember_covenant", unitId: "unit", position: { x: 100, y: 200 }, amount: 47 },
        { source: "ember_covenant", unitId: "unit", position: { x: 100, y: 200 }, amount: 0 },
        { source: "fire_breath", unitId: "unit", position: { x: 100, y: 200 }, amount: 15 },
    ]);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].kind).toBe("absorb");
    expect(f.calls[0].args[1]).toBe(47);
    expect(f.calls[0].args[4]).toBe(f.unit);
    expect(f.calls[0].args[6]).toBe("ember_covenant");
});

test("each common lab button uses the same above-flag runtime", () => {
    const f = fixture();
    for (const kind of ["lucky", "miss", "resist", "heal", "absorb"]) {
        expect(f.scene.playCreatureAnimationLabState(`common_${kind}`).ok).toBe(true);
        if (kind === "miss") {
            expect(f.calls.at(-1)?.kind).toBe("miss");
            expect(f.calls.at(-1)?.args.at(-1)).toBe(f.unit);
        } else {
            expect(f.calls.at(-1)).toEqual({ kind: "pop", args: [f.unit, kind] });
        }
    }
});

test("repeat attack preview uses the same shared sprite for a creature without native double attack", () => {
    const f = fixture();
    expect(f.scene.playCreatureAnimationLabState("multi_attack").ok).toBe(true);
    expect(f.calls).toEqual([{ kind: "pop", args: [f.unit, "multi_attack"] }]);
});

function addBiteVictim(f: ReturnType<typeof fixture>) {
    const victim = {
        ...f.unit,
        getId: () => "victim",
        getName: () => "Squire",
        getTeam: () => 2,
        getCells: () => [{ x: 1, y: 1 }],
    };
    f.scene.unitsHolder.getAllUnits = () =>
        new Map([
            ["unit", f.unit],
            ["victim", victim],
        ]);
    f.scene.grid = { getOccupantUnitId: () => "victim" };
    return victim;
}

test("Penetrating Bite lab preview uses the victim's flag and requires an opponent", () => {
    const f = fixture();
    expect(f.scene.playCreatureAnimationLabState("penetrating_bite").ok).toBe(false);
    expect(f.calls).toHaveLength(0);
    const victim = addBiteVictim(f);
    expect(f.scene.playCreatureAnimationLabState("penetrating_bite").ok).toBe(true);
    expect(f.calls).toEqual([{ kind: "pop", args: [victim, "penetrating_bite"] }]);
});

test("Shadow Touch lab preview uses the combat flag renderer", () => {
    const f = fixture();
    expect(f.scene.playCreatureAnimationLabState("shadow_touch").ok).toBe(true);
    expect(f.calls).toEqual([{ kind: "pop", args: [f.unit, "shadow_touch"] }]);
});

test.each(["melee_attack", "melee_attack_up", "melee_attack_down"])(
    "Hyena lab %s starts the bite only when the attack starts",
    (state) => {
        const f = fixture();
        let allowed = false;
        Object.assign(f.unit, {
            getName: () => "Hyena",
            hasAnimationState: () => true,
            hasAbilityActive: (name: string) => name === "Penetrating Bite",
            playOneShotAnimation: () => allowed,
        });
        expect(f.scene.playCreatureAnimationLabState(state).ok).toBe(false);
        expect(f.calls).toHaveLength(0);
        allowed = true;
        expect(f.scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(f.calls).toHaveLength(0);
        const victim = addBiteVictim(f);
        expect(f.scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(f.calls).toEqual([{ kind: "pop", args: [victim, "penetrating_bite"] }]);
    },
);
