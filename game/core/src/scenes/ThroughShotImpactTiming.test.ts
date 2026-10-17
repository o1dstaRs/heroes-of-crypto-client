import { afterEach, expect, test } from "bun:test";
import { GridConstants, GridSettings, type HoCMath } from "@heroesofcrypto/common";
import { Container } from "pixi.js";

import { Sandbox } from "./Sandbox";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { RangedProjectiles, type IFireProjectileOptions } from "./sandbox/RangedProjectiles";
import { throughShotImpactProgress } from "./sandbox/throughShotImpact";

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

const fixture = (double = false) => {
    const events: string[] = [];
    const width = gs.getMaxX() - gs.getMinX();
    const logical = (fraction: number) => ({ x: gs.getMinX() + width * fraction, y: gs.getMaxY() * 0.5 });
    const makeUnit = (id: string, fraction: number) => {
        const position = logical(fraction);
        const center = projectBattlefieldPoint(position, gs);
        const unit = {
            amount: 3,
            displayed: 3,
            getId: () => id,
            getName: () => (id === "cannon" ? "Tsar Cannon" : "Squire"),
            getPosition: () => position,
            getTeam: () => (id === "cannon" ? 1 : 2),
            getVisualCenter: () => center,
            getProjectileImpactPoint: () => center,
            getDamagePredictionAnchor: () => center,
            getRangedProjectileOrigin: () => center,
            getAnimationTextureKey: () => undefined,
            getFootprintWidth: () => 1,
            getFootprintHeight: () => 1,
            getUnitProperties: () => ({ level: 1 }),
            getAmountAlive: () => unit.amount,
            isDead: () => unit.amount <= 0,
            getAbility: () => undefined,
            hasAbilityActive: (name: string) => id === "cannon" && name === "Through Shot",
            continueDamagePresentation: (amount: number) => (unit.displayed = amount),
            clearDamagePresentation: () => (unit.displayed = unit.amount),
            presentDamageCasualties: (amount: number) => (unit.displayed = Math.max(0, unit.displayed - amount)),
        };
        return unit;
    };
    const cannon = makeUnit("cannon", 0.05);
    const near = makeUnit("near", 0.3);
    const far = makeUnit("far", 0.75);
    const units = new Map([cannon, near, far].map((unit) => [unit.getId(), unit]));
    const attachments: Container[] = [];
    const projectiles = new RangedProjectiles({
        getGridSettings: () => gs,
        attachToWorldRoot: (object) => attachments.push(object),
    });
    Object.assign(projectiles, { ensureProjectileTexture: () => Promise.resolve() });
    cleanup.push(() => {
        projectiles.destroy();
        attachments.forEach((object) => {
            if (!object.destroyed) object.destroy({ children: true });
        });
    });
    const shots: IFireProjectileOptions[] = [];
    const event = {
        type: "unit_attacked",
        attackType: "range",
        attackerId: "cannon",
        targetId: "near",
        unitIdsDied: ["far"],
        damage: {
            amount: 0,
            rangedVolleyCount: double ? 2 : 1,
            splash: [
                { unitId: "far", position: far.getPosition(), amount: 22, unitsDied: 3 },
                { unitId: "near", position: near.getPosition(), amount: 11, unitsDied: 1 },
                ...(double ? [{ unitId: "near", position: near.getPosition(), amount: 7, unitsDied: 1 }] : []),
            ],
        },
        animations: [{ fromPosition: cannon.getPosition(), toPosition: logical(0.95), affectedUnitId: "far" }],
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: new Set(),
        sceneDestroyed: false,
        isSceneDestroyed: () => scene.sceneDestroyed,
        snapshotRenderableUnits: () => new Map(units),
        attackHandler: { evaluateRangeAttack: () => ({}) },
        preparePyreDeaths: () => {},
        prepareDirectionalAttackState: () => "attack",
        popRecordedDullingDefense: () => {},
        showGravechainVfx: () => {},
        noteDeathBlowsFromAttackEvent: () => {},
        offsetReplayDamagePosition: (position: HoCMath.XY) => position,
        playUnitCombatSound: (unit: typeof cannon, role: string) => events.push(`${unit.getId()}:${role}`),
        playReplayOneShot: (unit: typeof cannon, state: string) => {
            events.push(`${unit.getId()}:${state}`);
            return Promise.resolve();
        },
        combatVisuals: {
            showFloatingDamage: (_position: HoCMath.XY, amount: number) => events.push(`damage:${amount}`),
        },
        fireUnitProjectile: (_unit: typeof cannon, options: IFireProjectileOptions) => {
            shots.push(options);
            return projectiles.fire(options);
        },
        hoverManager: { clearAttackVisuals: () => {}, clearHoverSilhouette: () => {} },
        createActionEngine: () => ({
            apply: () => {
                events.push("resolve");
                near.amount = double ? 1 : 2;
                far.amount = 0;
                units.delete("far");
                return { completed: true, events: [event] };
            },
        }),
        destroyReplayAttackUnitsAtImpact: (ids: string[]) => events.push(...ids.map((id) => `${id}:death`)),
        applyTurnEngineEvents: () => events.push("turn"),
        cleanupDeadUnits: () => {},
        refreshUnits: () => {},
    });
    const play = () =>
        scene.playCombatExchange(
            cannon,
            near,
            event,
            [{ response: false, position: logical(0.95) }],
            (unit: typeof cannon) => events.push(`${unit.getId()}:death`),
            new Map(units),
            [],
            false,
            { amountsBefore: new Map([...units].map(([id, unit]) => [id, unit.amount])), deadIds: new Set(["far"]) },
        );
    const advance = (fraction: number) => {
        const shot = shots.at(-1)!;
        const distance = Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y);
        projectiles.update((distance * fraction) / (gs.getCellSize() * 64));
    };
    return { scene, cannon, near, far, event, events, shots, projectiles, play, advance, logical };
};

