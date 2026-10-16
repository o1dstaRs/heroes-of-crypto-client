import { describe, expect, test } from "bun:test";

import { dragObserverPanelOffset } from "./observerPanelDrag";

const viewport = { width: 1600, height: 1000 };
// A 340x600 panel docked bottom-centre, where GameSystemControls lays it out.
const docked = { left: 630, top: 380, right: 970, bottom: 980 };

describe("spectator FIGHT panel drag", () => {
    test("follows the pointer while the panel stays on screen", () => {
        expect(dragObserverPanelOffset({ x: 0, y: 0 }, docked, { x: -400, y: -300 }, viewport)).toEqual({
            x: -400,
            y: -300,
        });
    });

    test("adds the travel to wherever an earlier drag left the panel", () => {
        const moved = { left: 230, top: 80, right: 570, bottom: 680 };
        expect(dragObserverPanelOffset({ x: -400, y: -300 }, moved, { x: 50, y: 20 }, viewport)).toEqual({
            x: -350,
            y: -280,
        });
    });

    test("never lifts the drag handle above the window", () => {
        expect(dragObserverPanelOffset({ x: 0, y: 0 }, docked, { x: 0, y: -900 }, viewport)).toEqual({
            x: 0,
            y: -380,
        });
    });

    test("keeps a grabbable strip on screen at both sides and the bottom", () => {
        expect(dragObserverPanelOffset({ x: 0, y: 0 }, docked, { x: 5000, y: 5000 }, viewport)).toEqual({
            x: 1600 - 48 - 630,
            y: 1000 - 48 - 380,
        });
        expect(dragObserverPanelOffset({ x: 0, y: 0 }, docked, { x: -5000, y: 0 }, viewport)).toEqual({
            x: 48 - 970,
            y: 0,
        });
    });
});
