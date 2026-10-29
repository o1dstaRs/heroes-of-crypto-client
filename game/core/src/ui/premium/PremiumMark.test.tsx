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
const render = (choices: PremiumChoice[]) => {
    const advice: PremiumAdvice = {
        entitlement: { active: true, reason: "test" },
        revision: "test",
        choices,
        offers: [creature(5)],
    };
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "medal-test" })}>
            <PremiumSearchPromptContext.Provider value={() => {}}>
                <PremiumContext.Provider value={advice}>
                    {[1, 2, 3, 4, 5].map((value) => (
                        <PremiumMark key={value} kind="creature" value={value} />
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
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(3);
    expect(html).toContain("Premium: gold, #1 Creature 3. Why?");
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
    expect(html).toContain("Premium: bronze, #3 Creature 4. Why?");
    expect(html).not.toContain('data-testid="premium-creature-2"');
    expect(html).not.toContain("Ask Premium");
});

test("missing AI advice never invents a recommendation from available offers", () => {
    expect(render([])).not.toContain("data-recommendation-medal");
});
