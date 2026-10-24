import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Sprite, Texture, TextureSource } from "pixi.js";
import type { GameEvent, IVisibleDamage } from "@heroesofcrypto/common";
import { animationAtlases } from "../../generated/animation_atlases";
import { isProductionOmittedAssetKey, isLazyCombatEffectAssetKey } from "../../pixi/imageAssetTiers";
import { BorrowedGracePops, borrowedGracePose } from "./BorrowedGracePops";
import { borrowedGraceTransfers, borrowedGraceBuffsByThief } from "./borrowedGraceTransfers";

test("only authoritative transfers reveal the exact buff, with independent counter-shot ownership", () => {
    const forward = { thiefId: "monk", targetId: "enemy", buffName: "Blessing" };
    const backward = { thiefId: "enemy", targetId: "monk", buffName: "Spiritual Armor" };
    const damage = { buffsStolen: [forward, forward, backward] } as IVisibleDamage;
    expect(borrowedGraceTransfers(damage, "monk")).toEqual([forward]);
    expect(borrowedGraceTransfers(damage, "enemy")).toEqual([backward]);
    expect(borrowedGraceTransfers({} as IVisibleDamage)).toEqual([]);
    expect(borrowedGraceTransfers(undefined)).toEqual([]);
    const owned = borrowedGraceBuffsByThief([{ type: "unit_attacked", damage } as GameEvent]);
    expect([...owned.get("monk")!]).toEqual(["Blessing"]);
    expect([...owned.get("enemy")!]).toEqual(["Spiritual Armor"]);
    expect(owned.get("monk")?.has("Haste")).toBe(false);
});

test("nine hand cels finish before the buff phase; the sheet is shipped and loaded lazily", () => {
    const meta = animationAtlases["Vfx Borrowed Grace"].pop;
    let elapsed = 0;
    for (const [frame, duration] of meta.frameDurationsMs!.entries()) {
        expect(borrowedGracePose(elapsed).frame).toBe(frame);
        expect(borrowedGracePose(elapsed + duration - 0.01).reveal).toBe(false);
        elapsed += duration;
    }
    expect(elapsed).toBe(1000);
    expect(meta.frameCount).toBe(9);
    expect(meta.loopDurationMs).toBe(1000);
    expect(borrowedGracePose(1000).reveal).toBe(true);
    expect(borrowedGracePose(1999).finished).toBe(false);
    expect(borrowedGracePose(2000).finished).toBe(true);
    expect(isProductionOmittedAssetKey("vfx_borrowed_grace_pop_atlas")).toBe(false);
    expect(isLazyCombatEffectAssetKey("vfx_borrowed_grace_pop_atlas")).toBe(true);
});

test("hand stays on the victim, then the actual card follows the rebuilt monk flag and cleans up", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 1152, height: 1152 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    root.scale.set(0.8, -0.5);
    let now = 0,
        flashes = 0;
    let victim: { x: number; y: number } | undefined = { x: 100, y: 200 };
    let monk: { x: number; y: number } | undefined = { x: 500, y: 400 };
    const layer = new BorrowedGracePops(
        (container) => root.addChild(container),
        () => now,
    );
    try {
        await layer.spawn(
            victim,
            64,
            Texture.WHITE,
            () => victim,
            () => monk,
            () => flashes++,
        );
        const [enemy, recipient] = root.children;
        expect(enemy.visible).toBe(true);
        expect(recipient.visible).toBe(false);
        const card = recipient.children[0] as Sprite;
        expect(card.texture).toBe(Texture.WHITE);
        now = 600;
        victim = { x: 120, y: 250 };
        layer.update(0);
        expect(enemy.x).toBe(120);
        expect(enemy.scale.y).toBeCloseTo(-1.6);
        expect(flashes).toBe(0);
        now = 1100;
        monk = { x: 550, y: 420 };
        layer.update(0);
        expect(enemy.visible).toBe(false);
        expect(recipient.visible).toBe(true);
        expect(recipient.x).toBe(550);
        expect(recipient.y).toBeCloseTo(420 + 64 * 0.72);
        expect(card.alpha).toBeGreaterThan(0);
        expect(flashes).toBe(1);
        layer.update(0);
        expect(flashes).toBe(1);
        now = 2000;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(enemy.destroyed).toBe(true);
        expect(recipient.destroyed).toBe(true);
        await layer.spawn(
            victim,
            64,
            Texture.WHITE,
            () => victim,
            () => monk,
            () => flashes++,
        );
        monk = undefined;
        layer.update(0);
        expect(layer.active).toBe(false);
        expect(flashes).toBe(1);
        expect(Texture.WHITE.destroyed).toBe(false);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});

test("scene teardown cancels an in-flight hand load and never reveals the card later", async () => {
    let resolve!: (texture: Texture) => void;
    const load = spyOn(Assets, "load").mockReturnValue(
        new Promise<Texture>((done) => (resolve = done)) as unknown as Promise<Record<string, unknown>>,
    );
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    const layer = new BorrowedGracePops((c) => root.addChild(c));
    try {
        const pending = layer.spawn(
            { x: 0, y: 0 },
            64,
            Texture.WHITE,
            () => ({ x: 0, y: 0 }),
            () => ({ x: 100, y: 0 }),
        );
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

test("animated buff takes over after the hand without creating an icon, even after a delayed frame", async () => {
    const atlas = new Texture({ source: new TextureSource({ width: 1152, height: 1152 }) });
    const load = spyOn(Assets, "load").mockResolvedValue(atlas as unknown as Record<string, unknown>);
    const unload = spyOn(Assets, "unload").mockResolvedValue();
    const root = new Container();
    let now = 0,
        reveals = 0;
    let recipient: { x: number; y: number } | undefined = { x: 500, y: 400 };
    const layer = new BorrowedGracePops(
        (container) => root.addChild(container),
        () => now,
    );
    const spawn = () =>
        layer.spawn(
            { x: 100, y: 200 },
            64,
            undefined,
            () => ({ x: 100, y: 200 }),
            () => recipient,
            () => reveals++,
        );
    try {
        await spawn();
        expect(root.children[1].children).toHaveLength(0);
        now = 649;
        layer.update(0);
        expect(reveals).toBe(0);
        now = 650;
        layer.update(0);
        expect(reveals).toBe(1);
        expect(root.children).toHaveLength(0);
        expect(layer.active).toBe(false);
        layer.update(0);
        expect(reveals).toBe(1);
        await spawn();
        now = 4000;
        layer.update(0);
        expect(reveals).toBe(2);
        await spawn();
        recipient = undefined;
        now = 5000;
        layer.update(0);
        expect(reveals).toBe(2);
        recipient = { x: 500, y: 400 };
        await spawn();
        layer.clear();
        now = 6000;
        layer.update(0);
        expect(reveals).toBe(2);
    } finally {
        layer.clear();
        await Promise.resolve();
        load.mockRestore();
        unload.mockRestore();
    }
});
