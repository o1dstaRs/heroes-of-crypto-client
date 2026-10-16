import { describe, expect, test } from "bun:test";

import { PlayPhase, type PlaySnapshot } from "../../api/play_protocol";
import { premiumChoiceQuestion, premiumQuestions } from "./premiumQuestions";
import { premiumSearchPlayStage } from "./premiumSearchFreshness";

describe("Premium question context", () => {
    test("general and replay surfaces never offer current-turn or current-army shortcuts", () => {
        const general = premiumQuestions(false, "fight");
        expect(general.map((item) => item.label)).toContain("Build an army");
        expect(general.some((item) => item.question.includes("my current"))).toBe(false);
        expect(premiumQuestions(true).map((item) => item.label)).toContain("Get a plan");
    });

    test("draft, build, placement and fight shortcuts ask about the decisions available at that stage", () => {
        expect(premiumQuestions(true, "draft").map((item) => item.label)).toContain("Compare offers");
        expect(premiumQuestions(true, "setup").map((item) => item.label)).toContain("Explain build");
        expect(premiumQuestions(true, "board").map((item) => item.label)).toContain("Before Ready");
        expect(premiumQuestions(true, "fight").map((item) => item.label)).toContain("Resource check");
        expect(premiumQuestions(true, "finished").some((item) => item.label === "Explain this turn")).toBe(false);
        for (const stage of ["draft", "setup", "board", "fight", "finished"] as const) {
            for (const item of premiumQuestions(true, stage)) expect(item.question.length).toBeLessThanOrEqual(600);
        }
    });

    test("recommendation questions name the choice and compare only current legal alternatives", () => {
        const question = premiumChoiceQuestion({ label: "Hydra + Monk + Tome of Amplification" });
        expect(question).toContain("Hydra + Monk + Tome of Amplification");
        expect(question).toContain("currently legal offers");
        expect(question).toContain("selected artifacts");
    });

    test("legacy placement stays on the board while split placement distinguishes setup and formation", () => {
        const snapshot = { phase: PlayPhase.PLACEMENT, placementStage: 0, placementSplit: false } as PlaySnapshot;
        expect(premiumSearchPlayStage(snapshot)).toBe("board");
        expect(premiumSearchPlayStage({ ...snapshot, placementSplit: true })).toBe("setup");
        expect(premiumSearchPlayStage({ ...snapshot, placementSplit: true, placementStage: 1 })).toBe("board");
        expect(premiumSearchPlayStage({ ...snapshot, phase: PlayPhase.PLAY, fightStarted: true })).toBe("fight");
        expect(premiumSearchPlayStage({ ...snapshot, fightStarted: true, fightFinished: true })).toBe("finished");
        expect(premiumSearchPlayStage({ ...snapshot, phase: PlayPhase.ABANDONED })).toBe("finished");
    });
});
