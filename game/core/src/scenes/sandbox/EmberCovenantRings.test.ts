import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Container, MeshSimple, Sprite, Texture } from "pixi.js";

import { EmberCovenantRings, type EmberCovenantUnit } from "./EmberCovenantRings";

const NAME = "Ember Covenant Blessing";
const roots: Container[] = [];
afterEach(() => {
    for (const root of roots) root.destroy({ children: true });
    roots.length = 0;
});

const makeUnit = () => ({
    properties: { applied_buffs: [NAME], applied_buffs_laps: [15] },
    frame: { x: 320, y: 510, width: 32, height: 14, zIndex: 4001 },
    flagVisible: true,
    dead: false,
    getUnitProperties() {
        return this.properties;
    },
    getBlessingHaloFrame() {
        return this.flagVisible ? this.frame : undefined;
    },
    isDead() {
        return this.dead;
    },
});

function setup() {
    const root = new Container();
    roots.push(root);
    const one = makeUnit();
    const two = makeUnit();
    two.frame = { ...two.frame, x: 640, y: 390 };
    const units = new Map<string, EmberCovenantUnit>([
        ["one", one],
        ["two", two],
    ]);
    let texture: Texture | undefined = Texture.WHITE;
    const layer = new EmberCovenantRings({
        getUnits: () => units,
        getTexture: () => texture,
        attachToWorldRoot: (node, zIndex) => {
            node.zIndex = zIndex;
            root.addChild(node);
        },
    });
    return {
        root,
        one,
        two,
        units,
        layer,
        setTexture: (value?: Texture) => {
            texture = value;
        },
    };
}

