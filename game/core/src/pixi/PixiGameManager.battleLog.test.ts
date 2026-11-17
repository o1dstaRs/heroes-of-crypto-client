import { expect, test } from "bun:test";

import { SceneLog } from "../scenes/SceneLog";
import { Sandbox } from "../scenes/Sandbox";
import { PixiGameManager } from "./PixiGameManager";

const fixture = () => {
    const state = {
        move: false,
        swap: false,
        cast: false,
        projectile: false,
        spellImpact: false,
        recovery: false,
        death: false,
        narrowing: false,
        liveReplay: false,
        fullReplay: false,
    };
    const log = new SceneLog();
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneLog: log,
        sc_moveBlocked: false,
        isActiveUnitMoving: false,
        moveAnimManager: { isMoving: () => state.move || state.swap },
        rangedProjectiles: { hasActive: () => state.projectile },
        combatVisuals: { hasPendingSpellImpacts: () => state.spellImpact },
        unitsHolder: {
            getAllUnits: () => new Map([["living", { hasUnfinishedCombatAnimation: () => state.recovery }]]),
        },
        dyingVisualUnits: new Set([{ hasUnfinishedCombatAnimation: () => state.death }]),
    });
    Object.defineProperties(scene, {
        sc_isAnimating: { get: () => state.cast },
        narrowingPresentation: { get: () => state.narrowing },
        replayPlaybackActive: { get: () => state.liveReplay || state.fullReplay },
        fightReplayPlaybackActive: { get: () => state.fullReplay },
    });
    const manager = new PixiGameManager();
    Object.assign(manager, { m_scene: scene });
    const received: string[] = [];
    manager.onAttackLanded.connect((text) => received.push(text));
    const publish = () => (manager as unknown as { publishBattleLog(): void }).publishBattleLog();
    return { state, log, received, publish };
};

const busyStates = [
    "move",
    "swap",
    "cast",
    "projectile",
    "spellImpact",
    "recovery",
    "death",
    "narrowing",
    "liveReplay",
] as const;

test.each(busyStates)("battle log retains outcomes until %s presentation finishes", (busy) => {
    const { state, log, received, publish } = fixture();
    state[busy] = true;
    log.updateLog("attacker hits victim");
    log.pushLine("victim responds");
    publish();
    expect(received).toEqual([]);
    expect(log.hasBeenUpdated()).toBe(true);
    // Presentation must not delay the engine's cursor or lose the authoritative journal tail.
    expect(log.getLogSize()).toBe(2);
    expect(log.getEntriesSince(0)).toEqual(["victim responds", "attacker hits victim"]);
    state[busy] = false;
    publish();
    expect(received).toEqual(["victim responds\nattacker hits victim"]);
    publish();
    expect(received).toHaveLength(1);
});

test("cast completion and projectile contact do not publish before the recipient's recovery finishes", () => {
    const { state, log, received, publish } = fixture();
    state.cast = state.projectile = true;
    log.updateLog("Fireball damages victim");
    publish();
    state.cast = false;
    publish();
    state.projectile = false;
    state.recovery = true;
    publish();
    expect(received).toEqual([]);
    state.recovery = false;
    publish();
    expect(received).toEqual(["Fireball damages victim"]);
});

test("full replays publish each completed record during its gap while keeping the next outcome pending", () => {
    const { state, log, received, publish } = fixture();
    state.fullReplay = state.projectile = true;
    log.pushLine("first action");
    publish();
    expect(received).toEqual([]);
    state.projectile = false;
    publish();
    expect(received).toEqual(["first action"]);
    state.cast = true;
    log.pushLine("second action");
    publish();
    expect(received).toHaveLength(1);
    state.cast = false;
    publish();
    expect(received.at(-1)).toBe("second action\nfirst action");
});

test("an idle refusal or reconnect snapshot is immediately readable", () => {
    const { log, received, publish } = fixture();
    log.pushLine("Action rejected");
    publish();
    expect(received).toEqual(["Action rejected"]);
    log.clear();
    log.pushLine("Reconnected match history");
    publish();
    expect(received.at(-1)).toBe("Reconnected match history");
});
