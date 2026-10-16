import { describe, expect, test } from "bun:test";
import { Container, Text } from "pixi.js";
import type { GridSettings, IVisibleDamage, UnitsHolder } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { RangedProjectiles } from "./sandbox/RangedProjectiles";
import { RangedProjectiles as LevelOneProjectiles } from "./sandbox/LevelOneRangedProjectiles";

const gs = { getCellSize: () => 100 } as GridSettings;
const setup = () => {
    const cleanses: string[] = [];
    const flashes: string[] = [];
    const unit = (id: string, x: number) => ({
        getId: () => id,
        getName: () => "Monk",
        getVisualCenter: () => ({ x, y: 0 }),
        getProjectileImpactPoint: () => ({ x, y: 0 }),
        getRangedProjectileOrigin: () => ({ x, y: 0 }),
        flashBuffApplied: () => flashes.push(id),
    });
    const source = unit("monk", 0);
    const target = unit("enemy", 100);
    const near = unit("near", 25);
    const far = unit("far", 75);
    const units = new Map([source, target, near, far].map((entry) => [entry.getId(), entry]));
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        isSceneDestroyed: () => false,
        combatVisuals: { showCleanse: (position: { x: number }) => cleanses.push(position.x === 25 ? "near" : "far") },
    });
    const lifted = (unitId: string, liftedNames = ["Stun"]) => ({
        sourceUnitId: source.getId(),
        unitId,
        liftedNames,
        position: { x: 0, y: 0 },
        response: false,
        hitIndex: 0,
    });
    const damage: IVisibleDamage = {
        amount: 10,
        render: true,
        unitPosition: { x: 100, y: 0 },
        unitIsSmall: true,
        absolutions: [lifted("near"), lifted("far", ["Weakness", "Sadness"])],
    };
    const strike = { attackerId: "monk", targetId: "enemy", response: false, hitIndex: 0 };
    const progress = () => scene.createAbsolvingArrowProgress(source, target, damage, strike, units);
    return { scene, source, target, units, damage, strike, lifted, progress, cleanses, flashes };
};

