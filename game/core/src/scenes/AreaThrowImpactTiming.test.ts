import { afterEach, expect, test } from "bun:test";
import { GridConstants, GridMath, GridSettings, type GameEvent, type HoCMath } from "@heroesofcrypto/common";
import { Container } from "pixi.js";

import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { RangedProjectiles, type IFireProjectileOptions } from "./sandbox/RangedProjectiles";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
const flush = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
};

const fixture = (redirect = false, shooter = "Gargantuan") => {
    const events: string[] = [];
    const width = gs.getMaxX() - gs.getMinX();
    const logical = (fraction: number) => ({ x: gs.getMinX() + width * fraction, y: gs.getMaxY() * 0.5 });
    const makeUnit = (id: string, fraction: number) => {
        const position = logical(fraction);
        const center = projectBattlefieldPoint(position, gs);
        const unit = Object.assign(Object.create(RenderableUnit.prototype) as RenderableUnit, {
            amount: 3,
            getId: () => id,
            getName: () => (id === "giant" ? shooter : "Squire"),
            getPosition: () => position,
            getCells: () => [GridMath.getCellForPosition(gs, position)],
            getTeam: () => (id === "giant" ? 1 : 2),
            getVisualCenter: () => center,
            getProjectileImpactPoint: () => center,
            getProjectileGroundPoint: () => center,
            getDamagePredictionAnchor: () => center,
            getRangedProjectileOrigin: () => center,
            getAnimationTextureKey: () => undefined,
            getAttackAnimationStateForTarget: () => "attack",
            faceBoardTarget: () => {},
            getUnitProperties: () => ({ level: 1 }),
            getAmountAlive: () => unit.amount,
            getCumulativeHp: () => unit.amount * 10,
            isDead: () => unit.amount <= 0,
            getAbility: (name: string) => (id === "giant" && name === "Double Throw" ? {} : undefined),
            hasAbilityActive: (name: string) => id === "giant" && name === "Area Throw",
            hasAnimationState: () => false,
            playCyclopsLabRangedThrow: () => false,
        });
        return unit;
    };
    const giant = makeUnit("giant", 0.1);
    const near = makeUnit("near", redirect ? 0.35 : 0.7);
    const far = makeUnit("far", 0.75);
    const units = new Map([giant, near, far].map((unit) => [unit.getId(), unit]));
    const attachments: Container[] = [];
    const projectiles = new RangedProjectiles({
        getGridSettings: () => gs,
        attachToWorldRoot: (object) => attachments.push(object),
    });
    Object.assign(projectiles, {
        ensureProjectileTexture: () => Promise.resolve(),
        spawnGargantuanImpact: () => {},
        spawnCyclopsImpact: () => {},
        ensureGargantuanImpactTexture: () => Promise.resolve(),
    });
    cleanup.push(() => {
        projectiles.destroy();
        attachments.forEach((object) => {
            if (!object.destroyed) object.destroy({ children: true });
        });
    });
    const shots: IFireProjectileOptions[] = [];
    const fire = (options: IFireProjectileOptions) => {
        shots.push(options);
        return projectiles.fire(options);
    };
    const damage = {
        amount: 0,
        rangedVolleyCount: 2,
        splash: [
            { unitId: "near", position: near.getPosition(), amount: 11, unitsDied: 1 },
            { unitId: "far", position: far.getPosition(), amount: 22, unitsDied: 3 },
            { unitId: "near", position: near.getPosition(), amount: 7, unitsDied: 1 },
        ],
    };
    if (redirect) {
        damage.splash = [
            { unitId: "near", position: near.getPosition(), amount: 30, unitsDied: 3 },
            { unitId: "far", position: far.getPosition(), amount: 7, unitsDied: 1 },
        ];
    }
    const areaEvent = {
        type: "area_attacked",
        attackerId: "giant",
        targetCell: { x: 11, y: 7 },
        targetPosition: near.getPosition(),
        unitIdsDied: [redirect ? "near" : "far"],
        damage,
        animations: [],
    };
    const record = {
        action: { type: "area_throw_attack", attackerId: "giant", targetCell: areaEvent.targetCell },
        events: [areaEvent, { type: "unit_destroyed", unitId: "far" }],
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units, refreshStackPowerForAllUnits: () => {} },
        dyingVisualUnits: new Set(),
        sceneDestroyed: false,
        isSceneDestroyed: () => scene.sceneDestroyed,
        snapshotRenderableUnits: () => new Map(units),
        shouldDeferActionToAuthoritativeReplay: () => false,
        getAreaThrowImpactCell: () => areaEvent.targetCell,
        preparePyreDeaths: () => {},
        spawnBorrowedGraceVfx: () => {},
        waitForProjectileHitReaction: () => Promise.resolve(true),
        prepareDirectionalAttackState: () => "attack",
        popRecordedDullingDefense: () => {},
        showGravechainVfx: () => {},
        noteDeathBlowsFromAttackEvent: () => {},
        renderAreaImpactVfx: (hits: unknown[]) => events.push(`blast:${hits.length}`),
        showFleshShieldAbsorbedDamage: () => new Map(),
        showWaterShieldAbsorbs: () => {},
        offsetReplayDamagePosition: (position: HoCMath.XY) => position,
        playUnitCombatSound: (unit: typeof giant, role: string) => events.push(`${unit.getId()}:${role}`),
        playReplayOneShot: (unit: typeof giant, state: string) => {
            events.push(`${unit.getId()}:${state}`);
            return Promise.resolve();
        },
        combatVisuals: {
            noteCyclopsKill: (_attacker: RenderableUnit, victim: RenderableUnit) =>
                events.push(`${victim.getId()}:gore`),
            showFloatingDamage: (_position: HoCMath.XY, amount: number) => events.push(`damage:${amount}`),
            showDamageVisualsFromDiff: () => {},
        },
        rangedProjectiles: { fire },
        fireUnitProjectile: (_unit: typeof giant, options: IFireProjectileOptions) => fire(options),
        hoverManager: { clearAOEArea: () => {}, clearAttackVisuals: () => {}, clearHoverSilhouette: () => {} },
        createActionEngine: () => ({
            apply: () => {
                events.push("resolve");
                near.amount = 1;
                far.amount = 0;
                units.delete("far");
                return { completed: true, events: record.events };
            },
        }),
        destroyReplayAttackUnitsAtImpact: (ids: string[]) => events.push(...ids.map((id) => `${id}:death`)),
        applyTurnEngineEvents: () => events.push("turn"),
        applyReplayEvents: () => events.push("reconcile"),
        cleanupDeadUnits: () => {},
        refreshUnits: () => {},
    });
    const plan = [0, 1].map((hitIndex) => ({
        attackerId: "giant",
        targetId: redirect && hitIndex === 1 ? "far" : "near",
        amount: hitIndex === 0 ? 11 : 7,
        unitsDied: 1,
        response: false,
        hitIndex,
        lethal: false,
    }));
    const playTargeted = (deadIds = new Set(areaEvent.unitIdsDied)) =>
        scene.playCombatExchange(
            giant,
            near,
            { ...areaEvent, type: "unit_attacked", attackType: "range", targetId: "near" },
            plan,
            (unit: typeof giant) => events.push(`${unit.getId()}:death`),
            new Map(units),
            record.events,
            false,
            {
                amountsBefore: new Map([...units].map(([id, unit]) => [id, unit.amount])),
                deadIds,
            },
        );
    const playFree = (replay = false) =>
        scene.performAreaThrow(giant, areaEvent.targetCell, areaEvent.targetPosition, replay ? record : undefined);
    const advance = (fraction: number) => {
        const shot = shots.at(-1)!;
        const distance = Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y);
        projectiles.update((distance * fraction) / (gs.getCellSize() * 64));
    };
    return {
        scene,
        giant,
        near,
        far,
        units,
        damage,
        areaEvent,
        record,
        events,
        shots,
        projectiles,
        playTargeted,
        playFree,
        advance,
    };
};

