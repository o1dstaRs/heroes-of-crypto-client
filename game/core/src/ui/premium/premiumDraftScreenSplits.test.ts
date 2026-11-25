import { expect, test } from "bun:test";
import { CreatureVals, GridVals } from "@heroesofcrypto/common";
import type { PremiumDraftState } from "./premiumDraftAssessment";
import { projectPremiumDraft } from "./premiumDraftProjection";

// a19-split-screen-v1 (common docs/owner_asks_adoption.md): the projection follows the server's split plan, which spends
// spare slots on one-model screens of the cheapest body (the 1x2 Wolf here) instead of a shooter cover split.
const amounts: Record<number, number> = {
    [CreatureVals.WOLF]: 50,
    [CreatureVals.ARBALESTER]: 60,
    [CreatureVals.PIKEMAN]: 90,
    [CreatureVals.ORC]: 100,
    [CreatureVals.GRIFFIN]: 25,
    [CreatureVals.GOBLIN_KNIGHT]: 40,
};
const picked = Object.keys(amounts).map(Number);
const setupDraft = (placement: number): PremiumDraftState => ({
    picked,
    opponentPicked: [CreatureVals.CYCLOPS],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: false,
    revealedMap: GridVals.NORMAL,
    setup: { placement, augments: [{ kind: "Placement", value: placement }], amounts },
});

test("spare Placement slots become one-model Wolf screens, not a shooter cover split", () => {
    const plan = projectPremiumDraft(setupDraft(2));
    expect(plan.own).toHaveLength(8);
    expect(plan.own.filter((stack) => stack.split).map((stack) => [stack.name, stack.amount, stack.split])).toEqual([
        ["Wolf", 1, "bait"],
        ["Wolf", 1, "bait"],
    ]);
    const wolves = plan.own.filter((stack) => stack.name === "Wolf").map((stack) => stack.amount);
    expect(wolves.sort((a, b) => a - b)).toEqual([1, 1, 48]);
    expect(plan.own.filter((stack) => stack.name === "Arbalester")).toHaveLength(1);
});
