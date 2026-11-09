import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Artifact } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import type { PremiumAdvice } from "../../api/premium_client";
import { PremiumContext } from "../premium/PremiumAdvisor";
import { PremiumSearchPromptContext } from "../premium/PremiumSearchPromptContext";
import { ArtifactPanel } from "./runtime";

test("actual artifact cards show a thumb for every advised offer", () => {
    const artifacts = Artifact.TIER2_ARTIFACT_LIST.slice(0, 3);
    const advice: PremiumAdvice = {
        entitlement: { active: true, reason: "test" },
        revision: "artifact-test",
        choices: artifacts.map(({ id, name }) => ({
            kind: "artifact",
            value: id,
            label: name,
            reasons: ["Fits the current army"],
        })),
    };
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "artifact-premium" })}>
            <PremiumSearchPromptContext.Provider value={() => {}}>
                <PremiumContext.Provider value={advice}>
                    <ArtifactPanel
                        disabled={false}
                        selected={artifacts[1].id}
                        offered={artifacts.map(({ id }) => id)}
                        onSelect={() => {}}
                    />
                </PremiumContext.Provider>
            </PremiumSearchPromptContext.Provider>
        </CacheProvider>,
    );
    expect(html.match(/data-recommendation-medal="gold"/g)).toHaveLength(1);
    expect(html.match(/data-recommendation-medal="silver"/g)).toHaveLength(2);
    expect(html.match(/data-thumb-direction="mirrored"/g)).toHaveLength(3);
    expect(html.match(/data-touch-draft-choice="true"/g)).toHaveLength(3);
    for (const { id } of artifacts) {
        expect(html).toContain(`data-testid="premium-artifact-${id}"`);
    }
});
