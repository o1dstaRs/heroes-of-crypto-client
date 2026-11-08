import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { TeamVals } from "@heroesofcrypto/common";
import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

mock.module("./useFullscreenActive", () => ({ useFullscreenActive: () => true }));
const premium = await import("./premium/PremiumAdvisor");
mock.module("./premium/PremiumAdvisor", () => ({
    ...premium,
    PremiumShield: () => <span data-visible-premium-shield aria-label="Premium account" />,
}));
const { MatchupOverlay } = await import("./MatchupOverlay");

test.each(["pick", "fight"] as const)(
    "the %s VS strip renders both human records, percentages and Premium shields",
    (placement) => {
        const html = renderToStaticMarkup(
            <CacheProvider value={createCache({ key: "matchup-information" })}>
                <MatchupOverlay
                    placement={placement}
                    players={[
                        {
                            team: TeamVals.LEFT,
                            label: "RuneWarden",
                            previewProfile: {
                                playerId: "left",
                                username: "RuneWarden",
                                wins: 142,
                                draws: 4,
                                losses: 74,
                                winRatePct: 65,
                            },
                        },
                        {
                            team: TeamVals.RIGHT,
                            label: "Dreadwolf",
                            previewProfile: {
                                playerId: "right",
                                username: "Dreadwolf",
                                wins: 98,
                                draws: 8,
                                losses: 64,
                                winRatePct: 58,
                            },
                        },
                    ]}
                />
            </CacheProvider>,
        );
        expect(html).toContain("W142 T4 L74");
        expect(html).toContain("W98 T8 L64");
        expect(html).toContain("65%");
        expect(html).toContain("58%");
        expect(html.match(/data-player-ranked-record="/g)).toHaveLength(2);
        expect(html.match(/data-visible-premium-shield="true"/g)).toHaveLength(2);
    },
);
