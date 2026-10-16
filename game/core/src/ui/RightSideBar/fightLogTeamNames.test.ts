import { describe, expect, it } from "bun:test";

import { FIGHT_LOG_MARK_COLORS, fightLogSegments } from "./fightLogTeamNames";

const green = FIGHT_LOG_MARK_COLORS["🟢"];
const red = FIGHT_LOG_MARK_COLORS["🔴"];

describe("fight log team names", () => {
    it("drops the bead and paints the name that followed it", () => {
        expect(fightLogSegments("🟢 Scavenger moved to (5, 11)")).toEqual([
            { text: "Scavenger", color: green, mark: "🟢" },
            { text: " moved to (5, 11)" },
        ]);
    });

    it("keeps a two-word creature whole and stops at the first lowercase word", () => {
        expect(fightLogSegments("🔴 Wandering Mage uses Luck Shield (luck +3)")).toEqual([
            { text: "Wandering Mage", color: red, mark: "🔴" },
            { text: " uses Luck Shield (luck +3)" },
        ]);
    });

    it("stops a turn header's name at the em dash", () => {
        expect(fightLogSegments("🟢 Fairy — Lap 2")).toEqual([
            { text: "Fairy", color: green, mark: "🟢" },
            { text: " — Lap 2" },
        ]);
    });

    it("stops at an action emoji and leaves the target uncoloured", () => {
        expect(fightLogSegments("🔴 Centaur 🏹 Scavenger (431) 💀47")).toEqual([
            { text: "Centaur", color: red, mark: "🔴" },
            { text: " 🏹 Scavenger (431) 💀47" },
        ]);
    });

    it("paints every marked name on a row, each in its own colour", () => {
        expect(fightLogSegments("🔴 Orc and 🟢 Fairy")).toEqual([
            { text: "Orc", color: red, mark: "🔴" },
            { text: " and " },
            { text: "Fairy", color: green, mark: "🟢" },
        ]);
    });

    it("removes a bead that names nothing, and leaves unmarked rows alone", () => {
        expect(fightLogSegments("🟢 moved")).toEqual([{ text: "moved" }]);
        expect(fightLogSegments("Fight started!")).toEqual([{ text: "Fight started!" }]);
    });
});