test.each(["targeted", "free"])(
    "%s Double Throw lands every victim's damage and reaction at each rock's impact",
    async (mode) => {
        const f = fixture();
        const pending = mode === "targeted" ? f.playTargeted() : f.playFree();
        await flush();
        f.advance(0.99);
        expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual([]);
        expect([f.near.getDisplayedAmount(), f.far.getDisplayedAmount()]).toEqual([3, 3]);
        f.advance(0.02);
        expect(f.events).toContain("near:hit");
        expect(f.events).toContain("far:death");
        expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:11", "damage:22"]);
        expect([f.near.getDisplayedAmount(), f.far.getDisplayedAmount()]).toEqual([2, 0]);
        expect(f.shots).toHaveLength(1);
        await flush();
        expect(f.shots).toHaveLength(2);
        f.advance(0.99);
        expect(f.near.getDisplayedAmount()).toBe(2);
        f.advance(0.02);
        expect(f.near.getDisplayedAmount()).toBe(1);
        expect(f.events.filter((entry) => entry === "near:hit")).toHaveLength(2);
        await pending;
        expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:11", "damage:22", "damage:7"]);
        expect(f.events.filter((entry) => entry === "far:death")).toHaveLength(1);
        expect(f.events.filter((entry) => entry.startsWith("blast:"))).toEqual(["blast:2", "blast:1"]);
    },
);

