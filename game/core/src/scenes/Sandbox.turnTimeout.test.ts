import { afterEach, describe, expect, mock, test } from "bun:test";
import {
    AbilityFactory,
    additionalTurnTimeFor,
    EffectFactory,
    FightProperties,
    FightStateManager,
    Grid,
    GridSettings,
    GridVals,
    HoCConfig,
    HoCLib,
    TeamVals,
    Unit,
    UnitsHolder,
    UnitVals,
    type TeamType,
} from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

const originalFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(originalFight));

interface TimeoutScene {
    handleLocalTurnTimeout(now: number): void;
    requestTime(team: number): void;
    currentActiveUnit?: Unit;
    sc_gameActionTransport?: () => void;
    replayPlaybackActive: boolean;
    sandboxConsecutiveTimeouts: number;
    sandboxGraceTurnUsed: boolean;
    sc_visibleStateUpdateNeeded: boolean;
    sc_visibleState: {
        canRequestAdditionalTime: boolean;
        hasAdditionalTime: boolean;
        secondsMax: number;
        secondsRemaining: number;
    };
    aiController: {
        performingAction: boolean;
        isAIActive: boolean;
        forceCurrentTurn: ReturnType<typeof mock<() => boolean>>;
    };
}

function fixture(mindless = false) {
    const fight = new FightProperties();
    FightStateManager.getInstance().setFightProperties(fight);
    const settings = new GridSettings(16, 2048, 0, 1024, -1024, 5, 0.06);
    const holder = new UnitsHolder(new Grid(settings, GridVals.NORMAL));
    const effects = new EffectFactory();
    const abilities = new AbilityFactory(effects);
    const createUnit = (team: TeamType, selfPlaying = false) => {
        const unit = Unit.createUnit(
            HoCConfig.getCreatureConfig(
                team,
                selfPlaying ? "Might" : "Life",
                selfPlaying ? "Berserker" : "Peasant",
                "",
                1,
            ),
            settings,
            team,
            UnitVals.CREATURE,
            abilities,
            effects,
            false,
        );
        holder.addUnit(unit);
        return unit;
    };
    const activeUnit = createUnit(TeamVals.LEFT, mindless);
    const support = createUnit(TeamVals.LEFT);
    const opponent = createUnit(TeamVals.RIGHT);
    fight.setTeamUnitsAlive(TeamVals.LEFT, 2);
    fight.setTeamUnitsAlive(TeamVals.RIGHT, 1);
    fight.startFight();
    fight.startTurn(TeamVals.LEFT, HoCLib.getTimeMillis(), 2);
    const grace = mock(() => true);
    const finish = mock(() => undefined);
    const buttons = mock(() => undefined);
    const log = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        currentActiveUnit: activeUnit,
        unitsHolder: holder,
        sc_sceneLog: { updateLog: log },
        sc_visibleState: {
            canRequestAdditionalTime: true,
            hasAdditionalTime: false,
            secondsMax: 0,
            secondsRemaining: 0,
        },
        sc_visibleStateUpdateNeeded: false,
        sandboxConsecutiveTimeouts: 0,
        sandboxGraceTurnUsed: false,
        replayPlaybackActive: false,
        aiController: { performingAction: false, isAIActive: false, forceCurrentTurn: mock(() => true) },
        buttonManager: { refreshButtons: buttons },
        runSandboxGraceTurn: grace,
        finishTurn: finish,
    }) as TimeoutScene;
    const offered = (team = TeamVals.LEFT) =>
        additionalTurnTimeFor(
            {
                fightProperties: fight,
                unitsHolder: holder,
                getCurrentActiveUnitId: () => scene.currentActiveUnit?.getId(),
            },
            team,
        );
    return { scene, fight, activeUnit, support, opponent, grace, finish, buttons, log, offered };
}

