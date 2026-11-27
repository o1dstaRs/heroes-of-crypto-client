import { expect, spyOn, test } from "bun:test";
import { Container, Texture } from "pixi.js";
import {
    AbilityFactory,
    EffectFactory,
    GridSettings,
    HoCConfig,
    TeamVals,
    Unit,
    UnitVals,
    type IVisibleDamage,
} from "@heroesofcrypto/common";
import { RenderableUnit } from "./RenderableUnit";
import { Sandbox } from "./Sandbox";
import { CombatVisuals, type ICombatVisualsContext } from "./sandbox/CombatVisuals";
import { projectBattlefieldPoint } from "./sandbox/BattlefieldVisualGrid";
import { WIND_SPEAR_TRAVEL_MS, WIND_SPEAR_FADE_MS } from "./sandbox/WindSpear";

const gs = new GridSettings(16, 1024, 0, 512, -512, 64, 32);
function fixture() {
    const make = (name: string, faction: string, x: number) => {
        const effects = new EffectFactory();
        const base = Unit.createUnit(
            HoCConfig.getCreatureConfig(TeamVals.LEFT, faction, name, "", 10),
            gs,
            TeamVals.LEFT,
            UnitVals.CREATURE,
            new AbilityFactory(effects),
            effects,
            false,
        );
        const unit = RenderableUnit.fromBase(base, () => Texture.WHITE);
        unit.setPosition(x, 96);
        unit.getVisualCenter = () => ({ x, y: 96 });
        return unit;
    };
    const thief = make("Arachna Queen", "Nature", 96);
    const donor = make("Pikeman", "Life", 160);
    const rear = make("Squire", "Life", 224);
    const stolen = donor.disableAbilityAsStolen("Skewer Strike")!;
    thief.grantStolenAbility(stolen.getName());
    const units = new Map([thief, donor, rear].map((unit) => [unit.getId(), unit]));
    const hits: unknown[] = [],
        authored: unknown[] = [];
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder: { getAllUnits: () => units },
        combatVisuals: { spawnWindSpear: (points: unknown) => hits.push(points) },
        spawnPikemanSpearToCell: (_source: unknown, point: unknown) => authored.push(point),
    });
    const hit: NonNullable<IVisibleDamage["secondary"]>[number] = {
        source: "skewer_strike",
        unitId: rear.getId(),
        position: rear.getPosition(),
        amount: 30,
        unitsDied: 1,
    };
    return { scene, thief, donor, rear, units, hits, authored, hit, make };
}

test("a real transferred Skewer card and Pikeman both show the traveling light", () => {
    const f = fixture();
    expect(f.thief.hasAbilityActive("Skewer Strike")).toBe(true);
    expect(f.donor.hasAbilityActive("Skewer Strike")).toBe(false);
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, { secondary: [f.hit] });
    expect(f.hits).toEqual([
        [
            { x: 96, y: 96 },
            { x: 160, y: 96 },
            { x: 224, y: 96 },
        ],
    ]);
    expect(f.authored).toEqual([]);
    // The recorded outcome remains visible even if the card is disabled later in the same exchange.
    f.scene.spawnSkewerWindSpearVfx(f.donor, f.rear, {
        secondary: [{ ...f.hit, unitId: "removed", position: { x: 288, y: 96 } }],
    });
    expect(f.authored).toEqual([{ x: 288, y: 96 }]);
    expect(f.hits[1]).toEqual([
        f.donor.getVisualCenter(gs),
        f.rear.getVisualCenter(gs),
        projectBattlefieldPoint({ x: 288, y: 96 }, gs),
    ]);
});

test("Pikeman's streak reaches a fallen large victim even when its center is off the spear line", () => {
    const f = fixture();
    const hydra = f.make("Hydra", "Chaos", 320);
    hydra.setPosition(320, 128);
    const captured = new Map(f.units).set(hydra.getId(), hydra);
    f.scene.spawnSkewerWindSpearVfx(
        f.donor,
        f.rear,
        { secondary: [{ ...f.hit, unitId: hydra.getId(), position: hydra.getPosition() }] },
        [],
        false,
        captured,
    );
    expect(f.hits).toHaveLength(1);
    expect(f.hits[0]).toEqual([f.donor.getVisualCenter(gs), f.rear.getVisualCenter(gs), hydra.getVisualCenter(gs)]);
});

test("stolen pierce rejects the counter's opposite ray, unrelated riders and unrecorded attacks", () => {
    const f = fixture();
    for (const secondary of [
        [],
        [{ ...f.hit, position: { x: 32, y: 96 } }],
        [{ ...f.hit, position: { x: 224, y: 160 } }],
        [{ ...f.hit, source: "fire_breath" }],
        [{ ...f.hit, position: f.donor.getPosition() }],
    ])
        f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, { secondary });
    expect(f.hits).toEqual([]);
    f.thief.disableAbilityAsStolen("Skewer Strike");
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, { secondary: [f.hit] });
    expect(f.hits).toHaveLength(1);
});

test("removed victims and zero-damage shield contacts retain their recorded pierce", () => {
    const f = fixture();
    f.units.delete(f.rear.getId());
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, { secondary: [{ ...f.hit, amount: 0, unitsDied: 0 }] });
    expect(f.hits).toEqual([
        [f.thief.getVisualCenter(gs), f.donor.getVisualCenter(gs), projectBattlefieldPoint(f.hit.position, gs)],
    ]);
});

test("stolen Skewer reaches recorded barrels, and ordinary barrel attacks cannot invent a pierce", () => {
    const f = fixture();
    const event = {
        type: "obstacle_attacked",
        attackerId: f.thief.getId(),
        targetPosition: { x: 224, y: 96 },
        source: "skewer_strike",
    };
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, undefined, [event]);
    expect(f.hits).toHaveLength(1);
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, undefined, [{ ...event, attackerId: "other" }]);
    expect(f.hits).toHaveLength(1);
    f.thief.disableAbilityAsStolen("Skewer Strike");
    f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, undefined, [{ ...event, source: undefined }], true);
    expect(f.hits).toHaveLength(1);
});

test("the stolen-owner fallback draws in live combat, survives hydration, and expires without simulation ticks", () => {
    const f = fixture();
    const root = new Container();
    root.scale.set(-0.8, -0.5);
    let now = 0;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const visuals = new CombatVisuals({
        legacyEffectsEnabled: false,
        getGridSettings: () => gs,
        getBoardScale: () => ({ x: root.scale.x, y: root.scale.y }),
        getUnitsHolder: () => ({ getAllUnits: () => new Map() }),
        attachToWorldRoot: (node: Container) => root.addChild(node),
    } as unknown as ICombatVisualsContext);
    f.scene.combatVisuals = visuals;
    try {
        f.scene.spawnSkewerWindSpearVfx(f.thief, f.donor, { secondary: [f.hit] });
        expect(root.children).toHaveLength(1);
        const spear = root.children[0];
        expect(spear.children).toHaveLength(8);
        visuals.clear({ keepDetachedOverlays: true });
        expect(spear.destroyed).toBe(false);
        now = WIND_SPEAR_TRAVEL_MS;
        visuals.update(0);
        const head = spear.children.at(-1)!;
        expect(head.x).toBeCloseTo(224);
        expect(head.y).toBeCloseTo(96);
        now += WIND_SPEAR_FADE_MS;
        visuals.update(0);
        expect(spear.destroyed).toBe(true);
        expect(root.children).toHaveLength(0);
        expect(Texture.WHITE.destroyed).toBe(false);
    } finally {
        visuals.clear();
        root.destroy({ children: true });
        clock.mockRestore();
    }
});
