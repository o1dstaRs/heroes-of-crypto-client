import { expect, spyOn, test } from "bun:test";
import { Container, Sprite, Texture } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import type { RenderableUnit } from "../RenderableUnit";
import { CombatVisuals } from "./CombatVisuals";

function fixture() {
    const root = new Container();
    root.scale.set(0.8, -0.5);
    const makeUnit = (x: number, y: number) =>
        ({
            getId: () => "target",
            isDead: () => false,
            presentDamageCasualties: () => {},
            getFlagEffectAnchor: () => ({ x, y }),
        }) as unknown as RenderableUnit;
    const unit = makeUnit(120, 300);
    const units = new Map([["target", unit]]);
    const visuals = new CombatVisuals({
        getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
        getBoardScale: () => ({ x: root.scale.x, y: root.scale.y }),
        attachToWorldRoot: (container) => {
            root.addChild(container);
        },
        getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { root, unit, units, makeUnit, visuals };
}

test("buffs, debuffs and morale follow the live flag across hydration and expire without simulation ticks", () => {
    const f = fixture();
    let now = 0;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    try {
        f.visuals.spawnDebuffPop({ x: 999, y: 10 }, Texture.WHITE, "Slow", 0, "debuff", f.unit);
        f.visuals.spawnDebuffPop({ x: 999, y: 10 }, Texture.WHITE, "Morale", 1, "buff", f.unit);
        const [debuff, buff] = f.root.children;
        expect(debuff.x).toBe(120);
        expect(debuff.y).toBeGreaterThan(300);
        expect(buff.y - debuff.y).toBeCloseTo(64 * 1.35);
        f.units.set("target", f.makeUnit(200, 400));
        now = 400;
        f.visuals.update(0);
        expect(debuff.x).toBe(200);
        expect(debuff.y).toBeCloseTo(400 + 64 * 0.85);
        expect(debuff.scale.y / debuff.scale.x).toBeCloseTo(-1.6);
        for (const pop of [debuff, buff]) {
            const icon = pop.children[0] as Sprite;
            const bounds = icon.getBounds();
            expect(bounds.width).toBeCloseTo(bounds.height);
        }
        now = 425;
        f.visuals.update(0);
        expect(debuff.destroyed).toBe(false);
        expect(buff.destroyed).toBe(false);
        expect(debuff.alpha).toBe(1);
        expect(buff.alpha).toBe(1);
        now = 650;
        f.visuals.update(0);
        expect(debuff.destroyed).toBe(true);
        expect(buff.destroyed).toBe(true);
    } finally {
        f.visuals.clear();
        clock.mockRestore();
    }
});

test.each(["luck", "resist", "heal", "absorb"])(
    "%s labels start above the flag, with no attack-direction drift",
    (kind) => {
        const f = fixture();
        let now = 0;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const pop = spyOn(f.visuals, "spawnCommonFlagPop").mockImplementation(() => undefined);
        const pos = { x: 999, y: 10 };
        try {
            if (kind === "luck") f.visuals.showLuckyLabel(pos, { x: 1, y: 1 }, f.unit);
            if (kind === "resist") f.visuals.showResistLabel(pos, { x: 1, y: 1 }, f.unit);
            if (kind === "heal") f.visuals.showFloatingHeal(pos, 10, f.unit);
            if (kind === "absorb") f.visuals.showFloatingAbsorbed(pos, 10, { x: 1, y: 1 }, undefined, f.unit);
            const label = f.root.children[0];
            expect(label.x).toBe(120);
            expect(label.y).toBeGreaterThan(300);
            now = 649;
            f.visuals.update(0);
            expect(label.x).toBe(120);
            expect(label.destroyed).toBe(false);
            now = 650;
            f.visuals.update(0);
            expect(label.destroyed).toBe(true);
        } finally {
            f.visuals.clear();
            pop.mockRestore();
            clock.mockRestore();
        }
    },
);
