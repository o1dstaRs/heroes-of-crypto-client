import { expect, test } from "bun:test";
import type { Container, Text } from "pixi.js";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";

test("only confirmed single Heal uses the emerald cross on the healed recipient", () => {
    const recipient = { isDead: () => false, getVisualCenter: () => ({ x: 120, y: 240 }) };
    const dead = { isDead: () => true };
    const calls: unknown[][] = [];
    let sounds = 0;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        unitsHolder: {
            getAllUnits: () =>
                new Map<string, unknown>([
                    ["ally", recipient],
                    ["dead", dead],
                ]),
        },
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        playSceneGameSound: () => sounds++,
        combatVisuals: { showFloatingHeal: (...args: unknown[]) => calls.push(args) },
    });
    scene.renderHealVfx([
        {
            type: "spell_cast",
            spellName: "Heal",
            healed: [
                { unitId: "ally", amount: 0 },
                { unitId: "missing", amount: 10 },
                { unitId: "dead", amount: 10 },
                { unitId: "ally", amount: 17 },
            ],
        },
        { type: "spell_cast", spellName: "Mass Heal", healed: [{ unitId: "ally", amount: 31 }] },
    ]);
    expect(calls).toEqual([
        [{ x: 120, y: 240 }, 17, recipient, "single_heal"],
        [{ x: 120, y: 240 }, 31, recipient],
    ]);
    expect(sounds).toBe(2);
});

test("single Heal lab preview uses the combat renderer with +125 on the selected unit", () => {
    const position = { x: 120, y: 200 };
    const unit = { getName: () => "Healer", getVisualCenter: () => position };
    const calls: unknown[][] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit }),
        moveAnimManager: { isMoving: () => false },
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        combatVisuals: { showFloatingHeal: (...args: unknown[]) => calls.push(args) },
    });
    expect(scene.playCreatureAnimationLabState("single_heal").ok).toBe(true);
    expect(calls).toEqual([[position, 125, unit, "single_heal"]]);
});

test("combat Heal retains its amount and flag anchor without also spawning the generic heal icon", () => {
    const flag = { x: 120, y: 280 };
    const unit = { getId: () => "healed", getFlagEffectAnchor: () => flag };
    const cross: unknown[] = [];
    const common: unknown[][] = [];
    const numbers: unknown[][] = [];
    const bursts: unknown[] = [];
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        context: { getGridSettings: () => ({ getCellSize: () => 64 }) },
        getDamageStyle: () => ({ fontSize: 18 }),
        spawnHealCross: (target: unknown) => cross.push(target),
        spawnCommonFlagPop: (...args: unknown[]) => common.push(args),
        enqueueFloatingContainer: (...args: unknown[]) => {
            const container = args[0] as Container;
            numbers.push([(container.children[0] as Text).text, ...args.slice(1)]);
            container.destroy({ children: true });
        },
        spawnHealBurst: (position: unknown) => bursts.push(position),
    });
    const position = { x: 120, y: 200 };
    visuals.showFloatingHeal(position, 17, unit, "single_heal");
    visuals.showFloatingHeal(position, 0, unit, "single_heal");
    expect(cross).toEqual([unit]);
    expect(common).toHaveLength(0);
    expect(numbers).toEqual([["+17", position, undefined, { ...flag, unitId: "healed" }, 36]]);
    expect(bursts).toHaveLength(0);
    visuals.showFloatingHeal(position, 31, unit);
    expect(cross).toHaveLength(1);
    expect(common).toEqual([[unit, "heal"]]);
    expect(bursts).toHaveLength(0);
});
