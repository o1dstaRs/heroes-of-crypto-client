import { expect, test } from "bun:test";
import { hydraLabIdleFrame, HYDRA_IDLE_FRAME_COUNT, HYDRA_IDLE_FRAME_MS, HYDRA_IDLE_SPEED } from "./HydraLabIdle";

test("Hydra calm idle loops every pose at 1.2x without a periodic biting section", () => {
    expect(HYDRA_IDLE_SPEED).toBe(1.2);
    expect(HYDRA_IDLE_FRAME_COUNT).toBe(64);
    for (let cycle = 0; cycle < 12; cycle++) {
        for (let pose = 0; pose < 64; pose++) {
            const time = (cycle * 64 + pose) * HYDRA_IDLE_FRAME_MS;
            expect(hydraLabIdleFrame(time)).toBe(pose);
            expect(hydraLabIdleFrame(time + HYDRA_IDLE_FRAME_MS - 0.01)).toBe(pose);
        }
    }
    expect(hydraLabIdleFrame(4000 / 1.2)).toBe(0);
    for (const time of [NaN, Infinity, -1]) expect(hydraLabIdleFrame(time)).toBe(0);
});
