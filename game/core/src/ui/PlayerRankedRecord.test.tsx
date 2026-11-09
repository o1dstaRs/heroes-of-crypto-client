import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { PlayerRankedRecord, rankedRecordText } from "./PlayerRankedRecord";

test("ranked records retain wins, ties, losses and a zero-percent win rate", () => {
    expect(rankedRecordText({ wins: 142, draws: 4, losses: 74, winRatePct: 64.5 })).toEqual({
        record: "W142 T4 L74",
        winRate: "65%",
    });
    expect(rankedRecordText({ wins: 0, draws: 0, losses: 12, winRatePct: 0 })).toEqual({
        record: "W0 T0 L12",
        winRate: "0%",
    });
});

test.each([
    undefined,
    {},
    { wins: 0, draws: 0, losses: 0, totalGames: 0, winRatePct: 0 },
    { wins: Number.NaN, losses: Infinity, draws: -2, winRatePct: Number.NaN },
])("missing or empty ranked history renders no stats: %j", (profile) => {
    expect(rankedRecordText(profile)).toEqual({ record: "", winRate: "" });
    for (const compact of [true, false]) {
        expect(renderToStaticMarkup(<PlayerRankedRecord profile={profile} color="#d3a65c" compact={compact} />)).toBe(
            "",
        );
    }
});

test("each statistic stays hidden until its own data is available", () => {
    const render = (profile: React.ComponentProps<typeof PlayerRankedRecord>["profile"]) =>
        renderToStaticMarkup(
            <CacheProvider value={createCache({ key: "partial-record" })}>
                <PlayerRankedRecord profile={profile} color="#d3a65c" compact={false} />
            </CacheProvider>,
        );
    const recordOnly = render({ wins: 0, draws: 0, losses: 12 });
    expect(recordOnly).toContain("W0 T0 L12");
    expect(recordOnly).not.toContain("data-player-win-rate");
    expect(recordOnly).not.toContain("WIN RATE");
    const rateOnly = render({ totalGames: 12, winRatePct: 0 });
    expect(rateOnly).toContain("0%");
    expect(rateOnly).not.toContain("data-player-record=");
});

test.each([true, false])("record and win rate are visible in the compact=%s player row", (compact) => {
    const html = renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "player-record" })}>
            <PlayerRankedRecord
                profile={{ wins: 86, draws: 9, losses: 61, winRatePct: 55 }}
                color="#d3a65c"
                compact={compact}
                reversed
            />
        </CacheProvider>,
    );
    expect(html).toContain("W86 T9 L61");
    expect(html).toContain("55%");
    expect(html).toContain("data-player-record");
    expect(html).toContain("data-player-win-rate");
    expect(html).not.toContain("text-overflow:ellipsis");
    if (!compact) expect(html).toContain("WIN RATE");
});