test("a piercing cannonball presents each hit and lethal casualty while it is still travelling", async () => {
    const f = fixture();
    const pending = f.play();
    await flush();
    f.advance(0.05);
    expect(f.events).toEqual(["cannon:attack"]);
    f.advance(0.35);
    expect(f.events).toEqual(["cannon:attack", "near:hurt", "damage:11", "near:hit"]);
    expect([f.near.displayed, f.far.displayed]).toEqual([2, 3]);
    expect(f.projectiles.hasActive()).toBe(true);
    f.advance(0.45);
    expect(f.events.slice(-3)).toEqual(["far:hurt", "damage:22", "far:death"]);
    expect([f.near.displayed, f.far.displayed]).toEqual([2, 0]);
    expect([f.near.amount, f.far.amount]).toEqual([3, 3]);
    expect(f.projectiles.hasActive()).toBe(true);
    f.advance(1);
    expect([...(await pending)]).toEqual(["far"]);
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:11", "damage:22"]);
});

test("a second volley owns its own contact and does not hit the first volley's dead victim again", async () => {
    const f = fixture(true);
    const pending = f.play();
    await flush();
    f.advance(1);
    await flush();
    expect(f.shots).toHaveLength(2);
    expect(f.near.displayed).toBe(2);
    f.advance(0.4);
    expect(f.events.slice(-3)).toEqual(["near:hurt", "damage:7", "near:hit"]);
    expect(f.near.displayed).toBe(1);
    f.advance(1);
    await pending;
    expect(f.events.filter((entry) => entry === "far:death")).toHaveLength(1);
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toHaveLength(3);
});

test("cancelling a scene after the first contact suppresses all later impacts and volleys", async () => {
    const f = fixture(true);
    const pending = f.play();
    await flush();
    f.advance(0.4);
    f.scene.sceneDestroyed = true;
    f.projectiles.destroy();
    await pending;
    expect(f.shots).toHaveLength(1);
    expect(f.events.filter((entry) => entry.startsWith("damage:"))).toEqual(["damage:11"]);
    expect(f.far.displayed).toBe(3);
});

test("live free aiming resolves once before flight and holds visible counts until the same contacts", async () => {
    const f = fixture();
    const pending = f.scene.performFreeThroughShotAttack(f.cannon, {
        type: "range_attack",
        attackerId: "cannon",
        targetId: "",
        targetPosition: f.logical(0.95),
    });
    await flush();
    expect(f.events[0]).toBe("resolve");
    expect([f.near.amount, f.far.amount]).toEqual([2, 0]);
    expect([f.near.displayed, f.far.displayed]).toEqual([3, 3]);
    f.advance(0.4);
    expect([f.near.displayed, f.far.displayed]).toEqual([2, 3]);
    expect(f.events).not.toContain("turn");
    f.advance(1);
    await pending;
    expect([f.near.displayed, f.far.displayed]).toEqual([2, 0]);
    expect(f.events.filter((entry) => entry === "resolve")).toHaveLength(1);
    expect(f.events.at(-1)).toBe("turn");
    expect(f.scene.sc_moveBlocked).toBe(false);
});

test("a live stack revived by the resolved shot does not play a lethal impact", async () => {
    const f = fixture();
    f.scene.createActionEngine = () => ({
        apply: () => {
            f.near.amount = 2;
            f.far.amount = 1;
            return { completed: true, events: [f.event] };
        },
    });
    const pending = f.scene.performFreeThroughShotAttack(f.cannon, {
        type: "range_attack",
        attackerId: "cannon",
        targetId: "",
        targetPosition: f.logical(0.95),
    });
    await flush();
    f.advance(1);
    await pending;
    expect(f.events).toContain("damage:22");
    expect(f.events).not.toContain("far:death");
    expect(f.far.displayed).toBe(1);
});

test.each([
    { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
    { from: { x: 100, y: 0 }, to: { x: 0, y: 0 } },
    { from: { x: 0, y: 100 }, to: { x: 0, y: 0 } },
    { from: { x: 0, y: 0 }, to: { x: 100, y: 100 } },
])("large frame steps preserve contact order and never repeat impacts: $from to $to", ({ from, to }) => {
    const seen: number[] = [];
    const progress = throughShotImpactProgress(
        from,
        to,
        [0.8, 0.3, 0.5].map((value) => ({
            value,
            radius: Math.hypot(to.x - from.x, to.y - from.y) * 0.1,
            position: { x: from.x + (to.x - from.x) * value, y: from.y + (to.y - from.y) * value },
        })),
        (value) => seen.push(value),
    );
    progress(0.19);
    expect(seen).toEqual([]);
    progress(0.21);
    expect(seen).toEqual([0.3]);
    progress(1);
    progress(1);
    progress(0.1);
    expect(seen).toEqual([0.3, 0.5, 0.8]);
});
