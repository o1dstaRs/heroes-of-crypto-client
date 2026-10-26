import { describe, expect, mock, test } from "bun:test";

import { TouchBoardInput, type TouchBoardView } from "./TouchBoardInput";

const fixture = () => {
    const taps = mock(() => {});
    const gestures = mock(() => {});
    let view: TouchBoardView = { zoom: 1, x: 0, y: 0 };
    const input = new TouchBoardInput({
        size: () => ({ width: 400, height: 300 }),
        toPoint: (point) => point,
        onTap: taps,
        onGesture: gestures,
        onView: (next) => {
            view = next;
        },
    });
    return { input, taps, gestures, view: () => view };
};

describe("touch battlefield gestures", () => {
    test("one quick tap fires once and suppresses its compatibility mouse click", () => {
        const { input, taps } = fixture();
        input.down(1, { x: 30, y: 50 }, 100);
        input.up(1, 160);
        input.up(1, 170);
        expect(taps).toHaveBeenCalledTimes(1);
        expect(taps).toHaveBeenCalledWith({ x: 30, y: 50 }, false);
        expect(input.ignoreMouse()).toBe(true);
        input.allowMouse();
        expect(input.ignoreMouse()).toBe(false);
    });
    test("long press inspects without issuing an ordinary action tap", () => {
        const { input, taps } = fixture();
        input.down(1, { x: 30, y: 50 }, 100);
        input.up(1, 700);
        expect(taps).toHaveBeenCalledTimes(1);
        expect(taps).toHaveBeenCalledWith({ x: 30, y: 50 }, true);
    });
    test("a pinch never becomes a tap when either finger lifts first", () => {
        const { input, taps, view } = fixture();
        input.down(1, { x: 100, y: 100 });
        input.down(2, { x: 200, y: 100 });
        input.move(2, { x: 300, y: 100 });
        expect(view().zoom).toBeCloseTo(2);
        input.up(1);
        input.move(2, { x: 320, y: 100 });
        input.up(2);
        expect(taps).not.toHaveBeenCalled();
        input.down(3, { x: 80, y: 80 });
        input.up(3);
        expect(taps).toHaveBeenCalledTimes(1);
    });
    test("dragging pans within bounds and never commits a board action", () => {
        const { input, taps, view } = fixture();
        input.zoomBy(2);
        input.down(1, { x: 100, y: 100 });
        input.move(1, { x: 1000, y: 1000 });
        input.up(1);
        expect(view()).toEqual({ zoom: 2, x: 200, y: 150 });
        expect(taps).not.toHaveBeenCalled();
    });
    test("cancellation and camera reset discard contacts and pending gestures", () => {
        const { input, taps, view } = fixture();
        input.down(1, { x: 100, y: 100 });
        input.cancel();
        input.up(1);
        input.zoomBy(100);
        expect(view().zoom).toBe(3.5);
        input.reset();
        expect(view()).toEqual({ zoom: 1, x: 0, y: 0 });
        input.zoomBy(0.01);
        expect(view().zoom).toBe(1);
        expect(taps).not.toHaveBeenCalled();
    });
    test("a layout resize drops contacts without cancelling an already selected action", () => {
        const { input, taps, gestures } = fixture();
        input.down(1, { x: 100, y: 100 });
        input.reset(false);
        input.up(1);
        expect(taps).not.toHaveBeenCalled();
        expect(gestures).not.toHaveBeenCalled();
    });
});
