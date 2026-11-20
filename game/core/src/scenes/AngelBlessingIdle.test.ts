import { expect, test } from "bun:test";
import { ANGEL_CAST_SPEED, angelCastAura } from "./AngelBlessingIdle";

test("cast aura peaks during its overhead hold and never repeats with idle time", () => {
    for (const time of [0, 1080, 2040, 3120, 6000, -1, NaN]) expect(angelCastAura(time / ANGEL_CAST_SPEED)).toBe(0);
    for (const time of [1320, 1560, 1820]) expect(angelCastAura(time / ANGEL_CAST_SPEED)).toBeCloseTo(1);
    expect(angelCastAura(1200 / ANGEL_CAST_SPEED)).toBeCloseTo(0.5);
    expect(angelCastAura(1930 / ANGEL_CAST_SPEED)).toBeCloseTo(0.5);
});
