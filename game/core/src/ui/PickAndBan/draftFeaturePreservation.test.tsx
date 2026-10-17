import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { GridVals, PickPhaseVals, TeamVals } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";
import React, { createContext, useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { PickBanContext, type PickBanContextType } from "../context/PickBanContextDefs";

const advice = { recommendation: "preserved" };
const premiumContext = createContext<typeof advice | undefined>(undefined);
mock.module("../premium/PremiumAdvisor", () => ({
    PremiumContext: premiumContext,
    PremiumMark: () => <span data-recommendation={useContext(premiumContext)?.recommendation} />,
    PremiumDraftBanner: ({ advice: current }: { advice: typeof advice }) => (
        <div data-draft-advice={current.recommendation} />
    ),
    usePremiumAdvisor: () => ({ advice }),
}));
mock.module("../premium/usePremiumPreference", () => ({ usePremiumCapability: () => true }));
mock.module("../premium/PremiumSearchMatchContext", () => ({ useReportPremiumSearchMatch: () => {} }));
mock.module("../auth/context/auth_context", () => ({ useAuthContext: () => ({}) }));
mock.module("../MatchupOverlay", () => ({ PickMatchupOverlay: () => null }));
mock.module("../CreaturePortraitImage", () => ({ CreaturePortraitImage: () => null }));
mock.module("./PickLanternFire", () => ({ PickLanternFire: () => null }));
mock.module("./MapReveal", () => ({
    MapBadge: () => null,
    MapRevealModal: ({ mapType }: { mapType: number }) => <div data-map-reveal={mapType} />,
}));
mock.module("../GameSystemControls", () => ({
    GAME_SYSTEM_CONTROL_SIZE_PX: 32,
    GAME_SYSTEM_CONTROLS_BOTTOM_INSET: "1rem",
    GameSystemControls: () => null,
}));
const { default: StainedGlassWindow } = await import("./runtime");

const draft: PickBanContextType = {
    isConnected: true,
    events: [],
    error: null,
    banned: [],
    picked: [],
    opponentPicked: [],
    watchedSlots: [],
    isYourTurn: true,
    isAbandoned: false,
    pickPhase: PickPhaseVals.ARTIFACT_2,
    phaseIdentity: "artifact-step",
    initialBundles: [],
    tier2Offers: [1, 2, 3],
    doctrine: 1,
    upgradePoints: 0,
    artifactTier1: 0,
    artifactTier2: 0,
    requiredLevel: 0,
    mapType: GridVals.LAVA_CENTER,
    secondsRemaining: 30,
    revealsRemaining: 0,
    autoPickedSignal: 0,
};

const render = (state: PickBanContextType): string =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "draft-preservation" })}>
            <PickBanContext.Provider value={state}>
                <StainedGlassWindow gameId="match" userTeam={TeamVals.LEFT} />
            </PickBanContext.Provider>
        </CacheProvider>,
    );

test("draft keeps one commit action and connects premium advice to its cards and banner", () => {
    const html = render(draft);
    expect(html.match(/<button /g)).toHaveLength(1);
    expect(html.match(/data-recommendation="preserved"/g)).toHaveLength(3);
    expect(html.match(/data-draft-advice="preserved"/g)).toHaveLength(1);
    expect(html.match(/data-map-reveal="3"/g)).toHaveLength(1);
    expect(html).toContain("hocCommitAvailable");
});

test("waiting for the opponent keeps a single disabled commit action", () => {
    const html = render({ ...draft, isYourTurn: false, artifactTier2: 1 });
    expect(html.match(/<button /g)).toHaveLength(1);
    expect(html).toContain('disabled=""');
    expect(html).toContain("WAITING OPPONENT");
});
