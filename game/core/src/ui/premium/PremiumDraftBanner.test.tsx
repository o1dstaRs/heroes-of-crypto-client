import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { PremiumAdvice } from "../../api/premium_client";
import { PremiumDraftBanner } from "./PremiumAdvisor";

const render = (active: boolean, isYourTurn: boolean) => {
    const advice: PremiumAdvice = {
        entitlement: { active, reason: "test" },
        revision: "draft-test",
        choices: [{ kind: "creature", value: 1, label: "First choice", reasons: ["Fits the current army"] }],
    };
    return renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "premium-draft" })}>
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
        </CacheProvider>,
    );
};

test.each([true, false])("draft guidance stays available while isYourTurn=%s", (isYourTurn) => {
    const html = render(true, isYourTurn);
    expect(html).toContain('aria-label="Premium draft assessment"');
    expect(html).toContain("Premium · Draft so far");
    expect(html).toContain("position:fixed");
    expect(html).toContain("bottom:16px");
});

test("draft guidance respects inactive Premium access", () => {
    expect(render(false, true)).not.toContain('aria-label="Premium draft assessment"');
});
