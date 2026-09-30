import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";

test.each([
    ["melee_attack", "attack"],
    ["melee_attack_up", "attack_up"],
    ["melee_attack_down", "attack_down"],
] as const)("Wolf lab button %s plays its authored %s atlas", (button, atlas) => {
    const played: unknown[][] = [];
    const unit = {
        getName: () => "Wolf",
        hasAnimationState: (state: string) => ["attack", "attack_up", "attack_down"].includes(state),
        playOneShotAnimation: (...args: unknown[]) => {
            played.push(args);
            return true;
        },
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
    }) as Sandbox;

    expect(scene.playCreatureAnimationLabState(button)).toEqual({ ok: true, message: `Wolf: ${atlas}` });
    expect(played).toEqual([[atlas, undefined, true]]);
});
