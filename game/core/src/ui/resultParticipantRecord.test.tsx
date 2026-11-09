import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { TeamVals } from "@heroesofcrypto/common";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { ResultParticipantCard } from "./FightFinishedOverlay";

const render = (isAi: boolean, withProfile: boolean) =>
    renderToStaticMarkup(
        <CacheProvider value={createCache({ key: "result-record" })}>
            <ResultParticipantCard
                participant={{
                    team: TeamVals.LEFT,
                    playerId: "human",
                    username: isAi ? "AI" : "RuneWarden",
                    isAi,
                    calibration: false,
                    showRewards: false,
                    settled: false,
                    result: "win",
                    profile: withProfile
                        ? { playerId: "human", username: "RuneWarden", wins: 86, draws: 9, losses: 61, winRatePct: 55 }
                        : undefined,
                }}
            />
        </CacheProvider>,
    );

test("practice result cards retain the human record and win rate without ranked rewards", () => {
    const html = render(false, true);
    expect(html).toContain("W86 T9 L61");
    expect(html).toContain("55%");
    expect(html).toContain("WIN RATE");
    expect(html).not.toContain("MMR");
});

test("unknown guest records stay hidden and AI seats do not inherit the human's profile", () => {
    const guest = render(false, false);
    expect(guest).toContain("RuneWarden");
    expect(guest).not.toContain("data-player-ranked-record");
    expect(guest).not.toContain("WIN RATE");
    expect(guest).not.toContain("—%");
    expect(render(true, true)).not.toContain("data-player-ranked-record");
});
