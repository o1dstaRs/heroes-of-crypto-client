import { expect, test } from "bun:test";
import { centaurLabIdleFrame, CENTAUR_LAB_IDLE_CYCLE_MS } from "./CentaurLabIdle";

test("sways the tail between occasional hair gestures and loops without a terminal hold", () => {
    expect(centaurLabIdleFrame(0)).toBe(0);
    expect(centaurLabIdleFrame(300)).toBe(7);
    expect(centaurLabIdleFrame(600)).toBe(1);
    expect(centaurLabIdleFrame(1200)).toBe(0);
    expect(centaurLabIdleFrame(3599)).toBe(7);
    expect(centaurLabIdleFrame(3600)).toBe(6);
    expect(centaurLabIdleFrame(4080)).toBe(4);
    expect(centaurLabIdleFrame(4340)).toBe(5);
    expect(centaurLabIdleFrame(4800)).toBe(7);
    expect(CENTAUR_LAB_IDLE_CYCLE_MS).toBe(5100);
    expect(centaurLabIdleFrame(5100)).toBe(0);
    expect(centaurLabIdleFrame(5100 + 4340)).toBe(5);
});

test("keeps authored boundaries stable after subtracting a fractional browser clock", () => {
    for (const boundary of [300, 600, 3600, 4080, 4340, 5100]) {
        expect(centaurLabIdleFrame(boundary - Number.EPSILON * boundary)).toBe(centaurLabIdleFrame(boundary));
    }
    expect(centaurLabIdleFrame(4080 - 0.001)).toBe(3);
    expect(centaurLabIdleFrame(5100 - 0.001)).toBe(7);
});
