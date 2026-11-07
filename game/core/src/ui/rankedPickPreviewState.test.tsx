import { expect, test } from "bun:test";
import {
    getCreatureLevel,
    LIVE_AUTO_BANS_BY_LEVEL,
    PickPhaseVals,
    TeamVals,
    transitionServerPersistedPickSim,
} from "@heroesofcrypto/common";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
    PremiumContext,
    PremiumDraftBanner,
    PremiumMark,
    PremiumShield,
    usePremiumAdvisor,
} from "./premium/PremiumAdvisor";
import { PremiumPreviewContext } from "./premium/PremiumPreviewContext";
import { createRankedPickPreview, rankedPickPreviewAdvice, rankedPickPreviewView } from "./rankedPickPreviewState";

for (const level of [1, 2, 3, 4]) {
    test(`L${level} preview follows ranked bans, private information and legal recommendations`, () => {
        const state = createRankedPickPreview(level);
        expect(state).toEqual(createRankedPickPreview(level));
        const view = rankedPickPreviewView(state);
        expect(view.pickPhase).toBe(PickPhaseVals.PICK);
        expect(view.requiredLevel).toBe(level);
        expect(view.isYourTurn).toBe(true);
        expect(view.picked).toHaveLength(level + 1);
        expect([1, 2, 3, 4].map((tier) => view.banned.filter((id) => getCreatureLevel(id) === tier).length)).toEqual([
            ...LIVE_AUTO_BANS_BY_LEVEL,
        ]);
        expect(view.watchedSlots).toEqual([0, 1, 2, 3, 4, 5]);
        expect(view.opponentPicked.filter(Boolean)).toEqual(state.right.creatures);
        expect(view.picked.some((id) => view.banned.includes(id))).toBe(false);
        const advice = rankedPickPreviewAdvice(state, `preview-ranked-level${level}`);
        expect(advice.adviceId).toBeUndefined(); // Preview impressions must never become server telemetry.
        expect(advice.scouting?.bannedCreatureIds).toEqual(view.banned);
        expect(advice.choices).toHaveLength(3);
        for (const choice of advice.choices ?? []) {
            expect(
                transitionServerPersistedPickSim(
                    state,
                    {
                        type: "pick_creature",
                        team: TeamVals.LEFT,
                        creatureId: choice.value,
                    },
                    () => 0,
                ).status,
            ).toBe("accepted");
        }
        const rejected = transitionServerPersistedPickSim(
            state,
            {
                type: "pick_creature",
                team: TeamVals.LEFT,
                creatureId: view.banned.find((id) => getCreatureLevel(id) === level)!,
            },
            () => 0,
        );
        expect(rejected.status).toBe("rejected");
        expect(rejected.state).toEqual(state);
    });
}

test("the real ranked Premium components render only inside the preview's scope", () => {
    const state = createRankedPickPreview(1);
    const advice = rankedPickPreviewAdvice(state, "preview-ranked-level1");
    const choice = advice.choices![0];
    const Probe = () => {
        const premium = usePremiumAdvisor(advice.gameId);
        return (
            <PremiumContext.Provider value={premium.advice}>
                <PremiumShield testOnly />
                <PremiumMark kind="creature" value={choice.value} />
                <PremiumDraftBanner advice={premium.advice} draft={rankedPickPreviewView(state)} />
            </PremiumContext.Provider>
        );
    };
    const preview = renderToStaticMarkup(
        <PremiumPreviewContext.Provider value={advice}>
            <Probe />
        </PremiumPreviewContext.Provider>,
    );
    expect(preview).toContain('aria-label="Premium account"');
    expect(preview).toContain('aria-label="Premium draft assessment"');
    expect(preview).toContain(`premium-creature-${choice.value}`);
    expect(renderToStaticMarkup(<Probe />)).toBe("");
});