describe("sandbox turn timeout", () => {
    test("automatically spends available extra time before a missed turn, then uses the existing grace turn", () => {
        const f = fixture();
        const deadline = f.fight.getCurrentTurnEnd();
        const extraTime = f.offered();
        const morale = f.activeUnit.getMorale();
        f.scene.handleLocalTurnTimeout(deadline - 1);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline);

        f.scene.handleLocalTurnTimeout(deadline);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline + extraTime);
        expect(f.offered()).toBe(0);
        expect(f.scene.currentActiveUnit).toBe(f.activeUnit);
        expect(f.activeUnit.getMorale()).toBe(morale);
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(0);
        expect(f.scene.sandboxGraceTurnUsed).toBe(false);
        expect(f.scene.aiController.isAIActive).toBe(false);
        expect(f.grace).not.toHaveBeenCalled();
        expect(f.scene.aiController.forceCurrentTurn).not.toHaveBeenCalled();
        expect(f.finish).not.toHaveBeenCalled();
        expect(f.scene.sc_visibleState).toMatchObject({ canRequestAdditionalTime: false, hasAdditionalTime: true });
        expect(f.scene.sc_visibleState.secondsMax).toBe(
            (f.fight.getCurrentTurnEnd() - f.fight.getCurrentTurnStart()) / 1000,
        );
        expect(f.scene.sc_visibleStateUpdateNeeded).toBe(true);

        f.scene.handleLocalTurnTimeout(deadline + 1);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline + extraTime);
        expect(f.log).toHaveBeenCalledTimes(1);
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(0);

        f.scene.handleLocalTurnTimeout(deadline + extraTime);
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(1);
        expect(f.scene.sandboxGraceTurnUsed).toBe(true);
        expect(f.grace).toHaveBeenCalledTimes(1);
    });

    test("a manually used extension cannot be spent again at expiry", () => {
        const f = fixture();
        f.scene.requestTime(TeamVals.LEFT);
        const deadline = f.fight.getCurrentTurnEnd();
        f.scene.handleLocalTurnTimeout(deadline);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline);
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(1);
        expect(f.grace).toHaveBeenCalledTimes(1);
    });

    test("extra time preserves an earlier miss; its expiry still triggers the second-miss AI takeover", () => {
        const f = fixture();
        f.scene.sandboxConsecutiveTimeouts = 1;
        f.scene.sandboxGraceTurnUsed = true;
        f.scene.handleLocalTurnTimeout(f.fight.getCurrentTurnEnd());
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(1);
        expect(f.scene.aiController.isAIActive).toBe(false);

        f.scene.handleLocalTurnTimeout(f.fight.getCurrentTurnEnd());
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(2);
        expect(f.scene.aiController.isAIActive).toBe(true);
        expect(f.buttons).toHaveBeenCalledTimes(1);
        expect(f.grace).not.toHaveBeenCalled();
    });

    test("the allowance is shared by the team's units and resets on the next lap", () => {
        const f = fixture();
        f.scene.handleLocalTurnTimeout(f.fight.getCurrentTurnEnd());
        f.scene.currentActiveUnit = f.support;
        f.fight.startTurn(TeamVals.LEFT, f.fight.getCurrentTurnEnd() + 1, 2);
        const deadline = f.fight.getCurrentTurnEnd();
        f.scene.handleLocalTurnTimeout(deadline);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline);
        expect(f.grace).toHaveBeenCalledTimes(1);

        f.fight.flipLap();
        f.fight.startTurn(TeamVals.LEFT, deadline + 1, 2);
        f.scene.handleLocalTurnTimeout(f.fight.getCurrentTurnEnd());
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(1);
        expect(f.scene.aiController.isAIActive).toBe(false);
        expect(f.offered()).toBe(0);
        expect(f.grace).toHaveBeenCalledTimes(1);
    });

    test("each team has its own extension and an off-turn request cannot consume it", () => {
        const f = fixture();
        const deadline = f.fight.getCurrentTurnEnd();
        f.scene.requestTime(TeamVals.RIGHT);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline);
        expect(f.fight.getHasAdditionalTimeRequestedPerTeam().has(TeamVals.RIGHT)).toBe(false);

        f.scene.handleLocalTurnTimeout(deadline);
        f.scene.currentActiveUnit = f.opponent;
        f.fight.startTurn(TeamVals.RIGHT, f.fight.getCurrentTurnEnd() + 1, 1);
        const opponentDeadline = f.fight.getCurrentTurnEnd();
        const opponentExtra = f.offered(TeamVals.RIGHT);
        f.scene.handleLocalTurnTimeout(opponentDeadline);
        expect(f.fight.getCurrentTurnEnd()).toBe(opponentDeadline + opponentExtra);
        expect(f.scene.sandboxConsecutiveTimeouts).toBe(0);
        expect(f.grace).not.toHaveBeenCalled();
    });

    test("mindless units keep the human's extra time and grace allowance", () => {
        const f = fixture(true);
        const deadline = f.fight.getCurrentTurnEnd();
        f.scene.handleLocalTurnTimeout(deadline);
        expect(f.fight.getCurrentTurnEnd()).toBe(deadline);
        expect(f.offered()).toBeGreaterThan(0);
        expect(f.scene.sandboxGraceTurnUsed).toBe(false);
        expect(f.grace).not.toHaveBeenCalled();
        expect(f.scene.aiController.forceCurrentTurn).toHaveBeenCalledTimes(1);
    });

    test("a refused extension still falls back to a skip when grace and AI cannot play", () => {
        const f = fixture();
        f.scene.requestTime(TeamVals.LEFT);
        f.grace.mockImplementation(() => false);
        f.scene.aiController.forceCurrentTurn.mockImplementation(() => false);
        f.scene.handleLocalTurnTimeout(f.fight.getCurrentTurnEnd());
        expect(f.finish).toHaveBeenCalledWith(false, "timeout");
    });

    const blockedCases: [string, (f: ReturnType<typeof fixture>) => void][] = [
        ["ranked transport", (f) => (f.scene.sc_gameActionTransport = () => undefined)],
        ["replay", (f) => (f.scene.replayPlaybackActive = true)],
        ["AI control", (f) => (f.scene.aiController.isAIActive = true)],
        ["action in progress", (f) => (f.scene.aiController.performingAction = true)],
        ["no active unit", (f) => (f.scene.currentActiveUnit = undefined)],
        ["finished fight", (f) => f.fight.finishFight()],
        ["placement", () => FightStateManager.getInstance().setFightProperties(new FightProperties())],
    ];
    for (const [name, block] of blockedCases) {
        test(`does not consume time or automate during ${name}`, () => {
            const f = fixture();
            const deadline = f.fight.getCurrentTurnEnd();
            block(f);
            f.scene.handleLocalTurnTimeout(deadline);
            expect(f.fight.getCurrentTurnEnd()).toBe(deadline);
            expect(f.fight.getHasAdditionalTimeRequestedPerTeam().size).toBe(0);
            expect(f.scene.sandboxConsecutiveTimeouts).toBe(0);
            expect(f.grace).not.toHaveBeenCalled();
            expect(f.scene.aiController.forceCurrentTurn).not.toHaveBeenCalled();
            expect(f.finish).not.toHaveBeenCalled();
        });
    }
});
