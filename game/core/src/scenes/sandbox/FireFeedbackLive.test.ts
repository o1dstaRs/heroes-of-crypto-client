import { expect, spyOn, test } from "bun:test";
import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import { GridConstants, GridSettings, type GameEvent, type UnitsHolder } from "@heroesofcrypto/common";
import { Sandbox } from "../Sandbox";
import { CombatVisuals } from "./CombatVisuals";

function fixture() {
    const root = new Container();
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const unitsHolder = { getAllUnits: () => new Map() } as unknown as UnitsHolder;
    const visuals = new CombatVisuals({
        getGridSettings: () => gs,
        attachToWorldRoot: (node) => {
            root.addChild(node);
        },
        getUnitsHolder: () => unitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    const texture = new Texture({ source: new TextureSource({ width: 64, height: 64 }) });
    const internals = visuals as unknown as {
        fireTexture: Texture;
        fireBurns: { container: Container }[];
        fireSweeps: { container: Container }[];
    };
    internals.fireTexture = texture;
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        sc_sceneSettings: { getGridSettings: () => gs },
        unitsHolder,
        combatVisuals: visuals,
        showFleshShieldAbsorbedDamage: () => {},
        showShieldAbsorbs: () => {},
    });
    let now = 1000;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const random = spyOn(Math, "random").mockReturnValue(0.5);
    return {
        root,
        visuals,
        internals,
        scene,
        texture,
        step(dt: number) {
            now += dt * 1000;
            visuals.update(dt);
        },
        dispose() {
            visuals.clear();
            clock.mockRestore();
            random.mockRestore();
        },
    };
}

for (const [source, method] of [
    ["fire_shield", "showFireShieldDamageAtImpact"],
    ["fire_breath", "showFireBreathDamageAtImpact"],
] as const) {
    test(`live ${source} damage burns the recipient at contact and retains its damage number`, () => {
        const f = fixture();
        try {
            f.scene[method](
                [{ source, unitId: "victim", position: { x: 240, y: 160 }, amount: 12, unitsDied: 0 }],
                { x: 0, y: 0 },
                new Map(),
            );
            expect(f.root.children).toHaveLength(2);
            expect(f.internals.fireBurns).toHaveLength(1);
            const burn = f.internals.fireBurns[0].container;
            f.step(0.1);
            expect((burn.children as Sprite[]).some((p) => p.visible && p.alpha > 0)).toBe(true);
            f.visuals.clear({ keepDetachedOverlays: true });
            expect(burn.destroyed).toBe(false);
            f.step(2);
            expect(burn.destroyed).toBe(true);
            expect(f.root.children).toHaveLength(0);
        } finally {
            f.dispose();
        }
        expect(f.texture.destroyed).toBe(true);
    });

    test(`a zero/immune ${source} entry creates no target burn or damage number`, () => {
        const f = fixture();
        try {
            f.scene[method](
                [{ source, unitId: "victim", position: { x: 240, y: 160 }, amount: 0, unitsDied: 0 }],
                { x: 0, y: 0 },
                new Map(),
            );
            expect(f.root.children).toHaveLength(0);
        } finally {
            f.dispose();
        }
    });
}

const attacker = (authored = false) => ({
    hasAuthoredBlackDragonFireBreath: () => authored,
    hasAbilityActive: (name: string) => name === "Fire Breath",
    getVisualCenter: () => ({ x: 50, y: 100 }),
});
const target = { getPosition: () => ({ x: 250, y: 100 }) };
const damage = (amount = 10) => ({
    amount,
    unitId: "victim",
    unitPosition: target.getPosition(),
    unitIsSmall: true,
    render: true,
});

test("live fallback breath sweeps outward at main's timing and expires", () => {
    const f = fixture();
    try {
        f.scene.spawnFireBreathVfx(attacker(), target, damage());
        expect(f.internals.fireSweeps).toHaveLength(1);
        const sweep = f.internals.fireSweeps[0].container;
        const puffs = sweep.children as Sprite[];
        expect(puffs.every((p) => !p.visible)).toBe(true);
        f.step(0.1);
        expect(puffs[0].visible).toBe(true);
        expect(puffs.at(-1)?.visible).toBe(false);
        f.step(0.12);
        expect(puffs.every((p) => p.visible)).toBe(true);
        f.step(1);
        expect(sweep.destroyed).toBe(true);
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.dispose();
    }
});

