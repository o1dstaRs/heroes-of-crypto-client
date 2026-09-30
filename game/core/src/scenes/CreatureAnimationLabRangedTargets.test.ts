import { describe, expect, test } from "bun:test";

import { Sandbox } from "./Sandbox";
import type { RenderableUnit } from "./RenderableUnit";
import type { IFireProjectileOptions } from "./sandbox/RangedProjectiles";

function createPreview(unitName = "Arbalester") {
    const hits: string[] = [];
    const makeUnit = (id: string, x: number, y: number, { team = 1, placed = true, dead = false } = {}) => ({
        getId: () => id,
        getName: () => unitName,
        getTeam: () => team,
        getPosition: () => ({ x, y }),
        getVisualCenter: () => ({ x, y }),
        getProjectileImpactPoint: () => ({ x, y: y + 80 }),
        getCells: () => (placed ? [{ x, y }] : []),
        hasAnimationState: () => true,
        isPlayingOneShotAnimation: (state?: string) => state === "death" && dead,
        hasPendingArbalesterRangedShot: () => false,
        hasPendingDryadRangedShot: () => false,
        playOneShotAnimation: () => hits.push(id),
    });
    const shooter = makeUnit("shooter", 0, 1000);
    const units = new Map([[shooter.getId(), shooter]]);
    const shots: { options: IFireProjectileOptions; state: string }[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabEnabled: true,
        moveAnimManager: { isMoving: () => false },
        creatureAnimationLabPlacedUnit: () => ({ ok: true, unit: shooter }),
        rangedProjectiles: { hasActive: () => false },
        unitsHolder: { getAllUnits: () => units },
        grid: {
            getOccupantUnitId: (cell: { x: number; y: number }) =>
                [...units.values()]
                    .find((unit) => unit.getCells().some((other) => other.x === cell.x && other.y === cell.y))
                    ?.getId(),
        },
        sc_sceneSettings: {
            getGridSettings: () => ({ getCellSize: () => 100, getMinX: () => -1000, getMaxX: () => 1000 }),
        },
        isSceneDestroyed: () => false,
        fireUnitProjectile: async (_unit: RenderableUnit, options: IFireProjectileOptions, state: string) => {
            shots.push({ options, state });
        },
    }) as Sandbox;
    return { scene, units, makeUnit, hits, shots };
}

describe("Arbalester forced lab ranged targets", () => {
    test.each([
        ["attack_up", 1200],
        ["attack_down", 800],
        ["attack", 1000],
    ] as const)("%s can hit a placed figure on the same team", (state, y) => {
        const { scene, units, makeUnit, hits, shots } = createPreview();
        const ally = makeUnit("ally", 300, y);
        units.set(ally.getId(), ally);

        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(shots).toHaveLength(1);
        expect(shots[0].state).toBe(state);
        expect(shots[0].options.to).toEqual({ x: 300, y: y + 80 });
        expect(shots[0].options.arbalesterBolt).toBe(true);
        expect(hits).toHaveLength(0);
        shots[0].options.onImpact?.();
        expect(hits).toEqual(["ally"]);
    });

    test.each([
        ["attack_up", 1200],
        ["attack_down", 800],
        ["attack", 1000],
    ] as const)("%s fires freely when only the shooter is placed", (state, y) => {
        const { scene, hits, shots } = createPreview();
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(shots[0].state).toBe(state);
        expect(shots[0].options.to).toEqual({ x: -400, y });
        expect(shots[0].options.onImpact).toBeUndefined();
        expect(hits).toHaveLength(0);
    });

    test("uses a directional enemy before a friendly practice target", () => {
        const { scene, units, makeUnit, shots } = createPreview();
        for (const unit of [
            makeUnit("ally", 100, 1200),
            makeUnit("enemy", 300, 1300, { team: 2 }),
            makeUnit("wrong-direction", 100, 800, { team: 2 }),
        ]) {
            units.set(unit.getId(), unit);
        }
        expect(scene.playCreatureAnimationLabState("attack_up").ok).toBe(true);
        expect(shots[0].options.to).toEqual({ x: 300, y: 1380 });
    });

    test("ignores unplaced, dead and wrong-direction figures without blocking the shot", () => {
        const { scene, units, makeUnit, shots } = createPreview();
        for (const unit of [
            makeUnit("bench", 100, 1300, { placed: false }),
            makeUnit("dead", 100, 1200, { dead: true }),
            makeUnit("below", 100, 800),
        ]) {
            units.set(unit.getId(), unit);
        }
        expect(scene.playCreatureAnimationLabState("attack_up").ok).toBe(true);
        expect(shots[0].options.to).toEqual({ x: -400, y: 1200 });
        expect(shots[0].options.onImpact).toBeUndefined();
    });

    test("never animates a practice target removed before impact", () => {
        const { scene, units, makeUnit, shots, hits } = createPreview();
        const ally = makeUnit("ally", 300, 800);
        units.set(ally.getId(), ally);
        expect(scene.playCreatureAnimationLabState("attack_down").ok).toBe(true);
        units.delete(ally.getId());
        shots[0].options.onImpact?.();
        expect(hits).toHaveLength(0);
    });

    test("preserves Orc enemy-only targeting", () => {
        const { scene, units, makeUnit, shots } = createPreview("Orc");
        const ally = makeUnit("ally", 300, 1200);
        units.set(ally.getId(), ally);
        expect(scene.playCreatureAnimationLabState("attack_up").ok).toBe(true);
        expect(shots[0].options.to).toEqual({ x: -400, y: 1200 });
        expect(shots[0].options.onImpact).toBeUndefined();
    });
});

