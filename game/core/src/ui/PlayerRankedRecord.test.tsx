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

test("missing profiles and invalid values stay unknown instead of inventing a record", () => {
    expect(rankedRecordText()).toEqual({ record: "W— T— L—", winRate: "—%" });
    expect(rankedRecordText({ wins: Number.NaN, losses: Infinity, draws: -2, winRatePct: Number.NaN })).toEqual({
        record: "W— T0 L—",
        winRate: "—%",
    });
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
