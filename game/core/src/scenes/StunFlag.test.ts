import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture, TextureSource } from "pixi.js";
import type { GameEvent } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { stunRecipients } from "./stunFlagEffects";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { CommonFlagPops } from "./sandbox/CommonFlagPops";

const events = [
    {
        type: "effects_applied",
        applications: [
            { unitId: "victim", name: "Stun", kind: "debuff" },
            { unitId: "victim", name: "Stun", kind: "debuff" },
            { unitId: "ally", name: "Stun", kind: "buff" },
            { unitId: "resisted", name: "Stun", kind: "debuff", resisted: true },
            { unitId: "other", name: "Freeze", kind: "debuff" },
        ],
    },
] as GameEvent[];

test("stun distinguishes the hostile hit from the identically named friendly aura", () => {
    expect(stunRecipients(events)).toEqual(["victim"]);
    expect(stunRecipients(undefined)).toEqual([]);
    expect(isLazyCombatEffectAssetKey("vfx_stun_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_stun_pop_atlas")).toBe(false);
});

test("the hit plays once for its actual living recipient across impact/final checkpoints", () => {
    const pops: string[] = [];
    let dead = false;
    const unit = { getId: () => "victim", isDead: () => dead };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["victim", unit]]) },
        combatVisuals: {
            spawnCommonFlagPop: (target: typeof unit, kind: string) => pops.push(`${target.getId()}:${kind}`),
        },
    });
    scene.beginDullingDefensePresentation();
    scene.popRecordedStun(events, new Set(["ally"]));
    expect(pops).toHaveLength(0);
    scene.popRecordedStun(events, new Set(["victim"]));
    scene.popRecordedStun(events);
    expect(pops).toEqual(["victim:stun"]);
    scene.beginDullingDefensePresentation();
    scene.popRecordedStun(events);
    expect(pops).toHaveLength(2);
    scene.beginDullingDefensePresentation();
    dead = true;
    scene.popRecordedStun(events);
    expect(pops).toHaveLength(2);
});

test("later spell casts can stun the same recipient again without retaining a previous action's dedupe", () => {
    const pops: string[] = [];
    const unit = { getId: () => "victim", isDead: () => false };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: { getAllUnits: () => new Map([["victim", unit]]) },
        combatVisuals: {
            spawnCommonFlagPop: (target: typeof unit, kind: string) => pops.push(`${target.getId()}:${kind}`),
        },
    });
    scene.renderCastOutcomes(events);
    scene.renderCastOutcomes(events);
    expect(pops).toEqual(["victim:stun", "victim:stun"]);
});

test.each(["stale", "cancelled"] as const)("a %s atlas request cannot resurrect the stun impact", async (reason) => {
    let resolve!: (texture: Texture) => void;
    let now = 0;
    const atlas = new Texture({ source: new TextureSource({ width: 1536, height: 1536 }) });
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => {
            resolve = done;
        }) as never,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const world = new Container();
    const layer = new CommonFlagPops(
        "stun",
        (container) => {
            world.addChild(container);
        },
        () => now,
    );
    try {
        const pending = layer.spawn("victim", { x: 10, y: 20 }, 64);
        if (reason === "stale") now = 700;
        else layer.clear();
        resolve(atlas);
        await pending;
        expect(layer.active).toBe(false);
        expect(world.children).toHaveLength(0);
        expect(atlas.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
        world.destroy({ children: true });
        atlas.destroy(true);
    }
});
