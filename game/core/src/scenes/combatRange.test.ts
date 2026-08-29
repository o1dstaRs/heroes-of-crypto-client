import { describe, expect, it } from "bun:test";

import { formatCombatRange } from "./combatRange";

describe("formatCombatRange", () => {
    it("adds compact thin-space gaps around the dash", () => {
        expect(formatCombatRange(209, 314)).toBe("209\u2009-\u2009314");
        expect(formatCombatRange(34, 52)).toBe("34\u2009-\u200952");
    });

    it("keeps a single-value range compact", () => {
        expect(formatCombatRange(13, 13)).toBe("13");
    });
});
