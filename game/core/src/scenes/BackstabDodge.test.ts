import { expect, test } from "bun:test";
import { TeamVals, type Unit } from "@heroesofcrypto/common";
import { isBackstabImpact } from "./backstabFlagEffects";
import { RenderableUnit, creatureOneShotAnimationEnabledForUnit } from "./RenderableUnit";
import { commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import { animationAtlasPrewarmKeys } from "../pixi/creatureAnimationSettings";

const ability = { getName: () => "Backstab" };
function unit(x: number, y: number, team = TeamVals.LEFT, width = 1, height = 1): Unit {
    return {
        hasAbilityActive: () => true,
        getAbilities: () => [ability],
        getBaseCell: () => ({ x, y }),
        isSmallSize: () => width === 1 && height === 1,
        getTeam: () => team,
        getFootprintWidth: () => width,
        getFootprintHeight: () => height,
    } as unknown as Unit;
}

test("Backstab follows the engine axis, team and full rectangular footprint", () => {
    const target = unit(5, 5, TeamVals.RIGHT, 2, 1);
    expect(isBackstabImpact(unit(6, 5), target, "melee", false, 10, true)).toBe(true);
    expect(isBackstabImpact(unit(5, 6), target, "melee", false, 10, true)).toBe(false);
    expect(isBackstabImpact(unit(5, 6), target, "melee", false, 10, false)).toBe(true);
    expect(isBackstabImpact(unit(4, 5, TeamVals.RIGHT), target, "melee", false, 10, true)).toBe(false);
    expect(isBackstabImpact(unit(3, 5, TeamVals.RIGHT), target, "melee", false, 10, true)).toBe(true);
});

test("Backstab never announces a miss, absorbed strike, ranged strike or inactive ability", () => {
    const a = unit(6, 5),
        b = unit(5, 5);
    expect(isBackstabImpact(a, b, "melee", true, 10, true)).toBe(false);
    expect(isBackstabImpact(a, b, "melee", false, 0, true)).toBe(false);
    expect(isBackstabImpact(a, b, "range", false, 10, true)).toBe(false);
    a.hasAbilityActive = () => false;
    expect(isBackstabImpact(a, b, "melee", false, 10, true)).toBe(false);
});

test("authored dodge clears hit recoil, plays once without a procedural ghost, and cannot interrupt death", () => {
    const calls: string[] = [];
    let state = "hit";
    const u = Object.assign(Object.create(RenderableUnit.prototype), {
        sprite: {},
        isDestroyed: false,
        currentRecoilX: 20,
        currentRecoilY: -10,
        hasAnimationState: (name: string) => name === "dodge",
        isPlayingOneShotAnimation: (name: string) => name === state,
        clearGenericCombatRecoil: () => calls.push("clear-hit"),
        clearGenericDodgeAnimation: () => calls.push("clear-ghosts"),
        playOneShotAnimation: (name: string) => {
            state = name;
            calls.push(name);
            return true;
        },
    });
    u.playDodgeAnimation(30, 20);
    expect(calls).toEqual(["clear-hit", "clear-ghosts", "dodge"]);
    expect([u.currentRecoilX, u.currentRecoilY]).toEqual([0, 0]);
    expect(u.isDodging()).toBe(true);
    state = "death";
    u.playDodgeAnimation(30, 20);
    expect(calls).toHaveLength(3);
});

test("the lab exposes both authored abilities only to their owner", () => {
    const owner = { name: "Scavenger", abilities: ["Backstab", "Dodge"], spells: [] };
    for (const state of ["backstab", "dodge"] as const) {
        expect(canPreviewCreatureLabState(owner, state)).toBe(true);
        expect(canPreviewCreatureLabState({ ...owner, abilities: [] }, state)).toBe(false);
    }
    expect(creatureOneShotAnimationEnabledForUnit("Scavenger", "dodge")).toBe(true);
    expect(animationAtlasPrewarmKeys("Scavenger")).toContain("scavenger_combat_dodge_atlas_quarter");
    expect(commonFlagFrameAt("backstab", 0)).toBe(0);
    expect(commonFlagFrameAt("backstab", 999)).toBe(15);
    expect(commonFlagFrameAt("backstab", 1000)).toBeUndefined();
});

test("Backstab lab preview plays above the selected Scavenger without an opponent", () => {
    const selected = { getName: () => "Scavenger" };
    const pops: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        angelLabActionRequest: 0,
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: selected }),
        penetratingBiteLabVictim: () => {
            throw new Error("Self preview must not require an enemy");
        },
        combatVisuals: {
            spawnCommonFlagPop: (target: unknown, kind: string) => pops.push([target, kind]),
        },
    });
    expect(scene.playCreatureAnimationLabState("backstab").ok).toBe(true);
    expect(pops).toEqual([[selected, "backstab"]]);
});

test.each([false, true])("combat places Backstab on the victim at contact, missed=%s", async (missed) => {
    const calls: string[] = [];
    const a = Object.assign(unit(6, 6), {
        getId: () => "A",
        getName: () => "Scavenger",
        isDead: () => false,
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: 100, y: 100 }),
        getDamagePredictionAnchor: () => ({ x: 100, y: 200 }),
        hasAbilityActive: (name: string) => name === "Backstab",
    });
    const b = Object.assign(unit(5, 5), {
        ...a,
        getBaseCell: () => ({ x: 5, y: 5 }),
        getId: () => "B",
        getName: () => "Squire",
        hasAbilityActive: () => false,
    });
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map<string, Unit>([
                    ["A", a],
                    ["B", b],
                ]),
        },
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (point: unknown) => point,
        combatVisuals: {
            showFloatingDamage: () => calls.push("damage"),
            prepareCommonFlagPop: () => calls.push("preload"),
            spawnCommonFlagPop: (target: Unit, kind: string) => calls.push(`${target.getId()}:${kind}`),
        },
        showAttackMissedVfx: () => calls.push("miss"),
        playReplayOneShot: (target: Unit, state: string) => {
            calls.push(`${target.getId()}:${state}`);
            return Promise.resolve();
        },
    });
    await scene.playCombatExchange(
        a,
        b,
        { attackType: "melee" },
        [
            {
                attackerId: "A",
                targetId: "B",
                amount: 10,
                unitsDied: 0,
                missed,
                response: false,
                hitIndex: 0,
                lethal: false,
            },
        ],
        () => {},
    );
    expect(calls.filter((call) => call.endsWith(":backstab"))).toEqual(missed ? [] : ["B:backstab"]);
    expect(calls.includes("B:hit")).toBe(!missed);
    if (!missed) expect(calls.indexOf("B:backstab")).toBeGreaterThan(calls.indexOf("A:attack"));
});
