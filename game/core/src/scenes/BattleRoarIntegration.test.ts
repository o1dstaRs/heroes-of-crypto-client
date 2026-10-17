import { describe, expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";

function preview(name = "Behemoth", started = true) {
    const unit = {
        getName: () => name,
        hasAnimationState: () => true,
        playOneShotAnimation: mock(() => started),
    };
    const spawnBattleRoarPop = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        combatVisuals: { spawnBattleRoarPop },
    }) as Sandbox;
    return { scene, unit, spawnBattleRoarPop };
}

describe("Battle Roar game and lab wiring", () => {
    test("the ordinary Behemoth cast button also plays the flag effect", () => {
        const { scene, unit, spawnBattleRoarPop } = preview();
        expect(scene.playCreatureAnimationLabState("cast").ok).toBe(true);
        expect(unit.playOneShotAnimation).toHaveBeenCalledWith("cast", undefined, true);
        expect(spawnBattleRoarPop).toHaveBeenCalledTimes(1);
        expect(spawnBattleRoarPop).toHaveBeenCalledWith(unit);
    });

    test("rejected casts and unrelated creatures/actions do not emit a roar", () => {
        for (const [name, started, state] of [
            ["Behemoth", false, "cast"],
            ["Wolf", true, "cast"],
            ["Behemoth", true, "hit"],
        ] as const) {
            const { scene, spawnBattleRoarPop } = preview(name, started);
            scene.playCreatureAnimationLabState(state);
            expect(spawnBattleRoarPop).not.toHaveBeenCalled();
        }
    });

    test.each([
        ["battle_roar_short", 1000],
        ["battle_roar_long", 1500],
    ] as const)("panel %s previews the requested duration over any selected recipient", (state, durationMs) => {
        const { scene, unit, spawnBattleRoarPop } = preview("Wolf");
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(spawnBattleRoarPop).toHaveBeenCalledWith(unit, durationMs);
        expect(unit.playOneShotAnimation).not.toHaveBeenCalled();
    });

    test("local and ranked cast outcomes animate successful living recipients and refreshed buffs", () => {
        const makeUnit = (dead = false) => ({ isDead: () => dead, flashBuffApplied: mock(() => undefined) });
        const ally = makeUnit();
        const dead = makeUnit(true);
        const resisted = makeUnit();
        const units = new Map([
            ["ally", ally],
            ["dead", dead],
            ["resisted", resisted],
        ]);
        const spawnBattleRoarPop = mock(() => undefined);
        const scene = Object.assign(Object.create(Sandbox.prototype), {
            unitsHolder: { getAllUnits: () => units },
            combatVisuals: { spawnBattleRoarPop },
        }) as Sandbox & { renderCastOutcomes: (events: GameEvent[]) => void };
        const event: GameEvent = {
            type: "effects_applied",
            applications: [
                { unitId: "ally", name: "Battle Roar", kind: "buff" },
                { unitId: "ally", name: "Battle Roar", kind: "buff" },
                { unitId: "dead", name: "Battle Roar", kind: "buff" },
                { unitId: "missing", name: "Battle Roar", kind: "buff" },
                { unitId: "resisted", name: "Battle Roar", kind: "buff", resisted: true },
            ],
        };
        scene.renderCastOutcomes([event]);
        expect(spawnBattleRoarPop).toHaveBeenCalledTimes(1);
        expect(spawnBattleRoarPop).toHaveBeenCalledWith(ally);
        expect(ally.flashBuffApplied).toHaveBeenCalledTimes(1);
        expect(dead.flashBuffApplied).not.toHaveBeenCalled();
        expect(resisted.flashBuffApplied).not.toHaveBeenCalled();
        scene.renderCastOutcomes([event]);
        expect(spawnBattleRoarPop).toHaveBeenCalledTimes(2);
    });
});
