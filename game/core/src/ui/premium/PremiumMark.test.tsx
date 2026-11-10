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

test("all creature recommendations retain thumbs in AI order within their own kind", () => {
    const html = render([
        { kind: "artifact", value: 1, label: "Artifact", reasons: [] },
        creature(3),
        creature(1),
        creature(4),
        creature(2),
    ]);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(4);
    expect(html).toContain("Premium: gold, #1 Creature 3. Why?");
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
    expect(html).not.toContain("bronze");
    expect(html).toContain("Premium: silver, #3 Creature 4. Why?");
    expect(html.match(/data-thumb-direction="mirrored"/g)).toHaveLength(4);
    expect(html).toContain("Premium: silver, #4 Creature 2. Why?");
    expect(html).toContain("Explain Creature 5 with Premium");
    expect(html).not.toContain("Ask Premium");
});

test("missing AI advice never invents a recommendation from available offers", () => {
    expect(render([])).not.toContain("data-recommendation-medal");
});

test("both advised creature choices keep their gold and silver thumbs", () => {
    const choices = [creature(3), creature(1)];
    const html = render(choices, choices);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(2);
    expect(html).toContain("Premium: gold, #1 Creature 3. Why?");
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
});

test("two ranked recommendations among more offers keep both medals", () => {
    const html = render([creature(3), creature(1)], [creature(1), creature(2), creature(3)]);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(2);
    expect(html).toContain("Premium: silver, #2 Creature 1. Why?");
});

test("both starting bundles keep recommendation thumbs when both are advised", () => {
    const choices: PremiumChoice[] = [0, 1].map((value) => ({
        kind: "bundle",
        value,
        label: `Bundle ${value}`,
        reasons: [],
    }));
    const html = render(choices, choices, "bundle");
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(2);
    expect(html).toContain("Premium: gold, #1 Bundle 0. Why?");
    expect(html).toContain("Premium: silver, #2 Bundle 1. Why?");
    expect(html).not.toContain("Ask Premium");
});

test("every advised artifact gets the same thumb styling and per-kind order", () => {
    const choices: PremiumChoice[] = [
        creature(4),
        { kind: "artifact", value: 3, label: "Artifact 3", reasons: ["First artifact reason"] },
        { kind: "artifact", value: 1, label: "Artifact 1", reasons: ["Second artifact reason"] },
        { kind: "artifact", value: 2, label: "Artifact 2", reasons: ["Third artifact reason"] },
    ];
    const html = render(choices, choices, "artifact");
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(3);
    expect(html.match(/data-thumb-direction="mirrored"/g)).toHaveLength(3);
    expect(html).toContain("Premium: gold, #1 Artifact 3. Why?");
    expect(html).toContain("Premium: silver, #2 Artifact 1. Why?");
    expect(html).toContain("Premium: silver, #3 Artifact 2. Why?");
    expect(html).not.toContain(">Preferred<");
});

test("an unadvised offer keeps its explanation entry without inventing a thumb", () => {
    const html = render([creature(3)], [creature(3), creature(5)]);
    expect(html.match(/data-recommendation-medal=/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Explain Creature 5 with Premium"');
    expect(html).not.toContain('data-testid="premium-creature-5"');
});
