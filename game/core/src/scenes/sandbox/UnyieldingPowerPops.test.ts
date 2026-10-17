import { describe, expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";

import { animationAtlases } from "../../generated/animation_atlases";
import { UnyieldingPowerPops, unyieldingPowerFrameAt } from "./UnyieldingPowerPops";
import { UnyieldingPowerTriggers } from "./UnyieldingPowerTriggers";

const meta = animationAtlases["Vfx Unyielding Power Curl"].short;

describe("Unyielding Power painted curl", () => {
    test("plays the approved 17 cels and expires at exactly one second", () => {
        expect(meta.frameCount).toBe(17);
        expect(meta.frameDurationsMs!.reduce((a, b) => a + b, 0)).toBe(1000);
        let elapsed = 0;
        for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
            expect(unyieldingPowerFrameAt(elapsed)).toBe(frame);
            expect(unyieldingPowerFrameAt(elapsed + duration - 0.01)).toBe(frame);
            elapsed += duration;
        }
        expect(unyieldingPowerFrameAt(1000)).toBeUndefined();
        expect(unyieldingPowerFrameAt(1500)).toBeUndefined();
    });

    test("simultaneous passive and first-turn events coalesce, follow the unit, and use real time", async () => {
        const atlas = new Texture({ source: new TextureSource({ width: meta.atlasWidth, height: meta.atlasHeight }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        root.scale.set(0.8, -0.5);
        let now = 0;
        let anchor = { x: 100, y: 200 };
        const layer = new UnyieldingPowerPops(
            (container) => root.addChild(container),
            () => now,
        );
        try {
            const triggers = new UnyieldingPowerTriggers();
            triggers.prime(["behemoth"]);
            const pending = [];
            if (triggers.observePassive("behemoth", 1, true))
                pending.push(layer.spawn("behemoth", anchor, 64, () => anchor));
            if (triggers.firstTurn("behemoth", 1, true))
                pending.push(layer.spawn("behemoth", anchor, 64, () => anchor));
            await Promise.all(pending);
            expect(root.children).toHaveLength(1);
            const container = root.children[0];
            const sprite = container.children[0] as Sprite;
            const scale = { x: sprite.scale.x, y: sprite.scale.y };
            const y = container.y;
            // A follow callback resolves the current rebuilt recipient, rather than a stale unit instance.
            anchor = { x: 150, y: 250 };
            now = 500;
            layer.update(1 / 240);
            expect(container.x).toBe(150);
            expect(container.y).toBe(y + 50);
            expect(container.scale.y).toBeCloseTo(-1.6, 8);
            expect(container.alpha).toBe(1); // fade is already painted into alpha
            expect(sprite.scale.x).toBe(scale.x);
            expect(sprite.scale.y).toBe(scale.y);
            expect(sprite.texture.width).toBe(384);
            await layer.spawn("behemoth", anchor, 64);
            expect(root.children).toHaveLength(1);
            now = 1000;
            layer.update(1 / 240);
            expect(layer.active).toBe(false);
            expect(container.destroyed).toBe(true);
            expect(atlas.destroyed).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });

    test("teardown cancels a pending load without leaving a stale pop", async () => {
        let resolve!: (texture: Texture) => void;
        const load = spyOn(Assets, "load").mockReturnValue(
            new Promise<Texture>((done) => {
                resolve = done;
            }) as unknown as Promise<Record<string, unknown>>,
        );
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        const layer = new UnyieldingPowerPops((container) => root.addChild(container));
        try {
            const pending = layer.spawn("behemoth", { x: 100, y: 200 }, 64);
            layer.clear();
            resolve(Texture.WHITE);
            await pending;
            expect(root.children).toHaveLength(0);
            expect(layer.active).toBe(false);
        } finally {
            layer.clear();
            await Promise.resolve();
            load.mockRestore();
            unload.mockRestore();
        }
    });
});
