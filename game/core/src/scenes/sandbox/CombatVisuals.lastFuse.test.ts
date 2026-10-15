import { expect, test } from "bun:test";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";
import { Container, Graphics } from "pixi.js";
import { CombatVisuals } from "./CombatVisuals";

function fixture() {
    const attached: Container[] = [];
    const visuals = new CombatVisuals({
        getGridSettings: () => undefined as unknown as GridSettings,
        attachToWorldRoot: (object: Container) => {
            attached.push(object);
        },
        getUnitsHolder: () => undefined as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    const internals = visuals as unknown as {
        pyreExplosions: { graphics: Graphics; age: number; delay: number; sparks: unknown[] }[];
    };
    return { visuals, internals, attached };
}

test("Last Fuse waits for a chain delay, renders sparks and destroys its graphics when finished", () => {
    const { visuals, internals, attached } = fixture();
    visuals.spawnPyreExplosion({ x: 100, y: 100 }, 64, 0.4);
    const effect = internals.pyreExplosions[0];
    expect(effect.sparks.length).toBeGreaterThan(0);
    visuals.update(0.2);
    expect(effect.graphics.context.instructions).toHaveLength(0);
    visuals.update(0.3);
    expect(effect.graphics.context.instructions.length).toBeGreaterThan(0);
    visuals.update(1);
    expect(internals.pyreExplosions).toHaveLength(0);
    expect(attached[0].destroyed).toBe(true);
});

test("scene reset disposes pending and visible Last Fuse explosions", () => {
    const { visuals, internals, attached } = fixture();
    visuals.spawnPyreExplosion({ x: 0, y: 0 }, 64);
    visuals.spawnPyreExplosion({ x: 64, y: 0 }, 64, 0.5);
    visuals.clear();
    expect(internals.pyreExplosions).toHaveLength(0);
    expect(attached.every((object) => object.destroyed)).toBe(true);
});