test("live free throws resolve once and retain first-wave victims until their impact", async () => {
    const f = fixture();
    const pending = f.playFree();
    await flush();
    expect(f.events[0]).toBe("resolve");
    expect([f.near.amount, f.far.amount]).toEqual([1, 0]);
    expect([f.near.getDisplayedAmount(), f.far.getDisplayedAmount()]).toEqual([3, 3]);
    expect(f.scene.dyingVisualUnits.has(f.far)).toBe(true);
    f.advance(1);
    expect(f.events).toContain("far:death");
    expect(f.events).not.toContain("turn");
    await flush();
    f.advance(1);
    await pending;
    expect(f.events.filter((entry) => entry === "resolve")).toHaveLength(1);
    expect(f.events.at(-1)).toBe("turn");
    expect(f.scene.sc_moveBlocked).toBe(false);
});

test("a second rock that passes a slain interceptor only hits its new victim at the second landing", async () => {
    const f = fixture(true);
    const pending = f.playTargeted();
    await flush();
    f.advance(1);
    expect(f.events).toContain("near:death");
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:30"]);
    expect(f.far.getDisplayedAmount()).toBe(3);
    await flush();
    expect(f.shots).toHaveLength(2);
    expect(f.shots[0].to).toEqual(f.near.getProjectileImpactPoint());
    expect(f.shots[1].to).toEqual(f.far.getProjectileImpactPoint());
    f.advance(1);
    await pending;
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:30", "damage:7"]);
    expect(f.far.getDisplayedAmount()).toBe(2);
});

test("a rejected local replay still uses both authoritative damage waves at impact", async () => {
    const f = fixture();
    f.scene.createActionEngine = () => ({ apply: () => ({ completed: false, events: [] }) });
    const pending = f.playFree(true);
    await flush();
    f.advance(1);
    expect(f.events).toContain("far:death");
    expect(f.events).not.toContain("damage:7");
    await flush();
    f.advance(1);
    await pending;
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:11", "damage:22", "damage:7"]);
    expect(f.events.at(-1)).toBe("reconcile");
});

test("a first-wave death keeps the second empty rock without repeating its casualty", async () => {
    const f = fixture();
    f.damage.splash = [f.damage.splash[1]];
    const pending = f.playFree();
    await flush();
    f.advance(1);
    expect(f.events).toContain("far:death");
    await flush();
    expect(f.shots).toHaveLength(2);
    f.advance(1);
    await pending;
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:22"]);
    expect(f.events.filter((entry) => entry === "far:death")).toHaveLength(1);
});

test.each(["targeted", "free"])(
    "a revived %s victim reacts without a final death and restores its living stack count",
    async (mode) => {
        const f = fixture();
        f.scene.createActionEngine = () => ({ apply: () => ({ completed: true, events: f.record.events }) });
        const pending = mode === "targeted" ? f.playTargeted(new Set()) : f.playFree();
        await flush();
        f.advance(1);
        expect(f.events).toContain("far:hit");
        expect(f.events).not.toContain("far:death");
        await flush();
        f.advance(1);
        await pending;
        expect(f.far.getAmountAlive()).toBe(3);
        expect(f.far.getDisplayedAmount()).toBe(3);
    },
);

test.each(["local", "replay"])("a %s free throw consumes death attribution once across turn events", async (mode) => {
    const f = fixture();
    const attributed: string[] = [];
    const outstanding = new Set<string>();
    const prototype = Sandbox.prototype as unknown as {
        noteDeathBlowsFromAttackEvent: (event: GameEvent) => void;
    };
    Object.assign(f.scene, {
        notedDeathBlowEvents: new WeakSet(),
        noteDeathBlowsFromAttackEvent: prototype.noteDeathBlowsFromAttackEvent,
        destroyReplayAttackUnitsAtImpact: (ids: string[]) => ids.forEach((id) => outstanding.delete(id)),
        applyTurnEngineEvents: (events: GameEvent[]) => {
            for (const event of events) {
                if (event.type === "area_attacked") f.scene.noteDeathBlowsFromAttackEvent(event);
            }
        },
    });
    Object.assign(f.scene.combatVisuals, {
        noteDeathBlow: (id: string) => {
            attributed.push(id);
            outstanding.add(id);
        },
    });
    if (mode === "replay") {
        const apply = f.scene.createActionEngine().apply;
        const localAreaEvent = { ...f.areaEvent, unitIdsDied: ["far", "rerolled-victim"] };
        f.scene.createActionEngine = () => ({
            apply: () => ({
                ...apply(),
                events: [localAreaEvent, { type: "unit_destroyed", unitId: "far" }],
            }),
        });
    }
    const pending = f.playFree(mode === "replay");
    await flush();
    expect(attributed).toEqual(["far"]);
    expect([...outstanding]).toEqual(["far"]);
    f.advance(1);
    expect(outstanding.size).toBe(0);
    await flush();
    f.advance(1);
    await pending;
    expect(attributed).toEqual(["far"]);
    expect(outstanding.size).toBe(0);
});

