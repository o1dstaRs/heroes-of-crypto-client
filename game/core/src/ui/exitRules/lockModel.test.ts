import { afterEach, describe, expect, it } from "bun:test";

import {
    appealDraftValid,
    appealStateText,
    lockActive,
    lockClock,
    lockGameText,
    lockReasonText,
    systemNoticeText,
} from "./lockModel";
import type { RankedConductLock } from "../../api/ranked_conduct_client";
import { DEFAULT_LANGUAGE, setLanguage } from "../../i18n/i18n";

const lock = (overrides: Partial<RankedConductLock> = {}): RankedConductLock => ({
    level: 1,
    reason: "in_a_row",
    startedAt: 0,
    until: 86_400_000,
    gameIds: ["a", "b"],
    ...overrides,
});

afterEach(() => {
    setLanguage(DEFAULT_LANGUAGE);
});

describe("ranked lock model", () => {
    it("counts down as a clock, with days once it runs past one", () => {
        expect(lockClock(85_270_000, 0)).toBe("23:41:10");
        expect(lockClock(6 * 86_400_000 + 3_600_000 + 1, 0)).toBe("6d 01:00:01");
        expect(lockClock(0, 5_000)).toBe("00:00:00");
    });

    it("treats a lock as active only until it runs out", () => {
        expect(lockActive(lock(), 86_399_999)).toBe(true);
        expect(lockActive(lock(), 86_400_000)).toBe(false);
        expect(lockActive(null, 0)).toBe(false);
    });

    it("says why the lock happened", () => {
        expect(lockReasonText("in_a_row", 2)).toBe("You abandoned 2 ranked matches in a row.");
        expect(lockReasonText("rolling", 3)).toBe("You abandoned 3 of your recent ranked matches.");
        expect(lockReasonText("repeat", 1)).toBe("You abandoned a ranked match within 30 days of a 7-day lock.");
        expect(lockReasonText("migrated", 0)).toBe("Your ranked suspension for leaving matches is now a timed lock.");
    });

    it("describes each match behind the lock, rounding casualties down", () => {
        const game = {
            gameId: "a",
            finishedTime: 1,
            opponentUsername: "Karsk",
            reason: "abandon",
            phase: "fight",
            boardBp: 3199,
            lap: 3,
        };
        expect(lockGameText(game)).toBe("left at 31% casualties, lap 3");
        expect(lockGameText({ ...game, phase: "draft" })).toBe("left the draft");
        expect(lockGameText({ ...game, phase: "placement" })).toBe("left during placement");
    });

    it("words each appeal state and checks a draft against the published bounds", () => {
        expect(appealStateText({ status: "pending", note: "", createdAt: 1, decidedAt: 0 })).toContain(
            "A person will review it",
        );
        expect(appealStateText({ status: "upheld", note: "x", createdAt: 1, decidedAt: 2 })).toBe(
            "Your appeal was reviewed and the lock stays.",
        );
        expect(appealDraftValid("   too short   ", 20, 1000)).toBe(false);
        expect(appealDraftValid("My internet dropped twice during the storm.", 20, 1000)).toBe(true);
        expect(appealDraftValid("x".repeat(1001), 20, 1000)).toBe(false);
    });

    it("renders the server's lock and appeal notices in the player's language, and leaves anything else alone", () => {
        expect(systemNoticeText("ranked_lock", { level: 2, reason: "in_a_row", count: 3, until: 1 })).toBe(
            "Ranked locked for 7 days. You abandoned 3 ranked matches in a row. vs AI, sandbox and casual lobbies stay open. Something went wrong? Send an appeal from the Ranked Arena.",
        );
        expect(systemNoticeText("appeal_decision", { decision: "lifted", note: " Power cut confirmed. " })).toBe(
            "Your appeal was reviewed and your ranked lock is lifted. The abandons stay on your record. Reviewer's note: Power cut confirmed.",
        );
        expect(systemNoticeText("ranked_lock", { level: 9 })).toBeUndefined();
        expect(systemNoticeText("appeal_decision", { decision: "maybe" })).toBeUndefined();
        expect(systemNoticeText(undefined, undefined)).toBeUndefined();

        setLanguage("ru");
        expect(systemNoticeText("ranked_lock", { level: 1, reason: "in_a_row", count: 2 })).toStartWith(
            "Рейтинговая игра заблокирована на 24 часа.",
        );
    });
});
