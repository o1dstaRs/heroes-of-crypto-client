import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { TOOLBAR_FULL_SLOTS, toolbarColumnHeightForPx, toolbarSlotCount } from "./toolbarMetrics";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("fight toolbar row height", () => {
    test("keeps all six slots while the AI toggle is part of the column", () => {
        expect(toolbarSlotCount(named("Hourglass", "LuckShield", "Next", "AI", "AttackType", "Spellbook"))).toBe(
            TOOLBAR_FULL_SLOTS,
        );
    });

    test("drops one slot when the scene publishes no AI toggle (ranked, lobby, vs-AI)", () => {
        expect(toolbarSlotCount(named("Hourglass", "LuckShield", "Next", "AttackType", "Spellbook"))).toBe(
            TOOLBAR_FULL_SLOTS - 1,
        );
        // Time Denial takes Wait's slot; it is not the AI toggle.
        expect(toolbarSlotCount(named("TimeDenial", "LuckShield", "Next", "AttackType", "Spellbook"))).toBe(
            TOOLBAR_FULL_SLOTS - 1,
        );
    });

    test("reserves the full column until the scene has published its buttons", () => {
        expect(toolbarSlotCount([])).toBe(TOOLBAR_FULL_SLOTS);
    });

    test("one slot is exactly one medallion and one gap", () => {
        expect(toolbarColumnHeightForPx(1, 6)).toBe(382);
        expect(toolbarColumnHeightForPx(1, 5)).toBe(317);
    });

    test("the right sidebar sizes the fight row by the slot count and re-measures the log when it changes", () => {
        const sidebar = readFileSync(join(import.meta.dir, "..", "RightSideBar", "index.tsx"), "utf8");
        expect(sidebar).toContain("toolbarColumnHeightPx(toolbarSlots)");
        expect(sidebar).toMatch(/setFrozenLogHeight\(null\);\s*\}, \[[^\]]*toolbarSlots/);
    });
});
