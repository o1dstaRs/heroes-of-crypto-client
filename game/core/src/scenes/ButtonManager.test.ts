import { describe, expect, it } from "bun:test";

import { FightStateManager, type GameAction, type Unit } from "@heroesofcrypto/common";

import { ButtonManager, type ISandboxButtonContext } from "./ButtonManager";
import { VisibleButtonState, type IVisibleButton } from "./VisibleState";

const makeUnit = (opts: { aiDriven?: boolean } = {}): Unit =>
    ({
        getId: () => "u1",
        hasAbilityActive: (name: string) => name === "AI Driven" && !!opts.aiDriven,
        getSpellsCount: () => 0,
        getCanCastSpells: () => false,
        getAttackTypeSelectionIndex: () => [-1, 0],
        getAttackTypeSelection: () => 0,
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
        isAiToggleAllowed: () => true,
        canControlCurrentActiveUnit: () => true,
        hasUnactedTeammateInCurrentLap: () => false,
        isHourglassDenied: () => false,
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

    it("keeps the AI button clickable while the turn-transition button lock is on", () => {
        // Regression: after every completed turn the scene locks button refreshes until the next unit
        // activates. In ranked that window spans a server round-trip per turn, and the toolbar swallows
        // clicks on disabled buttons — a disabled AI button silently ate the player's toggle-off while
        // autobattle chained turns ("toggle off doesn't work, still can't move").
        let rendered: IVisibleButton[] = [];
        const { ctx, rec } = makeContext({
            getCurrentActiveUnit: () => makeUnit(),
            setVisibleButtons: (buttons) => {
                rendered = buttons;
            },
        });
        const bm = new ButtonManager(ctx, true);

        bm.setButtonsRefreshLocked(true);

        const byName = new Map(rendered.map((b) => [b.name, b]));
        expect(byName.get("AI")?.isDisabled).toBe(false);
        expect(byName.get("Next")?.isDisabled).toBe(true);
        expect(byName.get("Hourglass")?.isDisabled).toBe(true);

        // And the click actually toggles while locked.
        bm.propagateButtonClicked("AI", VisibleButtonState.SECOND);
        expect(rec.aiActive).toEqual([false]);
        expect(bm.sc_isAIActive).toBe(false);
    });

    it("disables the AI button once the fight is finished", () => {
        let rendered: IVisibleButton[] = [];
        const { ctx } = makeContext({
            getCurrentActiveUnit: () => makeUnit(),
            getVisibleState: () =>
                ({ hasFinished: true }) as unknown as ReturnType<ISandboxButtonContext["getVisibleState"]>,
            setVisibleButtons: (buttons) => {
                rendered = buttons;
            },
        });
        const bm = new ButtonManager(ctx, true);

        bm.refreshButtons(true);

        const byName = new Map(rendered.map((b) => [b.name, b]));
        expect(byName.get("AI")?.isDisabled).toBe(true);
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

    it("leaves the AI button out of the toolbar where autobattle is not allowed (ranked, lobby, vs-AI)", () => {
        let rendered: IVisibleButton[] = [];
        const { ctx } = makeContext({
            isAiToggleAllowed: () => false,
            getCurrentActiveUnit: () => makeUnit(),
            setVisibleButtons: (buttons) => {
                rendered = buttons;
            },
        });
        const bm = new ButtonManager(ctx, false);

        bm.refreshButtons(true);
        expect(rendered.map((b) => b.name)).not.toContain("AI");
        expect(rendered.map((b) => b.name)).toContain("Next");

        bm.setButtonsRefreshLocked(true);
        expect(rendered.map((b) => b.name)).not.toContain("AI");
    });

    it("ignores an AI toggle click where autobattle is not allowed", () => {
        const { ctx, rec } = makeContext({
            isAiToggleAllowed: () => false,
            getCurrentActiveUnit: () => makeUnit(),
        });
        const bm = new ButtonManager(ctx, false);

        bm.propagateButtonClicked("AI", VisibleButtonState.FIRST);

        expect(rec.aiActive).toEqual([]);
        expect(bm.sc_isAIActive).toBe(false);
    });
});

describe("ButtonManager hourglass eligibility", () => {
    const checkHourglass = (manager: ButtonManager): boolean =>
        (
            manager as unknown as {
                checkHourglassCondition: () => boolean;
            }
        ).checkHourglassCondition();

    it("disables hourglass when the active unit is its team's last unacted unit this lap", () => {
        FightStateManager.getInstance().reset();
        FightStateManager.getInstance().getFightProperties().startFight();
        let activeUnit: Unit | undefined;
        const { ctx } = makeContext({
            getCurrentActiveUnit: () => activeUnit,
            hasUnactedTeammateInCurrentLap: () => false,
        });
        const manager = new ButtonManager(ctx, false);
        activeUnit = makeUnit();

        expect(checkHourglass(manager)).toBe(false);
    });

    it("allows hourglass while another teammate still has a turn pending this lap", () => {
        FightStateManager.getInstance().reset();
        FightStateManager.getInstance().getFightProperties().startFight();
        let activeUnit: Unit | undefined;
        const { ctx } = makeContext({
            getCurrentActiveUnit: () => activeUnit,
            hasUnactedTeammateInCurrentLap: () => true,
        });
        const manager = new ButtonManager(ctx, false);
        activeUnit = makeUnit();

        expect(checkHourglass(manager)).toBe(true);
    });

    it("disables Hourglass while Time Denial is active", () => {
        FightStateManager.getInstance().reset();
        FightStateManager.getInstance().getFightProperties().startFight();
        let activeUnit: Unit | undefined;
        let rendered: IVisibleButton[] = [];
        const { ctx } = makeContext({
            getCurrentActiveUnit: () => activeUnit,
            hasUnactedTeammateInCurrentLap: () => true,
            isHourglassDenied: () => true,
            setVisibleButtons: (buttons) => {
                rendered = buttons;
            },
        });
        const manager = new ButtonManager(ctx, false);
        activeUnit = makeUnit();

        expect(checkHourglass(manager)).toBe(false);
        manager.refreshButtons(true);
        const denial = rendered.find((button) => button.name === "TimeDenial");
        expect(denial).toMatchObject({
            isDisabled: true,
            text: "Time Denial — an active holder prevents either side from using Hourglass.",
        });
        expect(rendered.some((button) => button.name === "Hourglass")).toBe(false);
    });
});

describe("ButtonManager spellbook gating", () => {
    const makeCaster = (opts: { spells: number; canCast: boolean }): Unit =>
        ({
            getId: () => "u1",
            getName: () => "Wandering Mage",
            hasAbilityActive: () => false,
            getSpellsCount: () => opts.spells,
            getCanCastSpells: () => opts.canCast,
            getAttackTypeSelectionIndex: () => [-1, 0],
            getAttackTypeSelection: () => 0,
        }) as unknown as Unit;

    const spellbookButtonFor = (
        spells: number,
        canCast: boolean,
        over: Partial<ISandboxButtonContext> = {},
    ): IVisibleButton | undefined => {
        const manager = FightStateManager.getInstance();
        manager.reset();
        manager.getFightProperties().startFight();
        try {
            let captured: IVisibleButton[] = [];
            const { ctx } = makeContext({
                getCurrentActiveUnit: () => makeCaster({ spells, canCast }),
                setVisibleButtons: (buttons: IVisibleButton[]) => {
                    captured = buttons;
                },
                ...over,
            });
            new ButtonManager(ctx, false).refreshButtons(true);
            return captured.find((button) => button.name === "Spellbook");
        } finally {
            manager.reset();
        }
    };

    it("disables the spellbook when the unit has no spells to cast", () => {
        expect(spellbookButtonFor(0, false)).toMatchObject({
            isDisabled: true,
            text: "No spells to cast",
        });
    });

    it("disables the spellbook when casting is blocked despite remaining scrolls", () => {
        expect(spellbookButtonFor(2, false)).toMatchObject({
            isDisabled: true,
            text: "Cannot cast spells right now",
        });
    });

    it("enables the spellbook when the unit can cast, including a one-creature stack that still has scrolls", () => {
        expect(spellbookButtonFor(2, true)).toMatchObject({
            isDisabled: false,
            text: "Select spell",
        });
    });

    it("does not call an opponent's empty book a missing spellbook", () => {
        expect(spellbookButtonFor(0, false, { canControlCurrentActiveUnit: () => false })).toMatchObject({
            isDisabled: true,
            text: "Select spell",
        });
    });

    it("a click on a spell-less unit says why and does not open the book", () => {
        const manager = FightStateManager.getInstance();
        manager.reset();
        manager.getFightProperties().startFight();
        const lines: string[] = [];
        let overlay: boolean | undefined;
        try {
            const { ctx } = makeContext({
                getCurrentActiveUnit: () => makeCaster({ spells: 0, canCast: true }),
                getSceneLog: () =>
                    ({
                        updateLog: (line?: string) => {
                            if (line) lines.push(line);
                        },
                    }) as unknown as ReturnType<ISandboxButtonContext["getSceneLog"]>,
                setSpellBookOverlay: (active: boolean) => {
                    overlay = active;
                },
            });
            const buttons = new ButtonManager(ctx, false);
            buttons.propagateButtonClicked("Spellbook", VisibleButtonState.FIRST);
            expect(lines).toEqual(["Wandering Mage has no spells to cast"]);
            expect(overlay).toBeUndefined();
            expect(buttons.sc_renderSpellBookOverlay).toBe(false);
        } finally {
            manager.reset();
        }
    });

    it("clears the refusal once the same unit can cast again", () => {
        const manager = FightStateManager.getInstance();
        manager.reset();
        manager.getFightProperties().startFight();
        let spells = 0;
        let canCast = false;
        let captured: IVisibleButton[] = [];
        try {
            const { ctx } = makeContext({
                getCurrentActiveUnit: () => makeCaster({ spells, canCast }),
                setVisibleButtons: (buttons: IVisibleButton[]) => {
                    captured = buttons;
                },
            });
            const buttons = new ButtonManager(ctx, false);
            buttons.refreshButtons(true);
            expect(captured.find((button) => button.name === "Spellbook")).toMatchObject({
                isDisabled: true,
                text: "No spells to cast",
            });
            spells = 4;
            canCast = true;
            buttons.refreshButtons(true);
            expect(captured.find((button) => button.name === "Spellbook")).toMatchObject({
                isDisabled: false,
                text: "Select spell",
            });
        } finally {
            manager.reset();
        }
    });
});
