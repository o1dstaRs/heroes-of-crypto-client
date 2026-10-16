import { afterEach, expect, mock, test } from "bun:test";
import { FightProperties, FightStateManager } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import type { PremiumTurnAdvice } from "../api/premium_client";

const previousFight = FightStateManager.getInstance().getFightProperties();
afterEach(() => FightStateManager.getInstance().setFightProperties(previousFight));
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

function fixture() {
    const fight = new FightProperties();
    fight.startFight();
    FightStateManager.getInstance().setFightProperties(fight);
    const unit = {
        getId: () => "actor",
        isDead: () => false,
        getPosition: () => ({ x: 0, y: 0 }),
        getAttackTypeSelection: () => 1,
        hasAbilityActive: () => false,
    };
    const advice: PremiumTurnAdvice = {
        sequence: 1,
        lap: 1,
        unitId: "actor",
        status: "ready",
        options: [{ id: "wait", label: "Wait", reasons: [], actions: [{ type: "wait_turn", unitId: "actor" }] }],
    };
    const suggest = mock(() => advice);
    const draw = mock(() => {});
    const setVisible = mock((_visible: boolean) => {});
    const scene = Object.create(Sandbox.prototype) as Sandbox;
    Object.assign(scene, {
        currentActiveUnit: unit,
        sandboxPremiumEnabled: false,
        sandboxPremiumRevision: 1,
        sandboxPremiumModule: Promise.resolve({ sandboxPremiumAdvice: suggest }),
        sandboxPremiumOverlay: { draw, setVisible },
        getTurnActivationKey: () => "turn-1",
        isPlayingActionAnimation: () => false,
        aiController: { shouldControlCurrentUnit: () => false },
        grid: { getMatrix: () => [] },
        unitsHolder: { getAllUnits: () => new Map() },
        sc_sceneSettings: { getGridSettings: () => ({}) },
    });
    const update = () => (scene as unknown as { updateSandboxPremiumGuidance(): void }).updateSandboxPremiumGuidance();
    return { scene, update, suggest, draw, setVisible, unit };
}

test("sandbox Premium automatically draws once per board revision with no user request", async () => {
    const f = fixture();
    f.update();
    expect(f.suggest).not.toHaveBeenCalled();
    f.scene.setPremiumSandboxGuidance(true);
    f.update();
    await flush();
    expect(f.suggest).toHaveBeenCalledTimes(1);
    expect(f.draw).toHaveBeenCalledTimes(1);
    f.update();
    f.update();
    expect(f.suggest).toHaveBeenCalledTimes(1);
    expect(f.setVisible).toHaveBeenLastCalledWith(true);
    Object.assign(f.scene, { sandboxPremiumRevision: 2 });
    f.update();
    f.update();
    expect(f.setVisible).toHaveBeenLastCalledWith(false);
    await flush();
    expect(f.draw).toHaveBeenCalledTimes(2);
    f.scene.setPremiumSandboxGuidance(false);
    expect(f.setVisible).toHaveBeenLastCalledWith(false);
});

test("sandbox drawings clear during animation, replay, AI control and server-owned matches", async () => {
    for (const changed of [
        { replayPlaybackActive: true },
        { sc_isAIActive: true },
        { aiController: { shouldControlCurrentUnit: () => true } },
        { isPlayingActionAnimation: () => true },
        { sc_gameActionTransport: () => {} },
        { currentActiveUnit: undefined },
    ]) {
        const f = fixture();
        f.scene.setPremiumSandboxGuidance(true);
        f.update();
        await flush();
        Object.assign(f.scene, changed);
        f.update();
        expect(f.setVisible).toHaveBeenLastCalledWith(false);
        expect(f.suggest).toHaveBeenCalledTimes(1);
    }
});

test("a delayed sandbox module cannot draw an old turn after guidance is disabled", async () => {
    const f = fixture();
    let resolve!: (module: { sandboxPremiumAdvice: typeof f.suggest }) => void;
    Object.assign(f.scene, {
        sandboxPremiumModule: new Promise((done) => {
            resolve = done;
        }),
    });
    f.scene.setPremiumSandboxGuidance(true);
    f.update();
    f.scene.setPremiumSandboxGuidance(false);
    resolve({ sandboxPremiumAdvice: f.suggest });
    await flush();
    expect(f.suggest).not.toHaveBeenCalled();
    expect(f.draw).not.toHaveBeenCalled();
});
