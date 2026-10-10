import { afterEach, describe, expect, test } from "bun:test";
import { Filter, FilterSystem, RendererType, Texture, TexturePool } from "pixi.js";

import { recoverInterruptedFilters, renderWithFilterRecovery } from "./recoverInterruptedFilters";

interface IFilterInternals {
    _filterStackIndex: number;
    _filterStack: { skip: boolean; inputTexture: Texture | null; backTexture: Texture | null }[];
    _activeFilterData: unknown;
    _filterGlobalUniforms: { uniforms: { uOutputFrame: Float32Array } };
    _globalFilterBindGroup: { destroy(): void };
}

const dispose: (() => void)[] = [];

/** Real Pixi filtering/texture allocation, with only the GPU draw and render-target binding stubbed. */
const fixture = () => {
    const screen = { colorTexture: { source: { resolution: 1, antialias: false, width: 1000, height: 650 } } };
    const frames: number[][] = [];
    const renderer = {
        type: RendererType.WEBGL,
        renderPipes: {},
        globalUniforms: { push: () => {}, pop: () => {} },
        renderTarget: {
            renderSurface: screen as unknown,
            renderTarget: screen,
            rootRenderTarget: screen,
            rootViewPort: { width: 1000, height: 650 },
            bind({ target }: { target: unknown }) {
                this.renderSurface = target;
            },
            finishRenderPass: () => {},
            getRenderTarget: () => ({ width: 1000, height: 650, isRoot: true }),
        },
        encoder: {
            draw: () => frames.push([...internals._filterGlobalUniforms.uniforms.uOutputFrame]),
        },
    };
    const filter = new FilterSystem(renderer as never);
    const internals = filter as unknown as IFilterInternals;
    dispose.push(() => internals._globalFilterBindGroup.destroy());
    const camera = new Filter({ compatibleRenderers: RendererType.WEBGL, resolution: "inherit" });
    const effect = new Filter({ compatibleRenderers: RendererType.WEBGL, resolution: "inherit" });
    let mirrored = false;
    const push = (pass: Filter, x: number, y: number, width: number, height: number) => {
        filter.push({
            filterEffect: { filters: [pass] },
            container: {
                parentRenderGroup: {},
                getFastGlobalBounds: (
                    _: boolean,
                    bounds: { clear: () => void; addFrame: (...values: number[]) => void },
                ) => {
                    bounds.clear();
                    const left = mirrored ? screen.colorTexture.source.width - x - width : x;
                    bounds.addFrame(left, y, left + width, y + height);
                },
            },
        } as never);
    };
    const startFrame = () => {
        renderer.renderTarget.renderSurface = screen;
        push(camera, 300, 190, 610, 320);
        push(effect, 680, 370, 70, 120);
    };
    const setView = (width: number, height: number, resolution: number, mirror: boolean) => {
        Object.assign(screen.colorTexture.source, { width, height, resolution });
        Object.assign(renderer.renderTarget.rootViewPort, { width: width * resolution, height: height * resolution });
        mirrored = mirror;
    };
    return { renderer: { ...renderer, filter }, filter, internals, frames, camera, effect, startFrame, setView };
};

afterEach(() => {
    for (const cleanup of dispose.splice(0)) cleanup();
    TexturePool.clear();
});

