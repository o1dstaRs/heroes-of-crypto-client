import { describe, expect, test } from "bun:test";
import { Container } from "pixi.js";
import type { GameEvent, GridSettings, IGravechainWave, IVisibleDamage, UnitsHolder } from "@heroesofcrypto/common";

import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { GravechainVfx } from "./sandbox/GravechainVfx";
import { animatableEffectNames } from "./effect_pops";

const links: IGravechainWave["links"] = [
    { unitId: "root", position: { x: 0, y: 0 }, depth: 0, applied: true },
    { unitId: "relay", fromUnitId: "root", position: { x: 100, y: 0 }, depth: 1, applied: false },
    { unitId: "end", fromUnitId: "relay", position: { x: 200, y: 0 }, depth: 2, applied: true },
];
const gs = { getCellSize: () => 100 } as GridSettings;
const wave = (): IGravechainWave => ({
    sourceUnitId: "attacker",
    rootUnitId: "root",
    response: false,
    hitIndex: 0,
    links,
});

describe("Gravechain animation", () => {
    test("binds at arrival, relays through a failure, and frees the graphics after the final hop", () => {
        const attached: Container[] = [];
        const bound: string[] = [];
        const vfx = new GravechainVfx((container) => {
            attached.push(container);
            return 1;
        });
        vfx.spawn(links, 100, (id) => bound.push(id));
        expect(bound).toEqual(["root"]);
        expect(vfx.active).toBe(true);
        vfx.update(0.33);
        expect(bound).toEqual(["root"]);
        vfx.update(0.34);
        expect(bound).toEqual(["root"]);
        vfx.update(0.02);
        expect(bound).toEqual(["root", "end"]);
        expect(attached[0].destroyed).toBe(false);
        vfx.update(1);
        expect(attached[0].destroyed).toBe(true);
        expect(vfx.active).toBe(false);
        expect(bound).toEqual(["root", "end"]);
    });

    test("branches arrive together and a skipped render frame still presents each binding once", () => {
        const bound: string[] = [];
        const vfx = new GravechainVfx(() => 1);
        vfx.spawn(
            [...links, { unitId: "branch", fromUnitId: "root", position: { x: 0, y: 100 }, depth: 1, applied: true }],
            100,
            (id) => bound.push(id),
        );
        vfx.update(0.35);
        expect(bound).toEqual(["root", "branch"]);
        vfx.update(3);
        vfx.update(3);
        expect(bound).toEqual(["root", "branch", "end"]);
    });

    test("all-failed chains stay quiet and teardown cancels future arrivals", () => {
        const bound: string[] = [];
        const attached: Container[] = [];
        const vfx = new GravechainVfx((container) => {
            attached.push(container);
            return 1;
        });
        vfx.spawn(
            links.map((link) => ({ ...link, applied: false })),
            100,
            (id) => bound.push(id),
        );
        expect(attached).toEqual([]);
        vfx.spawn(links, 100, (id) => bound.push(id));
        vfx.clear();
        vfx.update(3);
        expect(bound).toEqual(["root"]);
        expect(attached[0].destroyed).toBe(true);
        expect(vfx.active).toBe(false);
    });

    test("CombatVisuals keeps a travelling chain across hydration and cancels it on full clear", () => {
        const attached: Container[] = [];
        const bound: string[] = [];
        const visuals = new CombatVisuals({
            getGridSettings: () => gs,
            getUnitsHolder: () => undefined as unknown as UnitsHolder,
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => {},
            setUnitPropertiesUpdateNeeded: () => {},
            attachToWorldRoot: (container) => attached.push(container),
        });
        visuals.spawnGravechain(links, 100, (id) => bound.push(id));
        visuals.clear({ keepDetachedOverlays: true });
        expect(attached[0].destroyed).toBe(false);
        visuals.update(0.7);
        expect(bound).toEqual(["root", "end"]);
        visuals.clear();
        expect(attached[0].destroyed).toBe(true);
    });
});

const sceneFixture = () => {
    const spawned: { links: typeof links; onBind: (id: string) => void }[] = [];
    const popped: string[] = [];
    const flashed: string[] = [];
    const units = new Map(
        ["attacker", "root", "relay", "end"].map((id, index) => [
            id,
            {
                getId: () => id,
                getName: () => "Goblin",
                getVisualCenter: () => ({ x: index * 100, y: 10 }),
                getPosition: () => ({ x: index * 100, y: 10 }),
                isSmallSize: () => true,
                isDead: () => false,
                flashDebuffDarken: () => flashed.push(id),
            },
        ]),
    );
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        isSceneDestroyed: () => false,
        combatVisuals: {
            spawnGravechain: (projected: typeof links, _size: number, onBind: (id: string) => void) =>
                spawned.push({ links: projected, onBind }),
        },
        popEffectOnUnit: (unit: { getId(): string }, name: string) => popped.push(`${unit.getId()}:${name}`),
    });
    const damage: IVisibleDamage = {
        amount: 10,
        render: true,
        unitPosition: { x: 0, y: 0 },
        unitIsSmall: true,
        gravechains: [wave()],
    };
    const strike = { attackerId: "attacker", response: false, hitIndex: 0 };
    return { scene, damage, strike, spawned, popped, flashed, units };
};

