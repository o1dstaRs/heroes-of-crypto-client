import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = readFileSync(join(import.meta.dir, "RankedGameViewRuntime.tsx"), "utf8");

describe("ranked background work", () => {
    test("animated replay prepares shared checkpoints before allocating snapshot fallback copies", () => {
        const play = source.slice(
            source.indexOf("const playLoadedRankedReplay ="),
            source.indexOf("const loadAndPlayReplay ="),
        );
        const opening = play.indexOf("getRankedReplayInitialSnapshot(replay)");
        const animated = play.indexOf("await manager.PlaySandboxReplay(sandboxReplay,");
        const fallback = play.indexOf("collectRankedReplaySnapshots(replay)");
        expect(opening).toBeGreaterThan(-1);
        expect(play).toContain("shareSnapshots: true");
        expect(animated).toBeGreaterThan(opening);
        expect(fallback).toBeGreaterThan(animated);
        expect(play.slice(animated, fallback)).toContain(
            'setStatus("Replay complete");\n                        return;',
        );
        const bootstrap = source.slice(source.indexOf("fetchRankedPlayReplay(gameId)\n            .then"));
        expect(bootstrap.slice(0, bootstrap.indexOf(".catch"))).toContain("getRankedReplayInitialSnapshot(replay)");
        expect(bootstrap.slice(0, bootstrap.indexOf(".catch"))).not.toContain("collectRankedReplaySnapshots");
    });

    test("every recurring timer pauses in hidden tabs", () => {
        // Snapshot polling, presence pings and countdowns all go through the visibility-aware interval;
        // a raw setInterval would keep polling and re-rendering a backgrounded tab.
        expect(source).toContain("startVisibleInterval(");
        expect(source).not.toContain("setInterval(");
    });
});
