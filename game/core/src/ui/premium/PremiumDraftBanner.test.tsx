import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { PremiumAdvice, PremiumChoice } from "../../api/premium_client";
import { PremiumDraftBanner } from "./PremiumAdvisor";
import { PremiumSearchPromptContext } from "./PremiumSearchPromptContext";

const render = (
    active: boolean,
    isYourTurn: boolean,
    choices: PremiumChoice[] = [
        { kind: "creature", value: 1, label: "First choice", reasons: ["Fits the current army"] },
    ],
) => {
    const advice: PremiumAdvice = {
        entitlement: { active, reason: "test" },
        revision: "draft-test",
        choices,
    };
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "premium-draft" })}>
            <PremiumSearchPromptContext.Provider
                value={() => {
                    throw new Error("Draft reasons must already be loaded");
                }}
            >
                <PremiumDraftBanner
                    advice={advice}
                    draft={{
                        gameId: "draft-test",
                        picked: [],
                        opponentPicked: [],
                        artifactTier1: 0,
                        artifactTier2: 0,
                        isYourTurn,
                    }}
                />
            </PremiumSearchPromptContext.Provider>
        </CacheProvider>,
    );
};

test.each([true, false])("draft guidance stays available while isYourTurn=%s", (isYourTurn) => {
    const html = render(true, isYourTurn);
    expect(html).toContain('aria-label="Premium draft assessment"');
    expect(html).toContain("Draft planner");
    expect(html).toContain("Live draft projected battlefield");
    expect(html).toContain("Collapse draft planner");
    expect(html).toContain("Move draft planner with arrow keys or drag");
    expect(html).toContain("Match synergies");
    expect(html).toContain("position:fixed");
    expect(html).toContain("right:18px");
    expect(html).toContain("bottom:72px");
    expect(html).not.toContain("left:18px");
});

test("draft guidance respects inactive Premium access", () => {
    expect(render(false, true)).not.toContain('aria-label="Premium draft assessment"');
});

const recommendations = (count: number): PremiumChoice[] =>
    Array.from({ length: count }, (_, i) => ({
        kind: "creature",
        value: i + 1,
        label: `Choice ${i + 1}`,
        reasons: [`Army fit for choice ${i + 1}`, `Artifact fit for choice ${i + 1}`],
    }));

test.each([2, 3])("all %i recommended units have their reasons in the initial panel", (count) => {
    const html = render(true, true, recommendations(count));
    expect(html).toContain('aria-label="Recommended draft choices"');
    expect(html.match(/<li /g)).toHaveLength(count);
    for (let i = 1; i <= count; i++) {
        expect(html).toContain(`Army fit for choice ${i}`);
        expect(html).toContain(`Artifact fit for choice ${i}`);
    }
    expect(html).not.toContain("Explain choice");
    expect(html).not.toContain("Explain this choice");
});

test("the panel only presents the current top three choices", () => {
    const html = render(true, true, recommendations(4));
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).not.toContain("Army fit for choice 4");
});

test("old recommendations disappear while waiting for the opponent or the next advice response", () => {
    expect(render(true, false, recommendations(3))).not.toContain("Army fit for choice");
    expect(render(true, true, [])).not.toContain('aria-label="Recommended draft choices"');
});

test.each([
    ["bundle", 2, 1],
    ["artifact", 3, 2],
] as const)("%s reasons match the limited card recommendations", (kind, count, shown) => {
    const choices = recommendations(count).map((choice) => ({ ...choice, kind }));
    const html = render(true, true, choices);
    expect(html.match(/<li /g)).toHaveLength(shown);
    for (let i = 1; i <= shown; i++) expect(html).toContain(`Army fit for choice ${i}`);
    expect(html).not.toContain(`Army fit for choice ${shown + 1}`);
});
