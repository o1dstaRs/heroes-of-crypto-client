import { expect, test } from "bun:test";
import { Sandbox } from "./Sandbox";

test.each(["melee", "range"])("%s obstacle attacks show every additional strike and preserve cadence", async (mode) => {
    const events: string[] = [];
    const unit = {
        getName: () => "Squire",
        getVisualCenter: () => ({ x: 0, y: 0 }),
        getRangedProjectileOrigin: () => ({ x: 0, y: 0 }),
        applyRecoil: () => events.push("attack"),
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        isSceneDestroyed: () => false,
        combatVisuals: {
            prepareCommonFlagPop: () => new Promise(() => {}),
            spawnCommonFlagPop: (source: typeof unit, kind: string) => {
                expect(source).toBe(unit);
                events.push(kind);
            },
        },
        playUnitCombatSound: () => {},
        fireUnitProjectile: async () => {
            events.push("attack");
        },
        delayReplay: async () => {
            events.push("existing gap");
        },
    });
    await scene.animateObstacleStrikeSequence(
        unit,
        Array(3).fill({ x: 64, y: 0 }),
        mode === "melee" ? { x: 0, y: 0 } : undefined,
    );
    expect(events).toEqual(
        mode === "melee"
            ? ["attack", "existing gap", "multi_attack", "attack", "existing gap", "multi_attack", "attack"]
            : ["attack", "multi_attack", "attack", "multi_attack", "attack"],
    );
});

test("Pikeman obstacle attacks start the authored thrust and pass the recorded pierce contact before impact", async () => {
    const order: string[] = [];
    const damage = { secondary: [{ source: "skewer_strike", amount: 0, position: { x: 128, y: 0 } }] };
    const recorded = [{ type: "obstacle_attacked", attackerId: "pikeman", targetPosition: { x: 64, y: 0 }, damage }];
    const unit = {
        getId: () => "pikeman",
        getName: () => "Pikeman",
        getVisualCenter: () => ({ x: 0, y: 0 }),
        faceBoardTarget: () => order.push("face"),
        getAttackAnimationStateForTarget: () => "melee_attack",
        getAnimationTextureKey: () => "pikeman_attack_atlas",
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        isSceneDestroyed: () => false,
        showRepeatedAttackFlag: () => {},
        playUnitCombatSound: () => {},
        waitForTexture: async () => order.push("texture"),
        playReplayOneShot: async () => order.push("thrust"),
        spawnSkewerWindSpearVfx: (
            source: unknown,
            target: { getPosition(): unknown },
            actualDamage: unknown,
            events: unknown,
            obstacle: boolean,
        ) => {
            expect(source).toBe(unit);
            expect(target.getPosition()).toEqual({ x: 64, y: 0 });
            expect(actualDamage).toBe(damage);
            expect(events).toBe(recorded);
            expect(obstacle).toBe(true);
            order.push("pierce");
        },
    });
    await scene.animateObstacleStrikeSequence(
        unit,
        [{ x: 64, y: 0 }],
        { x: 0, y: 0 },
        () => order.push("impact"),
        recorded,
    );
    expect(order).toEqual(["face", "texture", "thrust", "pierce", "impact"]);
});
