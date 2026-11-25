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

// a19-shield-screen-v1 (profile v36, the owner: "it is always better to split mermaid if we have it, because it takes
// two shots to kill her"): a splittable Mermaid is the screen body first, as in the server's split plan.
const mermaidAmounts: Record<number, number> = {
    [CreatureVals.MERMAID]: 80,
    [CreatureVals.PEASANT]: 160,
    [CreatureVals.ELF]: 30,
    [CreatureVals.TRENT]: 20,
    [CreatureVals.PIKEMAN]: 90,
    [CreatureVals.ARACHNA_QUEEN]: 2,
};
const mermaidDraft = (placement: number): PremiumDraftState => ({
    picked: Object.keys(mermaidAmounts).map(Number),
    opponentPicked: [CreatureVals.CYCLOPS],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: false,
    revealedMap: GridVals.NORMAL,
    setup: { placement, augments: [{ kind: "Placement", value: placement }], amounts: mermaidAmounts },
});

test("spare Placement slots become one-model Mermaids when the army has her", () => {
    const plan = projectPremiumDraft(mermaidDraft(2));
    expect(plan.own.filter((stack) => stack.split).map((stack) => [stack.name, stack.amount, stack.split])).toEqual([
        ["Mermaid", 1, "shield"],
        ["Mermaid", 1, "bait"],
    ]);
    const mermaids = plan.own.filter((stack) => stack.name === "Mermaid").map((stack) => stack.amount);
    expect(mermaids.sort((a, b) => a - b)).toEqual([1, 1, 78]);
    expect(plan.own.filter((stack) => stack.name === "Peasant")).toHaveLength(1);
});
