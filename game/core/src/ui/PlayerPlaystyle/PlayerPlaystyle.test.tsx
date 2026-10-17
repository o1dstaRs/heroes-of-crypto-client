import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { buildMockPlayerMetrics } from "./mockPlayerMetrics";
import { PlayerPlaystyleView } from "./PlayerPlaystyle";

describe("playstyle refresh stability", () => {
    const metrics = buildMockPlayerMetrics();
    const render = (loading: boolean, error = "", data = metrics) =>
        renderToStaticMarkup(
            <PlayerPlaystyleView metrics={data} loading={loading} error={error} language="en" compact />,
        );

    test("keeps exactly the same chart while refreshing and after a failed refresh", () => {
        const ready = render(false);
        expect(ready).toContain("hoc-playstyle__radar");
        expect(render(true)).toBe(ready);
        expect(render(false, "Network unavailable")).toBe(ready);
    });

    test("does not flash a heading before loading or for a player without recorded battles", () => {
        let wraps = 0;
        for (const loading of [true, false]) {
            const html = renderToStaticMarkup(
                <PlayerPlaystyleView
                    metrics={null}
                    loading={loading}
                    error=""
                    language="en"
                    compact
                    wrap={(body) => {
                        wraps++;
                        return <section>Playstyle{body}</section>;
                    }}
                />,
            );
            expect(html).toBe("");
        }
        expect(wraps).toBe(0);
        expect(render(false, "", { ...metrics, recordedGames: 0, stylePct: null })).toBe("");
    });
});
