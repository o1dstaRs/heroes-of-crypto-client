import { expect, mock, test } from "bun:test";
import { Sprite, Texture } from "pixi.js";
import { RenderableUnit } from "./RenderableUnit";

const fixture = (durations = [100, 200, 300]) => {
    const callback = mock(() => {}),
        frames: number[] = [];
    const anim = {
        stateName: "melee_attack_up",
        frames: durations.map(() => Texture.WHITE),
        frameIndex: 1,
        elapsed: 50,
        durationPerFrame: 100,
        frameDurationsMs: durations,
        holdLastFrame: true,
        onComplete: callback,
    };
    const unit = Object.assign(Object.create(RenderableUnit.prototype), {
        getName: () => "Squire",
        sprite: new Sprite(Texture.WHITE),
        oneShotAnim: anim,
        applyOneShotFrame: (state: { frameIndex: number }) => frames.push(state.frameIndex),
    });
    return { unit, anim, callback, frames };
};

test("a dying counter keeps every remaining frame and callback, compressed into a 150 ms follow-through", () => {
    const { unit, anim, callback, frames } = fixture();
    // 200 + 300 - 50 = 450 ms remain; they now play in 150 ms.
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    expect(anim.frameDurationsMs.map((ms) => Math.round(ms * 10) / 10)).toEqual([33.3, 66.7, 100]);
    expect(anim.elapsed).toBeCloseTo(50 / 3); // same quarter-frame phase; no visual jump
    expect(anim.frameIndex).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(49);
    expect(anim.frameIndex).toBe(1);
    unit.stepOneShotAnimation(1);
    expect(anim.frameIndex).toBe(2);
    unit.stepOneShotAnimation(99);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(frames).toContain(2);
    unit.sprite.destroy();
});

test("however long the swing, a dying actor falls within 150 ms and is never accelerated twice", () => {
    const { unit, anim } = fixture(Array(8).fill(300));
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    const after = anim.frameDurationsMs.slice(1).reduce((a, b) => a + b, 0) - anim.elapsed;
    expect(after).toBeCloseTo(150);
    const durations = [...anim.frameDurationsMs];
    expect(unit.hastenLethalMeleeRecovery()).toBe(false);
    expect(anim.frameDurationsMs).toEqual(durations);
    unit.sprite.destroy();
});

test("uniform-rate counters keep their current frame phase and complete once", () => {
    const { unit, anim, callback } = fixture([100, 100, 100, 100]);
    Object.assign(anim, { frameDurationsMs: undefined });
    // 3 frames x 100 - 50 = 250 ms remain; scaled to 150 ms.
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    expect(anim.durationPerFrame).toBeCloseTo(60);
    expect(anim.elapsed).toBeCloseTo(30);
    unit.stepOneShotAnimation(29);
    expect(anim.frameIndex).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(anim.frameIndex).toBe(2);
    unit.stepOneShotAnimation(119);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(callback).toHaveBeenCalledTimes(1);
    unit.sprite.destroy();
});

test("a swing already inside the follow-through is left untouched", () => {
    const { unit, anim } = fixture([100, 100, 100]);
    // 100 + 100 - 50 = 150 ms remain: nothing to compress.
    expect(unit.hastenLethalMeleeRecovery()).toBe(false);
    expect(anim.frameDurationsMs).toEqual([100, 100, 100]);
    unit.sprite.destroy();
});
