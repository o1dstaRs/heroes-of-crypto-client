import { describe, expect, test } from "bun:test";

import {
    awayNoticeDue,
    casualtyPercent,
    exitBannerFor,
    exitStandingFromSnapshot,
    formatAwayClock,
    formatXp,
    leaveOutcomeFor,
} from "./exitRulesModel";
import { PlayPhase, type PlaySnapshot } from "../../api/play_protocol";

const snapshot = (overrides: Partial<PlaySnapshot> = {}): PlaySnapshot =>
    ({
        phase: PlayPhase.PLAY,
        fightStarted: true,
        players: [
            {
                playerId: "me",
                team: 2,
                connected: true,
                aiControlled: false,
                lastSeenMs: 0,
                absenceUsedMs: 42_000,
                consecutiveMissedTurns: 1,
                calibrating: false,
            },
            { playerId: "them", team: 1, connected: true, aiControlled: false, lastSeenMs: 0, calibrating: true },
        ],
        casualtyBp: 3800,
        boardXpDestroyed: 4560,
        boardXpTotal: 12000,
        exitUnlocked: false,
        exitRulesRanked: true,
        exitRulesEnforced: true,
        exitRulesEnforceAtMs: 1,
        absenceBudgetMs: 300_000,
        ...overrides,
    }) as PlaySnapshot;

describe("exit rules model", () => {
    test("reads the viewer's standing from the snapshot", () => {
        expect(exitStandingFromSnapshot(snapshot(), "me")).toMatchObject({
            ranked: true,
            enforced: true,
            phase: "fight",
            boardBp: 3800,
            xpDestroyed: 4560,
            xpTotal: 12000,
            absenceUsedMs: 42_000,
            missedTurns: 1,
            connected: true,
            leaveOutcome: "abandon",
        });
        expect(exitStandingFromSnapshot(snapshot({ exitUnlocked: true }), "me").leaveOutcome).toBe("concede");
        expect(exitStandingFromSnapshot(snapshot(), "them").leaveOutcome).toBe("unscored");
        // An older server sends none of the fields: a casual reading with the default allowance.
        expect(
            exitStandingFromSnapshot({ ...snapshot(), exitRulesRanked: undefined, absenceBudgetMs: undefined }, "me"),
        ).toMatchObject({ leaveOutcome: "casual", absenceBudgetMs: 300_000 });
    });

    test("the 50% line only exists in the fight, and lobby games have no penalties", () => {
        expect(leaveOutcomeFor(true, "placement", true, false)).toBe("abandon");
        expect(leaveOutcomeFor(true, "draft", false, true)).toBe("unscored");
        expect(leaveOutcomeFor(true, "fight", true, true)).toBe("concede");
        expect(leaveOutcomeFor(false, "fight", false, true)).toBe("casual");
    });

    test("numbers are formatted the way players read them", () => {
        expect(casualtyPercent(4999)).toBe(49);
        expect(casualtyPercent(5000)).toBe(50);
        expect(casualtyPercent(12_000)).toBe(100);
        expect(formatXp(4560.4)).toBe("4,560");
        expect(formatAwayClock(160_000)).toBe("2:40");
        expect(formatAwayClock(1)).toBe("0:01");
    });

    test("the away notice shows when away time grew or a turn was missed, only while connected in ranked", () => {
        const standing = exitStandingFromSnapshot(snapshot(), "me");
        expect(awayNoticeDue(standing, { absenceUsedMs: 0, missedTurns: 0 })).toBe(true);
        expect(awayNoticeDue(standing, { absenceUsedMs: 40_000, missedTurns: 1 })).toBe(false);
        expect(awayNoticeDue({ ...standing, missedTurns: 2 }, { absenceUsedMs: 40_000, missedTurns: 1 })).toBe(true);
        expect(awayNoticeDue({ ...standing, connected: false }, { absenceUsedMs: 0, missedTurns: 0 })).toBe(false);
        expect(awayNoticeDue({ ...standing, ranked: false }, { absenceUsedMs: 0, missedTurns: 0 })).toBe(false);
    });

    test("the results banner is chosen from the viewer's side", () => {
        const exit = {
            kind: "abandon",
            cause: "button",
            leaverPlayerId: "them",
            scored: true,
            enforced: true,
            ranked: true,
        };
        expect(exitBannerFor(exit, "me")?.kind).toBe("abandon-opponent");
        expect(exitBannerFor(exit, "them")?.kind).toBe("abandon-self");
        expect(exitBannerFor(exit, undefined)?.kind).toBe("abandon-observer");
        expect(exitBannerFor({ ...exit, scored: false }, "me")?.kind).toBe("unscored-opponent");
        expect(exitBannerFor({ ...exit, kind: "concede", cause: "absence" }, "them")).toEqual({
            kind: "concede-self",
            cause: "absence",
            mine: true,
        });
        expect(exitBannerFor({ ...exit, cause: "double", leaverPlayerId: "" }, "me")?.kind).toBe("double");
        expect(exitBannerFor({ ...exit, kind: "void" }, "me")?.kind).toBe("void");
        expect(exitBannerFor({ ...exit, enforced: false }, "me")?.kind).toBe("preview-abandon");
        expect(exitBannerFor({ ...exit, ranked: false }, "me")?.kind).toBe("casual-opponent");
        expect(exitBannerFor(undefined, "me")).toBeUndefined();
    });
});
