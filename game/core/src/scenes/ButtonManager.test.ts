import { describe, expect, it } from "bun:test";

import type { GameAction, Unit } from "@heroesofcrypto/common";

import { ButtonManager, type ISandboxButtonContext } from "./ButtonManager";
import { VisibleButtonState } from "./VisibleState";

const makeUnit = (opts: { aiDriven?: boolean } = {}): Unit =>
    ({
        getId: () => "u1",
        hasAbilityActive: (name: string) => name === "AI Driven" && !!opts.aiDriven,
    }) as unknown as Unit;

interface Recorder {
    aiActive: boolean[];
    actions: GameAction[];
}

const makeContext = (over: Partial<ISandboxButtonContext> = {}): { ctx: ISandboxButtonContext; rec: Recorder } => {
    const rec: Recorder = { aiActive: [], actions: [] };
    const ctx: ISandboxButtonContext = {
        getCurrentActiveUnit: () => undefined,
        getSceneLog: () => ({ updateLog: () => {} }) as unknown as ReturnType<ISandboxButtonContext["getSceneLog"]>,
        getGridSettings: () => ({}) as unknown as ReturnType<ISandboxButtonContext["getGridSettings"]>,
        applyGameAction: (action: GameAction) => {
            rec.actions.push(action);
            return true;
        },
        refreshUnits: () => {},
        updateCurrentMovePath: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
        setCurrentEnemiesCellsWithinMovementRange: () => {},
        setSelectedAttackType: () => {},
        setCurrentActiveSpell: () => {},
        getCurrentActiveSpell: () => undefined,
        setVisibleButtons: () => {},
        setAIActive: (active: boolean) => {
            rec.aiActive.push(active);
        },
        setSpellBookOverlay: () => {},
        isInputLockedByAI: () => false,
        canControlCurrentActiveUnit: () => true,
        getVisibleState: () => undefined,
        ...over,
    };
    return { ctx, rec };
};

describe("ButtonManager AI toggle", () => {
    it("lets the player toggle AI OFF even while AI is locking board input", () => {
        // Regression: input is locked *because* AI is on. The toggle must stay clickable, otherwise
        // enabling AI permanently locks the player out of turning it back off.
        const { ctx, rec } = makeContext({
            isInputLockedByAI: () => true,
            getCurrentActiveUnit: () => makeUnit(),
        });
        const bm = new ButtonManager(ctx, /* isAIActive */ true);

        bm.propagateButtonClicked("AI", VisibleButtonState.SECOND);

        expect(rec.aiActive).toEqual([false]);
        expect(bm.sc_isAIActive).toBe(false);
    });

    it("still blocks non-AI buttons while AI locks board input", () => {
        const { ctx, rec } = makeContext({
            isInputLockedByAI: () => true,
            getCurrentActiveUnit: () => makeUnit(),
        });
        const bm = new ButtonManager(ctx, true);

        bm.propagateButtonClicked("Next", VisibleButtonState.FIRST);

        expect(rec.actions).toEqual([]);
    });

    it("blocks switching the AI toggle mid-turn for an AI-Driven ability unit", () => {
        // The one case the player explicitly should NOT be able to switch: an AI-Driven unit is
        // AI-controlled for its whole turn.
        const { ctx, rec } = makeContext({
            isInputLockedByAI: () => true,
            getCurrentActiveUnit: () => makeUnit({ aiDriven: true }),
        });
        const bm = new ButtonManager(ctx, true);

        bm.propagateButtonClicked("AI", VisibleButtonState.SECOND);

        expect(rec.aiActive).toEqual([]);
        expect(bm.sc_isAIActive).toBe(true);
    });
});
