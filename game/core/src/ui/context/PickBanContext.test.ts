import { PickPhaseVals, TeamVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { canViewerActOnPickFrame } from "./PickBanContext";
import type { IPickPhaseEventData } from "./PickBanContextDefs";

const frame = (overrides: Partial<IPickPhaseEventData> = {}): IPickPhaseEventData => ({
    ip: [],
    pp: PickPhaseVals.PICK,
    a: [TeamVals.LOWER],
    p: [],
    b: [],
    op: [],
    ws: [],
    t: 30_000,
    r: 0,
    ia: false,
    ...overrides,
});

describe("canViewerActOnPickFrame", () => {
    test("keeps an uncommitted simultaneous Tier-2 choice actionable", () => {
        expect(
            canViewerActOnPickFrame(
                frame({ pp: PickPhaseVals.ARTIFACT_2, a: [TeamVals.UPPER], art: [[1, 4]] }),
                TeamVals.LOWER,
            ),
        ).toBe(true);
    });

    test("waits after this viewer has committed a Tier-2 artifact", () => {
        expect(
            canViewerActOnPickFrame(
                frame({ pp: PickPhaseVals.ARTIFACT_2, a: [TeamVals.LOWER, TeamVals.UPPER], art: [[2, 7]] }),
                TeamVals.LOWER,
            ),
        ).toBe(false);
    });

    test("uses the server actor for ordinary creature picks", () => {
        expect(canViewerActOnPickFrame(frame({ a: [TeamVals.LOWER] }), TeamVals.LOWER)).toBe(true);
        expect(canViewerActOnPickFrame(frame({ a: [TeamVals.UPPER] }), TeamVals.LOWER)).toBe(false);
    });
});