describe("interrupted battlefield filters", () => {
    test("the next frame keeps the camera aligned after a nested combat effect throws", () => {
        const { renderer, filter, internals, frames, effect, startFrame } = fixture();
        const apply = effect.apply;
        startFrame();
        effect.apply = () => {
            throw new Error("combat texture disappeared");
        };
        expect(() => filter.pop()).toThrow("combat texture disappeared");
        expect(internals._filterStackIndex).toBe(1);
        effect.apply = apply;

        // Just catching the error (the old guard) draws the next camera at (0, 0), shifted up/left.
        startFrame();
        filter.pop();
        filter.pop();
        expect(frames.at(-1)?.slice(0, 2)).toEqual([0, 0]);

        recoverInterruptedFilters(renderer);
        expect(internals._filterStackIndex).toBe(0);
        expect(internals._activeFilterData).toBeNull();
        startFrame();
        filter.pop();
        filter.pop();
        expect(frames.at(-1)?.slice(0, 2)).toEqual([300, 190]);
        expect(internals._filterStackIndex).toBe(0);
    });

    test("repeated failures return still-pushed targets once, without sharing them between consumers", () => {
        const { renderer, filter, internals, startFrame } = fixture();
        for (let frame = 0; frame < 10; frame++) {
            startFrame();
            const abandoned = internals._filterStack.slice(0, 2).map((slot) => slot.inputTexture!);
            recoverInterruptedFilters(renderer);
            recoverInterruptedFilters(renderer);
            startFrame();
            const reused = internals._filterStack.slice(0, 2).map((slot) => slot.inputTexture!);
            expect(new Set(reused)).toEqual(new Set(abandoned));
            expect(reused[0]).not.toBe(reused[1]);
            filter.pop();
            filter.pop();
        }
    });

    test("does not return textures from skipped or already-popped slots, or Pixi's empty texture", () => {
        const { renderer, internals } = fixture();
        const leasedByText = TexturePool.getOptimalTexture({ width: 32, height: 32 });
        const leasedByEffect = TexturePool.getOptimalTexture({ width: 32, height: 32 });
        const textSlot = { skip: false, inputTexture: leasedByText, backTexture: Texture.EMPTY };
        textSlot.skip = true;
        internals._filterStack = [textSlot, { skip: false, inputTexture: leasedByEffect, backTexture: Texture.EMPTY }];
        internals._filterStackIndex = 1;
        recoverInterruptedFilters(renderer);

        const next = TexturePool.getOptimalTexture({ width: 32, height: 32 });
        expect(next).not.toBe(leasedByText);
        expect(next).not.toBe(leasedByEffect);
        expect(leasedByText.destroyed).toBe(false);
        expect(leasedByEffect.destroyed).toBe(false);
        expect(Texture.EMPTY.destroyed).toBe(false);
        TexturePool.returnTexture(next);
        TexturePool.returnTexture(leasedByText);
        TexturePool.returnTexture(leasedByEffect);
    });

    test("a push that throws before binding its input cannot return a stale texture leased by Text", () => {
        const { renderer, internals } = fixture();
        const leasedByText = TexturePool.getOptimalTexture({ width: 32, height: 32 });
        internals._filterStack = [{ skip: false, inputTexture: leasedByText, backTexture: Texture.EMPTY }];
        internals._filterStackIndex = 1;
        recoverInterruptedFilters(renderer);

        const next = TexturePool.getOptimalTexture({ width: 32, height: 32 });
        expect(next).not.toBe(leasedByText);
        expect(internals._filterStackIndex).toBe(0);
        TexturePool.returnTexture(next);
        TexturePool.returnTexture(leasedByText);
    });

    test("repairs an interrupted off-screen render before drawing the visible frame", () => {
        const { renderer, filter, internals, frames, startFrame } = fixture();
        startFrame(); // A separate render was interrupted between ticker frames.
        renderWithFilterRecovery(renderer, () => {
            expect(internals._filterStackIndex).toBe(0);
            startFrame();
            filter.pop();
            filter.pop();
        });
        expect(frames.at(-1)?.slice(0, 2)).toEqual([300, 190]);
        expect(internals._filterStackIndex).toBe(0);
    });

    test("cleans a silent unbalanced draw and leaves a balanced draw's cached resources alone", () => {
        const { renderer, filter, internals, startFrame } = fixture();
        renderWithFilterRecovery(renderer, startFrame);
        expect(internals._filterStackIndex).toBe(0);
        renderWithFilterRecovery(renderer, () => {
            startFrame();
            filter.pop();
            filter.pop();
        });
        const cameraTarget = internals._filterStack[0].inputTexture;
        const active = internals._activeFilterData;
        expect(cameraTarget).not.toBeNull();
        // The fast path must not return cached targets twice or scrub a successful frame's slots.
        renderWithFilterRecovery(renderer, () => {});
        expect(internals._filterStack[0].inputTexture).toBe(cameraTarget);
        expect(internals._activeFilterData).toBe(active);
    });

    test("keeps alignment through 300 interruptions, resizes, display resolutions, and board mirrors", () => {
        const { renderer, filter, internals, frames, camera, effect, startFrame, setView } = fixture();
        const apply = effect.apply;
        const failure = new Error("interrupted GPU draw");
        const fail = () => {
            throw failure;
        };
        for (let frame = 0; frame < 300; frame++) {
            const width = frame % 2 ? 1280 : 1000;
            const height = frame % 2 ? 720 : 650;
            const mirrored = frame % 4 < 2;
            setView(width, height, [0.5, 1, 2][frame % 3], mirrored);
            const phase = frame % 4;
            camera.apply = phase === 0 ? fail : apply;
            effect.apply = phase === 1 ? fail : apply;
            if (phase < 2) {
                expect(() =>
                    renderWithFilterRecovery(renderer, () => {
                        startFrame();
                        filter.pop();
                        filter.pop();
                    }),
                ).toThrow(failure);
            } else if (phase === 2) {
                expect(() =>
                    renderWithFilterRecovery(renderer, () => {
                        startFrame();
                        throw failure; // A unit draw failed with both filters still pushed.
                    }),
                ).toThrow(failure);
            } else {
                renderWithFilterRecovery(renderer, startFrame); // An effect swallowed its own failure.
            }
            expect(internals._filterStackIndex).toBe(0);
            camera.apply = apply;
            effect.apply = apply;
            renderWithFilterRecovery(renderer, () => {
                startFrame();
                filter.pop();
                filter.pop();
            });
            expect(frames.at(-1)?.slice(0, 2)).toEqual([mirrored ? width - 910 : 300, 190]);
            expect(internals._filterStackIndex).toBe(0);
        }
    });
});
