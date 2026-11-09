import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { premiumBriefingPlan, premiumSandboxVersion, type PremiumSandboxState } from "./premiumBriefing";
import { PremiumSandboxHelp } from "./PremiumSandboxHelp";

const empty: PremiumSandboxState = {
    left: 0,
    right: 0,
    started: false,
    finished: false,
    lap: 0,
    map: 1,
    visibleQueue: [],
};

test("an empty sandbox explains how to place both armies without making an AI request", () => {
    const plan = premiumBriefingPlan(undefined, empty);
    expect(plan.title).toBe("Set up a fight");
    expect(plan.question).toBeUndefined();
    const html = renderToStaticMarkup(<PremiumSandboxHelp plan={plan} sandbox={empty} />);
    expect(html).toContain("Pick your creatures");
    expect(html).toContain("six creature stacks per side");
    expect(html).toContain("two level 1, two level 2, one level 3 and one level 4");
    expect(html).toContain("Start when ready");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<form");
});

test("sandbox setup help follows the placed stacks and never invents a battle strategy before combat", () => {
    const partial = { ...empty, left: 3 };
    expect(premiumBriefingPlan(undefined, partial).title).toBe("Add the other army");
    const ready = premiumBriefingPlan(undefined, { ...partial, right: 6 });
    expect(ready.title).toBe("Before you start");
    expect(ready.question).toBeUndefined();
    expect(renderToStaticMarkup(<PremiumSandboxHelp plan={ready} sandbox={{ ...partial, right: 6 }} />)).toContain(
        "3 green stacks",
    );
});

test("ranked briefings use the right stage, evidence and visibility safeguards within the API limit", () => {
    const expected = [
        [undefined, "Match plan"],
        ["draft", "Draft plan"],
        ["setup", "Army setup"],
        ["board", "Placement plan"],
        ["fight", "Battle strategy"],
        ["finished", "Battle review"],
    ] as const;
    for (const [stage, title] of expected) {
        const plan = premiumBriefingPlan(stage);
        expect(plan.title).toBe(title);
        expect(plan.steps).toBeUndefined();
        expect(plan.question!.length).toBeLessThanOrEqual(600);
        expect(plan.question).toContain("premium_gameplay_evidence");
        expect(plan.question).toContain("Never invent win odds or hidden enemy information");
        expect(plan.question).toContain("no follow-up questions");
    }
    expect(premiumBriefingPlan("fight").question).toContain("rather than only the acting unit's next move");
    expect(premiumBriefingPlan("finished").question).toContain("Do not reconstruct unobserved turns");
});

test("sandbox combat context stays explicitly partial, bounded and separate from ranked authority", () => {
    const state = {
        ...empty,
        started: true,
        lap: 3,
        visibleQueue: Array.from({ length: 40 }, (_, i) => ({
            name: `Creature ${i} ${"long name ".repeat(5)}`,
            team: "green" as const,
            amount: 8,
        })),
    };
    const plan = premiumBriefingPlan(undefined, state);
    expect(plan.title).toBe("Practice strategy");
    expect(plan.question!.length).toBeLessThanOrEqual(600);
    expect(plan.question).toContain("client-supplied sandbox queue, not a complete live board");
    expect(plan.question).toContain("Do not infer positions, effects, spell charges, missing units or win odds");
    expect(plan.question).not.toContain("Creature 39");
    expect(premiumSandboxVersion({ ...state, lap: 4 })).not.toBe(premiumSandboxVersion(state));
    expect(premiumBriefingPlan(undefined, { ...state, finished: true }).question).toContain("lesson, not an action");
});
