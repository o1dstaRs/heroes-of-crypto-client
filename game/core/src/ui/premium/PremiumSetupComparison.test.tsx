import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { PremiumSetupComparison } from "./PremiumSetupComparison";

test("setup comparison shows the tradeoff and public artifact without inventing a win chance", () => {
    const markup = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "premium-compare-test" })}>
            <PremiumSetupComparison
                comparison={{
                    budget: 5,
                    selected: { spent: 2, remaining: 3 },
                    recommended: { spent: 2, remaining: 3 },
                    changes: [
                        {
                            kind: "Armor",
                            selectedLevel: 2,
                            recommendedLevel: 0,
                            pointChange: -2,
                            selectedEffect: "+13% base armor",
                            recommendedEffect: "No investment",
                            beneficiaries: ["Monk", "Healer"],
                        },
                    ],
                    publicOpponentArtifacts: [
                        {
                            tier: 2,
                            id: 16,
                            name: "Gravechain",
                            effect: "Cursed: each allied unit loses a movement step.",
                        },
                    ],
                    caveat: "Mechanical comparison, not a win-rate prediction.",
                }}
            />
        </CacheProvider>,
    );
    expect(markup).toContain("Compare with your build");
    expect(markup).toContain("-2");
    expect(markup).toContain("Current:");
    expect(markup).toContain("Proposed:");
    expect(markup).toContain("Gravechain");
    expect(markup).toContain("not a win-rate prediction");
});
