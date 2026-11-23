import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import { Artifact, CreatureVals } from "@heroesofcrypto/common";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { DraftBuildStrip } from "./DraftBuildStrip";
import type { PremiumDraftState } from "./premiumDraftAssessment";
import { projectPremiumDraft } from "./premiumDraftProjection";

const draft = (extra: Partial<PremiumDraftState> = {}): PremiumDraftState => ({
    gameId: "build-strip",
    picked: [],
    opponentPicked: [],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: true,
    ...extra,
});
const render = (element: React.ReactElement, key: string) =>
    renderToStaticMarkup(<CacheProvider value={createCache({ key })}>{element}</CacheProvider>);

test("an empty draft has no build row", () => {
    expect(render(<DraftBuildStrip plan={projectPremiumDraft(draft())} />, "strip-empty")).toBe("");
});

test("the build row shows picked artifacts, Premium's planned upgrades and the synergies the picks reach", () => {
    const tier1 = Artifact.TIER1_ARTIFACT_LIST[0].id;
    const plan = projectPremiumDraft(
        draft({ picked: [CreatureVals.PEASANT, CreatureVals.HEALER, CreatureVals.ORC], artifactTier1: tier1 }),
        [
            { kind: "Placement", value: 2 },
            { kind: "Movement", value: 2 },
        ],
    );
    const html = render(<DraftBuildStrip plan={plan} />, "strip-full");
    expect(html).toContain('data-build-chip="artifact-t1"');
    expect(html).not.toContain('data-build-chip="artifact-t2"');
    // Planned upgrades are dashed: they are Premium's plan, not choices the player has made.
    expect(html).toMatch(/data-build-chip="upgrade-Placement" data-projected="true"/);
    expect(html).toContain("Planned: Placement 2, deeper deployment zone");
    expect(html).toContain("Planned: Movement 2");
    expect(html).toContain('aria-label="Premium&#x27;s upgrade plan"');
    // Peasant and Healer are Life: level 1. Orc alone is a Chaos step toward level 1.
    expect(html).toMatch(
        /title="Life [^"]*: level 1,[^"]*" aria-label="[^"]*" role="img" data-build-chip="synergy-Life"/,
    );
    expect(html).toContain("<span>L1</span>");
    expect(html).toMatch(/data-build-chip="synergy-Chaos" data-projected="true"/);
    expect(html).toContain("<span>1/2</span>");
});

test("Premium's Tier-2 pick is shown as projected until a Tier-2 artifact is picked", () => {
    const offered = Artifact.TIER2_ARTIFACT_LIST[0].id;
    const choosing = render(
        <DraftBuildStrip plan={projectPremiumDraft(draft({ picked: [CreatureVals.ORC] }))} projectedTier2={offered} />,
        "strip-t2",
    );
    expect(choosing).toMatch(/data-build-chip="artifact-t2" data-projected="true"/);
    expect(choosing).toContain("T2?");
    const picked = render(
        <DraftBuildStrip
            plan={projectPremiumDraft(draft({ picked: [CreatureVals.ORC], artifactTier2: offered }))}
            projectedTier2={offered}
        />,
        "strip-t2-picked",
    );
    expect(picked).not.toContain("T2?");
    expect(picked).toContain('data-build-chip="artifact-t2"');
});
