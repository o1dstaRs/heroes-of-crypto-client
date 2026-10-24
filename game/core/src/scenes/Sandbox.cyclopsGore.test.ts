import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { Container, DOMAdapter, Mesh, Texture, TextureSource } from "pixi.js";
import { GridConstants, GridSettings, TeamVals } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { RankedPlayScene } from "./RankedPlayScene";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import type { RenderableUnit } from "./RenderableUnit";
import { cyclopsMultiKillTargets } from "./sandbox/cyclopsMultiKill";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const fixture = (ranked = false) => {
    const world = new Container();
    const texture = new Texture({ source: new TextureSource({ width: 768, height: 768 }) });
    const actor = (id: string, x: number) => {
        const pose = { texture, x, y: 128, anchorX: 0.5, anchorY: 0.97, scaleX: 0.25, scaleY: -0.25 };
        return {
            getId: () => id,
            getName: () => "Peasant",
            getTeam: () => TeamVals.RIGHT,
            getPosition: () => ({ x, y: 128 }),
            getVisualCenter: () => ({ x, y: 190 }),
            getAnimationTextureKey: (): string | undefined => undefined,
            getDamagePredictionAnchor: () => ({ x, y: 128 }),
            getStaticBattlefieldPreviewAt: () => pose,
            getAmountAlive: () => 3,
            getUnitProperties: () => ({ level: 3 }),
            presentDamageCasualties: mock(),
            hasAnimationState: () => true,
            isPlayingOneShotAnimation: () => false,
            playOneShotAnimation: mock((_state: string, done: () => void) => done?.()),
            destroyVisuals: mock(),
        };
    };
    const a = actor("a", 200),
        b = actor("b", 400);
    const units = new Map([a, b].map((unit) => [unit.getId(), unit]));
    const attacker = {
        ...actor("cyclops", -200),
        getName: () => "Cyclops",
        getId: () => "cyclops",
        getTeam: () => TeamVals.LEFT,
        getVisualCenter: () => ({ x: -200, y: 200 }),
        hasAbilityActive: (name: string) => name === "Large Caliber",
    };
    const visuals = new CombatVisuals({
        getGridSettings: () => gs,
        attachToWorldRoot: (root) => {
            world.addChild(root);
        },
        getUnitsHolder: () => undefined!,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => {},
        setUnitPropertiesUpdateNeeded: () => {},
    });
    visuals.showFloatingDamage = mock();
    const explosions = mock(() => false);
    const scene = Object.assign(Object.create(ranked ? RankedPlayScene.prototype : Sandbox.prototype), {
        combatVisuals: visuals,
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: new Set(),
        isSceneDestroyed: () => false,
        renderAreaImpactVfx: () => {},
        popRecordedDullingDefense: () => {},
        showGravechainVfx: () => {},
        playUnitCombatSound: () => {},
        prepareDirectionalAttackState: () => "attack",
        spawnBorrowedGraceVfx: () => {},
        waitForProjectileHitReaction: () => Promise.resolve(),
        offsetReplayDamagePosition: (center: unknown) => center,
        playReplayOneShot: mock(() => Promise.resolve()),
        pyreDeaths: { play: explosions },
    });
    const hit = (unitId: string, unitsDied = 3) => ({ unitId, unitsDied, amount: 100, position: { x: 0, y: 0 } });
    const impact = (hits = [hit("a"), hit("b")]) => {
        const amounts = new Map([
            ["a", 3],
            ["b", 3],
        ]);
        const deadIds = new Set(hits.filter((hit) => hit.unitsDied >= 3).map((hit) => hit.unitId));
        const targets = cyclopsMultiKillTargets(attacker, [hits], amounts, deadIds, units);
        return scene.playAreaThrowImpact(attacker, hits, {
            damage: { amount: 100, splash: hits },
            hitIndex: 0,
            units,
            remainingAmounts: amounts,
            deadIds,
            cyclopsKills: targets,
            onDeath: (id: string) => scene.playCustomDeathAnimation(units.get(id)),
        });
    };
    const cleanup = () => {
        visuals.clear();
        world.destroy({ children: true });
        texture.destroy(true);
    };
    return { world, texture, a, b, actor, units, attacker, visuals, scene, explosions, impact, hit, cleanup };
};

test.each([false, true])(
    "Cyclops multi-kills replace both authored deaths and retain Last Fuse, ranked=%s",
    async (ranked) => {
        const f = fixture(ranked);
        try {
            await f.impact();
            expect(f.world.children.filter((root) => root.label === "cyclops-gore")).toHaveLength(2);
            for (const victim of [f.a, f.b]) {
                expect(victim.playOneShotAnimation).not.toHaveBeenCalled();
                expect(victim.destroyVisuals).toHaveBeenCalledTimes(1);
                expect(f.explosions).toHaveBeenCalledWith(victim.getId(), victim);
                f.scene.playCustomDeathAnimation(victim);
            }
            expect(f.world.children).toHaveLength(2);
            const roots = [...f.world.children];
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(roots.every((root) => !root.destroyed)).toBe(true);
            f.visuals.update(0.25);
            const mesh = roots[0].children.find((child) => child.label === "meat-fragments") as Mesh;
            expect(mesh.shader!.resources.goreUniforms.uniforms.uTime).toBe(0.25);
            f.visuals.clear();
            expect(roots.every((root) => root.destroyed)).toBe(true);
            expect(f.texture.destroyed).toBe(false);
        } finally {
            f.cleanup();
        }
    },
);

