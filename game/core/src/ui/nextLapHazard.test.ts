import { HoCConstants } from "@heroesofcrypto/common";
import { describe, expect, test } from "bun:test";

import { nextLapHazard } from "./nextLapHazard";
import type { IVisibleState } from "../scenes/VisibleState";

const NORMAL_NARROWING = 3;

const state = (overrides: Partial<IVisibleState>): IVisibleState =>
    ({
        lapNumber: 1,
        numberOfLapsTillNarrowing: NORMAL_NARROWING,
        numberOfLapsTillStopNarrowing: HoCConstants.NUMBER_OF_LAPS_TILL_STOP_NARROWING,
        lapsNarrowed: 0,
        ...overrides,
    }) as IVisibleState;

describe("next-lap hazard warning", () => {
    test("warns on the lap BEFORE the map narrows, not on the narrowing lap itself", () => {
        // The engine narrows when lap % N === 1 (lap 4, 7, …), so the warning belongs on 3, 6, … — while
        // the player can still move off the doomed ring.
        expect(nextLapHazard(state({ lapNumber: 3 }))?.kind).toBe("narrowing");
        expect(nextLapHazard(state({ lapNumber: 6 }))?.kind).toBe("narrowing");

        expect(nextLapHazard(state({ lapNumber: 1 }))).toBeUndefined();
        expect(nextLapHazard(state({ lapNumber: 2 }))).toBeUndefined();
        // Lap 4 IS the narrowing lap — it already happened, so nothing is coming next lap.
        expect(nextLapHazard(state({ lapNumber: 4 }))).toBeUndefined();
    });

    test("stops warning once the board has narrowed as far as it can", () => {
        expect(
            nextLapHazard(state({ lapNumber: 3, lapsNarrowed: HoCConstants.MAX_NARROWING_LAPS_TOTAL })),
        ).toBeUndefined();
    });

    test("armageddon outranks narrowing once the waves begin", () => {
        const firstArmageddonLap = HoCConstants.NUMBER_OF_LAPS_FIRST_ARMAGEDDON;
        expect(nextLapHazard(state({ lapNumber: firstArmageddonLap }))?.kind).toBe("armageddon");
        expect(nextLapHazard(state({ lapNumber: firstArmageddonLap + 1 }))?.kind).toBe("armageddon");
        // A lap that satisfies BOTH rules announces the meteors, matching the icon precedence the
        // MessageBox and UpNextOverlay warnings have always used.
        const bothLap = firstArmageddonLap % NORMAL_NARROWING === 0 ? firstArmageddonLap : firstArmageddonLap + 3;
        expect(nextLapHazard(state({ lapNumber: bothLap }))?.kind).toBe("armageddon");
    });

    test("says nothing before the fight starts", () => {
        expect(nextLapHazard(state({ lapNumber: 0 }))).toBeUndefined();
        expect(nextLapHazard(undefined)).toBeUndefined();
    });
});
