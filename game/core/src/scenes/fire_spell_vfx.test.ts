import { expect, mock, test } from "bun:test";
import type { GameEvent, GridSettings } from "@heroesofcrypto/common";
import { Sandbox } from "./Sandbox";
import { CombatVisuals } from "./sandbox/CombatVisuals";
import { spellFootprint } from "./sandbox/SpellFootprint";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../pixi/imageAssetTiers";

const gs = {
    getCellSize: () => 64,
    getStep: () => 64,
    getHalfStep: () => 32,
    getMinX: () => 0,
    getMaxX: () => 1024,
    getMinY: () => 0,
    getMaxY: () => 1024,
    getGridSize: () => 16,
} as GridSettings;
const event = (spellName: string): GameEvent => ({
    type: "spell_cast",
    casterId: "caster",
    targetId: "target",
    spellName,
    targetCell: { x: 4, y: 5 },
    unitIdsDied: [],
    animations: [],
});
function fixture(cells = [{ x: 4, y: 5 }]) {
    const visuals = {
        spawnFireball: mock<CombatVisuals["spawnFireball"]>(() => undefined),
        spawnFireSweep: mock(() => undefined),
        spawnFireRing: mock<CombatVisuals["spawnFireRing"]>(() => undefined),
        spawnMeteorShower: mock<CombatVisuals["spawnMeteorShower"]>(() => undefined),
        spawnWhirlpool: mock<CombatVisuals["spawnWhirlpool"]>(() => undefined),
        spawnFireBurn: mock(() => undefined),
        showFloatingDamage: mock(() => undefined),
    };
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        combatVisuals: visuals,
        unitsHolder: { getAllUnits: () => new Map([["target", { getCells: () => cells }]]) },
        showFleshShieldAbsorbedDamage: mock(() => undefined),
        showShieldAbsorbs: mock(() => undefined),
    });
    return { scene, visuals };
}
test("ring is one footprint-centred burst even with no damaged victims", () => {
    const cells = [
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
    ];
    const { scene, visuals } = fixture(cells);
    scene.renderSpellDamageVfx([event("Ring of Fire")]);
    expect(visuals.spawnFireRing.mock.calls).toEqual([[spellFootprint(cells, gs), spellFootprint(cells, gs, 1)]]);
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
});
test("shower spawns once for the aimed 3x3, including empty cells, clipping at the board edge", () => {
    const { scene, visuals } = fixture();
    scene.renderSpellDamageVfx([event("Meteor Shower")]);
    const calls = visuals.spawnMeteorShower.mock.calls as unknown as [unknown[]][];
    expect(calls[0][0]).toHaveLength(9);
    scene.renderSpellDamageVfx([{ ...event("Meteor Shower"), targetCell: { x: 0, y: 0 } }]);
    expect(calls[1][0]).toHaveLength(4);
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
});
test("ring and meteor retain confirmed damage labels without an extra per-victim fire effect", () => {
    const { scene, visuals } = fixture();
    for (const name of ["Ring of Fire", "Meteor Shower"]) {
        scene.renderSpellDamageVfx([
            {
                ...event(name),
                damaged: [{ unitId: "victim", position: { x: 300, y: 300 }, amount: 17, unitsDied: 0 }],
            },
        ]);
    }
    expect(visuals.showFloatingDamage).toHaveBeenCalledTimes(2);
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
});
test("rectangular and 2x2 creatures each receive exactly one full-footprint Whirlpool", () => {
    for (const cells of [
        [
            { x: 4, y: 5 },
            { x: 4, y: 6 },
        ],
        [
            { x: 4, y: 5 },
            { x: 5, y: 5 },
        ],
        [
            { x: 4, y: 5 },
            { x: 5, y: 5 },
            { x: 4, y: 6 },
            { x: 5, y: 6 },
        ],
    ]) {
        const { scene, visuals } = fixture(cells);
        scene.renderSpellDamageVfx([event("Whirlpool")]);
        expect(visuals.spawnWhirlpool.mock.calls).toEqual([[spellFootprint(cells, gs)]]);
    }
});
test("fire spell atlases ship in production and load on demand", () => {
    for (const key of ["vfx_ring_fire_burst_atlas", "vfx_meteor_shower_impact_atlas"]) {
        expect(isLazyCombatEffectAssetKey(key)).toBe(true);
        expect(isProductionOmittedAssetKey(key)).toBe(false);
    }
});

