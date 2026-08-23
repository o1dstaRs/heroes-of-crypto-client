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
        const first = pickStep(1, [TeamVals.UPPER], 3);
        const repeated = pickStep(1, [TeamVals.UPPER], 3);

        expect(pickPhaseIdentity(first)).toBe("sequence:3");
        expect(pickPhaseIdentity(repeated)).toBe(pickPhaseIdentity(first));
    });

    it("changes the submission key when authoritative sequence advances across otherwise identical steps", () => {
        const current = pickStep(2, [TeamVals.UPPER], 4);
        const next = pickStep(2, [TeamVals.UPPER], 5);

        expect(pickPhaseIdentity(next)).not.toBe(pickPhaseIdentity(current));
    });

    it("distinguishes UPPER's consecutive level-1 and level-2 PICK turns on legacy events", () => {
        const upperLevel1 = pickStep(1, [TeamVals.UPPER]);
        const upperLevel2 = pickStep(2, [TeamVals.UPPER]);

        expect(pickPhaseIdentity(upperLevel2)).not.toBe(pickPhaseIdentity(upperLevel1));
    });

    it("distinguishes LOWER's consecutive level-2 and level-3 PICK turns on legacy events", () => {
        const lowerLevel2 = pickStep(2, [TeamVals.LOWER]);
        const lowerLevel3 = pickStep(3, [TeamVals.LOWER]);

        expect(pickPhaseIdentity(lowerLevel3)).not.toBe(pickPhaseIdentity(lowerLevel2));
    });

    it("normalizes actor order in the backward-compatible identity", () => {
        const lowerFirst = pickStep(0, [TeamVals.LOWER, TeamVals.UPPER]);
        const upperFirst = pickStep(0, [TeamVals.UPPER, TeamVals.LOWER]);

        expect(pickPhaseIdentity(lowerFirst)).toBe(pickPhaseIdentity(upperFirst));
    });
});
