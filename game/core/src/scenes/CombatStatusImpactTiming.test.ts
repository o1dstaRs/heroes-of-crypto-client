import { afterEach, expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    FightStateManager,
    GridConstants,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type GameEvent,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { EmberCovenantRings } from "./sandbox/EmberCovenantRings";
import { ParalysisStatusVfx } from "./sandbox/ParalysisStatusVfx";
import { EMBER_COVENANT_STATUS } from "./sandbox/combatStatusPresentation";
import type { CombatExchangeStrike } from "./sandbox/combat_exchange";

const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const roots: Container[] = [];
afterEach(() => {
    roots.splice(0).forEach((root) => root.destroy({ children: true }));
    FightStateManager.getInstance().reset();
});
const flush = async () => {
    for (let i = 0; i < 24; i++) await Promise.resolve();
};
const fixture = (mutate: (unit: RenderableUnit) => void, victimName = "Squire", victimFaction = "Life") => {
    FightStateManager.getInstance().reset();
    FightStateManager.getInstance().getFightProperties().startFight();
    const make = (name: string, faction: string, team: 1 | 2, x: number) => {
        const effects = new EffectFactory();
        const unit = RenderableUnit.fromBase(
            Unit.createUnit(
                HoCConfig.getCreatureConfig(team, faction, name, "", 10),
                gs,
                team,
                UnitVals.CREATURE,
                new AbilityFactory(effects),
                effects,
                false,
            ),
            () => Texture.WHITE,
        );
        unit.setPosition(x, gs.getHalfStep());
        return unit;
    };
    const orc = make("Orc", "Chaos", TeamVals.LEFT, gs.getMinX() + gs.getHalfStep());
    const victim = make(victimName, victimFaction, TeamVals.RIGHT, gs.getMinX() + gs.getStep() * 10 + gs.getHalfStep());
    const units = new Map([orc, victim].map((unit) => [unit.getId(), unit]));
    const event: Extract<GameEvent, { type: "unit_attacked" }> = {
        type: "unit_attacked",
        attackerId: orc.getId(),
        targetId: victim.getId(),
        attackType: "range",
        unitIdsDied: [],
        animations: [],
        damage: {
            amount: 10,
            render: true,
            unitPosition: victim.getPosition(),
            unitIsSmall: true,
            hits: [{ amount: 10, unitsDied: 0 }],
        },
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        replayRecordingSuspended: true,
        sc_moveBlocked: true,
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        dyingVisualUnits: new Set(),
        isSceneDestroyed: () => false,
        isStrikeInFlight: () => false,
        preparePyreDeaths: () => {},
        prepareDirectionalAttackState: () => "attack",
        waitForTexture: () => Promise.resolve(true),
        spawnBorrowedGraceVfx: () => {},
        popRecordedDullingDefense: () => {},
        popRecordedResistances: () => {},
        playUnitCombatSound: () => {},
        playReplayOneShot: () => Promise.resolve(),
        delayReplay: () => Promise.resolve(),
        waitForProjectileHitReaction: () => Promise.resolve(),
        showAttackMissedVfx: () => {},
        offsetReplayDamagePosition: (position: unknown) => position,
        combatVisuals: { showFloatingDamage: () => {}, showFloatingAbsorbed: () => {} },
    });
    let contact!: () => void, land!: () => void;
    scene.playReplayProjectile = (_a: unknown, _b: unknown, _position: unknown, impact: () => void) => {
        contact = impact;
        return new Promise<void>((resolve) => {
            land = resolve;
        });
    };
    const resolve = () =>
        scene
            .createReplayRecordingActionEngine({
                apply: () => {
                    mutate(victim);
                    return { completed: true, events: [event] };
                },
            })
            .apply({ type: "range_attack", attackerId: orc.getId(), targetId: victim.getId() });
    const plan: CombatExchangeStrike[] = [
        {
            attackerId: orc.getId(),
            targetId: victim.getId(),
            response: false,
            hitIndex: 0,
            amount: 10,
            unitsDied: 0,
            lethal: false,
        },
    ];
    const play = () => scene.playCombatExchange(orc, victim, event, plan, () => {});
    return {
        orc,
        victim,
        scene,
        event,
        plan,
        units,
        make,
        resolve,
        play,
        contact: () => contact(),
        land: () => land(),
    };
};

test("Orc's axe cannot show Stun before it reaches the victim; the engine still applies Stun immediately", async () => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Stun")!));
    f.resolve();
    expect(f.victim.hasStatusApplied("Stun")).toBe(true);
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    // Recording the action must keep resolved truth even while the stars are held for the axe.
    expect((Sandbox as unknown as { skippingForCapture(unit: Unit): boolean }).skippingForCapture(f.victim)).toBe(true);
    const pending = f.play();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.contact();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    f.land();
    await pending;
});

