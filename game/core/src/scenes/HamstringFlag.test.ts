import { expect, spyOn, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { Assets, Container, Texture } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import { hamstringRecipients } from "./hamstringFlagEffects";
import { animatableEffectNames } from "./effect_pops";
import { CommonFlagPops, commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

const events = [
    {
        type: "effects_applied",
        applications: [
            { unitId: "victim", name: "Hamstrung", kind: "debuff", resisted: false },
            { unitId: "victim", name: "Hamstrung", kind: "debuff", resisted: false },
            { unitId: "resisted", name: "Hamstrung", kind: "debuff", resisted: true },
            { unitId: "mirror", name: "Hamstrung", kind: "debuff", resisted: false },
            { unitId: "other", name: "Slow", kind: "debuff", resisted: false },
        ],
    },
] as GameEvent[];

test("Hamstring follows landed applications without a second generic icon", () => {
    expect(hamstringRecipients(events)).toEqual(["victim", "mirror"]);
    expect(hamstringRecipients(undefined)).toEqual([]);
    expect(animatableEffectNames(["Hamstrung", "Weakness"])).toEqual(new Set(["Weakness"]));
    expect(commonFlagFrameAt("hamstring", 0)).toBe(0);
    expect(commonFlagFrameAt("hamstring", 799)).toBe(15);
    expect(commonFlagFrameAt("hamstring", 800)).toBeUndefined();
    expect(isLazyCombatEffectAssetKey("vfx_hamstring_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_hamstring_pop_atlas")).toBe(false);
    expect(canPreviewCreatureLabState({ name: "Dryad", abilities: ["Hamstring"], spells: [] }, "hamstring")).toBe(true);
});

test("impact filtering, reflection, repeated checkpoints, next actions and death", () => {
    const pops: string[] = [];
    let dead = false;
    const victim = { getId: () => "victim", getName: () => "Fairy", isDead: () => dead };
    const mirror = { ...victim, getId: () => "mirror" };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["victim", victim],
                    ["mirror", mirror],
                ]),
        },
        combatVisuals: {
            spawnCommonFlagPop: (unit: typeof victim, kind: string) => pops.push(`${unit.getId()}:${kind}`),
        },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: victim }),
        penetratingBiteLabVictim: () => undefined,
        moveAnimManager: { isMoving: () => false },
    });
    scene.beginDullingDefensePresentation();
    scene.popRecordedHamstring(events, new Set(["victim"]));
    scene.popRecordedHamstring(events);
    scene.popRecordedHamstring(events);
    expect(pops).toEqual(["victim:hamstring", "mirror:hamstring"]);
    scene.beginDullingDefensePresentation();
    dead = true;
    scene.popRecordedHamstring(events);
    expect(pops).toHaveLength(2);
    dead = false;
    scene.popRecordedHamstring(events, new Set(["victim"]));
    expect(pops).toHaveLength(3);
    expect(scene.playCreatureAnimationLabState("hamstring").ok).toBe(true);
    expect(pops.at(-1)).toBe("victim:hamstring");
});

test("a cold Hamstring download cannot replay an expired hit", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0;
    const layer = new CommonFlagPops(
        "hamstring",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        const pending = layer.spawn("victim", { x: 0, y: 0 }, 64);
        now = 700;
        resolve(Texture.WHITE);
        await pending;
        expect(layer.active).toBe(false);
        expect(root.children).toHaveLength(0);
    } finally {
        layer.clear();
        await Promise.resolve();
        root.destroy({ children: true });
        load.mockRestore();
        unload.mockRestore();
    }
});

test("a ranged Hamstring stays hidden in flight and starts exactly at projectile contact", async () => {
    const pops: string[] = [];
    const flights: { contact: () => void; land: () => void }[] = [];
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => "Orc",
        hasAbilityActive: (name: string) => id === "archer" && name === "Hamstring",
        isDead: () => false,
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: id === "archer" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const archer = unit("archer"),
        victim = unit("victim");
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({}) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["archer", archer],
                    ["victim", victim],
                ]),
        },
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (to: unknown) => to,
        combatVisuals: {
            showFloatingDamage() {},
            prepareCommonFlagPop() {},
            spawnCommonFlagPop: (target: typeof victim, kind: string) => pops.push(`${target.getId()}:${kind}`),
        },
        playReplayOneShot: () => Promise.resolve(),
        playReplayProjectile: (_a: unknown, _b: unknown, _p: unknown, onImpact: () => void) =>
            new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve })),
    });
    scene.beginDullingDefensePresentation();
    const pending = scene.playCombatExchange(
        archer,
        victim,
        { attackType: "range" },
        [
            {
                attackerId: "archer",
                targetId: "victim",
                response: false,
                hitIndex: 0,
                amount: 10,
                missed: false,
                lethal: false,
                unitsDied: 0,
            },
        ],
        () => {},
        undefined,
        events,
    );
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(pops).toEqual([]);
    expect(flights).toHaveLength(1);
    flights[0].contact();
    flights[0].contact();
    expect(pops).toEqual(["victim:hamstring"]);
    flights[0].land();
    await pending;
    scene.popRecordedHamstring(events, new Set(["victim"]));
    expect(pops).toEqual(["victim:hamstring"]);
});
