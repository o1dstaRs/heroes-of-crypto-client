import { describe, expect, test } from "bun:test";

import { HeadlessMatch } from "../src/headless_match";

describe("HeadlessMatch", () => {
    test("creates a quick fight with legal actions for the active team", () => {
        const match = HeadlessMatch.createQuickstart({ matchId: "test-match" });
        const state = match.getState();

        expect(state.phase).toBe("fight");
        expect(state.activeTeam).toBe("LOWER");
        expect(state.units).toHaveLength(2);

        const legalActions = match.listLegalActions("LOWER");
        expect(legalActions.some((action) => action.kind === "melee_attack")).toBe(true);
        expect(match.listLegalActions("UPPER")).toHaveLength(0);
    });

    test("chooses and submits a model action through the real action engine", () => {
        const match = HeadlessMatch.createQuickstart({ matchId: "test-match" });
        const decision = match.chooseAction({ reason: "server_bot", style: "aggressive" });

        expect(decision.action.type).toBe("melee_attack");

        const result = match.submitAction({ team: "LOWER", actionId: decision.actionId });

        expect(result.completed).toBe(true);
        expect(result.state.phase).toBe("finished");
        expect(result.state.winner).toBe("LOWER");
        expect(result.events.some((event) => event.type === "unit_attacked")).toBe(true);
    });

    test("rejects stale or cross-team actions without advancing the match", () => {
        const match = HeadlessMatch.createQuickstart({ matchId: "test-match" });
        const decision = match.chooseAction({ reason: "server_bot" });
        const wrongTeamResult = match.submitAction({ team: "UPPER", actionId: decision.actionId });

        expect(wrongTeamResult.completed).toBe(false);
        expect(wrongTeamResult.rejectionReason).toBe("unit_not_active");
        expect(match.getState().phase).toBe("fight");

        const staleResult = match.submitAction({ team: "LOWER", actionId: "not-a-real-action" });
        expect(staleResult.completed).toBe(false);
        expect(staleResult.rejectionReason).toBe("unsupported_action");
    });

    test("offers engine-valid movement when no target is adjacent", () => {
        const match = HeadlessMatch.createApproachScenario({ matchId: "test-match" });
        const decision = match.chooseAction({ reason: "server_bot", style: "aggressive" });

        expect(decision.action.type).toBe("move_unit");

        const result = match.submitAction({ team: "LOWER", actionId: decision.actionId });

        expect(result.completed).toBe(true);
        expect(result.state.phase).toBe("fight");
        expect(result.state.activeTeam).toBe("LOWER");
        expect(result.events.some((event) => event.type === "unit_moved")).toBe(true);
        expect(result.nextLegalActions.some((action) => action.kind === "end_turn")).toBe(true);
    });

    test("plays a full AI turn across movement and attack decisions", () => {
        const match = HeadlessMatch.createApproachScenario({ matchId: "test-match" });
        const result = match.playAiTurn({ reason: "server_bot", style: "aggressive" });

        expect(result.completed).toBe(true);
        expect(result.stoppedReason).toBe("fight_finished");
        expect(result.decisions.map((decision) => decision.action.type)).toEqual(["move_unit", "melee_attack"]);
        expect(result.state.phase).toBe("finished");
        expect(result.state.winner).toBe("LOWER");
    });

    test("prioritizes a high-value ranged target over a low-value adjacent target", () => {
        const match = HeadlessMatch.createPriorityTargetScenario({ matchId: "test-match" });
        const legalActions = match.listLegalActions("LOWER").filter((action) => action.kind === "melee_attack");

        expect(legalActions).toHaveLength(2);
        expect(legalActions.every((action) => action.evaluation?.damage?.max)).toBe(true);

        const decision = match.chooseAction({ reason: "server_bot", style: "aggressive" });

        expect(decision.action.type).toBe("melee_attack");
        expect(decision.explanation).toContain("Upper Arbalester");
    });

    test("casts an engine-valid single-target spell", () => {
        const match = HeadlessMatch.createSpellDuelScenario({ matchId: "test-match" });
        const spellActions = match.listLegalActions("LOWER").filter((action) => action.kind === "cast_spell");

        expect(spellActions.some((action) => action.evaluation?.spell?.name === "Sadness")).toBe(true);

        const decision = match.chooseAction({ reason: "server_bot", style: "aggressive" });
        expect(decision.action.type).toBe("cast_spell");
        expect(decision.explanation).toContain("Sadness");

        const result = match.submitAction({ team: "LOWER", actionId: decision.actionId });

        expect(result.completed).toBe(true);
        expect(result.events.some((event) => event.type === "spell_cast")).toBe(true);
        expect(result.state.activeTeam).toBe("UPPER");
    });

    test("summons units through the production creature factory hook", () => {
        const match = HeadlessMatch.createSummonScenario({ matchId: "test-match" });
        const summonAction = match
            .listLegalActions("LOWER")
            .find((action) => action.kind === "cast_spell" && action.evaluation?.spell?.isSummon);

        expect(summonAction?.action.type).toBe("cast_spell");

        const result = match.submitAction({ team: "LOWER", actionId: summonAction?.id });

        expect(result.completed).toBe(true);
        expect(result.events.some((event) => event.type === "unit_summoned")).toBe(true);
        expect(result.state.units.some((unit) => unit.name === "Wolf" && unit.team === "LOWER")).toBe(true);
    });
});
