import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { GridConstants, GridSettings } from "@heroesofcrypto/common";
import { Container, MeshSimple, Sprite, Texture } from "pixi.js";

import { projectBattlefieldPoint } from "./BattlefieldVisualGrid";
import { EmberCovenantRings, type EmberCovenantUnit } from "./EmberCovenantRings";

const NAME = "Ember Covenant Blessing";
const settings = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const roots: Container[] = [];
afterEach(() => {
    for (const root of roots) root.destroy({ children: true });
    roots.length = 0;
});

const makeUnit = (width = 1, height = 1) => ({
    properties: { applied_buffs: [NAME], applied_buffs_laps: [Number.MAX_SAFE_INTEGER] },
    position: { x: 320, y: 384 },
    dead: false,
    getUnitProperties() {
        return this.properties;
    },
    getPosition() {
        return this.position;
    },
    getFootprintWidth() {
        return width;
    },
    getFootprintHeight() {
        return height;
    },
    isDead() {
        return this.dead;
    },
});

function setup(boardScale?: { x: number; y: number }) {
    const root = new Container();
    roots.push(root);
    const one = makeUnit();
    const two = makeUnit(2, 1);
    two.position = { x: 640, y: 256 };
    const units = new Map<string, EmberCovenantUnit>([
        ["one", one],
        ["two", two],
    ]);
    let texture: Texture | undefined = Texture.WHITE;
    const layer = new EmberCovenantRings({
        getUnits: () => units,
        getGridSettings: () => settings,
        getTexture: () => texture,
        getBoardScale: () => boardScale,
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
    test("uses hydrated buffs and one shared texture, with a fixed primitive budget and no filters or game RNG", () => {
        const f = setup();
        const properties = JSON.stringify([f.one.properties, f.two.properties]);
        const random = spyOn(Math, "random");
        try {
            f.layer.update(0.3);
            expect(f.root.children).toHaveLength(2);
            const first = f.root.children[0];
            expect(first.zIndex).toBe(5503);
            expect(first.eventMode).toBe("none");
            expect(first.filters?.length ?? 0).toBe(0);
            expect(first.children[0].children).toHaveLength(3);
            const sprites = first.children[0].children.filter((child) => child instanceof Sprite) as Sprite[];
            expect(sprites.every((sprite) => sprite.texture === Texture.WHITE)).toBe(true);
            for (let frame = 0; frame < 120; frame++) f.layer.update(1 / 60);
            expect(f.root.children[0]).toBe(first);
            expect(f.root.children).toHaveLength(2);
            expect(random).not.toHaveBeenCalled();
            expect(JSON.stringify([f.one.properties, f.two.properties])).toBe(properties);
        } finally {
            random.mockRestore();
        }
    });

    for (const [width, height] of [
        [1, 1],
        [2, 1],
        [1, 2],
        [2, 2],
        [3, 2],
    ])
        test(`keeps the ${width}x${height} halo above its creature on a mirrored board`, () => {
            const f = setup();
            const unit = makeUnit(width, height);
            f.units.clear();
            f.units.set("one", unit);
            f.root.scale.set(-1, -1);
            f.layer.update(0.3);
            const node = f.root.children[0];
            const center = projectBattlefieldPoint(unit.position, settings);
            const point = node.toGlobal({ x: 0, y: 0 });
            expect(point.x).toBeCloseTo(-center.x);
            expect(point.y).toBeLessThan(-center.y - settings.getStep());
            const diameter = settings.getStep() * (1.35 + (width - 1) * 0.4);
            expect(node.toGlobal({ x: 0.5, y: 0 }).x).toBeCloseTo(-center.x - diameter / 2);
            expect(node.toGlobal({ x: 0.5, y: 0 }).y).toBeCloseTo(point.y);
        });

    test("follows a moving unit and handles hydration replacing the unit object under the same id", () => {
        const f = setup();
        f.layer.update(0.3);
        const node = f.root.children[0];
        const replacement = makeUnit();
        replacement.position = { x: 512, y: 512 };
        f.units.set("one", replacement);
        f.layer.update(0);
        expect(f.root.children[0]).toBe(node);
        const center = projectBattlefieldPoint(replacement.position, settings);
        expect(node.x).toBeCloseTo(center.x);
        expect(node.y).toBeGreaterThan(center.y + settings.getStep());
    });

    test("uses the live upper outline and compensates a stretched or mirrored camera", () => {
        for (const mirrored of [false, true]) {
            const f = setup({ x: 2, y: 0.7 });
            f.root.scale.set(mirrored ? -2 : 2, -0.7);
            f.units.set("one", { ...f.one, getBlessingHaloAnchor: () => ({ x: 123, y: 650 }) });
            f.layer.update(0.3);
            const node = f.root.children[0];
            const origin = node.toGlobal({ x: 0, y: 0 });
            const horizontal = node.toGlobal({ x: 0.5, y: 0 });
            const vertical = node.toGlobal({ x: 0, y: 0.5 });
            expect(node.x).toBe(123);
            expect(node.y).toBeGreaterThan(650);
            expect(Math.abs((vertical.y - origin.y) / (horizontal.x - origin.x))).toBeCloseTo(0.34);
        }
    });

    test("invalid camera scales leave a finite halo", () => {
        for (const scale of [
            { x: Infinity, y: 1 },
            { x: 1, y: NaN },
            { x: 1, y: 0 },
        ]) {
            const f = setup(scale);
            f.layer.update(0.3);
            const node = f.root.children[0];
            expect([node.x, node.y, node.scale.x, node.scale.y].every(Number.isFinite)).toBe(true);
        }
    });

    test("every ring collapses together when the army blessing disappears", () => {
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
        const geometry = fragments.geometry;
        const released = spyOn(geometry, "destroy");
        f.layer.update(0.36);
        expect(f.root.children).toHaveLength(0);
        expect(f.layer.active).toBe(false);
        expect(released).toHaveBeenCalledTimes(1);
        released.mockRestore();
    });

    test("an expired buff and a dead or removed unit dissolve without leaving orphaned rings", () => {
        for (const reason of ["expired", "dead", "removed"]) {
            const f = setup();
            f.layer.update(0.3);
            if (reason === "expired") f.one.properties.applied_buffs_laps[0] = 0;
            if (reason === "dead") f.one.dead = true;
            if (reason === "removed") f.units.delete("one");
            f.layer.update(0.6);
            expect(f.root.children).toHaveLength(1);
        }
    });

    test("late artwork appears on the existing ring and invalid time deltas cannot poison it", () => {
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

    test("clear and external world teardown release nodes but preserve the shared artwork", () => {
        const f = setup();
        f.layer.update(0);
        f.root.removeChildren().forEach((node) => node.destroy({ children: true }));
        expect(f.layer.active).toBe(false);
        f.layer.clear();
        f.layer.clear();
        expect(Texture.WHITE.destroyed).toBe(false);
    });
});