describe("Dryad forced lab ranged targets", () => {
    test("waits for the first atlas load, then fires only on release; pending cancellation prevents the shot", async () => {
        for (const [name, cancelled] of [
            ["Dryad", false],
            ["Dryad", true],
            ["Elf", false],
            ["Elf", true],
            ["Medusa", false],
            ["Medusa", true],
        ] as const) {
            const shot = new AbortController();
            let ready!: (value: object) => void;
            let release: (() => void) | undefined;
            const shots: IFireProjectileOptions[] = [];
            const unit = {
                getName: () => name,
                prepareDryadRangedShot: () => shot,
                getAnimationTextureKey: () => "dryad_lab_attack_atlas",
                setBoardFacing: () => {},
                getVisualCenter: () => ({ x: 0, y: 0 }),
                playDryadRangedShot: (_state: string, _shot: AbortController, onRelease: () => void) => {
                    release = onRelease;
                    return true;
                },
                getDryadArrowLength: () => 50,
                getRangedProjectileOrigin: () => ({ x: 25, y: 80 }),
                finishDryadRangedShot: () => {},
            };
            const scene = Object.assign(Object.create(Sandbox.prototype), {
                waitForTexture: () => new Promise((resolve) => (ready = resolve)),
                scheduleSceneTimeout: () => undefined,
                clearSceneTimeout: () => {},
                isSceneDestroyed: () => false,
                sc_sceneSettings: { getGridSettings: () => ({}) },
                rangedProjectiles: {
                    prepare: async () => {},
                    fire: async (opts: IFireProjectileOptions) => {
                        shots.push(opts);
                    },
                },
            }) as {
                fireDryadLabProjectile: (unit: unknown, opts: IFireProjectileOptions, state: string) => Promise<void>;
            };
            const pending = scene.fireDryadLabProjectile(
                unit,
                {
                    from: { x: 0, y: 0 },
                    to: { x: 400, y: 80 },
                    big: false,
                    dryadArrow: name !== "Medusa",
                    medusaArmSerpent: name === "Medusa",
                },
                "attack",
            );
            expect(release).toBeUndefined();
            expect(shots).toHaveLength(0);
            if (cancelled) shot.abort();
            ready({});
            for (let i = 0; i < 5; i++) await Promise.resolve();
            expect(shots).toHaveLength(0);
            if (!cancelled) {
                expect(release).toBeDefined();
                release!();
            }
            await pending;
            expect(shots).toHaveLength(cancelled ? 0 : 1);
            if (!cancelled) {
                expect(shots[0].from).toEqual({ x: 25, y: 80 });
                expect(shots[0].arrowLength).toBe(50);
                expect(shots[0].to).toEqual({ x: 400, y: 80 });
                expect(shots[0].signal).toBe(shot.signal);
                if (name === "Medusa") expect(shots[0].serpentLength).toBe(50);
            }
        }
    });
    test.each([
        ["attack", 1000],
        ["attack_up", 1200],
        ["attack_down", 800],
    ] as const)("%s launches an arrow toward the enemy and reacts only on arrival", (state, y) => {
        const { scene, units, makeUnit, shots, hits } = createPreview("Dryad");
        for (const unit of [makeUnit("ally", 100, y), makeUnit("enemy", 300, y, { team: 2 })])
            units.set(unit.getId(), unit);
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(shots).toHaveLength(1);
        expect(shots[0].state).toBe(state);
        expect(shots[0].options.to).toEqual({ x: 300, y: y + 80 });
        expect(shots[0].options.dryadArrow).toBe(true);
        expect(shots[0].options.orcAxe).toBe(false);
        expect(hits).toHaveLength(0);
        shots[0].options.onImpact?.();
        expect(hits).toEqual(["enemy"]);
    });
});

