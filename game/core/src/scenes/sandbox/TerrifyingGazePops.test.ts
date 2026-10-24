import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { Assets, Container, DOMAdapter, Texture, TextureSource } from "pixi.js";
import { TerrifyingGazePops } from "./TerrifyingGazePops";
import { CombatVisuals } from "./CombatVisuals";
import { images } from "../../generated/image_imports";
import { Sandbox } from "../Sandbox";
import { animatableEffectNames, diffUnitEffects } from "../effect_pops";
import { canPreviewCreatureLabState } from "../../ui/creatureAnimationLabCapabilities";

const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));

const texture = () => new Texture({ source: new TextureSource({ width: 256, height: 256 }) });

test("combat preparation waits for the real gaze texture and tolerates an unavailable asset", async () => {
    const visuals = Object.create(CombatVisuals.prototype) as CombatVisuals;
    const art = texture();
    let complete!: (value: Texture) => void;
    const load = spyOn(Assets, "load").mockImplementation(
        () =>
            new Promise<Texture>((resolve) => {
                complete = resolve;
            }),
    );
    try {
        let ready = false;
        const preparation = visuals.prepareTerrifyingGazePop().then(() => {
            ready = true;
        });
        await Promise.resolve();
        expect(load).toHaveBeenCalledWith(images.terrifying_gaze_256);
        expect(ready).toBe(false);
        complete(art);
        await preparation;
        expect(ready).toBe(true);
        expect(art.destroyed).toBe(false);
        load.mockRejectedValueOnce(new Error("icon unavailable"));
        await expect(visuals.prepareTerrifyingGazePop()).resolves.toBeUndefined();
    } finally {
        load.mockRestore();
        art.destroy(true);
    }
});

test.each([1, -1])(
    "gaze follows the flag, corrects projection and expires on wall time (mirror %s)",
    async (mirror) => {
        const root = new Container();
        root.scale.set(mirror * 0.8, -0.5);
        const art = texture();
        let now = 0,
            anchor: { x: number; y: number } | undefined = { x: 120, y: 300 };
        const layer = new TerrifyingGazePops(
            (c) => root.addChild(c),
            () => now,
            async () => art,
        );
        await layer.spawn("victim", 64, () => anchor);
        expect(layer.active).toBe(true);
        await layer.spawn("victim", 64, () => anchor);
        expect(root.children).toHaveLength(1);
        const pop = root.children[0];
        anchor = { x: 220, y: 410 };
        now = 350;
        layer.update();
        expect(pop.x).toBe(220);
        expect(pop.y).toBeCloseTo(410 + 64 * 0.07);
        expect(pop.scale.y).toBeCloseTo(-1.6);
        now = 650;
        layer.update();
        expect(layer.active).toBe(false);
        expect(pop.destroyed).toBe(true);
        expect(art.destroyed).toBe(false);
        await layer.spawn("victim", 64, () => anchor);
        expect(layer.active).toBe(true);
        anchor = undefined;
        layer.update();
        expect(layer.active).toBe(false);
        layer.clear();
        art.destroy(true);
        root.destroy();
    },
);

test.each(["clear", "late"])("pending gaze never resurrects after %s", async (reason) => {
    const root = new Container();
    const art = texture();
    let now = 0,
        resolve!: (t: Texture) => void;
    const layer = new TerrifyingGazePops(
        (c) => root.addChild(c),
        () => now,
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const pending = layer.spawn("victim", 64, () => ({ x: 0, y: 0 }));
    if (reason === "clear") layer.clear();
    else now = 1100;
    resolve(art);
    await pending;
    expect(root.children).toHaveLength(0);
    expect(art.destroyed).toBe(false);
    layer.clear();
    root.destroy();
    art.destroy(true);
});

test("fright stays out of the delayed snapshot queue and uses the dedicated animation", () => {
    const names = animatableEffectNames(["Terrifying Gaze"]);
    expect(diffUnitEffects(undefined, undefined, names, new Set()).seeded).toBe(true);
    expect(diffUnitEffects(new Set(), new Set(), names, new Set()).newDebuffs).toEqual([]);
    const spawn = mock(() => undefined),
        load = mock(() => undefined);
    const scene = Object.assign(Object.create(Sandbox.prototype), {
        combatVisuals: { spawnTerrifyingGazePop: spawn },
        waitForTexture: load,
    });
    const unit = { isDead: () => false };
    scene.popEffectOnUnit(unit, "Terrifying Gaze", 0, "debuff");
    scene.popEffectOnUnit({ isDead: () => true }, "Terrifying Gaze", 0, "debuff");
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(unit);
    expect(load).not.toHaveBeenCalled();
    expect(
        canPreviewCreatureLabState(
            { name: "Manticore", abilities: ["Terrifying Gaze"], spells: [] },
            "terrifying_gaze",
        ),
    ).toBe(true);
    expect(canPreviewCreatureLabState({ name: "Peasant", abilities: [], spells: [] }, "terrifying_gaze")).toBe(false);
});
