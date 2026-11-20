import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { DraftPlannerBoard } from "./PremiumDraftPlanner";

const stack = (creature: number, width: number, height: number, x: number, y: number) => ({
    creature,
    name: `Unit ${creature}`,
    role: "Front line",
    amount: 12,
    width,
    height,
    position: { x, y },
});

test("rectangular bodies show one square portrait per cell; square bodies show one portrait", () => {
    const plan = {
        own: [stack(11, 2, 1, 3, 10), stack(1, 1, 1, 2, 6), stack(4, 2, 2, 3, 3)],
        enemy: [stack(27, 2, 1, 13, 10)],
        arrows: [],
        synergies: [],
        artifacts: [],
        steps: [],
    } as unknown as React.ComponentProps<typeof DraftPlannerBoard>["plan"];
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "planner-board" })}>
            <DraftPlannerBoard plan={plan} showPlan={false} />
        </CacheProvider>,
    );
    expect(html.match(/data-portrait-tiles="(\d+)"/g)).toEqual([
        'data-portrait-tiles="2"',
        'data-portrait-tiles="1"',
        'data-portrait-tiles="1"',
        'data-portrait-tiles="2"',
    ]);
});

test("the board never grows past the size that fits the planner window", () => {
    const plan = {
        own: [],
        enemy: [],
        arrows: [],
        synergies: [],
        artifacts: [],
        steps: [],
    } as unknown as React.ComponentProps<typeof DraftPlannerBoard>["plan"];
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "planner-fit" })}>
            <DraftPlannerBoard plan={plan} showPlan={false} maxSize={420} />
        </CacheProvider>,
    );
    expect(html).toContain("max-width:420px");
});
