import { expect, test } from "bun:test";
import { wanderingMageFireFrame } from "./WanderingMageIdleFire";
import { WANDERING_MAGE_IDLE_PALMS } from "./WanderingMageIdleAnchors";
import { authoredIdleFrameForElapsed } from "./RenderableUnit";

test("Mage fire completes six cycles while breathing retains five seconds of original timing", () => {
    const bodyTiming = Array(120).fill(1000 / 60);
    expect(wanderingMageFireFrame(0)).toBe(0);
    expect(wanderingMageFireFrame(1000 / 1.2 - 0.01)).toBe(59);
    expect(wanderingMageFireFrame(1000 / 1.2)).toBe(0);
    expect(wanderingMageFireFrame(2000)).toBe(24);
    expect(wanderingMageFireFrame(5000)).toBe(0);
    expect(authoredIdleFrameForElapsed(1000, bodyTiming)).toBe(60);
    expect(authoredIdleFrameForElapsed(2000.001, bodyTiming)).toBe(0);
    expect(authoredIdleFrameForElapsed(5000.001, bodyTiming)).toBe(60);
    expect(WANDERING_MAGE_IDLE_PALMS).toHaveLength(120);
    for (const palm of WANDERING_MAGE_IDLE_PALMS) {
        expect(palm[0]).toBeGreaterThan(670);
        expect(palm[0]).toBeLessThan(690);
        expect(palm[1]).toBeGreaterThan(175);
        expect(palm[1]).toBeLessThan(205);
    }
});
