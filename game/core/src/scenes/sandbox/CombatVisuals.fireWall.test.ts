import { describe, expect, test } from "bun:test";

import { Container } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { RenderableUnit } from "../RenderableUnit";
import { CombatVisuals } from "./CombatVisuals";

// The Fire Wall crossing effects only touch attachToWorldRoot and the grid settings they hand straight
// to the unit; the rest of the context is never reached.
const makeVisuals = (): { visuals: CombatVisuals; attached: Container[] } => {
    const attached: Container[] = [];
    const visuals = new CombatVisuals({
        getGridSettings: () => undefined as unknown as GridSettings,
        attachToWorldRoot: (obj: Container) => {
            attached.push(obj);
        },
        getUnitsHolder: () => undefined as unknown as UnitsHolder,
        getSelectedUnitProperties: () => undefined,
        updateSelectedUnitProperties: () => undefined,
        setUnitPropertiesUpdateNeeded: () => undefined,
    });
    return { visuals, attached };
};

interface IParticle {
    age: number;
    life: number;
    x: number;
    y: number;
    riseY: number;
}

type Internals = {
    fireBurns: { container: Container; particles: IParticle[] }[];
    unitAblazes: { age: number; flashed: boolean; particles: IParticle[] }[];
    delayedFloatingDamage: unknown[];
    floatingTexts: unknown[];
};

const internalsOf = (visuals: CombatVisuals): Internals => visuals as unknown as Internals;

const settle = (visuals: CombatVisuals, seconds: number): void => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) {
        visuals.update(0.05);
    }
};

describe("fire wall crossing visuals", () => {
    test("a cell's flare waits for the walk to reach it, then burns out and cleans up after itself", () => {
        const { visuals, attached } = makeVisuals();
        visuals.spawnFireWallCrossing({ x: 100, y: 100 }, 64, 0.5, false, { x: 1, y: 0 });
        const burn = internalsOf(visuals).fireBurns[0];
        expect(burn).toBeDefined();

        // Nothing is born before the delay elapses — the sprite is still walking up to the cell.
        visuals.update(0.3);
        expect(burn.particles.every((particle) => particle.age < 0)).toBe(true);
        expect(burn.container.children.every((child) => !child.visible)).toBe(true);

        visuals.update(0.4);
        expect(burn.container.children.some((child) => child.visible)).toBe(true);

        settle(visuals, 4);
        expect(internalsOf(visuals).fireBurns).toHaveLength(0);
        expect(attached[0].destroyed).toBe(true);
    });

    test("the flames leap higher under a flyer than around a wader", () => {
        const { visuals } = makeVisuals();
        visuals.spawnFireWallCrossing({ x: 0, y: 0 }, 64, 0, false, { x: 1, y: 0 });
        visuals.spawnFireWallCrossing({ x: 0, y: 0 }, 64, 0, true, { x: 1, y: 0 });
        const [wading, flying] = internalsOf(visuals).fireBurns;
        const tallest = (particles: IParticle[]) => Math.max(...particles.map((particle) => particle.riseY));
        expect(tallest(flying.particles)).toBeGreaterThan(tallest(wading.particles));
    });

    test("an ignited body sheds embers from wherever its sprite is, flashes once, and goes out", () => {
        const { visuals } = makeVisuals();
        let flashes = 0;
        let center = { x: 10, y: 10 };
        let dead = false;
        // A rendered unit (instanceof matters: a plain engine unit has no body to wash or to read a
        // sprite centre off), with just the three members the emitter touches.
        const unit = Object.assign(Object.create(RenderableUnit.prototype) as RenderableUnit, {
            getVisualCenter: () => center,
            isDead: () => dead,
            flashScorch: () => {
                flashes += 1;
            },
        });

        visuals.igniteUnit(unit, 0.2, 1, 64);
        const ablaze = internalsOf(visuals).unitAblazes[0];
        expect(ablaze).toBeDefined();

        // Not yet in the fire: no wash, no embers.
        visuals.update(0.1);
        expect(flashes).toBe(0);
        expect(ablaze.particles).toHaveLength(0);

        // In the fire: the scorch wash lands once and embers start peeling off the body.
        visuals.update(0.2);
        expect(flashes).toBe(1);
        expect(ablaze.particles.length).toBeGreaterThan(0);

        // The body moved on; the newest embers are born where it is now, not where it caught fire.
        center = { x: 500, y: 500 };
        visuals.update(0.1);
        const newest = ablaze.particles[ablaze.particles.length - 1];
        expect(Math.abs(newest.x - 500)).toBeLessThan(64);
        expect(Math.abs(newest.y - 500)).toBeLessThan(64);

        settle(visuals, 3);
        expect(internalsOf(visuals).unitAblazes).toHaveLength(0);
        expect(flashes).toBe(1);

        // A body that died in the flames stops burning at once.
        visuals.igniteUnit(unit, 0, 5, 64);
        dead = true;
        settle(visuals, 1.5);
        expect(internalsOf(visuals).unitAblazes).toHaveLength(0);
    });

    test("a delayed burn number pops only once its moment comes", () => {
        const { visuals } = makeVisuals();
        visuals.showFloatingDamageDelayed({ x: 0, y: 0 }, 42, 0, 0.5, "#ffb347", "#5a1500");
        visuals.update(0.3);
        expect(internalsOf(visuals).floatingTexts).toHaveLength(0);
        expect(internalsOf(visuals).delayedFloatingDamage).toHaveLength(1);
        visuals.update(0.3);
        expect(internalsOf(visuals).delayedFloatingDamage).toHaveLength(0);
        expect(internalsOf(visuals).floatingTexts).toHaveLength(1);
    });
});
