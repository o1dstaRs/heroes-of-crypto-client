import { describe, expect, test } from "bun:test";

import { PickPhaseVals } from "@heroesofcrypto/common";

import { isAugmentHandoffPhase, shouldShowOpponentDraftRail } from "./draftPhaseVisibility";

describe("draft opponent-rail visibility", () => {
    test("classifies both augment phases as route handoffs", () => {
        expect(isAugmentHandoffPhase(PickPhaseVals.AUGMENTS)).toBe(true);
        expect(isAugmentHandoffPhase(PickPhaseVals.AUGMENTS_SCOUT)).toBe(true);
    });

    test("shows the opponent rail during augment handoff by default", () => {
        expect(shouldShowOpponentDraftRail(PickPhaseVals.AUGMENTS)).toBe(true);
        expect(shouldShowOpponentDraftRail(PickPhaseVals.AUGMENTS_SCOUT)).toBe(true);
    });

    test("lets ranked/private callers hide the opponent rail during augment handoff", () => {
        expect(shouldShowOpponentDraftRail(PickPhaseVals.AUGMENTS, false)).toBe(false);
        expect(shouldShowOpponentDraftRail(PickPhaseVals.AUGMENTS_SCOUT, false)).toBe(false);
    });

    test("retains the opponent rail during real creature and artifact draft phases when handoff is private", () => {
        for (const phase of [
            PickPhaseVals.INITIAL_PICK,
            PickPhaseVals.EXTENDED_PICK,
            PickPhaseVals.EXTENDED_BAN,
            PickPhaseVals.PICK,
            PickPhaseVals.BAN,
            PickPhaseVals.ARTIFACT_1,
            PickPhaseVals.ARTIFACT_2,
        ]) {
            expect(isAugmentHandoffPhase(phase)).toBe(false);
            expect(shouldShowOpponentDraftRail(phase, false)).toBe(true);
        }
    });
});
