import { expect, spyOn, test } from "bun:test";
import { CreatureVals, FightStateManager, GridVals, HoCLib } from "@heroesofcrypto/common";
import { StrategyV0_8 } from "../../../../heroes-of-crypto-common/src/ai/versions/v0_8";
import type { PremiumDraftState } from "./premiumDraftAssessment";
import { projectPremiumDraft } from "./premiumDraftProjection";

const draft: PremiumDraftState = {
    picked: [
        CreatureVals.PEASANT,
        CreatureVals.ORC,
        CreatureVals.ELF,
        CreatureVals.ARBALESTER,
        CreatureVals.HEALER,
        CreatureVals.HYDRA,
    ],
    opponentPicked: [CreatureVals.CYCLOPS],
    artifactTier1: 0,
    artifactTier2: 0,
    isYourTurn: true,
    revealedMap: GridVals.NORMAL,
};

test("the projection calls native A19 placement with only revealed opponent identities", () => {
    const native = spyOn(StrategyV0_8.prototype, "placeArmy");
    try {
        const projection = projectPremiumDraft(draft);
        expect(projection.own).toHaveLength(6);
        expect(native).toHaveBeenCalled();
        const context = native.mock.calls[0][1];
        expect(context.publicOpponentCreatureIds).toEqual([CreatureVals.CYCLOPS]);
        expect(context.unitsHolder.getAllEnemyUnits(context.team).map((unit) => unit.getName())).toEqual(["Cyclops"]);
    } finally {
        native.mockRestore();
    }
});

test("A19 adjusts the recommended formation automatically when splash is revealed", () => {
    const ordinary = projectPremiumDraft({ ...draft, opponentPicked: [CreatureVals.ORC] });
    const splash = projectPremiumDraft(draft);
    expect(splash.own.map((unit) => unit.position)).not.toEqual(ordinary.own.map((unit) => unit.position));
    expect(splash.own.map((unit) => unit.amount)).toEqual(ordinary.own.map((unit) => unit.amount));
    expect(splash).toEqual(projectPremiumDraft(draft));
});

test.each([false, true])(
    "preview preserves live fight and RNG/UUID state, including a strategy failure (%s)",
    (fail) => {
        const manager = FightStateManager.getInstance();
        const fight = manager.getFightProperties();
        const before = structuredClone(fight);
        const originalRandom = HoCLib.captureDeterministicRandomState();
        const inputBefore = JSON.stringify(draft);
        let liveDraws = 0;
        HoCLib.setDeterministicRandomSource(() => {
            liveDraws++;
            return 0.5;
        });
        const randomBefore = HoCLib.captureDeterministicRandomState();
        const native = fail
            ? spyOn(StrategyV0_8.prototype, "placeArmy").mockImplementation(() => {
                  throw new Error("preview failure");
              })
            : undefined;
        try {
            const result = projectPremiumDraft(draft);
            expect(result.formationUnavailable).toBe(fail);
            expect(result.own.length).toBe(fail ? 0 : 6);
            expect(manager.getFightProperties()).toBe(fight);
            expect(structuredClone(fight)).toEqual(before);
            expect(HoCLib.captureDeterministicRandomState()).toEqual(randomBefore);
            expect(liveDraws).toBe(0);
            expect(JSON.stringify(draft)).toBe(inputBefore);
        } finally {
            native?.mockRestore();
            HoCLib.restoreDeterministicRandomState(originalRandom);
        }
    },
);
