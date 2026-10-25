import { expect, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { troglodyteFlagApplications } from "./troglodyteFlagEffects";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { animatableEffectNames } from "./effect_pops";

const events = [
    {
        type: "effects_applied",
        applications: [
            { unitId: "victim", name: "Miner", kind: "debuff" },
            { unitId: "victim", name: "Miner", kind: "debuff" },
            { unitId: "trog", name: "Blindness", kind: "effect", resisted: true, resistedBy: "Madness" },
            { unitId: "other", name: "Weakness", kind: "debuff", resisted: true },
            { unitId: "other", name: "Miner", kind: "debuff", resisted: true },
        ],
    },
] as GameEvent[];

test("only actual armor theft and attributed Madness resistance produce flag applications", () => {
    expect(troglodyteFlagApplications(events)).toEqual([
        { unitId: "victim", kind: "miner" },
        { unitId: "trog", kind: "madness" },
    ]);
    expect(troglodyteFlagApplications(undefined)).toEqual([]);
    expect(animatableEffectNames(["Miner", "Weakness"])).toEqual(new Set(["Weakness"]));
});

test("combat checkpoints and lab use the correct owner; misses, Break and dead recipients are silent", () => {
    const pops: string[] = [];
    let dead = false,
        active = true;
    const trog = {
        getId: () => "trog",
        getName: () => "Troglodyte",
        isDead: () => dead,
        hasAbilityActive: (name: string) => active && name === "Blind Fury",
    };
    const victim = { ...trog, getId: () => "victim", getName: () => "Knight" };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["trog", trog],
                    ["victim", victim],
                ]),
        },
        combatVisuals: { spawnCommonFlagPop: (u: typeof trog, kind: string) => pops.push(`${u.getId()}:${kind}`) },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: trog }),
        penetratingBiteLabVictim: () => {
            throw new Error("Self preview must not require an opponent");
        },
        moveAnimManager: { isMoving: () => false },
    });
    scene.beginDullingDefensePresentation();
    scene.popRecordedTroglodyteEffects(events, new Set(["victim"]));
    expect(pops).toEqual(["victim:miner"]);
    scene.popRecordedTroglodyteEffects(events);
    scene.popRecordedTroglodyteEffects(events);
    expect(pops).toEqual(["victim:miner", "trog:madness"]);
    scene.spawnBlindFuryOnImpact(trog, { amount: 20 });
    scene.spawnBlindFuryOnImpact(trog, { amount: 20, missed: true });
    scene.spawnBlindFuryOnImpact(trog, { amount: 0 });
    active = false;
    scene.spawnBlindFuryOnImpact(trog, { amount: 20 });
    dead = true;
    active = true;
    scene.spawnBlindFuryOnImpact(trog, { amount: 20 });
    expect(pops.at(-1)).toBe("trog:blind_fury");
    expect(pops).toHaveLength(3);
    dead = false;
    scene.beginDullingDefensePresentation();
    scene.popRecordedTroglodyteEffects(events);
    expect(pops).toHaveLength(5);
    for (const state of ["blind_fury", "miner", "madness"] as const) {
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(
            canPreviewCreatureLabState(
                { name: "Troglodyte", abilities: ["Blind Fury", "Miner", "Madness"], spells: [] },
                state,
            ),
        ).toBe(true);
        expect(canPreviewCreatureLabState({ name: "Knight", abilities: [], spells: [] }, state)).toBe(false);
    }
    expect(pops.slice(-3)).toEqual(["trog:blind_fury", "trog:miner", "trog:madness"]);
});
