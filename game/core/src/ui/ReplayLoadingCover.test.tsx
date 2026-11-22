import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { REPLAY_COVER_FADE_MS, REPLAY_COVER_LABEL_DELAY_MS, ReplayLoadingCover } from "./ReplayLoadingCover";

const render = (visible: boolean) =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: `replay-cover-${visible ? "up" : "down"}` })}>
            <ReplayLoadingCover visible={visible} />
        </CacheProvider>,
    );

test("the replay cover comes up at once and labels only a load long enough to notice", () => {
    const html = render(true);
    expect(html).toContain('aria-hidden="false"');
    expect(html).toContain("opacity:1");
    expect(html).toContain("transition:none");
    expect(html).toContain("Loading replay");
    // The label waits: a quick start shows a still dark frame, never a spinner that flashes and vanishes.
    expect(html).toContain(`${REPLAY_COVER_LABEL_DELAY_MS}ms forwards`);
});

test("the replay cover fades out onto the opening board and stops taking clicks", () => {
    const html = render(false);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("opacity:0");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain(`opacity ${REPLAY_COVER_FADE_MS}ms ease-out`);
    expect(html).not.toContain("Loading replay");
});
