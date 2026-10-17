import { expect, test } from "bun:test";
import { FightStateManager } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { commonFlagFrameAt } from "./sandbox/CommonFlagPops";
import { animationAtlases } from "../generated/animation_atlases";

test("Made of Fire follows earned buff transitions, including ranked replacement and Lava Striders", () => {
    const fight = FightStateManager.getInstance();
    fight.reset();
    let active = false;
    let dead = false;
    const unit = {
        getId: () => "lava-strider",
        getName: () => "Peasant",
        hasBuffActive: (name: string) => name === "Made of Fire" && active,
        canTraverseLava: () => true,
        isDead: () => dead,
    };
    const units = new Map([[unit.getId(), unit]]);
    const calls: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        madeOfFireBuffStates: new Map(),
        unitsHolder: { getAllUnits: () => units },
        combatVisuals: { spawnCommonFlagPop: (target: unknown, kind: string) => calls.push([target, kind]) },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
    });
    try {
        scene.refreshMadeOfFirePops();
        fight.getFightProperties().startFight();
        active = true;
        const rebuilt = { ...unit };
        units.set(unit.getId(), rebuilt);
        scene.refreshMadeOfFirePops();
        scene.refreshMadeOfFirePops();
        expect(calls).toEqual([[rebuilt, "made_of_fire"]]);
        scene.madeOfFireBuffStates.clear();
        scene.refreshMadeOfFirePops(); // Existing buff on reconnect must be silent.
        expect(calls).toHaveLength(1);
        active = false;
        scene.refreshMadeOfFirePops();
        active = true;
        dead = true;
        scene.refreshMadeOfFirePops();
        expect(calls).toHaveLength(1);
        dead = false;
        expect(scene.playCreatureAnimationLabState("made_of_fire").ok).toBe(true);
        expect(calls.at(-1)).toEqual([unit, "made_of_fire"]);
    } finally {
        fight.reset();
    }
});

test("Made of Fire plays all authored cels in exactly one second", () => {
    const meta = animationAtlases["Vfx Made Of Fire"].pop;
    let time = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        expect(commonFlagFrameAt("made_of_fire", time)).toBe(frame);
        time += duration;
    }
    expect(time).toBe(1000);
    expect(commonFlagFrameAt("made_of_fire", 1000)).toBeUndefined();
});
