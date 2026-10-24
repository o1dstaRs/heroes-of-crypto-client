import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { Assets, Container, DOMAdapter, Sprite, Texture, TextureSource } from "pixi.js";
import { CommonFlagPops } from "./CommonFlagPops";
import { InterpolatedFlagCel } from "./InterpolatedFlagCel";
import { isLazyCombatEffectAssetKey, isProductionOmittedAssetKey } from "../../pixi/imageAssetTiers";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

test.each(["blind_fury", "miner", "madness"] as const)(
    "%s visits all cels, follows mirrored flags, restarts, expires and releases safely",
    async (kind) => {
        const atlas = new Texture({ source: new TextureSource({ width: 1280, height: 1280 }) });
        const load = spyOn(Assets, "load").mockResolvedValue(atlas as never);
        const unload = spyOn(Assets, "unload").mockResolvedValue();
        const root = new Container();
        root.scale.set(-1, -0.6);
        const anchor = { x: 100, y: 200 };
        let now = 0;
        const layer = new CommonFlagPops(
            kind,
            (c) => root.addChild(c),
            () => now,
        );
        try {
            expect(isLazyCombatEffectAssetKey(`vfx_${kind}_pop_atlas`)).toBe(true);
            expect(isProductionOmittedAssetKey(`vfx_${kind}_pop_atlas`)).toBe(false);
            await layer.spawn("trog", anchor, 64, () => anchor);
            const sprite = root.children[0].children[0] as Sprite | InterpolatedFlagCel;
            const celPosition = () =>
                sprite instanceof InterpolatedFlagCel
                    ? Array.from(sprite.shader!.resources.cels.uniforms.uFrom as Float32Array)
                          .slice(0, 2)
                          .join(":")
                    : `${sprite.texture.frame.x}:${sprite.texture.frame.y}`;
            const initialPosition = celPosition();
            const frames = new Set<string>();
            for (let i = 0; i < 16; i++) {
                now = ((i + 0.5) * 650) / 16;
                layer.update(0);
                frames.add(celPosition());
                if (sprite instanceof InterpolatedFlagCel) {
                    expect(sprite.shader!.resources.cels.uniforms.uBlend).toBeCloseTo(0.5);
                }
            }
            expect(frames.size).toBe(16);
            anchor.x = 150;
            now = 620;
            await layer.spawn("trog", anchor, 64, () => anchor);
            expect(root.children).toHaveLength(1);
            expect(celPosition()).toBe(initialPosition);
            expect(root.children[0].x).toBe(150);
            expect(root.children[0].scale.y).toBeCloseTo(-1 / 0.6);
            now = 1269;
            layer.update(0);
            expect(layer.active).toBe(true);
            now = 1270;
            layer.update(0);
            expect(layer.active).toBe(false);
            layer.clear();
            await Promise.resolve();
            expect(unload).toHaveBeenCalledTimes(1);
            expect(atlas.source.destroyed).toBe(false);
        } finally {
            layer.clear();
            root.destroy({ children: true });
            load.mockRestore();
            unload.mockRestore();
        }
    },
);
