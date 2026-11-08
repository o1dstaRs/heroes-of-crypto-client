import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";
import { MemoryRouter } from "react-router";

import { InviteFriendBadge } from "./InviteFriendBadge";
import { PlayRankedBadge } from "./PlayRankedBadge";

test("Play Ranked retains the main footer's Invite a friend sizing, including fullscreen", () => {
    const render = (child: React.ReactNode) =>
        renderToStaticMarkup(
            <CacheProvider value={createCache({ key: "footer-parity" })}>
                <MemoryRouter>{child}</MemoryRouter>
            </CacheProvider>,
        );
    const ranked = render(<PlayRankedBadge />);
    const invite = render(<InviteFriendBadge />);
    for (const html of [ranked, invite]) {
        expect(html).toContain("font-size:min(0.924rem, 7.07cqw)");
        expect(html).toContain("height:clamp(30px, 16.84cqw, 35.2px)");
        // These sibling plates intentionally keep the same scale in fullscreen as in a normal window.
        expect(html).not.toContain("html:fullscreen");
        expect(html).not.toContain("html:-webkit-full-screen");
        expect(html).not.toContain("html[data-");
    }
    expect(ranked).toContain('aria-label="Play ranked (vs AI or vs another player)"');
});
