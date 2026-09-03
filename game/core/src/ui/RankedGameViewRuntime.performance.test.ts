import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "RankedGameViewRuntime.tsx"), "utf8");

describe("ranked background work", () => {
    test("pauses fallback snapshots in hidden tabs and catches up on return", () => {
        const poll = source.slice(source.indexOf("const pollSnapshot ="), source.indexOf("}, [refreshSnapshot"));

        expect(poll).toContain("if (document.hidden) return");
        expect(poll).toContain('document.addEventListener("visibilitychange", onVisibilityChange)');
        expect(poll).toContain('document.removeEventListener("visibilitychange", onVisibilityChange)');
    });

    test("runs the augment countdown only during a timed placement phase", () => {
        const timer = source.slice(source.indexOf("const [augmentNowMs"), source.indexOf("const augmentSecondsLeft"));

        expect(timer).toContain("snapshot.phase !== PlayPhase.PLACEMENT");
        expect(timer).toContain("snapshot.placementDeadlineMs <= 0");
        expect(timer).toContain("[snapshot.phase, snapshot.placementDeadlineMs]");
    });

    test("fully disarms presence and countdown intervals while the tab is hidden", () => {
        expect(source.match(/startVisibleInterval\(ping(?:Model|Human)Player, 8_000\)/g)).toHaveLength(2);
        expect(source).toContain("startVisibleInterval(() => setNowMs(Date.now()), 1000)");
        expect(source).toContain("startVisibleInterval(() => setAugmentNowMs(Date.now()), 1000)");
    });
});
