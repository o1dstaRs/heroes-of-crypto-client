import { expect, test } from "bun:test";
import { Texture } from "pixi.js";
import { Sandbox } from "./Sandbox";

function fixture() {
    const played: string[] = [];
    const requested: string[] = [];
    let resolve!: (texture: Texture) => void;
    const unit = {
        getName: () => "Angel",
        getId: () => "angel-lab",
        hasAnimationState: () => true,
        getAnimationTextureKey: (state: string) => `angel_lab_${state}_atlas`,
        playOneShotAnimation: (state: string) => {
            played.push(state);
            return true;
        },
        returnToIdleAnimation: () => {},
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        angelLabActionRequest: 0,
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        unitsHolder: { getAllUnits: () => new Map([[unit.getId(), unit]]) },
        isSceneDestroyed: () => false,
        waitForTexture: (key: string) => {
            requested.push(key);
            return new Promise<Texture>((done) => {
                resolve = done;
            });
        },
    }) as Sandbox;
    return { scene, played, requested, loaded: () => resolve(Texture.WHITE) };
}

test("each Angel melee button loads its atlas before starting on the first press", async () => {
    for (const state of ["melee_attack", "melee_attack_up", "melee_attack_down"] as const) {
        const { scene, played, requested, loaded } = fixture();
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(requested).toEqual([`angel_lab_${state}_atlas`]);
        expect(played).toEqual([]);
        loaded();
        await Promise.resolve();
        expect(played).toEqual([state]);
    }
});

test("idle cancels a queued Angel strike while its atlas is still loading", async () => {
    const { scene, played, loaded } = fixture();
    scene.playCreatureAnimationLabState("melee_attack_up");
    scene.playCreatureAnimationLabState("idle");
    loaded();
    await Promise.resolve();
    expect(played).toEqual([]);
});
