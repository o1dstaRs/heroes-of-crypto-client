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

test("a dying counter keeps every remaining frame and callback, finishing 40% sooner", () => {
    const { unit, anim, callback, frames } = fixture();
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    expect(anim.frameDurationsMs).toEqual([60, 120, 180]);
    expect(anim.elapsed).toBe(30); // same quarter-frame phase; no visual jump
    expect(anim.frameIndex).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(89);
    expect(anim.frameIndex).toBe(1);
    unit.stepOneShotAnimation(1);
    expect(anim.frameIndex).toBe(2);
    unit.stepOneShotAnimation(179);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(frames).toContain(2);
    unit.sprite.destroy();
});

test("long counters gain at most 300 ms and repeated lethal notifications cannot accelerate them again", () => {
    const { unit, anim } = fixture(Array(8).fill(300));
    const before = anim.frameDurationsMs.slice(1).reduce((a, b) => a + b, 0) - anim.elapsed;
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    const after = anim.frameDurationsMs.slice(1).reduce((a, b) => a + b, 0) - anim.elapsed;
    expect(before - after).toBeCloseTo(300);
    const durations = [...anim.frameDurationsMs];
    expect(unit.hastenLethalMeleeRecovery()).toBe(false);
    expect(anim.frameDurationsMs).toEqual(durations);
    unit.sprite.destroy();
});

test("uniform-rate counters keep their current frame phase and complete once", () => {
    const { unit, anim, callback } = fixture([100, 100, 100]);
    Object.assign(anim, { frameDurationsMs: undefined });
    expect(unit.hastenLethalMeleeRecovery()).toBe(true);
    expect(anim.durationPerFrame).toBe(60);
    expect(anim.elapsed).toBe(30);
    unit.stepOneShotAnimation(29);
    expect(anim.frameIndex).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(anim.frameIndex).toBe(2);
    unit.stepOneShotAnimation(59);
    expect(callback).not.toHaveBeenCalled();
    unit.stepOneShotAnimation(1);
    expect(callback).toHaveBeenCalledTimes(1);
    unit.sprite.destroy();
});

test.each(["hit", "death", "cast", "idle"])("%s and its timing are unchanged", (state) => {
    const { unit, anim } = fixture();
    anim.stateName = state;
    expect(unit.hastenLethalMeleeRecovery()).toBe(false);
    expect(anim.frameDurationsMs).toEqual([100, 200, 300]);
    unit.sprite.destroy();
});

test.each([{ externallyDriven: true }, { projectileRelease: () => {} }, { orcRelease: () => {} }, { finished: true }])(
    "externally driven/unfinished projectile release is never retimed: %j",
    (extra) => {
        const { unit, anim } = fixture();
        Object.assign(anim, extra);
        expect(unit.hastenLethalMeleeRecovery()).toBe(false);
        expect(anim.elapsed).toBe(50);
        unit.sprite.destroy();
    },
);