test.each(["Blindness", "Freeze", "Paralysis", "Whirlpool"])("%s follows the same contact boundary", async (name) => {
    const f = fixture((unit) => {
        if (name === "Whirlpool") unit.getUnitProperties().applied_debuffs.push(name);
        else unit.applyEffect(new EffectFactory().makeEffect(name)!);
    });
    f.resolve();
    expect(f.victim.hasStatusApplied(name)).toBe(true);
    expect(f.victim.hasPresentedStatus(name)).toBe(false);
    if (name === "Paralysis" || name === "Whirlpool") expect(f.victim.canMove()).toBe(false);
    const pending = f.play();
    await flush();
    expect(f.victim.hasPresentedStatus(name)).toBe(false);
    f.contact();
    expect(f.victim.hasPresentedStatus(name)).toBe(true);
    f.land();
    await pending;
});

test("an existing disable stays visible throughout a different incoming attack", async () => {
    const f = fixture(() => {});
    f.victim.applyEffect(new EffectFactory().makeEffect("Stun")!);
    f.resolve();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    const pending = f.play();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    f.contact();
    f.land();
    await pending;
    expect(f.victim.isSkippingDisplayed()).toBe(true);
});

test("a cold texture wait cannot reveal the new disable during the axe windup", async () => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Stun")!));
    let ready!: () => void;
    f.victim.getAnimationTextureKey = () => "cold-status-victim";
    const texture = new Promise<boolean>((resolve) => {
        ready = () => resolve(true);
    });
    f.scene.waitForTexture = () => texture;
    f.resolve();
    const pending = f.play();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    ready();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.contact();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    f.land();
    await pending;
});

test("an expired animation lock cannot reveal a disable whose delayed damage has not appeared", () => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Stun")!));
    f.resolve();
    f.scene.sc_moveBlocked = false;
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    const present = f.victim.captureDamageCasualties(0);
    present();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
});

test("an old damage callback cannot reveal a new action's disable", () => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Stun")!));
    f.victim.beginCombatStatusPresentation(() => true);
    f.victim.beginDamagePresentation();
    const oldHit = f.victim.captureDamageCasualties(0);
    f.resolve();
    oldHit();
    expect(f.victim.hasStatusApplied("Stun")).toBe(true);
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.victim.captureDamageCasualties(0)();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
});

test("a replay presents its recorded disable at impact without applying it to the engine", async () => {
    const f = fixture(() => {});
    const properties = structuredClone(f.victim.getUnitProperties());
    properties.applied_debuffs.push("Stun");
    f.scene.beginCombatStatusPresentation(
        { type: "range_attack", attackerId: f.orc.getId(), targetId: f.victim.getId() },
        { units: [{ properties, skipping: true }] },
    );
    const pending = f.play();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.contact();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    expect(f.victim.isSkippingApplied()).toBe(false);
    expect(f.victim.hasStatusApplied("Stun")).toBe(false);
    f.land();
    await pending;
});

test("Paralysis's persistent electric field appears at contact while the projectile is still returning", async () => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Paralysis")!));
    const root = new Container();
    roots.push(root);
    const layer = new ParalysisStatusVfx({
        getUnits: () => f.units,
        getFrame: () => ({ x: 0, y: 0, width: 64, height: 80, zIndex: 4000 }),
        isImpactPending: () => true,
        attach: (node) => {
            root.addChild(node);
        },
    });
    f.resolve();
    layer.update(0.1);
    expect(root.children).toHaveLength(0);
    const pending = f.play();
    await flush();
    layer.update(0.1);
    expect(root.children).toHaveLength(0);
    f.contact();
    layer.update(0.1);
    expect(root.children).toHaveLength(1);
    f.land();
    await pending;
    layer.clear();
});

