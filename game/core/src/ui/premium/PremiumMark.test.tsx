import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { PremiumAdvice, PremiumChoice } from "../../api/premium_client";
import { PremiumContext, PremiumMark } from "./PremiumAdvisor";
import { PremiumSearchPromptContext } from "./PremiumSearchPromptContext";

const creature = (value: number): PremiumChoice => ({
    kind: "creature",
    value,
    label: `Creature ${value}`,
    reasons: ["Fits the current army."],
});
const render = (
    choices: PremiumChoice[],
    offers: PremiumAdvice["offers"] = [creature(5)],
    kind: PremiumChoice["kind"] = "creature",
) => {
    const advice: PremiumAdvice = {
        entitlement: { active: true, reason: "test" },
        revision: "test",
        choices,
        offers,
    };
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "medal-test" })}>
            <PremiumSearchPromptContext.Provider value={() => {}}>
                <PremiumContext.Provider value={advice}>
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                        <PremiumMark key={value} kind={kind} value={value} />
                    ))}
                </PremiumContext.Provider>
            </PremiumSearchPromptContext.Provider>
        </CacheProvider>,
    );
};

test("creature medals follow AI order, ignore other choice kinds and suppress lower offers", () => {
    const html = render([
        { kind: "artifact", value: 1, label: "Artifact", reasons: [] },
        creature(3),
        creature(1),
        creature(4),
        creature(2),
    ]);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(2);
    expect(html).toContain("Premium: gold, #1 Creature 3. Why?");
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
    expect(html).not.toContain("bronze");
    expect(html).not.toContain('data-testid="premium-creature-4"');
    expect(html.match(/data-thumb-direction="mirrored"/g)).toHaveLength(2);
    expect(html).not.toContain('data-testid="premium-creature-2"');
    expect(html).not.toContain("Ask Premium");
});

test("missing AI advice never invents a recommendation from available offers", () => {
    expect(render([])).not.toContain("data-recommendation-medal");
});

test("a creature choice out of two has only the gold thumb", () => {
    const choices = [creature(3), creature(1)];
    const html = render(choices, choices);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(1);
    expect(html).toContain("Premium: gold, #1 Creature 3. Why?");
    expect(html).not.toContain('data-testid="premium-creature-1"');
});

test("two ranked recommendations among more offers keep both medals", () => {
    const html = render([creature(3), creature(1)], [creature(1), creature(2), creature(3)]);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(2);
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
});

test("the one-of-two starting bundles have one gold thumb and no second callout", () => {
    const choices: PremiumChoice[] = [0, 1].map((value) => ({
        kind: "bundle",
        value,
        label: `Bundle ${value}`,
        reasons: [],
    }));
    const html = render(choices, choices, "bundle");
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(1);
    expect(html).toContain("Premium: gold, #1 Bundle 0. Why?");
    expect(html).not.toContain('data-testid="premium-bundle-1"');
    expect(html).not.toContain("Ask Premium");
});
