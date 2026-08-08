import { describe, expect, test } from "bun:test";

import { formatTurnLogHeader, parseTurnLogHeaderLabel } from "../../scenes/sceneLogTurnHeaders";
import {
    fightLogClipboardText,
    fightLogExportLine,
    groupFightLogEntries,
    TURN_LOG_HEADER_PREFIX,
} from "./fightLogGrouping";

interface Entry {
    id: number;
    text: string;
}

const entry = (id: number, text: string): Entry => ({ id, text });

describe("turn header lines", () => {
    test("format/parse round-trip, and regular lines never parse as headers", () => {
        const header = formatTurnLogHeader("🟢", "Fairy", 2);
        expect(parseTurnLogHeaderLabel(header)).toBe("🟢 Fairy — Lap 2");
        expect(parseTurnLogHeaderLabel("🟢 Fairy ⚔️ Orc (12)")).toBeUndefined();
        // No team flag (unknown side): no double space.
        expect(formatTurnLogHeader("", "Fairy", 1)).toBe("⌖ Fairy — Lap 1");
    });
});

describe("groupFightLogEntries", () => {
    test("folds the newest-first stream into newest-turn-first groups with chronological rows", () => {
        // Stream as the panel receives it (newest first): Orc's turn (2 lines), then Fairy's turn
        // (2 lines), then the pre-turn block (fight start + spawn).
        const lines = [
            entry(6, "🔴 Orc ⚔️ Fairy (7)"),
            entry(5, "🔴 Orc moved to (4, 5)"),
            entry(4, formatTurnLogHeader("🔴", "Orc", 1)),
            entry(3, "🟢 Fairy waits (hourglass)"),
            entry(2, formatTurnLogHeader("🟢", "Fairy", 1)),
            entry(1, "🟢 Fairy spawned at (1, 3)"),
            entry(0, "Fight started!"),
        ];
        const groups = groupFightLogEntries(lines, (e) => e.text);

        expect(groups).toHaveLength(3);
        expect(groups[0].headerLabel).toBe("🔴 Orc — Lap 1");
        expect(groups[0].headerEntry?.id).toBe(4);
        // Inside the turn, rows read chronologically: move first, strike second.
        expect(groups[0].entries.map((e) => e.id)).toEqual([5, 6]);
        expect(groups[1].headerLabel).toBe("🟢 Fairy — Lap 1");
        expect(groups[1].entries.map((e) => e.id)).toEqual([3]);
        // The pre-turn block has no header and also reads chronologically.
        expect(groups[2].headerLabel).toBeUndefined();
        expect(groups[2].entries.map((e) => e.id)).toEqual([0, 1]);
    });

    test("a stream with no headers is one headerless chronological block", () => {
        const lines = [entry(1, "B"), entry(0, "A")];
        const groups = groupFightLogEntries(lines, (e) => e.text);
        expect(groups).toHaveLength(1);
        expect(groups[0].headerLabel).toBeUndefined();
        expect(groups[0].entries.map((e) => e.text)).toEqual(["A", "B"]);
    });

    test("a header with no rows yet still opens an (empty) group — the turn just started", () => {
        const lines = [entry(1, formatTurnLogHeader("🟢", "Fairy", 3)), entry(0, "Fight started!")];
        const groups = groupFightLogEntries(lines, (e) => e.text);
        expect(groups).toHaveLength(2);
        expect(groups[0].headerLabel).toBe("🟢 Fairy — Lap 3");
        expect(groups[0].entries).toEqual([]);
    });
});

describe("fightLogExportLine", () => {
    test("headers export as dividers, other lines verbatim", () => {
        expect(fightLogExportLine(formatTurnLogHeader("🟢", "Fairy", 2))).toBe("── 🟢 Fairy — Lap 2 ──");
        expect(fightLogExportLine("🟢 Fairy ⚔️ Orc (12)")).toBe("🟢 Fairy ⚔️ Orc (12)");
    });
});

describe("fightLogClipboardText", () => {
    test("exports oldest-first with turn headers as dividers", () => {
        const newestFirst = ["Wolf bit Peasant for 12", `${TURN_LOG_HEADER_PREFIX}🔴 Wolf — Lap 1`, "Fight started!"];
        expect(fightLogClipboardText(newestFirst)).toBe(
            ["Fight started!", "── 🔴 Wolf — Lap 1 ──", "Wolf bit Peasant for 12"].join("\n"),
        );
        expect(fightLogClipboardText([])).toBe("");
    });
});