test("an authored Dragon mouth flame skips the fallback sweep while its victim still gets an impact burn", () => {
    const f = fixture();
    try {
        f.scene.spawnFireBreathVfx(attacker(true), target, damage());
        expect(f.root.children).toHaveLength(0);
        f.scene.showFireBreathDamageAtImpact(
            [{ source: "fire_breath", unitId: "victim", position: target.getPosition(), amount: 10, unitsDied: 0 }],
            { x: 0, y: 0 },
            new Map(),
        );
        expect(f.internals.fireBurns).toHaveLength(1);
        expect(f.internals.fireSweeps).toHaveLength(0);
    } finally {
        f.dispose();
    }
});

test("missing breath damage and a zero-length sweep create no fallback fire", () => {
    const f = fixture();
    try {
        f.scene.spawnFireBreathVfx(attacker(), target, damage(0));
        f.visuals.spawnFireSweep({ x: 50, y: 100 }, { x: 50, y: 100 }, 64);
        expect(f.root.children).toHaveLength(0);
    } finally {
        f.dispose();
    }
});

test("a breath hit presented at contact is not burned again by the post-exchange fallback", () => {
    const f = fixture();
    try {
        const hit = {
            source: "fire_breath",
            unitId: "victim",
            position: target.getPosition(),
            amount: 10,
            unitsDied: 0,
        };
        f.scene.shownFireBreathHits = new WeakSet([hit]);
        f.scene.showFireBreathDamageAtImpact([hit], { x: 0, y: 0 }, new Map());
        f.scene.spawnFireDamageVfx(attacker(), target, { ...damage(), secondary: [hit] });
        expect(f.internals.fireBurns).toHaveLength(1);
    } finally {
        f.dispose();
    }
});

test("Fireforged Sword retains its dedicated burn instead of adding a generic target burst", () => {
    const f = fixture();
    const sword = spyOn(f.visuals, "spawnFireforgedSwordBurn").mockImplementation(() => {});
    try {
        f.scene.spawnFireDamageVfx(attacker(), target, {
            ...damage(),
            secondary: [
                {
                    source: "fireforged_sword",
                    unitId: "victim",
                    position: target.getPosition(),
                    amount: 7,
                    unitsDied: 0,
                },
            ],
        });
        expect(sword).toHaveBeenCalledTimes(1);
        expect(f.internals.fireBurns).toHaveLength(0);
    } finally {
        sword.mockRestore();
        f.dispose();
    }
});

for (const amount of [0, 7]) {
    test(`a legacy position-only Meteorite record with ${amount} damage has matching recipient fire`, () => {
        const f = fixture();
        try {
            const event: GameEvent = {
                type: "spell_cast",
                casterId: "caster",
                spellName: "Meteorite",
                animations: [],
                unitIdsDied: [],
                damaged: [{ unitId: "victim", position: target.getPosition(), amount, unitsDied: 0 }],
            };
            f.scene.renderSpellDamageVfx([event]);
            expect(f.internals.fireBurns).toHaveLength(amount > 0 ? 1 : 0);
        } finally {
            f.dispose();
        }
    });
}

test("Whirlpool's water effect and damage do not gain a generic fire burst", () => {
    const f = fixture();
    const water = spyOn(f.visuals, "spawnWhirlpool").mockImplementation(() => {});
    try {
        f.scene.renderSpellDamageVfx([
            {
                type: "spell_cast",
                casterId: "caster",
                spellName: "Whirlpool",
                targetCell: { x: 4, y: 5 },
                animations: [],
                unitIdsDied: [],
                damaged: [{ unitId: "victim", position: target.getPosition(), amount: 7, unitsDied: 0 }],
            },
        ]);
        expect(water).toHaveBeenCalledTimes(1);
        expect(f.internals.fireBurns).toHaveLength(0);
        expect(f.internals.fireSweeps).toHaveLength(0);
        expect(f.root.children).toHaveLength(1);
    } finally {
        water.mockRestore();
        f.dispose();
    }
});

test("scene teardown removes unfinished live burns and sweeps and releases their texture", () => {
    const f = fixture();
    try {
        f.visuals.spawnFireBurn({ x: 50, y: 100 }, 64);
        f.visuals.spawnFireSweep({ x: 50, y: 100 }, { x: 250, y: 100 }, 64);
        const effects = [...f.root.children];
        f.step(0.1);
        f.visuals.clear();
        expect(effects.every((e) => e.destroyed)).toBe(true);
        expect(f.root.children).toHaveLength(0);
        expect(f.texture.destroyed).toBe(true);
    } finally {
        f.dispose();
    }
});
