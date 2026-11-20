import { describe, expect, test } from "bun:test";

import { Container, Sprite, Texture, TextureSource } from "pixi.js";

import { collectStageTextureSources, prewarmTextureSources } from "./prewarmStageTextures";

const textured = () => new Sprite(new Texture({ source: new TextureSource({ width: 4, height: 4 }) }));

describe("collectStageTextureSources", () => {
    test("returns each drawn source once, skipping the loading screen and hidden subtrees", () => {
        const stage = new Container();
        const board = new Container();
        const shared = textured();
        const twin = new Sprite(shared.texture);
        const hidden = new Container();
        hidden.visible = false;
        const hiddenSprite = textured();
        hidden.addChild(hiddenSprite);
        const notRenderable = textured();
        notRenderable.renderable = false;
        const loader = new Container();
        const loaderArt = textured();
        loader.addChild(loaderArt);
        board.addChild(shared, twin, hidden, notRenderable);
        stage.addChild(board, loader);

        expect(collectStageTextureSources(stage, loader)).toEqual([shared.texture.source]);
        expect(collectStageTextureSources(stage)).toEqual([shared.texture.source, loaderArt.texture.source]);
        stage.destroy({ children: true });
    });
});

describe("prewarmTextureSources", () => {
    const sources = () => Array.from({ length: 5 }, () => new TextureSource({ width: 4, height: 4 }));

    test("uploads within a per-frame budget, yielding a frame between batches and reporting progress", async () => {
        const all = sources();
        all[3].destroy();
        let clock = 0;
        const uploaded: TextureSource[] = [];
        const progress: number[] = [];
        let frames = 0;
        await prewarmTextureSources({
            sources: all,
            upload: (source) => {
                uploaded.push(source);
                clock += 5; // 5 ms each against an 8 ms budget: two uploads per frame; a destroyed source is free
            },
            onProgress: (fraction) => progress.push(fraction),
            nextFrame: async () => {
                frames++;
            },
            now: () => clock,
            frameBudgetMs: 8,
        });
        expect(uploaded).toEqual([all[0], all[1], all[2], all[4]]);
        // Frame 1: sources 0 and 1. Frame 2: source 2, destroyed source 3 skipped, source 4.
        expect(frames).toBe(1);
        expect(progress).toEqual([0.4, 1, 1]);
    });

    test("always makes progress with a source larger than the budget, and stops when cancelled", async () => {
        const all = sources();
        let clock = 0;
        let uploads = 0;
        let cancelled = false;
        await prewarmTextureSources({
            sources: all,
            upload: () => {
                uploads++;
                clock += 100;
                if (uploads === 2) cancelled = true;
            },
            nextFrame: async () => undefined,
            now: () => clock,
            isCancelled: () => cancelled,
        });
        expect(uploads).toBe(2);
    });
});
