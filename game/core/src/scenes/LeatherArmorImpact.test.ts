import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { OneInTheFieldTriggers } from "./sandbox/OneInTheFieldTriggers";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

test.each(["melee", "range"])("Leather Armor %s follows each landed hit and counter at contact", async (attackType) => {
    for (const active of [true, false]) {
        for (const missed of [true, false]) {
            const pops: string[] = [];
            const flights: { contact: () => void; land: () => void }[] = [];
            const unit = (id: string) => ({
                getId: () => id,
                getName: () => "Orc",
                hasAbilityActive: (name: string) => active && name === "Leather Armor",
                isDead: () => false,
                isPlayingOneShotAnimation: () => false,
                getAnimationTextureKey: () => undefined,
                getVisualCenter: () => ({ x: id === "A" ? 0 : 100, y: 0 }),
                getDamagePredictionAnchor: () => ({ x: 0, y: 100 }),
            });
            const a = unit("A"),
                b = unit("B");
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                oneInTheFieldTriggers: new OneInTheFieldTriggers(),
                sc_sceneSettings: { getGridSettings: () => ({}) },
                unitsHolder: {
                    getAllUnits: () =>
                        new Map([
                            ["A", a],
                            ["B", b],
                        ]),
                },
                isSceneDestroyed: () => false,
                prepareDirectionalAttackState: () => "attack",
                offsetReplayDamagePosition: (to: unknown) => to,
                combatVisuals: {
                    showFloatingDamage() {},
                    prepareCommonFlagPop() {},
                    spawnCommonFlagPop: (victim: typeof a, kind: string) => {
                        if (kind === "leather_armor") pops.push(victim.getId());
                    },
                },
                showAttackMissedVfx() {},
                playReplayOneShot: () => Promise.resolve(),
                playReplayProjectile: (_a: unknown, _b: unknown, _p: unknown, onImpact: () => void) =>
                    new Promise<void>((resolve) => flights.push({ contact: onImpact, land: resolve })),
            });
            const strikes = [
                { attackerId: "A", targetId: "B", response: false, hitIndex: 0 },
                { attackerId: "B", targetId: "A", response: true, hitIndex: 0 },
                { attackerId: "A", targetId: "B", response: false, hitIndex: 1 },
            ].map((s) => ({ ...s, amount: missed ? 0 : 10, missed, lethal: false, unitsDied: 0 }));
            const pending = scene.playCombatExchange(a, b, { attackType }, strikes, () => {});
            await flush();
            if (attackType === "range") {
                expect(pops).toEqual([]);
                for (let i = 0; i < 6; i++) {
                    for (const f of flights.splice(0)) {
                        f.contact();
                        f.contact(); // Duplicate arrival callbacks must not replay the passive.
                        f.land();
                    }
                    await flush();
                }
            }
            await pending;
            expect(pops).toEqual(active && !missed && attackType === "range" ? ["B", "A", "B"] : []);
        }
    }
});

test("Leather Armor ignores zero damage, dead recipients, disabled passive and non-ranged damage", () => {
    const pops: string[] = [];
    const unit = {
        getId: () => "arbalester",
        isDead: () => false,
        hasAbilityActive: (name: string) => name === "Leather Armor",
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: {
            spawnCommonFlagPop: (_unit: unknown, kind: string) => pops.push(kind),
        },
    });
    scene.spawnLeatherArmorOnImpact(unit, { amount: 0 }, "range");
    scene.spawnLeatherArmorOnImpact(unit, { amount: 10, missed: true }, "range");
    scene.spawnLeatherArmorOnImpact(unit, { amount: 10 }, "melee");
    scene.spawnLeatherArmorOnImpact(unit, { amount: 10 }, "magic");
    scene.spawnLeatherArmorOnImpact({ ...unit, isDead: () => true }, { amount: 10 }, "range");
    scene.spawnLeatherArmorOnImpact({ ...unit, hasAbilityActive: () => false }, { amount: 10 }, "range");
    expect(pops).toEqual([]);
    scene.spawnLeatherArmorOnImpact(unit, { amount: 10 }, "range");
    expect(pops).toEqual(["leather_armor"]);
});

test("Leather Armor lab preview uses its owner's flag and keeps the atlas available in production", () => {
    const pops: string[] = [];
    const unit = { getId: () => "arbalester", getName: () => "Arbalester", isDead: () => false };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: {
            spawnCommonFlagPop: (recipient: typeof unit, kind: string) => pops.push(`${recipient.getId()}:${kind}`),
        },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    expect(scene.playCreatureAnimationLabState("leather_armor").ok).toBe(true);
    expect(pops).toEqual(["arbalester:leather_armor"]);
    expect(
        canPreviewCreatureLabState({ name: "Arbalester", abilities: ["Leather Armor"], spells: [] }, "leather_armor"),
    ).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Squire", abilities: [], spells: [] }, "leather_armor")).toBe(false);
    expect(isLazyCombatEffectAssetKey("vfx_leather_armor_pop_atlas")).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_leather_armor_pop_atlas")).toBe(false);
});
