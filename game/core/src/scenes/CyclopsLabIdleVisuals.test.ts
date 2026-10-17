import { expect, test } from "bun:test";
import {
    CYCLOPS_IDLE_FULL_BODY_FRAME_COUNT,
    CYCLOPS_IDLE_FULL_BODY_PERIOD_MS,
    cyclopsIdleFullBodyFrame,
} from "./CyclopsLabIdleVisuals";

test("Cyclops shifts through whole-body grip, crouch, lift, release and catch poses", () => {
    expect(CYCLOPS_IDLE_FULL_BODY_FRAME_COUNT).toBe(5);
    expect(cyclopsIdleFullBodyFrame(0)).toBe(0);
    expect(cyclopsIdleFullBodyFrame(1450)).toBe(1);
    expect(cyclopsIdleFullBodyFrame(1700)).toBe(2);
    expect(cyclopsIdleFullBodyFrame(1900)).toBe(3);
    expect(cyclopsIdleFullBodyFrame(2050)).toBe(2);
    expect(cyclopsIdleFullBodyFrame(2250)).toBe(1);
    expect(cyclopsIdleFullBodyFrame(2500)).toBe(0);
});

test("Cyclops blinks in a stable rest pose and repeats the same cycle", () => {
    expect(cyclopsIdleFullBodyFrame(3200)).toBe(4);
    expect(cyclopsIdleFullBodyFrame(3300)).toBe(0);
    for (const time of [0, 1450, 1700, 1900, 2050, 2250, 3200, 3300]) {
        expect(cyclopsIdleFullBodyFrame(time + CYCLOPS_IDLE_FULL_BODY_PERIOD_MS)).toBe(cyclopsIdleFullBodyFrame(time));
    }
});

test("Cyclops blinks twice per cycle without speeding up the toss", () => {
    let blinks = 0;
    let wasClosed = false;
    for (let ms = 0; ms < CYCLOPS_IDLE_FULL_BODY_PERIOD_MS; ms++) {
        const closed = cyclopsIdleFullBodyFrame(ms) === 4;
        if (closed && !wasClosed) blinks++;
        wasClosed = closed;
    }
    expect(blinks).toBe(2);
    expect(cyclopsIdleFullBodyFrame(750)).toBe(4);
    expect(cyclopsIdleFullBodyFrame(820)).toBe(0);
    expect(cyclopsIdleFullBodyFrame(1900)).toBe(3);
});
