import { afterAll, beforeAll, expect, test } from "bun:test";
import { BufferImageSource, Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { RangedProjectiles, type IRangedProjectilesContext } from "./RangedProjectiles";
import { CYCLOPS_FRACTURE_LIFE_MS, CYCLOPS_FRACTURE_PLAYBACK_RATE } from "./CyclopsFracturePhysics";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test("Gargantuan stone retains its painted projection in flight and impacts only on arrival", async () => {
    const gs = new GridSettings(
        GridConstants.GRID_SIZE,
        GridConstants.MAX_Y,
        GridConstants.MIN_Y,
        GridConstants.MAX_X,
        GridConstants.MIN_X,
        GridConstants.MOVEMENT_DELTA,
        GridConstants.UNIT_SIZE_DELTA,
    );
    const world = new Container();
    const projectiles = new RangedProjectiles({
        getGridSettings: () => gs,
        attachToWorldRoot: (object: Container) => world.addChild(object),
    } as IRangedProjectilesContext);
    const texture = new Texture({
        source: new BufferImageSource({ resource: new Uint8Array(4), width: 512, height: 512 }),
    });
    const state = projectiles as unknown as {
        gargantuanHeldStoneTexture: Texture;
        cyclopsFracture?: { activeCount: number };
        rockImpacts: unknown[];
        projectiles: { sprite: Sprite }[];
    };
    state.gargantuanHeldStoneTexture = texture;
    for (const cancel of [false, true]) {
        const controller = new AbortController();
        let impacts = 0;
        const flight = projectiles.fire({
            from: { x: 0, y: 0 },
            to: { x: 1000, y: 200 },
            big: false,
            gargantuanRock: true,
            gargantuanRockDiameter: 60,
            gargantuanRockHeight: 84,
            gargantuanImpactPosition: { x: 1000, y: 158 },
            signal: controller.signal,
            onImpact: () => impacts++,
        });
        await Promise.resolve();
        expect(projectiles.hasActive()).toBe(true);
        const sprite = state.projectiles[0].sprite;
        expect(sprite.texture).toBe(texture);
        expect((sprite.width * 496) / 512).toBeCloseTo(60, 8);
        expect((sprite.height * 496) / 512).toBeCloseTo(84, 8);
        expect(sprite.scale.y).toBeLessThan(0);
        projectiles.update(0.02);
        expect((sprite.width * 496) / 512).toBeCloseTo(60, 8);
        expect(impacts).toBe(0);
        if (cancel) controller.abort();
        else projectiles.update(10);
        await flight;
        expect(impacts).toBe(cancel ? 0 : 1);
        expect(projectiles.hasActive()).toBe(false);
        expect(state.rockImpacts).toHaveLength(0);
        expect(state.cyclopsFracture?.activeCount ?? 0).toBe(cancel ? 0 : 1);
        if (!cancel) {
            const impact = world.children.find((child) => child.children.length === 5)!;
            expect([impact.x, impact.y]).toEqual([1000, 158]);
            expect([impact.scale.x, impact.scale.y]).toEqual([gs.getCellSize(), gs.getCellSize()]);
            expect(impact.children).toHaveLength(5);
            projectiles.update(CYCLOPS_FRACTURE_LIFE_MS / CYCLOPS_FRACTURE_PLAYBACK_RATE / 4000);
            expect(state.cyclopsFracture?.activeCount).toBe(0);
            expect(impact.destroyed).toBe(true);
            expect(impacts).toBe(1);
        }
    }
    const resetFlight = projectiles.fire({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        big: false,
        gargantuanRock: true,
    });
    await Promise.resolve();
    projectiles.update(10);
    await resetFlight;
    const activeImpact = world.children.find((child) => child.children.length === 5)!;
    projectiles.clear();
    expect(activeImpact.destroyed).toBe(true);
    expect(state.cyclopsFracture?.activeCount).toBe(0);
    projectiles.destroy();
    expect(world.children).toHaveLength(0);
});
