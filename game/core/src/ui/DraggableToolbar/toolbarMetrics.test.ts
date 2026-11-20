import { describe, expect, test } from "bun:test";

import { TOOLBAR_FULL_SLOTS, toolbarColumnHeightForPx, toolbarSlotCount } from "./toolbarMetrics";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("fight toolbar row height", () => {
    test.each([
        [
            "keeps all six slots while the AI toggle is part of the column",
            named("Hourglass", "LuckShield", "Next", "AI", "AttackType", "Spellbook"),
            TOOLBAR_FULL_SLOTS,
        ],
        [
            "drops one slot when the scene publishes no AI toggle (ranked, lobby, vs-AI)",
            named("Hourglass", "LuckShield", "Next", "AttackType", "Spellbook"),
            TOOLBAR_FULL_SLOTS - 1,
        ],
        // Time Denial takes Wait's slot; it is not the AI toggle.
        [
            "does not count Time Denial as the AI toggle",
            named("TimeDenial", "LuckShield", "Next", "AttackType", "Spellbook"),
            TOOLBAR_FULL_SLOTS - 1,
        ],
        ["reserves the full column until the scene has published its buttons", [], TOOLBAR_FULL_SLOTS],
    ])("%s", (_, buttons, slots) => {
        expect(toolbarSlotCount(buttons)).toBe(slots);
    });

    test("one slot is exactly one medallion and one gap", () => {
        expect(toolbarColumnHeightForPx(1, 6)).toBe(382);
        expect(toolbarColumnHeightForPx(1, 5)).toBe(317);
    });
});
