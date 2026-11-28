import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { DraftPlannerBoard, defaultDraftPlannerSize } from "./PremiumDraftPlanner";
import { projectPremiumDraft } from "./premiumDraftProjection";

const stack = (creature: number, width: number, height: number, x: number, y: number, id = String(creature)) => ({
    id,
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

test("the board takes the window's full width instead of leaving empty columns beside it", () => {
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
            <DraftPlannerBoard plan={plan} showPlan={false} />
        </CacheProvider>,
    );
    expect(html).not.toContain("max-width");
    expect(html).toContain("aspect-ratio:1");
});

test("the default planner window is tall enough for its full-width board, and narrows on a short screen", () => {
    const gutter = 36,
        chrome = 192;
    const roomy = defaultDraftPlannerSize({ width: 1920, height: 1080 });
    expect(roomy.width).toBe(640);
    expect(roomy.height).toBe(640 - gutter + chrome);
    const short = defaultDraftPlannerSize({ width: 1440, height: 700 });
    // The square board (width minus gutter) plus its chrome still fits the 676px the viewport leaves.
    expect(short.height).toBe(676);
    expect(short.width - gutter + chrome).toBeLessThanOrEqual(short.height);
    expect(short.width).toBe(676 - chrome + gutter);
    const phone = defaultDraftPlannerSize({ width: 360, height: 800 });
    expect(phone.width).toBe(336);
});

test("a planned Placement upgrade draws the extra zone cells hatched and names it beside your side", () => {
    const plan = projectPremiumDraft(
        {
            gameId: "planned-zone",
            picked: [],
            opponentPicked: [],
            artifactTier1: 0,
            artifactTier2: 0,
            isYourTurn: true,
        },
        [{ kind: "Placement", value: 2 }],
    );
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "planner-zone" })}>
            <DraftPlannerBoard plan={plan} showPlan={false} />
        </CacheProvider>,
    );
    expect(html).toContain('data-board-zone-upgrade="planned"');
    expect(html).toContain("planned Placement 2");
    // Placement 2 opens six full-height columns, edge column A included (96 cells); the base 3-column zone holds 42.
    expect(html.match(/data-zone-cell="planned"/g)).toHaveLength(96 - 42);
});

test("a split creature renders one board token per stack, each with its own amount", () => {
    const plan = {
        own: [stack(36, 1, 1, 1, 7), { ...stack(36, 1, 1, 1, 12, "36:split:1"), amount: 1 }],
        enemy: [],
        arrows: [],
        synergies: [],
        artifacts: [],
        steps: [],
    } as unknown as React.ComponentProps<typeof DraftPlannerBoard>["plan"];
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "planner-split" })}>
            <DraftPlannerBoard plan={plan} showPlan={false} selected="own:36:split:1" />
        </CacheProvider>,
    );
    expect(html.match(/aria-label="Your Unit 36, Front line, projected \d+ creatures"/g)).toEqual([
        'aria-label="Your Unit 36, Front line, projected 12 creatures"',
        'aria-label="Your Unit 36, Front line, projected 1 creatures"',
    ]);
    expect(Array.from(html.matchAll(/<b[^>]*data-stack-count[^>]*>(\d+)<\/b>/g), (match) => match[1])).toEqual([
        "12",
        "1",
    ]);
    // Selection is per stack: only the split-off token is pressed.
    expect(html.match(/aria-pressed="(true|false)"/g)).toEqual(['aria-pressed="false"', 'aria-pressed="true"']);
});
