import { afterEach, describe, expect, test } from "bun:test";

import { Container, Texture, TextureSource } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { CombatVisuals } from "./CombatVisuals";

// spawnDeathVfx / the death animations only touch attachToWorldRoot; the rest of the context is
// never reached by these paths.
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

// A real (headless) texture big enough to slice — the death effects bail on frames <= 1px.
const makeInfo = () => ({
    texture: new Texture({ source: new TextureSource({ width: 32, height: 32 }) }),
    x: 100,
    y: 200,
    scaleX: 2,
    scaleY: -2, // the y-up flip the unit sprites carry
});

type VisualsInternals = {
    shatterGroups: unknown[];
    cleaveDeaths: unknown[];
    dissolveDeaths: unknown[];
    abilitySteals: { payload: Container; arrived: boolean }[];
};
const internals = (visuals: CombatVisuals): VisualsInternals => visuals as unknown as VisualsInternals;

const originalRandom = Math.random;
afterEach(() => {
    Math.random = originalRandom;
});

describe("spawnDeathVfx kill-specific death animations", () => {
    test("no recorded blow -> always the mirror shatter, even when the roll favors the new animations", () => {
        Math.random = () => 0.25; // < 0.5 would pick a new animation IF a blow were recorded
        const { visuals } = makeVisuals();
        visuals.spawnDeathVfx(makeInfo(), "u1");
        expect(internals(visuals).shatterGroups.length).toBe(1);
        expect(internals(visuals).cleaveDeaths.length).toBe(0);
        expect(internals(visuals).dissolveDeaths.length).toBe(0);
    });

    test("melee blow + winning roll -> cleave death", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "melee", { x: 1, y: 0 });
        visuals.spawnDeathVfx(makeInfo(), "u1");
        expect(internals(visuals).cleaveDeaths.length).toBe(1);
        expect(internals(visuals).shatterGroups.length).toBe(0);
        expect(internals(visuals).dissolveDeaths.length).toBe(0);
    });

    test("range blow + winning roll -> dissolve death (works without a direction too)", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "range");
        visuals.spawnDeathVfx(makeInfo(), "u1");
        expect(internals(visuals).dissolveDeaths.length).toBe(1);
        expect(internals(visuals).shatterGroups.length).toBe(0);
        expect(internals(visuals).cleaveDeaths.length).toBe(0);
    });

    test("losing roll -> the recorded blow still gives the classic mirror shatter (the 50/50)", () => {
        Math.random = () => 0.75;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "melee", { x: 0, y: 1 });
        visuals.spawnDeathVfx(makeInfo(), "u1");
        expect(internals(visuals).shatterGroups.length).toBe(1);
        expect(internals(visuals).cleaveDeaths.length).toBe(0);
    });

    test("a blow is consumed by the death it colors — a second death of the same id falls back to the mirror", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "range", { x: -1, y: 0 });
        visuals.spawnDeathVfx(makeInfo(), "u1");
        visuals.spawnDeathVfx(makeInfo(), "u1");
        expect(internals(visuals).dissolveDeaths.length).toBe(1);
        expect(internals(visuals).shatterGroups.length).toBe(1);
    });

    test("dissolve is angle-aware: shards are carried along the shot and erode entry-side first", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "range", { x: 0, y: 1 }); // shot flying straight up
        visuals.spawnDeathVfx(makeInfo(), "u1");
        type Shard = { y: number; vy: number; delay: number };
        const dissolve = (internals(visuals).dissolveDeaths as { shards: Shard[] }[])[0];
        // Every shard is thrown along the shot direction (+y), not sideways or down.
        for (const shard of dissolve.shards) {
            expect(shard.vy).toBeGreaterThan(0);
        }
        // The erosion wave enters on the side facing the shooter (lowest y) and exits at the top.
        const byDelay = [...dissolve.shards].sort((a, b) => a.delay - b.delay);
        expect(byDelay[0].y).toBeLessThan(byDelay[byDelay.length - 1].y);
    });

    test("cleave is angle-aware: the cut runs perpendicular to the blow and the halves separate along it", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "melee", { x: 1, y: 0 }); // struck from the left
        visuals.spawnDeathVfx(makeInfo(), "u1");
        type Cleave = { cutU: { x: number; y: number }; halves: { vx: number; vy: number }[] };
        const cleave = (internals(visuals).cleaveDeaths as Cleave[])[0];
        // Cut tangent is near-perpendicular to the strike line (only the small blade lean remains).
        expect(Math.abs(cleave.cutU.x * 1 + cleave.cutU.y * 0)).toBeLessThan(0.25);
        // Both halves get shoved away from the attacker overall, and asymmetrically: the far half
        // flies off along the blow while the near half mostly crumples in place.
        const alongBlow = cleave.halves.map((h) => h.vx * 1 + h.vy * 0);
        expect(Math.max(...alongBlow)).toBeGreaterThan(100);
        expect(Math.min(...alongBlow)).toBeLessThan(50);
        expect(alongBlow[0] + alongBlow[1]).toBeGreaterThan(0);
    });

    test("all three animations run to completion and tear their containers down", () => {
        Math.random = () => 0.25;
        const { visuals, attached } = makeVisuals();
        visuals.noteDeathBlow("melee-kill", "melee", { x: 1, y: 0.5 });
        visuals.noteDeathBlow("range-kill", "range", { x: 0, y: -1 });
        visuals.spawnDeathVfx(makeInfo(), "melee-kill");
        visuals.spawnDeathVfx(makeInfo(), "range-kill");
        visuals.spawnDeathVfx(makeInfo(), "spell-kill"); // no blow -> mirror
        expect(attached.length).toBe(3);
        for (let i = 0; i < 80; i++) {
            visuals.update(0.05); // 4 simulated seconds, far past every effect's life
        }
        expect(internals(visuals).shatterGroups.length).toBe(0);
        expect(internals(visuals).cleaveDeaths.length).toBe(0);
        expect(internals(visuals).dissolveDeaths.length).toBe(0);
        for (const container of attached) {
            expect(container.destroyed).toBe(true);
        }
    });

    test("clear() drops in-flight death animations and pending blows", () => {
        Math.random = () => 0.25;
        const { visuals } = makeVisuals();
        visuals.noteDeathBlow("u1", "melee");
        visuals.noteDeathBlow("u2", "range");
        visuals.spawnDeathVfx(makeInfo(), "u1");
        visuals.spawnDeathVfx(makeInfo(), "u2");
        visuals.clear();
        expect(internals(visuals).cleaveDeaths.length).toBe(0);
        expect(internals(visuals).dissolveDeaths.length).toBe(0);
        // u2's blow was consumed and the registry cleared: a re-death of either id is a mirror shatter.
        visuals.spawnDeathVfx(makeInfo(), "u2");
        expect(internals(visuals).shatterGroups.length).toBe(1);
        expect(internals(visuals).dissolveDeaths.length).toBe(0);
    });
});