describe("Gravechain combat presentation", () => {
    test("projects captured figures and pops each successful binding on chain arrival", () => {
        const { scene, damage, strike, spawned, popped, flashed } = sceneFixture();
        scene.showGravechainVfx(damage, strike);
        expect(popped).toEqual([]);
        expect(spawned[0].links.map((link) => link.position)).toEqual([
            { x: 100, y: 10 },
            { x: 200, y: 10 },
            { x: 300, y: 10 },
        ]);
        spawned[0].onBind("end");
        expect(popped).toEqual(["end:Gravebound"]);
        expect(flashed).toEqual(["end"]);
        expect(animatableEffectNames(["Gravebound", "Sadness"])).toEqual(new Set(["Sadness"]));
    });

    test("ties waves to their counter/volley and deduplicates the final event fallback", () => {
        const { scene, damage, strike, spawned } = sceneFixture();
        damage.gravechains![0].response = true;
        damage.gravechains![0].hitIndex = 1;
        scene.showGravechainVfx(damage, strike);
        expect(spawned).toHaveLength(0);
        strike.response = true;
        strike.hitIndex = 1;
        scene.showGravechainVfx(damage, strike);
        scene.showGravechainVfx(damage);
        expect(spawned).toHaveLength(1);
        scene.beginDullingDefensePresentation();
        scene.showGravechainVfx(damage, strike);
        expect(spawned).toHaveLength(2);
    });

    test("defers a Chakram bounce's root until that disc reaches it", () => {
        const { scene, damage, strike, spawned } = sceneFixture();
        scene.showGravechainVfx(damage, strike, undefined, undefined, new Set(["root"]));
        expect(spawned).toHaveLength(0);
        scene.showGravechainVfx(damage, undefined, undefined, new Set(["other"]));
        expect(spawned).toHaveLength(0);
        scene.showGravechainVfx(damage, undefined, undefined, new Set(["root"]));
        expect(spawned).toHaveLength(1);
    });

    test("combat playback starts the chain at projectile contact", async () => {
        const { scene, damage, strike, spawned, units } = sceneFixture();
        const source = units.get("attacker")!;
        const target = units.get("root")!;
        Object.assign(source, { getAnimationTextureKey: () => undefined });
        Object.assign(target, { getAnimationTextureKey: () => undefined });
        let arrive!: () => void;
        Object.assign(scene, {
            dyingVisualUnits: new Set(),
            prepareDirectionalAttackState: () => "attack",
            playUnitCombatSound: () => {},
            playReplayOneShot: () => Promise.resolve(),
            popRecordedDullingDefense: () => {},
            showAttackMissedVfx: () => {},
            playReplayProjectile: (_source: unknown, _victim: unknown, _position: unknown, impact: () => void) =>
                new Promise<void>((resolve) => {
                    arrive = () => {
                        impact();
                        resolve();
                    };
                }),
        });
        const playback = scene.playCombatExchange(
            source,
            target,
            { attackType: "range", damage },
            [{ ...strike, targetId: "root", amount: 0, unitsDied: 0, lethal: false }],
            () => {},
        );
        for (let index = 0; index < 12; index++) await Promise.resolve();
        expect(spawned).toHaveLength(0);
        arrive();
        await playback;
        expect(spawned).toHaveLength(1);
        scene.showGravechainVfx(damage);
        expect(spawned).toHaveLength(1);
    });

    test("a scene destroyed in flight never flashes or pops a later binding", () => {
        const { scene, damage, spawned, popped } = sceneFixture();
        scene.showGravechainVfx(damage);
        scene.isSceneDestroyed = () => true;
        spawned[0].onBind("end");
        scene.showGravechainVfx({ ...damage, gravechains: [wave()] });
        expect(popped).toEqual([]);
        expect(spawned).toHaveLength(1);
    });

    test("a killed root uses its captured position and still reaches the next living unit", () => {
        const { scene, damage, units, spawned, popped } = sceneFixture();
        units.delete("root");
        scene.preDeferredActionUnitHp = new Map([["root", { visualCenter: { x: 125, y: 15 } }]]);
        scene.showGravechainVfx(damage);
        expect(spawned[0].links[0].position).toEqual({ x: 125, y: 15 });
        spawned[0].onBind("root");
        spawned[0].onBind("end");
        expect(popped).toEqual(["end:Gravebound"]);
    });

    test("old recordings still burst for successful applications, once, without inventing a route", () => {
        const { scene, spawned } = sceneFixture();
        const events = [
            {
                type: "effects_applied",
                applications: [
                    { name: "Gravebound", kind: "debuff", unitId: "root" },
                    { name: "Gravebound", kind: "debuff", unitId: "end", resisted: true },
                ],
            },
        ];
        scene.showLegacyGraveboundVfx(events);
        scene.showLegacyGraveboundVfx(events);
        expect(spawned).toHaveLength(1);
        expect(spawned[0].links.map((link) => link.unitId)).toEqual(["root"]);
    });

    test.each(["unit_attacked", "area_attacked", "obstacle_attacked"] as const)(
        "ranked %s fallback plays recorded chains even without a damage number",
        (type) => {
            const { scene, damage, spawned } = sceneFixture();
            damage.render = false;
            Object.assign(scene, {
                noteDeathBlowsFromAttackEvent: () => {},
                applyAuthoritativeSecondaryVfx: () => {},
                applyAuthoritativeSplashVfx: () => false,
            });
            RankedPlayScene.prototype.applyAuthoritativeVfx.call(scene, [{ type, damage } as GameEvent]);
            expect(spawned).toHaveLength(1);
            scene.showGravechainVfx(damage);
            expect(spawned).toHaveLength(1);
        },
    );
});
