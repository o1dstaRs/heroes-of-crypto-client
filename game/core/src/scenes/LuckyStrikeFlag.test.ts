import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { CommonFlagPops, commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";

test("Lucky Strike belongs to each recorded striker, deduplicates impact/fallback, resets next action", () => {
    const pops: string[] = [];
    const unit = (id: string) => ({ getId: () => id, getName: () => "Leprechaun", isDead: () => id === "dead" });
    const a = unit("a"),
        b = unit("b");
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["a", a],
                    ["b", b],
                    ["dead", unit("dead")],
                ]),
        },
        combatVisuals: { spawnCommonFlagPop: (u: typeof a, kind: string) => pops.push(`${u.getId()}:${kind}`) },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: a }),
        moveAnimManager: { isMoving: () => false },
    });
    scene.beginDullingDefensePresentation();
    scene.spawnLuckyStrikeVfx(undefined);
    scene.spawnLuckyStrikeVfx({ luckyStrikeBy: [] });
    expect(pops).toEqual([]);
    const damage = { luckyStrikeBy: ["a", "a", "b", "missing", "dead"] };
    scene.spawnLuckyStrikeVfx(damage, new Set(["a"]));
    expect(pops).toEqual(["a:lucky_strike"]);
    scene.spawnLuckyStrikeVfx(damage);
    scene.spawnLuckyStrikeVfx(damage);
    expect(pops).toEqual(["a:lucky_strike", "b:lucky_strike"]);
    scene.beginDullingDefensePresentation();
    scene.spawnLuckyStrikeVfx(damage, new Set(["a"]));
    expect(pops).toHaveLength(3);
    expect(scene.playCreatureAnimationLabState("lucky_strike").ok).toBe(true);
    expect(pops.at(-1)).toBe("a:lucky_strike");
    expect(commonFlagFrameAt("lucky_strike", 799)).toBe(15);
    expect(commonFlagFrameAt("lucky_strike", 800)).toBeUndefined();
    expect(
        canPreviewCreatureLabState({ name: "Leprechaun", abilities: ["Lucky Strike"], spells: [] }, "lucky_strike"),
    ).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Dryad", abilities: ["Hamstring"], spells: [] }, "lucky_strike")).toBe(
        false,
    );
    expect(isLazyCombatEffectAssetKey("vfx_lucky_strike_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_lucky_strike_pop_atlas")).toBe(false);
});

test("expired cold Lucky Strike downloads do not replay a completed proc", async () => {
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
        "lucky_strike",
        (container) => root.addChild(container),
        () => now,
    );
    try {
        const pending = layer.spawn("a", { x: 0, y: 0 }, 64);
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

test("Lucky Strike waits for contact and appears over the attacker, never the victim", async () => {
    const pops: string[] = [];
    const flights: { contact: () => void; land: () => void }[] = [];
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => "Leprechaun",
        hasAbilityActive: () => false,
        isDead: () => false,
        isPlayingOneShotAnimation: () => false,
        getAnimationTextureKey: () => undefined,
        getVisualCenter: () => ({ x: id === "a" ? 0 : 100, y: 0 }),
        getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
    });
    const a = unit("a"),
        b = unit("b");
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        oneInTheFieldTriggers: new OneInTheFieldTriggers(),
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    ["a", a],
                    ["b", b],
                ]),
        },
        isSceneDestroyed: () => false,
        prepareDirectionalAttackState: () => "attack",
        offsetReplayDamagePosition: (to: unknown) => to,
        combatVisuals: {
            showFloatingDamage() {},
            prepareCommonFlagPop() {},
            spawnCommonFlagPop: (u: typeof a, kind: string) => pops.push(`${u.getId()}:${kind}`),
        },
        playReplayOneShot: () => Promise.resolve(),
        playReplayProjectile: (_a: unknown, _b: unknown, _p: unknown, onImpact: () => void) =>
            new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve })),
    });
    scene.beginDullingDefensePresentation();
    const damage = { luckyStrikeBy: ["a"] };
    const pending = scene.playCombatExchange(
        a,
        b,
        { attackType: "range", damage },
        [
            {
                attackerId: "a",
                targetId: "b",
                response: false,
                hitIndex: 0,
                amount: 10,
                missed: false,
                lethal: false,
                unitsDied: 0,
            },
        ],
        () => {},
    );
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(pops).toEqual([]);
    expect(flights).toHaveLength(1);
    flights[0].contact();
    flights[0].contact();
    expect(pops).toEqual(["a:lucky_strike"]);
    flights[0].land();
    await pending;
    scene.spawnLuckyStrikeVfx(damage);
    expect(pops).toEqual(["a:lucky_strike"]);
});
