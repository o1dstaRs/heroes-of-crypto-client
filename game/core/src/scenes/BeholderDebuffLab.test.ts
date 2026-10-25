import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";
import { canPreviewCreatureLabState } from "../ui/creatureAnimationLabCapabilities";

function fixture(withVictim = false) {
    const unit = (id: string) => ({
        getId: () => id,
        getName: () => id,
        hasAbilityActive: (name: string) => name === "Spit Ball",
        isDead: () => false,
        getVisualCenter: () => ({ x: 64, y: 64 }),
        getDamagePredictionAnchor: () => ({ x: 64, y: 100 }),
        getFlagEffectAnchor: () => ({ x: 64, y: 110 }),
    });
    const source = unit("Beholder"),
        victim = withVictim ? unit("Peasant") : source;
    const calls: string[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        angelLabActionRequest: 0,
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: source }),
        penetratingBiteLabVictim: () => (withVictim ? victim : undefined),
        isSceneDestroyed: () => false,
        unitsHolder: {
            getAllUnits: () =>
                new Map([
                    [source.getId(), source],
                    [victim.getId(), victim],
                ]),
        },
        sc_sceneSettings: { getGridSettings: () => ({}) },
        waitForTexture: async () => ({}),
        playReplayProjectile: async () => {
            calls.push("projectile");
        },
        combatVisuals: {
            showFloatingDamage: () => calls.push("damage"),
            spawnDebuffPop: (_p: unknown, _t: unknown, name: string) => calls.push(name),
        },
    });
    return { scene, calls };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("lab immediately previews all seven without damage or a projectile", async () => {
    const f = fixture();
    expect(f.scene.playCreatureAnimationLabState("beholder_debuff_all").ok).toBe(true);
    await settle();
    expect(f.calls).toEqual(["Curse", "Sadness", "Quagmire", "Weakening Beam", "Weakness", "Rangebane", "Cowardice"]);
});

test("individual preview is immediate even when an opponent exists", async () => {
    const f = fixture(true);
    f.scene.playCreatureAnimationLabState("beholder_debuff_sadness");
    await settle();
    expect(f.calls).toEqual(["Sadness"]);
});

test("superseded lab action cannot start a pending preview", async () => {
    const f = fixture();
    f.scene.playCreatureAnimationLabState("beholder_debuff_all");
    f.scene.angelLabActionRequest++;
    await settle();
    expect(f.calls).toEqual([]);
    expect(
        canPreviewCreatureLabState({ name: "Beholder", abilities: ["Spit Ball"], spells: [] }, "beholder_debuff_all"),
    ).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Peasant", abilities: [], spells: [] }, "beholder_debuff_all")).toBe(
        false,
    );
});
