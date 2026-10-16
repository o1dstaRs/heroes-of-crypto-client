import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.node";

import { PremiumMoveReview } from "./PremiumFightMoves";
import { PremiumSearchPromptContext } from "./PremiumSearchPromptContext";
import { currentPremiumTurnReview, type PremiumTurnReview } from "./PremiumTurnPreviewContext";
import type { PremiumSearchMatchVersion } from "./premiumSearchFreshness";

const turn: PremiumTurnReview = {
    gameId: "match",
    versionKey: "current-turn",
    actorName: "Angel",
    sequence: 7,
    lap: 2,
    unitId: "actor",
    status: "ready",
    options: [
        {
            id: "1111111111111111",
            label: "Attack Squire from (4, 5)",
            reasons: ["Preferred by combat search."],
            actions: [{ type: "melee_attack", attackerId: "actor", targetId: "enemy", attackFrom: { x: 4, y: 5 } }],
            assessment: {
                recommended: true,
                purpose: "attack",
                attackMode: 1,
                resources: {
                    usesAmmunition: false,
                    usesSpellCharge: false,
                    spendsSelfResurrection: false,
                    usesHourglass: false,
                    baseMoraleChange: 0,
                    baseLuckChange: 0,
                },
            },
        },
        {
            id: "2222222222222222",
            label: "Move to (3, 4)",
            reasons: ["The planned path crosses lava."],
            actions: [{ type: "move_unit", unitId: "actor", path: [{ x: 3, y: 4 }] }],
        },
        {
            id: "3333333333333333",
            label: "Cast Resurrection on Monk",
            reasons: [
                "Uses a spell charge.",
                "Spends this unit’s own resurrection charge, including its on-death resurrection.",
                ...Array.from({ length: 16 }, (_, i) => `Material warning ${i + 1}.`),
            ],
            actions: [{ type: "cast_spell", casterId: "actor", targetId: "ally", spellName: "Resurrection" }],
            assessment: {
                recommended: false,
                purpose: "ally-spell",
                attackMode: 1,
                resources: {
                    usesAmmunition: false,
                    usesSpellCharge: true,
                    spendsSelfResurrection: true,
                    usesHourglass: false,
                    baseMoraleChange: 0,
                    baseLuckChange: 0,
                },
            },
        },
    ],
};
const version: PremiumSearchMatchVersion = { gameId: "match", source: "play", key: "current-turn", stage: "fight" };

test("move reviews disappear as soon as the match, turn, stage or response stops matching", () => {
    expect(currentPremiumTurnReview(turn, "match", version)).toBe(turn);
    for (const change of [
        { key: "next-turn" },
        { gameId: "another-match" },
        { source: "draft" as const },
        { stage: "finished" as const },
        { stage: "board" as const },
    ]) {
        expect(currentPremiumTurnReview(turn, "match", { ...version, ...change })).toBeUndefined();
    }
    expect(currentPremiumTurnReview(turn, "another-match", version)).toBeUndefined();
    expect(currentPremiumTurnReview(turn, undefined, version)).toBeUndefined();
    expect(currentPremiumTurnReview(turn, "match", undefined)).toBeUndefined();
    expect(currentPremiumTurnReview({ ...turn, status: "waiting" }, "match", version)).toBeUndefined();
    expect(currentPremiumTurnReview({ ...turn, options: [] }, "match", version)).toBeUndefined();
});

test("the review numbers all three board choices and retains late risk and shared-use warnings", () => {
    const render = (canAsk: boolean) =>
        renderToStaticMarkup(
            <CacheProvider value={createCache({ key: "premium-moves-test" })}>
                <PremiumSearchPromptContext.Provider value={canAsk ? () => {} : undefined}>
                    <PremiumMoveReview turn={turn} />
                </PremiumSearchPromptContext.Provider>
            </CacheProvider>,
        );
    const html = render(true);
    expect(html).toContain("Review 3 moves");
    expect(html).toContain("1 · Preferred");
    expect(html).toContain("3 · Ally spell");
    expect(html).toContain("planned path crosses lava");
    expect(html).toContain("own resurrection charge");
    expect(html).toContain("Material warning 16.");
    expect(html.match(/Ask about this move/g)).toHaveLength(3);
    expect(render(false)).not.toContain("Ask about this move");
});
