import { PickPhaseVals, TeamVals } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { canViewerActOnPickFrame } from "./PickBanContext";
import type { IPickPhaseEventData } from "./PickBanContextDefs";

const frame = (overrides: Partial<IPickPhaseEventData> = {}): IPickPhaseEventData => ({
    ip: [],
    pp: PickPhaseVals.PICK,
    a: [TeamVals.LEFT],
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
                frame({ pp: PickPhaseVals.ARTIFACT_2, a: [TeamVals.RIGHT], art: [[1, 4]] }),
                TeamVals.LEFT,
            ),
        ).toBe(true);
    });

    test("waits after this viewer has committed a Tier-2 artifact", () => {
        expect(
            canViewerActOnPickFrame(
                frame({ pp: PickPhaseVals.ARTIFACT_2, a: [TeamVals.LEFT, TeamVals.RIGHT], art: [[2, 7]] }),
                TeamVals.LEFT,
            ),
        ).toBe(false);
    });

    test("uses the server actor for ordinary creature picks", () => {
        expect(canViewerActOnPickFrame(frame({ a: [TeamVals.LEFT] }), TeamVals.LEFT)).toBe(true);
        expect(canViewerActOnPickFrame(frame({ a: [TeamVals.RIGHT] }), TeamVals.LEFT)).toBe(false);
    });
});
