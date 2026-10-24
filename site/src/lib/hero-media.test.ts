import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { afterHeroPaint } from "./hero-media";

const originalFrame = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    globalThis.requestAnimationFrame = (callback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
    };
    globalThis.cancelAnimationFrame = (frame) => {
        frames.delete(frame);
    };
});

afterEach(() => {
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
});

const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(performance.now());
};
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const image = () => {
    let decode!: () => void;
    const ready = new Promise<void>((resolve) => {
        decode = resolve;
    });
    return { element: { decode: () => ready }, decode };
};
const hero = (...images: Array<{ decode: () => Promise<void> }>) =>
    ({ querySelectorAll: () => images }) as unknown as ParentNode;

describe("homepage media loading", () => {
    test("keeps decorative requests behind every visible hero image and its first paint", async () => {
        const background = image();
        const logo = image();
        let requests = 0;
        afterHeroPaint(hero(background.element, logo.element), () => requests++);

        background.decode();
        await settle();
        paint();
        expect(requests).toBe(0);
        expect(frames.size).toBe(0);

        logo.decode();
        await settle();
        paint();
        expect(requests).toBe(0);
        paint();
        expect(requests).toBe(1);
        paint();
        expect(requests).toBe(1);
    });

    test("a failed hero image does not permanently hide the rest of the page", async () => {
        let ready = false;
        afterHeroPaint(hero({ decode: () => Promise.reject(new Error("image unavailable")) }), () => {
            ready = true;
        });
        await settle();
        paint();
        paint();
        expect(ready).toBe(true);
    });

    test("leaving before a slow image finishes prevents later downloads", async () => {
        const background = image();
        let requests = 0;
        const cancel = afterHeroPaint(hero(background.element), () => requests++);
        cancel();
        background.decode();
        await settle();
        paint();
        paint();
        expect(requests).toBe(0);
        expect(frames.size).toBe(0);
    });

    test("leaving between rendering frames cancels the deferred work", async () => {
        let requests = 0;
        const cancel = afterHeroPaint(hero({ decode: () => Promise.resolve() }), () => requests++);
        await settle();
        paint();
        cancel();
        paint();
        expect(requests).toBe(0);
        expect(frames.size).toBe(0);
    });

    test("pages without a hero still reveal their media", async () => {
        let ready = false;
        afterHeroPaint(null, () => {
            ready = true;
        });
        await settle();
        paint();
        paint();
        expect(ready).toBe(true);
    });
});
