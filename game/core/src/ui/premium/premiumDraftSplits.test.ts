import { expect, test } from "bun:test";
import { CreatureVals, GridVals } from "@heroesofcrypto/common";
import { cells } from "../../../../heroes-of-crypto-common/src/ai/placement/layout";
import type { PremiumDraftState } from "./premiumDraftAssessment";
import { projectPremiumDraft } from "./premiumDraftProjection";

const amounts: Record<number, number> = {
    [CreatureVals.PEASANT]: 200,
    [CreatureVals.ORC]: 100,
    [CreatureVals.ELF]: 26,
    [CreatureVals.ARBALESTER]: 124,
    [CreatureVals.HEALER]: 40,
    [CreatureVals.HYDRA]: 2,
};
const picked = Object.keys(amounts).map(Number);
// No gameId: synergy variants (and so any Nature extra-stack slot) stay unknown; only Placement opens slots.
const setupDraft = (placement: number): PremiumDraftState => ({
    picked,
    opponentPicked: [CreatureVals.CYCLOPS],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: false,
    revealedMap: GridVals.NORMAL,
    setup: { placement, augments: [{ kind: "Placement", value: placement }], amounts },
});
const totals = (stacks: readonly { creature: number; amount: number }[]) => {
    const sum: Record<number, number> = {};
    for (const stack of stacks) sum[stack.creature] = (sum[stack.creature] ?? 0) + stack.amount;
    return sum;
};

test("spare Placement slots show the planner's split stacks; per-creature totals are unchanged", () => {
    const plan = projectPremiumDraft(setupDraft(2));
    // Placement 2 = 8 stacks: the support planner peels one Healer off for spell support and one Peasant
    // aura carrier, exactly the SPLIT_UNITs the server's Premium arrangement applies.
    expect(plan.own).toHaveLength(8);
    expect(plan.own.filter((stack) => stack.split).map((stack) => [stack.name, stack.amount, stack.split])).toEqual([
        ["Healer", 1, "support"],
        ["Peasant", 1, "aura"],
    ]);
    expect(totals(plan.own)).toEqual(amounts);
    expect(new Set(plan.own.map((stack) => stack.id)).size).toBe(8);
    const occupied = new Set<string>();
    for (const stack of plan.own)
        for (const cell of cells(stack, stack.position)) {
            expect(occupied.has(`${cell.x}:${cell.y}`)).toBe(false);
            occupied.add(`${cell.x}:${cell.y}`);
        }
    expect(plan.steps.find((step) => step.title === "Split stacks")?.stackIds).toEqual(
        plan.own.filter((stack) => stack.split).map((stack) => stack.id),
    );
    // Revealed enemy stacks never split: their setup is not public.
    expect(plan.enemy.every((stack) => !stack.split)).toBe(true);
    expect(plan).toEqual(projectPremiumDraft(setupDraft(2)));
});

test("without spare capacity the projection keeps one whole stack per creature", () => {
    for (const draft of [setupDraft(0), { ...setupDraft(0), setup: undefined }]) {
        const plan = projectPremiumDraft(draft);
        expect(plan.own.map((stack) => stack.id)).toEqual(picked.map(String));
        expect(plan.own.every((stack) => stack.split === undefined)).toBe(true);
        expect(plan.steps.map((step) => step.title)).not.toContain("Split stacks");
    }
    expect(totals(projectPremiumDraft(setupDraft(0)).own)).toEqual(amounts);
});