describe("Predatory Assimilation ability-steal VFX", () => {
    test("carries the ability from victim to Queen, fires arrival once, and tears itself down", () => {
        const { visuals, attached } = makeVisuals();
        let arrivals = 0;
        visuals.spawnAbilitySteal({ x: 20, y: 30 }, { x: 220, y: 130 }, 80, "Dodge", undefined, () => {
            arrivals++;
        });

        expect(attached.length).toBe(1);
        expect(internals(visuals).abilitySteals.length).toBe(1);
        visuals.update(0.23);
        const inFlight = internals(visuals).abilitySteals[0];
        expect(inFlight.payload.x).toBeGreaterThan(20);
        expect(inFlight.payload.x).toBeLessThan(220);
        expect(arrivals).toBe(0);

        visuals.update(0.24);
        expect(arrivals).toBe(1);
        expect(internals(visuals).abilitySteals[0].arrived).toBe(true);
        visuals.update(0.2);
        expect(arrivals).toBe(1);
        visuals.update(0.2);
        expect(internals(visuals).abilitySteals.length).toBe(0);
        expect(attached[0].destroyed).toBe(true);
    });

    test("clear removes an in-flight transfer without applying its arrival flash", () => {
        const { visuals, attached } = makeVisuals();
        let arrived = false;
        visuals.spawnAbilitySteal({ x: 0, y: 0 }, { x: 100, y: 0 }, 80, "Dodge", undefined, () => {
            arrived = true;
        });
        visuals.update(0.1);
        visuals.clear();

        expect(arrived).toBe(false);
        expect(internals(visuals).abilitySteals.length).toBe(0);
        expect(attached[0].destroyed).toBe(true);
    });
});
