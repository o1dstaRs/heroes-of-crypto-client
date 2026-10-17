import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import type { GridSettings, UnitsHolder } from "@heroesofcrypto/common";

import { animationAtlases } from "../../generated/animation_atlases";
import { BattleRoarPops, battleRoarFrameAt, battleRoarOpacityAt } from "./BattleRoarPops";
import { CombatVisuals } from "./CombatVisuals";

const layers: BattleRoarPops[] = [];
afterEach(() => {
    for (const layer of layers) layer.clear();
    layers.length = 0;
});

describe("Battle Roar painted flag effect", () => {
    test.each([1000, 1500] as const)("plays all cels and expires at exactly %d ms", (durationMs) => {
        const meta = animationAtlases["Vfx Battle Roar"][durationMs === 1000 ? "short" : "long"];
        expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBe(durationMs);
        expect(meta.totalDurationSec).toBe(durationMs / 1000);
        let elapsed = 0;
        for (const [i, duration] of meta.frameDurationsMs!.entries()) {
            expect(battleRoarFrameAt(elapsed, durationMs)).toBe(i);
            expect(battleRoarFrameAt(elapsed + duration - 0.01, durationMs)).toBe(i);
            elapsed += duration;
        }
        expect(battleRoarFrameAt(durationMs, durationMs)).toBeUndefined();
        expect(battleRoarFrameAt(durationMs + 500, durationMs)).toBeUndefined();
    });

    test("follows the flag without pose-dependent drift or scale", async () => {
        const meta = animationAtlases["Vfx Battle Roar"].short;
        const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        try {
            const root = new Container();
            root.scale.set(0.8, -0.5);
            let now = 0;
            const layer = new BattleRoarPops(
                (container) => root.addChild(container),
                () => now,
            );
            layers.push(layer);
            let anchor = { x: 100, y: 200 };
            await layer.spawn(anchor, 64, 1500, () => anchor);
            const container = root.children[0];
            const sprite = container.children[0] as Sprite;
            const scale = { x: sprite.scale.x, y: sprite.scale.y };
            const y = container.y;
            for (let i = 0; i < 14; i++) {
                now += 100;
                layer.update(0.1);
                expect(container.x).toBe(anchor.x);
                expect(container.y).toBe(y);
                expect(sprite.scale.x).toBe(scale.x);
                expect(sprite.scale.y).toBe(scale.y);
                expect(container.scale.y).toBeCloseTo(-1.6, 8);
                expect(sprite.texture.width).toBe(384);
            }
            anchor = { x: 150, y: 250 };
            layer.update(0);
            expect(container.x).toBe(150);
            expect(container.y).toBe(y + 50);
            now += 100;
            layer.update(0.1);
            expect(layer.active).toBe(false);
            expect(container.destroyed).toBe(true);
            expect(atlas.destroyed).toBe(false);
            layer.clear();
            await Promise.resolve();
            expect(unload).toHaveBeenCalled();
        } finally {
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("clearing the scene cancels a pending load without spawning stale effects", async () => {
        let resolve!: (texture: Texture) => void;
        const pending = new Promise<Texture>((done) => (resolve = done));
        const load = spyOn(Assets, "load").mockReturnValue(pending as unknown as Promise<Record<string, unknown>>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        try {
            const root = new Container();
            const layer = new BattleRoarPops((container) => root.addChild(container));
            layers.push(layer);
            const spawning = layer.spawn({ x: 100, y: 200 }, 64);
            layer.clear();
            resolve(Texture.WHITE);
            await spawning;
            expect(root.children).toHaveLength(0);
            expect(layer.active).toBe(false);
        } finally {
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("ranked hydration keeps the running effect and follows the rebuilt recipient flag", async () => {
        let now = 0;
        const clock = spyOn(performance, "now").mockImplementation(() => now);
        const meta = animationAtlases["Vfx Battle Roar"].short;
        const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const makeUnit = (x: number, y: number) => ({
            getId: () => "ally",
            isDead: () => false,
            getFlagEffectAnchor: () => ({ x, y }),
        });
        const units = new Map([["ally", makeUnit(100, 200)]]);
        const visuals = new CombatVisuals({
            getGridSettings: () => ({ getCellSize: () => 64 }) as GridSettings,
            getUnitsHolder: () => ({ getAllUnits: () => units }) as unknown as UnitsHolder,
            attachToWorldRoot: (container: Container) => root.addChild(container),
            getSelectedUnitProperties: () => undefined,
            updateSelectedUnitProperties: () => undefined,
            setUnitPropertiesUpdateNeeded: () => undefined,
        });
        try {
            visuals.spawnBattleRoarPop(
                units.get("ally")! as unknown as Parameters<CombatVisuals["spawnBattleRoarPop"]>[0],
            );
            await Promise.resolve();
            await Promise.resolve();
            expect(root.children).toHaveLength(1);
            const pop = root.children[0];
            now = 300;
            visuals.update(0.4);
            visuals.clear({ keepDetachedOverlays: true });
            expect(pop.destroyed).toBe(false);
            units.set("ally", makeUnit(150, 250));
            now = 600;
            visuals.update(0.4);
            expect(pop.x).toBe(150);
            expect(pop.y).toBeCloseTo(250 + 64 * 0.07);
            now = 1000;
            visuals.update(0.7);
            expect(pop.destroyed).toBe(true);
            expect(root.children).toHaveLength(0);
        } finally {
            visuals.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
            clock.mockRestore();
        }
    });

    test.each([1000, 1500] as const)(
        "%d ms is real elapsed time even with slow or paused scene steps",
        async (durationMs) => {
            const meta = animationAtlases["Vfx Battle Roar"].short;
            const atlas = new Texture({
                source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }),
            });
            const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
            const unload = spyOn(Assets, "unload").mockResolvedValue();
            try {
                const root = new Container();
                let now = 5000;
                const layer = new BattleRoarPops(
                    (container) => root.addChild(container),
                    () => now,
                );
                layers.push(layer);
                await layer.spawn({ x: 100, y: 200 }, 64, durationMs);
                const pop = root.children[0];
                expect(pop.alpha).toBe(0);
                now += 60;
                layer.update(1 / 60);
                expect(pop.alpha).toBeGreaterThan(0);
                expect(pop.alpha).toBeLessThan(1);
                now = 5000 + durationMs * 0.5;
                layer.update(1 / 60);
                expect(pop.alpha).toBe(1);
                now = 5000 + durationMs - 50;
                layer.update(0);
                expect(pop.alpha).toBeGreaterThan(0);
                expect(pop.alpha).toBeLessThan(0.2);
                now = 5000 + durationMs;
                layer.update(0);
                expect(layer.active).toBe(false);
                expect(pop.destroyed).toBe(true);
                layer.clear();
                await Promise.resolve();
            } finally {
                load.mockRestore();
                unload.mockRestore();
            }
        },
    );

    test("appearance and disappearance are continuous and included in the one-second cycle", () => {
        expect(battleRoarOpacityAt(0, 1000)).toBe(0);
        expect(battleRoarOpacityAt(60, 1000)).toBeCloseTo(0.5);
        expect(battleRoarOpacityAt(120, 1000)).toBe(1);
        expect(battleRoarOpacityAt(780, 1000)).toBe(1);
        expect(battleRoarOpacityAt(890, 1000)).toBeCloseTo(0.5);
        expect(battleRoarOpacityAt(1000, 1000)).toBe(0);
    });
});
