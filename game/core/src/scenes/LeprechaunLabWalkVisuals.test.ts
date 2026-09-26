import { expect, test } from "bun:test";
import { leprechaunHeadFrame } from "./LeprechaunLabWalkVisuals";

test("Leprechaun head is another 40% slower and does not restart at a body loop boundary", () => {
    expect(leprechaunHeadFrame(0)).toBe(0);
    expect(leprechaunHeadFrame(1.3 - 0.000001)).toBe(3);
    expect(leprechaunHeadFrame(1.3)).toBe(3);
    expect(leprechaunHeadFrame(1.3 / 0.42 - 0.000001)).toBe(7);
    expect(leprechaunHeadFrame(1.3 / 0.42)).toBe(0);
    // Fifty full leg cycles contain exactly twenty-one head cycles.
    expect(leprechaunHeadFrame(65 - 0.000001)).toBe(7);
    expect(leprechaunHeadFrame(65)).toBe(0);
    expect(leprechaunHeadFrame(-1)).toBe(0);
    expect(leprechaunHeadFrame(Number.NaN)).toBe(0);
});
