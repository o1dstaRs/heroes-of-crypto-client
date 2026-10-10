import { describe, expect, test } from "bun:test";

import type { PlaySnapshot } from "../../api/play_protocol";
import {
    currentPremiumSearchMatch,
    premiumSearchMatchChanged,
    premiumSearchPlayVersion,
} from "./premiumSearchFreshness";

describe("Premium answer freshness", () => {
    const draft = { gameId: "match", source: "draft" as const, key: "draft-1" };
    const play = { gameId: "match", source: "play" as const, key: "turn-1" };

    test("prefers the loaded battlefield during the draft handoff regardless of mount order", () => {
        expect(currentPremiumSearchMatch([play, draft], "match")).toBe(play);
        expect(currentPremiumSearchMatch([draft, play], "match")).toBe(play);
        expect(currentPremiumSearchMatch([draft], "match")).toBe(draft);
        expect(currentPremiumSearchMatch([draft, play], "another-match")).toBeUndefined();
        expect(currentPremiumSearchMatch([draft, play])).toBeUndefined();
    });

    test("marks draft changes, combat actions and handoffs, but never a different match", () => {
        expect(premiumSearchMatchChanged(draft, { ...draft, key: "draft-2" })).toBe(true);
        expect(premiumSearchMatchChanged(draft, play)).toBe(true);
        expect(premiumSearchMatchChanged(play, { ...play, key: "turn-2" })).toBe(true);
        expect(premiumSearchMatchChanged(play, { ...play })).toBe(false);
        expect(premiumSearchMatchChanged(play, { ...play, gameId: "other", key: "turn-2" })).toBe(false);
        expect(premiumSearchMatchChanged(undefined, play)).toBe(false);
        expect(premiumSearchMatchChanged(play, undefined)).toBe(false);
    });

    test("ignores timer ticks while noticing actions and a finished fight", () => {
        const snapshot = {
            phase: 1,
            placementStage: 0,
            latestSequence: 5,
            currentLap: 2,
            currentUnitId: "elf",
            fightFinished: false,
            serverTimeMs: 1000,
        } as PlaySnapshot;
        expect(premiumSearchPlayVersion({ ...snapshot, serverTimeMs: 2000 })).toBe(premiumSearchPlayVersion(snapshot));
        expect(premiumSearchPlayVersion({ ...snapshot, latestSequence: 6 })).not.toBe(
            premiumSearchPlayVersion(snapshot),
        );
        expect(premiumSearchPlayVersion({ ...snapshot, fightFinished: true })).not.toBe(
            premiumSearchPlayVersion(snapshot),
        );
        expect(premiumSearchPlayVersion({ ...snapshot, currentUnitId: "angel" })).not.toBe(
            premiumSearchPlayVersion(snapshot),
        );
    });
});