test("switching fire render modes routes new casts without clearing effects already playing", () => {
    const renderer = () => ({
        ring: mock(() => Promise.resolve()),
        meteors: mock(() => Promise.resolve()),
        clear: mock(() => undefined),
    });
    const sprites = renderer(),
        particles = renderer();
    const visuals = Object.assign(Object.create(CombatVisuals.prototype), {
        spellFireSprites: sprites,
        spellFireParticles: particles,
    }) as CombatVisuals;
    const f = { center: { x: 64, y: 64 }, width: 64, height: 64 };
    visuals.setFireSpellRenderMode("sprites");
    visuals.spawnFireRing(f, f);
    visuals.spawnMeteorShower([f]);
    visuals.setFireSpellRenderMode("particles");
    visuals.spawnFireRing(f, f);
    visuals.spawnMeteorShower([f]);
    for (const layer of [sprites, particles]) {
        expect(layer.ring).toHaveBeenCalledTimes(1);
        expect(layer.meteors).toHaveBeenCalledTimes(1);
        expect(layer.clear).not.toHaveBeenCalled();
    }
});

test("Battle Mage meteor uses the identical shower renderer, with only its authoritative four cells", () => {
    const { scene, visuals } = fixture();
    scene.renderSpellDamageVfx([
        {
            ...event("Meteorite"),
            damaged: [{ unitId: "victim", position: { x: 300, y: 300 }, amount: 17, unitsDied: 0 }],
        },
    ]);
    expect(visuals.spawnMeteorShower.mock.calls).toEqual([
        [
            [
                { x: 4, y: 5 },
                { x: 4, y: 6 },
                { x: 5, y: 5 },
                { x: 5, y: 6 },
            ].map((cell) => spellFootprint([cell], gs)),
            "particles",
        ],
    ]);
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
    expect(visuals.showFloatingDamage).toHaveBeenCalledTimes(1);
});

test("Fire Strike emits one book-anchored arrow and no premature legacy burn", () => {
    const { scene, visuals } = fixture();
    const arrow = mock(() => 600),
        sweep = mock(() => undefined);
    Object.assign(visuals, { spawnFireStrikeArrow: arrow, spawnFireSweep: sweep });
    const origin = { x: 40, y: 80 },
        body = { x: 300, y: 240 };
    scene.unitsHolder.getAllUnits = () =>
        new Map([
            ["caster", { getSpells: () => [], getSpellProjectileOrigin: () => origin }],
            [
                "target",
                {
                    getProjectileImpactPoint: () => body,
                    getDamagePredictionAnchor: () => body,
                    hasAbilityActive: () => false,
                },
            ],
        ]);
    scene.renderSpellDamageVfx(
        [
            {
                ...event("Fire Strike"),
                damaged: [{ unitId: "target", position: { x: 300, y: 200 }, amount: 0, unitsDied: 0 }],
            },
        ],
        { x: 0, y: 0 },
    );
    expect(arrow).toHaveBeenCalledTimes(1);
    expect((arrow.mock.calls as unknown[][])[0].slice(0, 2)).toEqual([origin, body]);
    expect(sweep).not.toHaveBeenCalled();
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
});

test("Fireball routes the old ring sequence without extra sweep or burn layers", () => {
    const { scene, visuals } = fixture();
    scene.renderSpellDamageVfx([
        { ...event("Fireball"), damaged: [{ unitId: "other", position: { x: 288, y: 352 }, amount: 7, unitsDied: 0 }] },
    ]);
    expect(visuals.spawnFireball.mock.calls).toEqual([
        [spellFootprint([{ x: 4, y: 5 }], gs), spellFootprint([{ x: 4, y: 5 }], gs, 1)],
    ]);
    expect(visuals.spawnFireRing).not.toHaveBeenCalled();
    expect(visuals.spawnFireSweep).not.toHaveBeenCalled();
    expect(visuals.spawnFireBurn).not.toHaveBeenCalled();
});
