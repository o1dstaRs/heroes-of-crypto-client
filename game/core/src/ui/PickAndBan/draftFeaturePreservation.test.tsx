import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Artifact, CreatureLevelList, GridVals, PickPhaseVals, TeamVals } from "@heroesofcrypto/common";
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
const { default: StainedGlassWindow, OpponentDraftBar } = await import("./runtime");

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

test("the live draft exposes the server's authorized future-level bans through its ban summary", () => {
    const html = render({ ...draft, doctrine: 2, banned: [CreatureLevelList[1][0], CreatureLevelList[4][0]] });
    expect(html).toContain('data-testid="draft-ban-summary"');
    expect(html).toContain("Level 4");
    expect(html.match(/<button /g)).toHaveLength(1);
});

test("the live draft cannot invent future bans absent from its private stream", () => {
    const html = render({ ...draft, doctrine: 3, banned: [CreatureLevelList[1][0]] });
    expect(html).toContain('data-testid="draft-ban-summary"');
    expect(html).not.toContain("Level 4</");
});

const renderOpponent = (artifacts: { artifactTier1?: number; artifactTier2?: number }): string =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "opponent-artifacts" })}>
            <OpponentDraftBar
                opponentPicked={[12, 33, 24, 51, 17, 40]}
                opponentLabel="Opponent"
                watchedSlots={[0, 1, 2, 3, 4, 5]}
                {...artifacts}
            />
        </CacheProvider>,
    );

test("the augment opponent rail shows both artifact images and accessible names", () => {
    const tier1 = Artifact.Tier1Artifact.AMULET_OF_RESOLVE;
    const tier2 = Artifact.Tier2Artifact.TITAN_PLATE;
    const html = renderOpponent({ artifactTier1: tier1, artifactTier2: tier2 });
    expect(html).toContain(`alt="${Artifact.TIER1_ARTIFACTS[tier1].name}"`);
    expect(html).toContain(`alt="${Artifact.TIER2_ARTIFACTS[tier2].name}"`);
    expect(html.match(/aria-label="Tier-[12] artifact:/g)).toHaveLength(2);
});

test("the pick-phase opponent rail does not invent artifact slots before the reveal", () => {
    const html = renderOpponent({});
    expect(html).not.toContain('aria-label="Tier-1 artifact:');
    expect(html).not.toContain('aria-label="Tier-2 artifact:');
});

test("missing or unknown artifacts leave safe empty slots in the setup recap", () => {
    const html = renderOpponent({ artifactTier1: 0, artifactTier2: 999999 });
    expect(html).toContain('aria-label="Tier-1 artifact: none picked"');
    expect(html).toContain('aria-label="Tier-2 artifact: none picked"');
});

test("scouting bans stay between the armies and the choices throughout picks", () => {
    for (const doctrine of [1, 2]) {
        for (const pickPhase of [PickPhaseVals.INITIAL_PICK, PickPhaseVals.PICK, PickPhaseVals.ARTIFACT_2]) {
            const html = render({ ...draft, doctrine, pickPhase, requiredLevel: 1, banned: [CreatureLevelList[4][0]] });
            const bans = html.indexOf('data-testid="draft-ban-summary"');
            expect(bans).toBeGreaterThan(html.indexOf('data-testid="draft-armies-zone"'));
            expect(bans).toBeLessThan(html.indexOf('data-testid="draft-choice-action-zone"'));
            expect(html).not.toContain("<details");
        }
    }
});
