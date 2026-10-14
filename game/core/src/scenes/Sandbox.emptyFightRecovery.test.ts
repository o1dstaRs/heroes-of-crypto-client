import { afterEach, expect, mock, test } from "bun:test";
import { FightProperties, FightStateManager, TeamVals } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

const manager = FightStateManager.getInstance();
const originalFight = manager.getFightProperties();
afterEach(() => manager.setFightProperties(originalFight));

function fixture() {
    const fight = new FightProperties();
    fight.startFight();
    manager.setFightProperties(fight);
    const scene = Object.create(Sandbox.prototype) as {
        recoverEmptyStartedFightState(): boolean;
        sc_visibleState: { hasFinished: boolean; teamWin?: number; fightStats?: { winner: number } };
        cleanActivePaths: ReturnType<typeof mock>;
        hoverManager: { clear: ReturnType<typeof mock> };
        sc_onHasStarted: { emit: ReturnType<typeof mock> };
    };
    scene.sc_visibleState = { hasFinished: false };
    scene.cleanActivePaths = mock(() => {});
    scene.hoverManager = { clear: mock(() => {}) };
    scene.sc_onHasStarted = { emit: mock(() => {}) };
    return { scene, fight };
}

test("preserves a completed Armageddon draw and its results instead of reopening placement", () => {
    const { scene, fight } = fixture();
    fight.markFirstTurn();
    fight.finishFight();
    const report = { winner: TeamVals.NO_TEAM };
    scene.sc_visibleState = { hasFinished: true, teamWin: TeamVals.NO_TEAM, fightStats: report };

    for (let frame = 0; frame < 3; frame++) {
        expect(scene.recoverEmptyStartedFightState()).toBe(false);
        expect(manager.getFightProperties()).toBe(fight);
        expect(fight.hasFightStarted()).toBe(true);
        expect(fight.hasFightFinished()).toBe(true);
        expect(scene.sc_visibleState.hasFinished).toBe(true);
        expect(scene.sc_visibleState.fightStats).toBe(report);
    }
    expect(scene.sc_onHasStarted.emit).not.toHaveBeenCalled();
});

test("leaves an empty in-progress combat in the engine's hands until it publishes the result", () => {
    const { scene, fight } = fixture();
    fight.markFirstTurn();
    expect(scene.recoverEmptyStartedFightState()).toBe(false);
    expect(manager.getFightProperties()).toBe(fight);
    expect(scene.sc_onHasStarted.emit).not.toHaveBeenCalled();
});

test("still recovers an empty setup that was accidentally started before any turn", () => {
    const { scene, fight } = fixture();
    expect(scene.recoverEmptyStartedFightState()).toBe(true);
    expect(manager.getFightProperties()).not.toBe(fight);
    expect(manager.getFightProperties().hasFightStarted()).toBe(false);
    expect(scene.sc_visibleState.hasFinished).toBe(false);
    expect(scene.sc_onHasStarted.emit).toHaveBeenCalledWith(false);
});
