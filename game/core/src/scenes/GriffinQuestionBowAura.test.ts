import { afterAll, beforeAll, expect, test } from "bun:test";
import { EffectHelper, GridConstants, GridMath, GridSettings } from "@heroesofcrypto/common";
import auraEffects from "../../../heroes-of-crypto-common/src/configuration/aura_effects.json";
import { Container, DOMAdapter, Graphics, Mesh, Polygon, Sprite, Texture } from "pixi.js";
import { projectedRectPoints } from "./sandbox/BattlefieldVisualGrid";
import { isLazyCombatEffectAssetKey } from "../pixi/imageAssetTiers";
import {
    GRIFFIN_QUESTION_BOW_AURA_KEY,
    drawGriffinQuestionBowAura,
    resetGriffinQuestionBowAuras,
} from "./GriffinQuestionBowAura";
import {
    griffinTornadoGeometry,
    griffinTornadoShape,
    griffinTornadoPoint,
    griffinTornadoBounds,
    GRIFFIN_TORNADO_VISUAL_SCALE,
    GRIFFIN_TORNADO_VERTICAL_SCALE,
    GRIFFIN_TORNADO_EYE_SCALE,
} from "./GriffinTornadoAura";
const adapter = DOMAdapter.get();
beforeAll(() =>
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement }),
);
afterAll(() => DOMAdapter.set(adapter));
const gs = new GridSettings(
    GridConstants.GRID_SIZE,
    GridConstants.MAX_Y,
    GridConstants.MIN_Y,
    GridConstants.MAX_X,
    GridConstants.MIN_X,
    GridConstants.MOVEMENT_DELTA,
    GridConstants.UNIT_SIZE_DELTA,
);
const center = { x: (gs.getMinX() + gs.getMaxX()) / 2, y: (gs.getMinY() + gs.getMaxY()) / 2 };
const footprint = { width: 2, height: 1 };

test("front and back wind bands meet without gaps", () => {
    const a = griffinTornadoGeometry(center, footprint, 2, gs, false),
        b = griffinTornadoGeometry(center, footprint, 2, gs, true);
    for (let row = 0; row <= 20; row++) {
        const last = (row * 41 + 40) * 2,
            first = row * 41 * 2;
        expect(a.positions[last]).toBeCloseTo(b.positions[first]);
        expect(a.positions[last + 1]).toBeCloseTo(b.positions[first + 1]);
        expect(a.positions[first]).toBeCloseTo(b.positions[last]);
    }
    expect([...a.positions].every(Number.isFinite)).toBe(true);
    expect(Math.max(...a.indices)).toBeLessThan(a.positions.length / 2);
});

test("tight oval eye follows the 2x1 figure and raised coils stay outside it", () => {
    const cell = gs.getCellSize();
    for (const range of [2, 3]) {
        const shape = griffinTornadoShape(footprint, range, cell);
        for (let i = 0; i < 80; i++) {
            const angle = (i / 80) * Math.PI * 2;
            const inner = griffinTornadoPoint(center, shape, angle, 0);
            expect(
                ((inner.x - center.x - shape.innerOffsetX) / shape.innerX) ** 2 +
                    ((inner.y - center.y) / shape.innerY) ** 2,
            ).toBeCloseTo(1);
            const outer = griffinTornadoPoint(center, shape, angle, 1);
            expect(
                ((outer.x - center.x) / shape.rx) ** 2 + ((outer.y - center.y - shape.offsetY) / shape.ry) ** 2,
            ).toBeCloseTo(1);
            for (let row = 1; row <= 20; row++) {
                const p = griffinTornadoPoint(center, shape, angle, row / 20);
                expect(
                    ((p.x - center.x - shape.innerOffsetX) / shape.innerX) ** 2 +
                        ((p.y - center.y) / shape.innerY) ** 2,
                ).toBeGreaterThanOrEqual(1 - 0.00001);
            }
        }
        const previousEyeX = cell * Math.SQRT2 * GRIFFIN_TORNADO_EYE_SCALE;
        expect(griffinTornadoPoint(center, shape, Math.PI, 0).x).toBeCloseTo(center.x - previousEyeX);
        expect(griffinTornadoPoint(center, shape, 0, 0).x).toBeCloseTo(center.x + previousEyeX - 0.44 * cell);
        const back = griffinTornadoPoint(center, shape, Math.PI / 2, 0.5);
        const front = griffinTornadoPoint(center, shape, -Math.PI / 2, 0.5);
        expect((back.y + front.y) / 2).toBeGreaterThan(center.y + cell * 0.4);
    }
});

test("the projected funnel fits the red-mark artwork extents at every board depth", () => {
    const cell = gs.getCellSize();
    for (const y of [gs.getMinY() + 4 * cell, center.y, gs.getMaxY() - 4 * cell]) {
        const at = { x: center.x, y };
        const bounds = griffinTornadoBounds(
            { x: at.x, y: at.y - 0.37 * cell },
            footprint,
            2,
            gs,
            0,
            GRIFFIN_TORNADO_VISUAL_SCALE,
            GRIFFIN_TORNADO_VERTICAL_SCALE,
        );
        [at.x - 3.3075 * cell, at.y - 3.495 * cell, at.x + 3.3075 * cell, at.y + 2.755 * cell].forEach((value, i) =>
            expect(bounds[i]).toBeCloseTo(value),
        );
        // Mesh vertices are float32; allow only rounding error on the exact outer cell edges.
        const epsilon = cell * 0.00001;
        const clip = new Polygon(
            projectedRectPoints(bounds[0] - epsilon, bounds[1] - epsilon, bounds[2] + epsilon, bounds[3] + epsilon, gs),
        );
        for (const front of [false, true]) {
            const { positions } = griffinTornadoGeometry(at, footprint, 2, gs, front);
            for (let i = 0; i < positions.length; i += 2) {
                expect(clip.contains(positions[i], positions[i + 1])).toBe(true);
            }
        }
    }
});

