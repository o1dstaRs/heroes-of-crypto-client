import { expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

let mode = "accepted";
mock.module("react-router", () => ({
    useNavigate: () => () => {},
    useSearchParams: () => [new URLSearchParams({ mockMatch: mode }), () => {}],
}));
mock.module("./PlayerPortal/mockPortal", () => ({ isMockPortalEnabled: () => true }));
mock.module("./auth/context/auth_context", () => ({ useAuthContext: () => ({ user: { is_active: true } }) }));
mock.module("./useRankedSeason", () => ({ useRankedSeason: () => ({ currency: {}, snapshot: null }) }));
mock.module("./PlayerPortal/useRankedStanding", () => ({ useRankedStanding: () => undefined }));
mock.module("./GameSystemControls", () => ({ FULLSCREEN_CORNER_CLEARANCE: "3.5rem", FullscreenCorner: () => null }));
mock.module("./PlayerPortal/PlayerPortalSidebar", () => ({ PlayerPortalSidebar: () => null }));
mock.module("./ArenaChatPanel", () => ({ ArenaChatPanel: () => null }));
mock.module("./ArenaNavBar", () => ({ ArenaNavBar: () => null }));
mock.module("./MatchFoundOpponentPreview", () => ({ MatchFoundOpponentPreview: () => null }));
const { MatchmakingRoute } = await import("./MatchmakingRoute");

test("an accepted match fills the route with the draft waiting window instead of the arena", () => {
    mode = "accepted";
    const html = renderToStaticMarkup(<MatchmakingRoute />);
    expect(html).toContain('data-testid="draft-acceptance-window"');
    expect(html).toContain("Waiting for your opponent to accept");
    expect(html).toContain("You accepted");
    expect(html).toContain("Acceptance closes in 28s");
    expect(html).not.toContain("Accept ranked match");
    expect(html).not.toContain("Your rival is ready");
});

test("an unaccepted found match still presents its accept action", () => {
    mode = "found";
    const html = renderToStaticMarkup(<MatchmakingRoute />);
    expect(html).toContain("Accept ranked match");
    expect(html).toContain("Your rival is ready");
    expect(html).not.toContain('data-testid="draft-acceptance-window"');
});
