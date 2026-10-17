import { afterEach, expect, test } from "bun:test";
import { RenderableUnit } from "./RenderableUnit";
import { setStaggerDuplicateIdle } from "../settings/idleTiming";

afterEach(() => setStaggerDuplicateIdle(true));

function playback(name: string, ordinal: number) {
    const frames = Array.from({ length: 8 }, (_, frame) => ({ frame }));
    const state = {
        syncCreaturePalette: () => undefined,
        hasAnimationState: () => true,
        getUnitProperties: () => ({ name }),
        berserkerLabIdleScale: () => 1,
        duplicateIdleOrdinal: ordinal,
        selectionAnimationStartedAtMs: 0,
        selectionAnimFrames: frames,
        selectionAnimTiming: { frameForElapsed: () => 0 },
        selectionAnimFrameDurationsMs: frames.map(() => 200),
        selectionAnimFrameIndex: -1,
        refreshedIdlePhaseRatio: 0,
        sprite: { texture: frames[0] },
        walkAnim: undefined as object | undefined,
        oneShotAnim: undefined as { elapsed: number } | undefined,
    };
    const tick = (now: number) => RenderableUnit.prototype.stepSelectionAnimation.call(state as never, now);
    return { state, frames, tick };
}

test.each(["Monk", "Orc", "Nomad", "Dryad"])("staggering changes %s idle frame without changing durations", (name) => {
    const first = playback(name, 0);
    const second = playback(name, 1);
    first.tick(0);
    second.tick(0);
    expect(first.state.sprite.texture).toBe(first.frames[0]);
    expect(second.state.sprite.texture).toBe(second.frames[3]);
    expect(second.state.selectionAnimFrameDurationsMs).toEqual(first.state.selectionAnimFrameDurationsMs);
    setStaggerDuplicateIdle(false);
    second.tick(0);
    expect(second.state.sprite.texture).toBe(second.frames[0]);
});

test("actions retain their texture and elapsed time while duplicates idle at different phases", () => {
    const unit = playback("Monk", 3);
    unit.state.oneShotAnim = { elapsed: 125 };
    unit.tick(900);
    expect(unit.state.oneShotAnim.elapsed).toBe(125);
    expect(unit.state.sprite.texture).toBe(unit.frames[0]);
    unit.state.oneShotAnim = undefined;
    unit.state.walkAnim = {};
    unit.tick(1800);
    expect(unit.state.sprite.texture).toBe(unit.frames[0]);
});
