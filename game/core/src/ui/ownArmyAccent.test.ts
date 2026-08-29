import { afterEach, describe, expect, test } from "bun:test";

import { ownArmyAccent } from "./ownArmyAccent";
import { ARMY_COLOR_PRESETS, TEAM_DEFAULT_ARMY_COLOR_ID, writePlayerArmyColorId } from "../settings/playerArmyColor";

/**
 * The draft rail reads the player's colour straight from storage — there is no fight yet to arm the scene
 * tint, and whoever is looking at the draft IS the player.
 *
 * The property that matters most is the DEFAULT one: a player who never opens settings must see the draft
 * they have always seen, so the untinted values are the authored literals themselves rather than a mix
 * that happens to land near them.
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
        store.set(key, value);
    },
};

const AMETHYST = ARMY_COLOR_PRESETS[0];
const GREEN = ARMY_COLOR_PRESETS.find((preset) => preset.id === "green")!;

afterEach(() => {
    writePlayerArmyColorId(TEAM_DEFAULT_ARMY_COLOR_ID);
});

describe("the draft's own-army accents", () => {
    test("without a choice every tone is the authored green, unchanged", () => {
        const mine = ownArmyAccent();

        expect(mine.accent(0.5)).toBe("rgba(120,220,150,0.5)");
        expect(mine.soft(0.55)).toBe("rgba(180,230,195,0.55)");
        expect(mine.label(1)).toBe("rgba(143,205,125,1)");
        expect(mine.ring(1)).toBe("rgba(59,155,92,1)");
        expect(mine.text).toBe("#e6f5e9");
        expect(mine.cloth).toBe("linear-gradient(90deg, rgba(3,18,8,.65), rgba(5,31,14,.55) 50%, rgba(3,18,8,.65))");
    });

    test("a chosen colour reaches every tone, and the alpha the call site asked for survives", () => {
        writePlayerArmyColorId(AMETHYST.id);
        const mine = ownArmyAccent();

        for (const tone of [mine.accent, mine.soft, mine.label, mine.ring]) {
            expect(tone(0.35)).toMatch(/^rgba\(\d+,\d+,\d+,0\.35\)$/);
        }
        // Amethyst is 0x9b30ff: red and blue lead, green trails. Every tone is a mix of that one colour, so
        // the ordering holds whichever end of the range it is mixed towards.
        const [r, g, b] = mine.accent(1).match(/\d+/g)!.map(Number);
        expect(r).toBeGreaterThan(g);
        expect(b).toBeGreaterThan(r);
    });

    test("the rail darkens towards the colour, never away from it", () => {
        writePlayerArmyColorId(GREEN.id);
        const mine = ownArmyAccent();

        // Picking green must not read as "no choice": the derived cloth is its own string, and both its
        // stops are near-black tints of the preset rather than the authored green's literals.
        expect(mine.cloth).not.toBe(
            "linear-gradient(90deg, rgba(3,18,8,.65), rgba(5,31,14,.55) 50%, rgba(3,18,8,.65))",
        );
        expect(mine.cloth).toContain("rgba(0,13,0,0.65)");
        expect(mine.cloth).toContain("rgba(0,25,0,0.55)");
    });

    test("an unknown stored id falls back to the authored green rather than throwing", () => {
        writePlayerArmyColorId("chartreuse");

        expect(ownArmyAccent().text).toBe("#e6f5e9");
    });
});
