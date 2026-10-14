import { describe, expect, test } from "bun:test";

import { normalizePlayerMetrics } from "../../api/player_metrics_contract";
import { buildMockPlayerMetrics } from "./mockPlayerMetrics";
import { renderPlayerPlaystyle } from "./renderPlayerPlaystyle";

describe("player playstyle presentation", () => {
    test("mock presets use the real wire contract and summary math", () => {
        for (const kind of ["adaptive", "ranged", "magic", "new"] as const)
            expect(normalizePlayerMetrics(buildMockPlayerMetrics(kind))).not.toBeNull();
        expect(buildMockPlayerMetrics("ranged").versatility).toBe(0);
        expect(buildMockPlayerMetrics("adaptive").versatility).toBeGreaterThan(0);
        expect(buildMockPlayerMetrics("new").versatility).toBeNull();
    });
    test("shows independent army axes and excludes automation from decision shares", () => {
        const markup = renderPlayerPlaystyle(buildMockPlayerMetrics());
        expect(markup).toContain("Army preferences");
        expect(markup).toContain("Roles overlap");
        expect(markup).toContain("400 human decisions");
        expect(markup).toContain("40 AI decisions excluded");
        expect(markup).toContain("55%");
        expect(markup).toContain("168,400");
        expect(markup).toContain('role="img"');
    });
    test("the compact player-card variant preserves sample coverage and pending scores", () => {
        const markup = renderPlayerPlaystyle(buildMockPlayerMetrics("new"), "en", "ready", true);
        expect(markup).toContain("hoc-playstyle--compact");
        expect(markup).toContain("hoc-playstyle--pending");
        expect(markup).toContain("3/20 with recorded battle data");
        expect(markup).toContain("Available after 5 recorded battles");
    });
    test("missing data and small samples never masquerade as a zero score", () => {
        expect(renderPlayerPlaystyle(null)).not.toContain("<svg");
        expect(renderPlayerPlaystyle(buildMockPlayerMetrics("new"))).toContain("Available after 5 recorded battles");
        expect(renderPlayerPlaystyle(null, "en", "error")).toContain("temporarily unavailable");
        expect(renderPlayerPlaystyle(buildMockPlayerMetrics(), "ru")).toContain("Предпочтения армии");
        const russian = renderPlayerPlaystyle(buildMockPlayerMetrics(), "ru-RU");
        expect(russian).toContain("Предпочтения армии");
        expect(russian).not.toContain("Army preferences");
        expect(renderPlayerPlaystyle(null, "ru-RU", "error")).not.toContain("temporarily unavailable");
    });
});