describe("Medusa forced lab serpent targets", () => {
    test.each(["attack", "attack_up", "attack_down"] as const)(
        "%s launches a serpent and applies hit only on arrival",
        (state) => {
            const { scene, units, makeUnit, shots, hits } = createPreview("Medusa");
            const y = state === "attack_up" ? 1200 : state === "attack_down" ? 800 : 1000;
            const enemy = makeUnit("enemy", 300, y, { team: 2 });
            units.set(enemy.getId(), enemy);
            expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
            expect(shots).toHaveLength(1);
            expect(shots[0].state).toBe(state);
            expect(shots[0].options.medusaSerpent).toBe(true);
            expect(shots[0].options.orcAxe).toBe(false);
            expect(shots[0].options.to).toEqual({ x: 300, y: y + 80 });
            expect(hits).toHaveLength(0);
            shots[0].options.onImpact?.();
            expect(hits).toEqual(["enemy"]);
        },
    );
});

describe("Elf forced lab archery targets", () => {
    test.each(["attack", "attack_up", "attack_down"] as const)("%s routes through the arrow release flow", (state) => {
        const { scene, shots, hits } = createPreview("Elf");
        expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
        expect(shots).toHaveLength(1);
        expect(shots[0].state).toBe(state);
        expect(shots[0].options.dryadArrow).toBe(true);
        expect(shots[0].options.orcAxe).toBe(false);
        expect(shots[0].options.to.y).toBe(state === "attack_up" ? 1200 : state === "attack_down" ? 800 : 1000);
        expect(hits).toHaveLength(0);
    });
});

describe("Centaur forced lab ranged targets", () => {
    test.each(["attack", "attack_up", "attack_down"] as const)(
        "%s launches the centaur spear in its selected direction",
        (state) => {
            const { scene, shots } = createPreview("Centaur");
            expect(scene.playCreatureAnimationLabState(state).ok).toBe(true);
            expect(shots).toHaveLength(1);
            expect(shots[0].state).toBe(state);
            expect(shots[0].options.centaurSpear).toBe(true);
            expect(shots[0].options.orcAxe).toBe(false);
            expect(shots[0].options.arbalesterBolt).toBe(false);
            expect(shots[0].options.to.y).toBe(state === "attack_up" ? 1200 : state === "attack_down" ? 800 : 1000);
        },
    );
});

test.each([
    ["Elf", "attack", 0],
    ["Elf", "attack_up", 100],
    ["Elf", "attack_down", -100],
    ["Medusa", "attack", 0],
    ["Medusa", "attack_up", 100],
    ["Medusa", "attack_down", -100],
] as const)("%s combat %s uses its authored projectile release without lab mode", async (name, state, y) => {
    const routed: { options: IFireProjectileOptions; state: string }[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        creatureAnimationLabEnabled: false,
        rangedProjectiles: {
            prepare: async () => {},
            fire: async () => {
                throw new Error("Unanimated release");
            },
        },
        waitForProjectileHitReaction: async () => true,
        sc_sceneSettings: { getGridSettings: () => ({ getCellSize: () => 100 }) },
        fireDryadLabProjectile: async (_unit: unknown, options: IFireProjectileOptions, action: string) => {
            routed.push({ options, state: action });
        },
    }) as { fireUnitProjectile: (unit: unknown, opts: IFireProjectileOptions) => Promise<void> };
    await scene.fireUnitProjectile(
        { getName: () => name, hasAnimationState: () => true, getProjectileImpactPoint: () => ({ x: 0, y: 0 }) },
        {
            from: { x: 0, y: 0 },
            to: { x: 400, y },
            big: false,
            elfArrow: name === "Elf",
            medusaSerpent: name === "Medusa",
        },
    );
    expect(routed).toHaveLength(1);
    expect(routed[0].state).toBe(state);
    if (name === "Elf") expect(routed[0].options.dryadArrow).toBe(true);
    else expect(routed[0].options.medusaArmSerpent).toBe(true);
    expect(routed[0].options.elfArrow).toBe(false);
    expect(routed[0].options.to).toEqual({ x: 400, y });
});
