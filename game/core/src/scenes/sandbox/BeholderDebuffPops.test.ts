import { expect, test } from "bun:test";
import { Container, Texture, TextureSource } from "pixi.js";
import { BeholderDebuffPops, BEHOLDER_DEBUFFS, beholderDebuffSlot } from "./BeholderDebuffPops";
import { releaseBoardMirror, setBoardMirror } from "../../pixi/boardMirror";
import { beholderDebuffFramePose } from "./beholderDebuffRegistration";

const fixture = () => {
    let now = 0;
    const root = new Container();
    const texture = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
    const layer = new BeholderDebuffPops(
        (node) => root.addChild(node),
        () => now,
    );
    return { root, texture, layer, time: (ms: number) => (now = ms) };
};

test("registration holds the measured skull landmark and size across different painted poses", () => {
    // Independent measurements from atlas frames 1, 5, 10 and 16 (256 px cells).
    for (const [frame, x, y, size] of [
        [0, 127, 88, 0.99],
        [4, 132, 74, 1.05],
        [9, 134, 74, 1.05],
        [15, 136, 79, 0.91],
    ]) {
        const [dx, dy, scale] = beholderDebuffFramePose("Curse", frame);
        expect(128 + (x - 128) * scale + dx).toBeCloseTo(127, 2);
        expect(128 + (y - 128) * scale + dy).toBeCloseTo(88, 2);
        expect(size * scale).toBeCloseTo(0.99, 4);
    }
    // Sinking/crouching and exploding shards must never be resized from their changing silhouette.
    for (const name of ["Quagmire", "Weakness", "Weakening Beam", "Rangebane"])
        for (let frame = 0; frame < 16; frame++) expect(beholderDebuffFramePose(name, frame)[2]).toBe(1);
});

test("all seven motifs share one evenly spaced row centered on the victim flag", () => {
    const f = fixture();
    for (const name of BEHOLDER_DEBUFFS) f.layer.spawn("victim", { x: 100, y: 200 }, 64, name, f.texture);
    f.layer.spawn("victim", { x: 100, y: 200 }, 64, "Curse", f.texture);
    expect(f.root.children).toHaveLength(1);
    expect(f.root.children[0].children).toHaveLength(7);
    for (let index = 0; index < 7; index++) {
        const slot = beholderDebuffSlot(index, 7);
        expect(slot.y + 0.82 / 2).toBeLessThan(-0.1);
        expect(slot.y).toBe(beholderDebuffSlot(0, 7).y);
        expect(slot.x + beholderDebuffSlot(6 - index, 7).x).toBeCloseTo(0);
        if (index > 0) expect(slot.x - beholderDebuffSlot(index - 1, 7).x).toBeGreaterThan(0.95);
    }
    f.layer.clear();
    expect(f.root.children).toHaveLength(0);
    expect(f.texture.destroyed).toBe(false);
    expect(f.texture.source.destroyed).toBe(false);
    f.texture.destroy(true);
});

test("icons follow a live replacement, correct mirroring and disappear when the victim is gone", () => {
    const f = fixture();
    let anchor: { x: number; y: number } | undefined = { x: 100, y: 200 };
    try {
        setBoardMirror(f, true);
        f.root.scale.set(-2, -1);
        f.layer.spawn("victim", anchor, 64, "Sadness", f.texture, () => anchor);
        f.time(400);
        anchor = { x: 200, y: 350 };
        f.layer.update();
        expect(f.root.children[0].position.x).toBe(200);
        expect(f.root.children[0].position.y).toBe(350);
        expect(f.root.children[0].scale.x).toBe(-1);
        expect(f.root.children[0].scale.y).toBe(-2);
        anchor = undefined;
        f.layer.update();
        expect(f.layer.active).toBe(false);
        expect(f.root.children).toHaveLength(0);
    } finally {
        releaseBoardMirror(f);
        f.layer.clear();
        f.texture.destroy(true);
    }
});

test("wall-clock expiry and a cold texture cannot replay a stale impact", () => {
    const f = fixture();
    f.layer.spawn("victim", { x: 0, y: 0 }, 64, "Weakness", f.texture);
    f.time(649);
    f.layer.update();
    expect(f.layer.active).toBe(true);
    f.time(650);
    f.layer.update();
    expect(f.layer.active).toBe(false);
    f.layer.spawn("victim", { x: 0, y: 0 }, 64, "Weakness", f.texture, undefined, 0);
    expect(f.layer.active).toBe(false);
    f.layer.spawn("victim", { x: 0, y: 0 }, 64, "Weakness", f.texture);
    expect(f.layer.active).toBe(true);
    f.layer.clear();
    expect(f.texture.destroyed).toBe(false);
    f.texture.destroy(true);
});

test("motifs stay hidden until damage finishes, then play their full authored sequence", () => {
    const f = fixture();
    let damageVisible = true;
    f.layer.spawn("victim", { x: 100, y: 200 }, 64, "Curse", f.texture, undefined, 0, () => damageVisible);
    expect(f.root.children[0].visible).toBe(false);
    f.time(3000); // Delayed render ticks must not reveal the motifs over unfinished damage.
    f.layer.update();
    expect(f.root.children[0].visible).toBe(false);
    damageVisible = false;
    f.layer.update();
    expect(f.root.children[0].visible).toBe(true);
    f.time(3200);
    f.layer.update();
    const sprite = f.root.children[0].children[0] as import("pixi.js").Sprite;
    expect(sprite.texture.frame.y).toBe(256); // New painted pose, not a scaled still icon.
    const frame = sprite.texture;
    f.time(3649);
    f.layer.update();
    expect(f.layer.active).toBe(true);
    f.time(3650);
    f.layer.update();
    expect(f.layer.active).toBe(false);
    f.layer.clear();
    expect(frame.destroyed).toBe(true);
    expect(f.texture.destroyed).toBe(false);
    expect(f.texture.source.destroyed).toBe(false);
    f.texture.destroy(true);
});

test("a hidden pending group is removed if its victim disappears", () => {
    const f = fixture();
    let alive = true;
    f.layer.spawn(
        "victim",
        { x: 0, y: 0 },
        64,
        "Curse",
        f.texture,
        () => (alive ? { x: 0, y: 0 } : undefined),
        0,
        () => true,
    );
    alive = false;
    f.layer.update();
    expect(f.root.children).toHaveLength(0);
    f.layer.clear();
    expect(f.texture.source.destroyed).toBe(false);
    f.texture.destroy(true);
});