test("Hydra's shared shield waits for the absorb contact even if the animation lock drops", async () => {
    const f = fixture((unit) => {
        unit.getUnitProperties().applied_buffs.length = 0;
        unit.getUnitProperties().applied_buffs_laps.length = 0;
    });
    const ally = f.make("Squire", "Life", TeamVals.RIGHT, gs.getMinX() + gs.getStep() * 12);
    f.units.set(ally.getId(), ally);
    for (const unit of [f.victim, ally]) {
        const p = unit.getUnitProperties();
        p.applied_buffs.push(EMBER_COVENANT_STATUS);
        p.applied_buffs_laps.push(15);
        unit.getBlessingHaloFrame = () => ({ x: unit.getPosition().x, y: 0, width: 32, height: 14, zIndex: 4001 });
    }
    f.event.damage.secondary = [
        {
            source: "ember_covenant",
            unitId: f.victim.getId(),
            position: f.victim.getPosition(),
            amount: 30,
            unitsDied: 0,
        },
    ];
    const root = new Container();
    roots.push(root);
    const layer = new EmberCovenantRings({
        getUnits: () => f.units,
        getTexture: () => Texture.WHITE,
        isImpactPending: () => false,
        attachToWorldRoot: (node) => {
            root.addChild(node);
        },
    });
    layer.update(0.3);
    f.resolve();
    ally.getUnitProperties().applied_buffs.length = 0;
    ally.getUnitProperties().applied_buffs_laps.length = 0;
    ally.applyEffect(new EffectFactory().makeEffect("Stun")!);
    f.scene.sc_moveBlocked = false;
    layer.update(0.5);
    expect(f.victim.hasPresentedBuff(EMBER_COVENANT_STATUS)).toBe(true);
    expect(ally.hasPresentedBuff(EMBER_COVENANT_STATUS)).toBe(true);
    expect(root.children.map((node) => node.children[0].alpha)).toEqual([1, 1]);
    const pending = f.play();
    await flush();
    f.contact();
    layer.absorb(f.victim.getId());
    layer.update(0.2);
    expect(f.victim.hasPresentedBuff(EMBER_COVENANT_STATUS)).toBe(false);
    expect(ally.hasPresentedBuff(EMBER_COVENANT_STATUS)).toBe(false);
    expect(ally.isSkippingDisplayed()).toBe(false);
    expect(root.children.slice(0, 2).every((node) => node.children[0].alpha < 1)).toBe(true);
    f.land();
    await pending;
    layer.clear();
});

test("Water Shield stays whole during the axe windup and flight and dissolves at contact", async () => {
    const f = fixture(
        (unit) => {
            unit.deleteBuff("Water Shield");
            unit.getUnitProperties().applied_buffs.length = 0;
            unit.getUnitProperties().applied_buffs_laps.length = 0;
        },
        "Mermaid",
        "Might",
    );
    const props = f.victim.getUnitProperties();
    if (!props.applied_buffs.includes("Water Shield")) {
        props.applied_buffs.push("Water Shield");
        props.applied_buffs_laps.push(99);
    }
    const root = new Container();
    roots.push(root);
    const view = f.victim as unknown as {
        ensureVisual(): void;
        updateWaterShieldAura(): void;
        updateWaterShieldBreak(): void;
        waterShieldAura?: Container;
        waterShieldBreakStartMs?: number;
    };
    view.ensureVisual = () => {};
    view.updateWaterShieldAura = () => {
        view.waterShieldAura ??= root.addChild(new Container());
        view.waterShieldAura.visible = true;
    };
    view.updateWaterShieldBreak = () => {};
    f.victim.syncVisual(root, gs);
    expect(view.waterShieldAura?.visible).toBe(true);
    f.resolve();
    expect(f.victim.hasStatusBuff("Water Shield")).toBe(false);
    f.victim.syncVisual(root, gs);
    expect(view.waterShieldAura?.visible).toBe(true);
    expect(view.waterShieldBreakStartMs).toBeUndefined();
    const pending = f.play();
    await flush();
    f.victim.syncVisual(root, gs);
    expect(view.waterShieldBreakStartMs).toBeUndefined();
    f.contact();
    f.victim.syncVisual(root, gs);
    expect(view.waterShieldAura?.visible).toBe(false);
    expect(view.waterShieldBreakStartMs).toBeDefined();
    f.land();
    await pending;
});

test.each(["miss", "water shield"])("a first %s cannot reveal the second axe's Stun", async (first) => {
    const f = fixture((unit) => unit.applyEffect(new EffectFactory().makeEffect("Stun")!));
    Object.assign(f.plan[0], { amount: 0, missed: first === "miss" });
    f.plan.push({ ...f.plan[0], amount: 10, missed: false, hitIndex: 1 });
    if (first === "water shield")
        f.event.damage.secondary = [
            {
                source: "water_shield",
                unitId: f.victim.getId(),
                position: f.victim.getPosition(),
                amount: 30,
                unitsDied: 0,
            },
        ];
    f.resolve();
    const pending = f.play();
    await flush();
    f.contact();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.land();
    await flush();
    expect(f.victim.isSkippingDisplayed()).toBe(false);
    f.contact();
    expect(f.victim.isSkippingDisplayed()).toBe(true);
    f.land();
    await pending;
});

test.each(["refused", "throw"])("a %s action cannot leave the next status visually held", (mode) => {
    const f = fixture(() => {});
    const engine = f.scene.createReplayRecordingActionEngine({
        apply: () => {
            if (mode === "throw") throw new Error("rejected before resolution");
            return { completed: false, events: [] };
        },
    });
    const action = { type: "range_attack", attackerId: f.orc.getId(), targetId: f.victim.getId() };
    if (mode === "throw") expect(() => engine.apply(action)).toThrow("rejected before resolution");
    else expect(engine.apply(action).completed).toBe(false);
    f.victim.applyEffect(new EffectFactory().makeEffect("Stun")!);
    expect(f.victim.isSkippingDisplayed()).toBe(true);
});
