import { describe, expect, it } from "bun:test";
import { PickPhaseVals, TeamVals } from "@heroesofcrypto/common";

import { pickPhaseIdentity, type PickPhaseIdentityInput } from "./PickBanContextDefs";

const pickStep = (
    level: number,
    actors: PickPhaseIdentityInput["a"],
    phaseSequence?: number,
): PickPhaseIdentityInput => ({
    pp: PickPhaseVals.PICK,
    lv: level,
    a: actors,
    ps: phaseSequence,
});

describe("pickPhaseIdentity", () => {
    it("prefers the authoritative phase sequence and remains stable across repeated frames", () => {
        const first = pickStep(1, [TeamVals.RIGHT], 3);
        const repeated = pickStep(1, [TeamVals.RIGHT], 3);

        expect(pickPhaseIdentity(first)).toBe("sequence:3");
        expect(pickPhaseIdentity(repeated)).toBe(pickPhaseIdentity(first));
    });

    it("changes the submission key when authoritative sequence advances across otherwise identical steps", () => {
        const current = pickStep(2, [TeamVals.RIGHT], 4);
        const next = pickStep(2, [TeamVals.RIGHT], 5);

        expect(pickPhaseIdentity(next)).not.toBe(pickPhaseIdentity(current));
    });

    it("distinguishes RIGHT's consecutive level-1 and level-2 PICK turns on legacy events", () => {
        const rightLevel1 = pickStep(1, [TeamVals.RIGHT]);
        const rightLevel2 = pickStep(2, [TeamVals.RIGHT]);

        expect(pickPhaseIdentity(rightLevel2)).not.toBe(pickPhaseIdentity(rightLevel1));
    });

    it("distinguishes LEFT's consecutive level-2 and level-3 PICK turns on legacy events", () => {
        const leftLevel2 = pickStep(2, [TeamVals.LEFT]);
        const leftLevel3 = pickStep(3, [TeamVals.LEFT]);

        expect(pickPhaseIdentity(leftLevel3)).not.toBe(pickPhaseIdentity(leftLevel2));
    });

    it("normalizes actor order in the backward-compatible identity", () => {
        const leftFirst = pickStep(0, [TeamVals.LEFT, TeamVals.RIGHT]);
        const rightFirst = pickStep(0, [TeamVals.RIGHT, TeamVals.LEFT]);

        expect(pickPhaseIdentity(leftFirst)).toBe(pickPhaseIdentity(rightFirst));
    });
});