test.each(["local", "replay"])("a %s free throw projects its landing and keeps logical facing", async (mode) => {
    const f = fixture();
    const originTargets: HoCMath.XY[] = [];
    const facingTargets: HoCMath.XY[] = [];
    const animationTargets: HoCMath.XY[] = [];
    const origin = f.giant.getVisualCenter();
    Object.assign(f.giant, {
        getRangedProjectileOrigin: (position: HoCMath.XY) => {
            originTargets.push(position);
            return origin;
        },
        faceBoardTarget: (position: HoCMath.XY) => facingTargets.push(position),
        getAttackAnimationStateForTarget: (position: HoCMath.XY) => {
            animationTargets.push(position);
            return "attack";
        },
    });
    const logicalTarget =
        mode === "replay"
            ? f.areaEvent.targetPosition
            : GridMath.getPositionForCell(f.areaEvent.targetCell, gs.getMinX(), gs.getStep(), gs.getHalfStep());
    const projectedTarget = projectBattlefieldPoint(logicalTarget, gs);
    const pending = f.playFree(mode === "replay");
    await flush();
    const shot = f.shots[0];
    f.scene.sceneDestroyed = true;
    f.projectiles.destroy();
    await pending;
    expect(shot.to).toEqual(projectedTarget);
    expect(shot.gargantuanImpactPosition).toEqual(projectedTarget);
    expect(originTargets).toEqual([projectedTarget]);
    expect(facingTargets).toEqual([logicalTarget]);
    expect(animationTargets).toEqual([logicalTarget]);
});

test.each(["targeted", "free"])("cancelling a %s throw suppresses damage and the next rock", async (mode) => {
    const f = fixture();
    const pending = mode === "targeted" ? f.playTargeted() : f.playFree();
    await flush();
    f.advance(0.5);
    f.scene.sceneDestroyed = true;
    f.projectiles.destroy();
    await pending;
    expect(f.shots).toHaveLength(1);
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual([]);
    expect([f.near.getDisplayedAmount(), f.far.getDisplayedAmount()]).toEqual([3, 3]);
    expect(f.events).not.toContain("turn");
});

test.each(["targeted", "live free", "replay free"])(
    "Cyclops %s multi-stack deaths are marked only at each killing boulder's contact",
    async (mode) => {
        const f = fixture(false, "Cyclops");
        f.damage.splash[2].unitsDied = 2;
        f.areaEvent.unitIdsDied = ["near", "far"];
        f.record.events.push({ type: "unit_destroyed", unitId: "near" });
        if (mode !== "targeted") {
            f.scene.createActionEngine = () => ({
                apply: () => {
                    f.near.amount = 0;
                    f.far.amount = 0;
                    f.units.clear();
                    return { completed: true, events: f.record.events };
                },
            });
        }
        const pending = mode === "targeted" ? f.playTargeted() : f.playFree(mode === "replay free");
        await flush();
        expect(f.events.filter((entry) => entry.endsWith(":gore"))).toEqual([]);
        f.advance(0.99);
        expect(f.events.filter((entry) => entry.endsWith(":gore"))).toEqual([]);
        f.advance(0.02);
        expect(f.events.filter((entry) => entry.endsWith(":gore"))).toEqual(["far:gore"]);
        expect(f.events.indexOf("far:gore")).toBeLessThan(f.events.indexOf("far:death"));
        expect(f.events).toContain("near:hit");
        await flush();
        expect(f.shots).toHaveLength(2);
        f.advance(1.01);
        await pending;
        expect(f.events.filter((entry) => entry.endsWith(":gore"))).toEqual(["far:gore", "near:gore"]);
        expect(f.events.indexOf("near:gore")).toBeLessThan(f.events.indexOf("near:death"));
    },
);

test.each(["Cyclops", "Gargantuan"])(
    "%s keeps ordinary deaths without two directly destroyed stacks",
    async (shooter) => {
        const f = fixture(false, shooter);
        const pending = f.playTargeted();
        await flush();
        f.advance(1.01);
        await flush();
        f.advance(1.01);
        await pending;
        expect(f.events).toContain("far:death");
        expect(f.events.filter((entry) => entry.endsWith(":gore"))).toEqual([]);
    },
);