test("one destroyed stack and one wounded stack keep their ordinary death and hit animations", async () => {
    const f = fixture();
    try {
        await f.impact([f.hit("a"), f.hit("b", 1)]);
        expect(f.world.children).toHaveLength(0);
        expect(f.a.playOneShotAnimation).toHaveBeenCalled();
        expect(f.scene.playReplayOneShot).toHaveBeenCalledWith(f.b, "hit", 3000, true);
    } finally {
        f.cleanup();
    }
});

test("a captured kill pose survives scratch reuse and resurrection permits a later finishing effect", () => {
    const f = fixture();
    try {
        const unit = f.a as unknown as RenderableUnit;
        const expectedX = f.a.getStaticBattlefieldPreviewAt().x;
        f.visuals.noteCyclopsKill(f.attacker, unit, { x: 1, y: 0 });
        f.a.getStaticBattlefieldPreviewAt().x += 700;
        expect(f.visuals.playCyclopsGoreDeath(unit)).toBe(true);
        expect(f.world.children[0].x).toBe(expectedX);
        f.visuals.resetCyclopsDeath("a", unit);
        expect(f.visuals.playCyclopsGoreDeath(unit)).toBe(false);
        f.visuals.noteCyclopsKill(f.attacker, unit, { x: 1, y: 0 });
        expect(f.visuals.playCyclopsGoreDeath(unit)).toBe(true);
        expect(f.world.children).toHaveLength(2);
    } finally {
        f.cleanup();
    }
});

test("a stolen Chakram keeps Cyclops collateral at primary impact and its bounce death at ricochet contact", async () => {
    const f = fixture();
    const collateral = f.actor("c", 600);
    f.units.set("c", collateral);
    let primaryContact!: () => void;
    let bounceContact!: () => void;
    f.scene.playReplayProjectile = (_source: unknown, _victim: unknown, _target: unknown, impact: () => void) =>
        new Promise<void>((resolve) => {
            primaryContact = () => {
                impact();
                resolve();
            };
        });
    const splash = [f.a, f.b, collateral].map((victim) => ({
        ...f.hit(victim.getId()),
        position: victim.getPosition(),
    }));
    f.scene.playChakramArcs = (
        _source: unknown,
        _damage: unknown,
        _victim: unknown,
        _units: unknown,
        _skipPrimary: unknown,
        impact: (id: string, hit: (typeof splash)[number], direction: { x: number; y: number }) => void,
    ) =>
        new Promise<void>((resolve) => {
            bounceContact = () => {
                impact("b", splash[1], { x: 1, y: 0 });
                resolve();
            };
        });
    const flush = async () => {
        for (let i = 0; i < 24; i++) await Promise.resolve();
    };
    try {
        const pending = f.scene.playCombatExchange(
            f.attacker,
            f.a,
            {
                attackType: "range",
                unitIdsDied: ["a", "b", "c"],
                animations: [],
                damage: {
                    amount: 100,
                    splash,
                    chakramFlights: [
                        {
                            attackerId: "cyclops",
                            primaryTargetId: "a",
                            response: false,
                            hitIndex: 0,
                            splash,
                            arcs: [{ targetUnitId: "b", hitUnitIds: ["b"], cells: [] }],
                        },
                    ],
                },
            },
            [
                {
                    attackerId: "cyclops",
                    targetId: "a",
                    amount: 100,
                    unitsDied: 3,
                    lethal: true,
                    response: false,
                    hitIndex: 0,
                },
            ],
            (victim: RenderableUnit) => f.scene.playCustomDeathAnimation(victim),
            f.units,
            [],
            false,
            {
                amountsBefore: new Map(["a", "b", "c"].map((id) => [id, 3])),
                deadIds: new Set(["a", "b", "c"]),
            },
        );
        await flush();
        expect(f.world.children).toHaveLength(0);
        primaryContact();
        await flush();
        expect(f.world.children.filter((root) => root.label === "cyclops-gore")).toHaveLength(2);
        expect(f.a.destroyVisuals).toHaveBeenCalledTimes(1);
        expect(collateral.destroyVisuals).toHaveBeenCalledTimes(1);
        expect(f.b.destroyVisuals).not.toHaveBeenCalled();
        bounceContact();
        await pending;
        expect(f.world.children.filter((root) => root.label === "cyclops-gore")).toHaveLength(3);
        expect(f.b.destroyVisuals).toHaveBeenCalledTimes(1);
    } finally {
        f.cleanup();
    }
});