describe("Ember Covenant rings", () => {
    test("uses hydrated buffs and one shared texture behind the flag, with no filters or game RNG", () => {
        const f = setup();
        const properties = JSON.stringify([f.one.properties, f.two.properties]);
        const random = spyOn(Math, "random");
        try {
            f.layer.update(0.3);
            expect(f.root.children).toHaveLength(2);
            const first = f.root.children[0];
            expect(first.zIndex).toBeLessThan(f.one.frame.zIndex);
            expect(first.eventMode).toBe("none");
            expect(first.filters?.length ?? 0).toBe(0);
            expect(first.children[0].children).toHaveLength(3);
            const sprites = first.children[0].children.filter((child) => child instanceof Sprite) as Sprite[];
            expect(sprites.every((sprite) => sprite.texture === Texture.WHITE)).toBe(true);
            for (let frame = 0; frame < 120; frame++) f.layer.update(1 / 60);
            expect(f.root.children[0]).toBe(first);
            expect(first.x).toBe(f.one.frame.x);
            expect(first.y).toBe(f.one.frame.y);
            expect(random).not.toHaveBeenCalled();
            expect(JSON.stringify([f.one.properties, f.two.properties])).toBe(properties);
        } finally {
            random.mockRestore();
        }
    });

    for (const [width, height] of [
        [29, 13],
        [50, 13],
        [29, 24],
        [58, 26],
    ]) {
        test(`centers the fire around a ${width}x${height} amount flag on a mirrored board`, () => {
            const f = setup();
            f.units.delete("two");
            Object.assign(f.one.frame, { width, height });
            f.root.scale.set(-1, -1);
            f.layer.update(0.3);
            const node = f.root.children[0];
            const point = node.toGlobal({ x: 0, y: 0 });
            expect(point.x).toBeCloseTo(-f.one.frame.x);
            expect(point.y).toBeCloseTo(-f.one.frame.y);
            expect(node.scale.x).toBeGreaterThan(width);
            expect(node.scale.y).toBeGreaterThan(height);
            expect(node.zIndex).toBeLessThan(f.one.frame.zIndex);
        });
    }

    test("keeps its screen shape when the amount flag compensates a stretched camera", () => {
        const ratios: number[] = [];
        for (const yScale of [2, 0.7]) {
            const f = setup();
            f.units.delete("two");
            f.root.scale.set(2, -yScale);
            f.one.frame.height *= 2 / yScale;
            f.layer.update(0.3);
            const node = f.root.children[0];
            const center = node.toGlobal({ x: 0, y: 0 });
            const right = node.toGlobal({ x: 0.5, y: 0 });
            const top = node.toGlobal({ x: 0, y: 0.5 });
            ratios.push(Math.abs((top.y - center.y) / (right.x - center.x)));
        }
        expect(ratios[0]).toBeCloseTo(ratios[1]);
    });

    test("follows the flag through movement and object replacement, including while dissolving", () => {
        const f = setup();
        f.layer.update(0.3);
        const node = f.root.children[0];
        const replacement = makeUnit();
        replacement.frame = { ...replacement.frame, x: 512, y: 550, zIndex: 4200 };
        f.units.set("one", replacement);
        f.layer.update(0);
        expect(f.root.children[0]).toBe(node);
        expect(node.x).toBe(512);
        expect(node.y).toBe(550);
        expect(node.zIndex).toBeLessThan(4200);
        replacement.properties.applied_buffs.length = 0;
        replacement.frame.x = 520;
        f.layer.update(0.1);
        expect(node.x).toBe(520);
        expect(node.children[0].alpha).toBeLessThan(1);
    });

    test("every ring dissolves together when the army blessing disappears", () => {
        const f = setup();
        f.layer.update(0.3);
        f.one.properties.applied_buffs.length = 0;
        f.two.properties.applied_buffs.length = 0;
        f.layer.update(0.2);
        expect(f.root.children).toHaveLength(2);
        const planes = f.root.children.map((node) => node.children[0]);
        expect(planes[0].alpha).toBeCloseTo(planes[1].alpha);
        expect(planes[0].alpha).toBeLessThan(1);
        const fragments = planes[0].children.find((child) => child instanceof MeshSimple) as MeshSimple;
        expect(fragments).toBeDefined();
        expect(fragments.vertices).toHaveLength(280);
        expect([...fragments.vertices].every(Number.isFinite)).toBe(true);
        const released = spyOn(fragments.geometry, "destroy");
        f.layer.update(0.66);
        expect(f.root.children).toHaveLength(0);
        expect(f.layer.active).toBe(false);
        expect(released).toHaveBeenCalledTimes(1);
        released.mockRestore();
    });

    test("an expired buff and a dead or removed unit dissolve without orphaned rings", () => {
        for (const reason of ["expired", "dead", "removed"]) {
            const f = setup();
            f.layer.update(0.3);
            if (reason === "expired") f.one.properties.applied_buffs_laps[0] = 0;
            if (reason === "dead") f.one.dead = true;
            if (reason === "removed") f.units.delete("one");
            f.layer.update(0.9);
            expect(f.root.children).toHaveLength(1);
        }
    });

    test("waits for a visible flag and hides its ring if the flag is hidden or invalid", () => {
        const f = setup();
        f.units.delete("two");
        f.one.flagVisible = false;
        f.layer.update(0.3);
        expect(f.root.children).toHaveLength(0);
        f.one.flagVisible = true;
        f.layer.update(0.3);
        const node = f.root.children[0];
        f.one.flagVisible = false;
        f.layer.update(0.1);
        expect(node.visible).toBe(false);
        f.one.flagVisible = true;
        f.one.frame.width = NaN;
        f.layer.update(0.1);
        expect(node.visible).toBe(false);
        f.one.frame.width = 32;
        f.layer.update(0.1);
        expect(node.visible).toBe(true);
        expect(f.root.children[0]).toBe(node);
    });

    test("late artwork and invalid time deltas cannot poison the existing ring", () => {
        const f = setup();
        f.setTexture(undefined);
        f.layer.update(0.3);
        const node = f.root.children[0];
        const flame = node.children[0].children[1] as Sprite;
        expect(flame.visible).toBe(false);
        f.setTexture(Texture.WHITE);
        for (const dt of [NaN, Infinity, -1, 0]) f.layer.update(dt);
        expect(flame.visible).toBe(true);
        expect(Number.isFinite(flame.rotation)).toBe(true);
        expect(f.root.children[0]).toBe(node);
    });

    test("clear and external teardown release nodes but preserve the shared artwork", () => {
        const f = setup();
        f.layer.update(0);
        f.root.removeChildren().forEach((node) => node.destroy({ children: true }));
        expect(f.layer.active).toBe(false);
        f.layer.clear();
        f.layer.clear();
        expect(Texture.WHITE.destroyed).toBe(false);
    });

    test("a confirmed absorb flashes only its recipient, even after the shared rings finished dissolving", () => {
        const f = setup();
        f.layer.update(0.3);
        f.one.properties.applied_buffs.length = 0;
        f.two.properties.applied_buffs.length = 0;
        f.layer.update(0.9);
        const random = spyOn(Math, "random");
        try {
            f.layer.absorb("one");
            expect(f.root.children).toHaveLength(1);
            const impact = f.root.children[0];
            expect(impact.label).toBe("ember-covenant-absorb");
            expect(impact.zIndex).toBeLessThan(f.one.frame.zIndex);
            expect(impact.filters?.length ?? 0).toBe(0);
            f.one.frame.x += 30;
            f.one.frame.zIndex += 20;
            f.layer.update(0.2);
            expect(impact.x).toBe(f.one.frame.x);
            expect(impact.zIndex).toBeLessThan(f.one.frame.zIndex);
            expect(impact.zIndex).toBeGreaterThan(f.one.frame.zIndex - 1);
            expect(impact.alpha).toBeGreaterThan(0);
            expect(impact.alpha).toBeLessThan(1);
            f.layer.update(0.5);
            expect(impact.destroyed).toBe(true);
            expect(f.layer.active).toBe(false);
            expect(random).not.toHaveBeenCalled();
        } finally {
            random.mockRestore();
        }
    });
});