test("turning mirrors the eye toward the front legs and updates the existing storm without restarting it", () => {
    const right = griffinTornadoShape(footprint, 2, gs.getCellSize(), 1);
    const left = griffinTornadoShape(footprint, 2, gs.getCellSize(), -1);
    for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * Math.PI * 2;
        for (const progress of [0, 0.5, 1]) {
            const a = griffinTornadoPoint(center, right, angle, progress);
            const b = griffinTornadoPoint(center, left, Math.PI - angle, progress);
            expect(a.x - center.x).toBeCloseTo(center.x - b.x);
            expect(a.y).toBeCloseTo(b.y);
        }
    }
    const floor = new Container();
    const draw = (time: number, facing: -1 | 1) =>
        drawGriffinQuestionBowAura(
            floor,
            undefined,
            center,
            footprint,
            2,
            gs,
            "turning",
            1,
            0,
            time,
            undefined,
            facing,
        );
    draw(0, 1);
    const layers = [...floor.children] as Container[];
    const meshes = layers.flatMap((layer) => layer.children.filter((child) => child instanceof Mesh)) as Mesh[];
    const before = meshes.map((mesh) => [...mesh.geometry.positions]);
    resetGriffinQuestionBowAuras(floor, 1000);
    draw(1000, -1);
    expect(floor.children).toEqual(layers);
    meshes.forEach((mesh, index) => {
        expect([...mesh.geometry.positions]).not.toEqual(before[index]);
        const front = index >= 2;
        expect([...mesh.geometry.positions]).toEqual([
            ...griffinTornadoGeometry(center, footprint, 2, gs, front, -1).positions,
        ]);
        expect(mesh.shader!.resources.storm.uniforms.uTime).toBe(1);
    });
    floor.destroy({ children: true });
});

test("successive artwork expansions leave the factual full-body aura coverage unchanged", () => {
    const cell = gs.getCellSize();
    const baseRange = auraEffects["Range Null Field"].range;
    expect(baseRange).toBe(2);
    for (const bonus of [0, 1]) {
        const range = baseRange + bonus;
        for (const x of [0, 7, 14]) {
            const body = [
                { x, y: 7 },
                { x: x + 1, y: 7 },
            ];
            const at = GridMath.getPositionForCells(gs, body)!;
            const bounds = griffinTornadoBounds(at, footprint, range, gs);
            const actual = EffectHelper.getAuraCellKeyMembershipForBody(gs, body, range);
            let covered = 0;
            for (let cx = 0; cx < gs.getGridSize(); cx++) {
                for (let cy = 0; cy < gs.getGridSize(); cy++) {
                    const point = GridMath.getPositionForCells(gs, [{ x: cx, y: cy }])!;
                    const painted =
                        point.x > bounds[0] && point.x < bounds[2] && point.y > bounds[1] && point.y < bounds[3];
                    expect(painted).toBe(actual.has((cx << 4) | cy));
                    if (painted) covered++;
                }
            }
            if (x === 7) expect(covered).toBe((2 + range * 2) * (1 + range * 2));
            const shape = griffinTornadoShape(footprint, range, cell);
            expect(shape.rx * 2).toBeCloseTo((2 + range * 2) * cell * 1.05 * 1.05);
            expect(shape.ry * 2).toBeCloseTo((1 + range * 2) * cell * 1.25);
        }
    }
});

test("hover and selection share one storm; front air renders among units and is cleaned with its owner", () => {
    const floor = new Container(),
        units = new Container();
    const draw = (time: number) =>
        drawGriffinQuestionBowAura(floor, Texture.WHITE, center, footprint, 2, gs, "griffin", 1, 0, time, {
            container: units,
            depth: 100,
        });
    draw(0);
    draw(0);
    expect(floor.children).toHaveLength(1);
    expect(units.children).toHaveLength(1);
    const back = floor.children[0] as Container,
        front = units.children[0] as Container;
    expect(front.zIndex).toBe(100);
    // Air keeps its mask; props are never sliced by a parent mask.
    for (const layer of [back, front]) {
        expect(layer.mask).toBeFalsy();
        const shell = layer.children.find((c) => c instanceof Mesh) as Mesh;
        expect(shell.mask).toBeInstanceOf(Graphics);
        expect((shell.mask as Graphics).parent).toBe(layer);
    }
    resetGriffinQuestionBowAuras(floor, 1000);
    draw(1000);
    const sprites = [...back.children, ...front.children].filter((c) => c instanceof Sprite) as Sprite[];
    expect(sprites).toHaveLength(0);
    const shell = front.children.find((c) => c instanceof Mesh) as Mesh;
    expect(shell.shader!.resources.storm.uniforms.uTime).toBe(1);
    resetGriffinQuestionBowAuras(floor, 7000);
    expect(floor.children).toHaveLength(0);
    expect(units.children).toHaveLength(0);
    expect(isLazyCombatEffectAssetKey(GRIFFIN_QUESTION_BOW_AURA_KEY)).toBe(true);
    floor.destroy();
    units.destroy();
});

test("scene destruction releases the front half even when it belongs to the units layer", () => {
    const floor = new Container(),
        units = new Container();
    drawGriffinQuestionBowAura(floor, undefined, center, footprint, 2, gs, "griffin", 1, 0, 0, {
        container: units,
        depth: 100,
    });
    floor.destroy({ children: true });
    expect(units.children).toHaveLength(0);
    units.destroy();
});