describe("Absolving Arrow success VFX", () => {
    test("cleanses each ally when the projectile crosses it, once despite repeated frames and fallback", () => {
        const { progress, cleanses, flashes, scene, damage } = setup();
        const flight = progress();
        flight(0.2);
        expect(cleanses).toEqual([]);
        flight(0.25);
        expect(cleanses).toEqual(["near"]);
        flight(0.6);
        expect(cleanses).toEqual(["near"]);
        flight(0.8);
        flight(1);
        scene.showAbsolvingArrowVfx(damage);
        expect(cleanses).toEqual(["near", "far"]);
        expect(flashes).toEqual(["near", "far"]);
    });

    test("has no VFX for missing results or unsuccessful removals", () => {
        const { progress, damage, lifted, cleanses } = setup();
        damage.absolutions = undefined;
        expect(progress()).toBeUndefined();
        damage.absolutions = [lifted("near", [])];
        expect(progress()).toBeUndefined();
        expect(cleanses).toEqual([]);
    });

    test("playing the same recorded attack again presents its cleanses again", () => {
        const { progress, cleanses, scene } = setup();
        progress()(1);
        expect(cleanses).toEqual(["near", "far"]);
        scene.beginDullingDefensePresentation();
        progress()(1);
        expect(cleanses).toEqual(["near", "far", "near", "far"]);
    });

    test("still cleanses on a missed enemy shot, and cancels with the scene", () => {
        const { progress, scene, damage, cleanses } = setup();
        damage.missed = true;
        damage.render = false;
        const flight = progress();
        flight(0.3);
        expect(cleanses).toEqual(["near"]);
        scene.isSceneDestroyed = () => true;
        flight(1);
        expect(cleanses).toEqual(["near"]);
    });

    test("only the recorded source, counter, and volley can present a cleanse", () => {
        const { progress, damage, strike, cleanses } = setup();
        damage.absolutions![0].response = true;
        damage.absolutions![1].hitIndex = 1;
        expect(progress()).toBeUndefined();
        strike.response = true;
        progress()(1);
        expect(cleanses).toEqual(["near"]);
        strike.response = false;
        strike.hitIndex = 1;
        progress()(1);
        expect(cleanses).toEqual(["near", "far"]);
    });

    test("combat playback passes the cleanse callback into the actual projectile flight", async () => {
        const { scene, source, target, damage, strike, cleanses } = setup();
        Object.assign(source, { getAnimationTextureKey: () => undefined });
        Object.assign(target, { getAnimationTextureKey: () => undefined });
        let progress!: (fraction: number) => void;
        let arrive!: () => void;
        Object.assign(scene, {
            dyingVisualUnits: new Set(),
            prepareDirectionalAttackState: () => "attack",
            playUnitCombatSound: () => {},
            playReplayOneShot: () => Promise.resolve(),
            popRecordedDullingDefense: () => {},
            showAttackMissedVfx: () => {},
            playReplayProjectile: (
                _source: unknown,
                _victim: unknown,
                _position: unknown,
                onImpact: () => void,
                _chakram: unknown,
                onProgress: (fraction: number) => void,
            ) =>
                new Promise<void>((resolve) => {
                    progress = onProgress;
                    arrive = () => {
                        onImpact();
                        resolve();
                    };
                }),
        });
        const playback = scene.playCombatExchange(
            source,
            target,
            { attackType: "range", damage },
            [{ ...strike, amount: 0, unitsDied: 0, lethal: false, missed: true }],
            () => {},
        );
        for (let index = 0; index < 12; index++) await Promise.resolve();
        expect(cleanses).toEqual([]);
        progress(0.25);
        expect(cleanses).toEqual(["near"]);
        arrive();
        await playback;
        expect(cleanses).toEqual(["near", "far"]);
    });

    test("uses a distinct CLEANSED label and golden-white burst that tears down normally", () => {
        const attached: Container[] = [];
        const visuals = new CombatVisuals({
            getGridSettings: () => gs,
            getUnitsHolder: () => undefined as unknown as UnitsHolder,
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => {},
            setUnitPropertiesUpdateNeeded: () => {},
            attachToWorldRoot: (container) => attached.push(container),
        });
        visuals.showCleanse({ x: 25, y: 50 });
        const text = attached[0].children[0] as Text;
        expect(text.text).toBe("CLEANSED");
        expect(attached).toHaveLength(2);
        visuals.update(1);
        expect(attached.every((container) => container.destroyed)).toBe(true);
    });
});

test.each([
    ["standard", RangedProjectiles],
    ["level one", LevelOneProjectiles],
] as const)(
    "%s projectile reports actual flight progress and never completes a cancelled cleanse",
    async (_name, Renderer) => {
        const attachments: Container[] = [];
        const projectiles = new Renderer({
            getGridSettings: () => gs,
            attachToWorldRoot: (container) => attachments.push(container),
        });
        const progress: number[] = [];
        let impacts = 0;
        const abort = new AbortController();
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 1000, y: 0 },
            big: true,
            signal: abort.signal,
            onProgress: (fraction) => progress.push(fraction),
            onImpact: () => impacts++,
        });
        for (let index = 0; index < 4; index++) await Promise.resolve();
        expect(progress).toEqual([]);
        projectiles.update(0.001);
        expect(progress).toHaveLength(1);
        expect(progress[0]).toBeGreaterThan(0);
        expect(progress[0]).toBeLessThan(1);
        abort.abort();
        projectiles.update(10);
        await flight;
        expect(progress).toHaveLength(1);
        expect(impacts).toBe(0);
        const nextFlight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 100, y: 0 },
            big: true,
            onProgress: (fraction) => progress.push(fraction),
            onImpact: () => impacts++,
        });
        for (let index = 0; index < 4; index++) await Promise.resolve();
        projectiles.update(10);
        await nextFlight;
        expect(progress.at(-1)).toBe(1);
        expect(impacts).toBe(1);
        projectiles.destroy();
        expect(attachments.every((container) => container.destroyed)).toBe(true);
    },
);
