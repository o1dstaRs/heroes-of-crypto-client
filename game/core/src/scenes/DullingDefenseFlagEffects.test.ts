import { expect, mock, test } from "bun:test";
import type { GameEvent } from "@heroesofcrypto/common";
import { animationAtlases } from "../generated/animation_atlases";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";
import { isProductionOmittedDisabledUnitAnimationAssetKey } from "../pixi/productionImageAssetPolicy";
import { Sandbox } from "./Sandbox";
import { commonFlagFrameAt } from "./sandbox/CommonFlagPops";

test("Dulling Defense paints every fracture cel in one second and remains available on demand", () => {
    const meta = animationAtlases["Vfx Dulling Defense"].pop;
    expect(meta.frameCount).toBe(9);
    let elapsed = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("dulling_defense", elapsed)).toBe(frame);
        expect(commonFlagFrameAt("dulling_defense", elapsed + duration - 0.01)).toBe(frame);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(meta.loopDurationMs).toBe(1000);
    expect(commonFlagFrameAt("dulling_defense", elapsed)).toBeUndefined();
    for (const key of ["vfx_dulling_defense_pop_atlas", "vfx_dulling_defense_pop_atlas_quarter"]) {
        expect(isLazyCombatEffectAssetKey(key)).toBe(true);
        expect(isProductionOmittedDisabledUnitAnimationAssetKey(key)).toBe(false);
        expect(isProductionOmittedAssetKey(key)).toBe(false);
    }
});

test("confirmed attack loss and the lab use the same flag effect; resisted recipients stay silent and fatal hits retain their confirmed effect", () => {
    let dead = false;
    const unit = {
        isDead: () => dead,
        flashDebuffDarken: mock(() => undefined),
        getName: () => "Goblin Knight",
        getId: () => "attacker",
        getTeam: () => 1,
        getPosition: () => ({ x: 0, y: 0 }),
        getCells: () => [{ x: 0, y: 0 }],
    };
    // The unit the knight's blow strikes: the lab previews the debuff over it, not over the knight.
    const struck = {
        isDead: () => false,
        getName: () => "Pikeman",
        getId: () => "struck",
        getTeam: () => 2,
        getPosition: () => ({ x: 1, y: 0 }),
        getCells: () => [{ x: 1, y: 0 }],
    };
    const spawnCommonFlagPop = mock(() => undefined);
    const popEffectOnUnit = mock(() => undefined);
    const scheduled: (() => void)[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map<string, unknown>([
                    ["attacker", unit],
                    ["struck", struck],
                ]),
        },
        grid: { getOccupantUnitId: (cell: { x: number }) => (cell.x === 1 ? "struck" : "attacker") },
        combatVisuals: { spawnCommonFlagPop },
        dyingVisualUnits: new Set(),
        popEffectOnUnit,
        scheduleSceneTimeout: (callback: () => void) => scheduled.push(callback),
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    const application = { unitId: "attacker", name: "Dulling Defense", kind: "debuff" as const };
    const events: GameEvent[] = [{ type: "effects_applied", applications: [application] }];
    scene.popDullingDefenseApplications(undefined, "attacker");
    scene.popDullingDefenseApplications(
        [{ type: "effects_applied", applications: [{ ...application, resisted: true }] }],
        "attacker",
    );
    scene.popDullingDefenseApplications(events, "missing");
    expect(spawnCommonFlagPop).not.toHaveBeenCalled();
    scene.popDullingDefenseApplications(events, "attacker");
    expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(unit, "dulling_defense");
    expect(popEffectOnUnit).not.toHaveBeenCalled();
    expect(unit.flashDebuffDarken).toHaveBeenCalledTimes(1);
    expect(scene.playCreatureAnimationLabState("dulling_defense").ok).toBe(true);
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(2);
    expect(spawnCommonFlagPop).toHaveBeenLastCalledWith(struck, "dulling_defense", "preview");
    scene.popDullingDefenseApplications(
        [{ type: "effects_applied", applications: [application, application] }],
        "attacker",
    );
    expect(scheduled).toHaveLength(1);
    dead = true;
    scheduled[0]();
    scene.popDullingDefenseApplications(events, "attacker");
    expect(spawnCommonFlagPop).toHaveBeenCalledTimes(5);
});
