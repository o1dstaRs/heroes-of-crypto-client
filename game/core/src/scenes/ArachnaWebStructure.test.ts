import { expect, test } from "bun:test";
import { Container, DOMAdapter, Sprite, Texture } from "pixi.js";
import { WEB_NODES, WEB_SPOKES, webSurfaceLift, webWeaveAt } from "./ArachnaWebStructure";
import { addWebTension, webNodeDistances } from "./ArachnaWebTension";
import { publishWebFireLights, webFireLights } from "./ArachnaWebLighting";
import { ARACHNA_WEB_DEW, arachnaDewLoads, arachnaDewPose } from "./ArachnaWebDew";
import { ArachnaContactField } from "./ArachnaWebContacts";

test("crossings alternate over and under with original perimeter pinned", () => {
    for (let row = 1; row < 15; row++)
        for (let spoke = 0; spoke < 40; spoke++) {
            const node = WEB_NODES[row * 40 + spoke];
            const support = webWeaveAt(spoke, node.x, node.y);
            const capture = webWeaveAt(40 + row * 40 + spoke, node.x, node.y);
            expect(support.lift * capture.lift).toBeLessThan(0);
            expect(support.under + capture.under).toBeCloseTo(1, 5);
            expect(webSurfaceLift(node.x, node.y)).toBeCloseTo(0.85, 5);
        }
    for (let spoke = 0; spoke < 40; spoke++) {
        const anchor = WEB_NODES[15 * 40 + spoke];
        expect(webWeaveAt(spoke, anchor.x, anchor.y)).toEqual({ lift: 0, under: 0 });
        expect(webWeaveAt(40 + 15 * 40 + spoke, anchor.x, anchor.y)).toEqual({ lift: 0, under: 0 });
    }
});
test("tension uses connected paths and transmits to radial and capture neighbours", () => {
    const start = 10 * WEB_SPOKES + 7,
        p = WEB_NODES[start];
    const distances = webNodeDistances(start);
    const cell = (i: number) => Math.floor(WEB_NODES[i].y / 5) * 128 + Math.floor(WEB_NODES[i].x / 5);
    for (const next of [start + 1, start + 40]) {
        expect(distances[next]).toBeGreaterThanOrEqual(
            Math.hypot(WEB_NODES[next].x - p.x, WEB_NODES[next].y - p.y) - 0.01,
        );
        const before = new Float32Array(128 * 128),
            arrived = new Float32Array(128 * 128);
        addWebTension(before, p.x, p.y, 0.01, 1, 0);
        addWebTension(arrived, p.x, p.y, distances[next] / 190, 1, 0);
        expect(Math.abs(arrived[cell(next)])).toBeGreaterThan(Math.abs(before[cell(next)]) + 0.01);
    }
    const settled = new Float32Array(128 * 128);
    addWebTension(settled, p.x, p.y, 1, 1, 0);
    expect(settled.every((v) => v === 0)).toBe(true);
});
test("dew has small static mass, finite attached motion and independent phases", () => {
    const field = new ArachnaContactField();
    field.update(arachnaDewLoads);
    expect(ARACHNA_WEB_DEW).toHaveLength(9);
    for (let i = 0; i < ARACHNA_WEB_DEW.length; i++) {
        const drop = ARACHNA_WEB_DEW[i];
        expect(field.sample(drop.x, drop.y)).toBeLessThan(0);
        for (let time = 0; time < 6000; time += 137) {
            const p = arachnaDewPose(i, time, field),
                support = field.motion(drop.x, drop.y, time);
            expect(Math.abs(p.x - drop.x - support.x)).toBeLessThan(drop.radius * 0.2);
            expect(p.y - drop.y - support.y).toBeCloseTo(drop.radius * 0.48, 8);
            expect(Object.values(p).every(Number.isFinite)).toBe(true);
        }
    }
});
test("fire lighting follows real sprite placement, alpha, visibility and stage isolation", () => {
    const adapter = DOMAdapter.get();
    DOMAdapter.set({ ...adapter, createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement });
    const stage = new Container(),
        other = new Container(),
        web = new Container();
    stage.addChild(web);
    const fire = new Sprite(Texture.WHITE);
    stage.addChild(fire);
    fire.position.set(123, 240);
    fire.height = 30;
    fire.alpha = 0.5;
    publishWebFireLights(stage, [fire]);
    const light = webFireLights(web);
    expect(light[0]).toBe(123);
    expect(light[1]).toBeCloseTo(229.5);
    expect(light[2]).toBe(45);
    expect(light[3]).toBeGreaterThan(0);
    expect(webFireLights(other).every((v) => v === 0)).toBe(true);
    fire.visible = false;
    publishWebFireLights(stage, [fire]);
    expect(light.every((v) => v === 0)).toBe(true);
    stage.destroy({ children: true });
    other.destroy();
    DOMAdapter.set(adapter);
});

test("fixed outer anchors return a smaller phase-inverted tension pulse", () => {
    const source = 14 * WEB_SPOKES + 5;
    const p = WEB_NODES[source];
    const outward = webNodeDistances(source)[source + WEB_SPOKES];
    const field = new Float32Array(128 * 128);
    addWebTension(field, p.x, p.y, (outward * 2) / 190, 1, 0);
    const echo = field[Math.floor(p.y / 5) * 128 + Math.floor(p.x / 5)];
    expect(echo).toBeLessThan(-0.002);
    expect(echo).toBeGreaterThan(-0.1);
});
