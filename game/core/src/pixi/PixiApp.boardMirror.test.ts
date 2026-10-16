import { afterEach, describe, expect, test } from "bun:test";
import { Container } from "pixi.js";

import { releaseBoardMirror, setBoardMirror } from "./boardMirror";
import { PixiApp } from "./PixiApp";

const fight = {};

interface IMirrorInternals {
    app: { renderer: { width: number; height: number } };
    stage: Container;
    boardRoot: Container;
    camera: Container;
    worldRoot: Container;
    applyBoardMirror(): void;
}

const WIDTH = 1500;
const HEIGHT = 900;

/** The real container chain (stage > board root > camera > y-up world) without a renderer behind it. */
const buildApp = (): { pixiApp: PixiApp; internals: IMirrorInternals } => {
    const pixiApp = Object.create(PixiApp.prototype) as PixiApp;
    const internals = pixiApp as unknown as IMirrorInternals;
    internals.app = { renderer: { width: WIDTH, height: HEIGHT } };
    internals.stage = new Container();
    internals.boardRoot = new Container();
    internals.camera = new Container();
    internals.worldRoot = new Container();
    internals.worldRoot.scale.set(1, -1);
    internals.camera.addChild(internals.worldRoot);
    internals.boardRoot.addChild(internals.camera);
    internals.stage.addChild(internals.boardRoot);
    // The battle fit is anisotropic (wider columns than rows) and centred on the board's middle.
    pixiApp.setCameraScale(0.9, 0.62);
    pixiApp.setCameraPosition(0, 512);
    return { pixiApp, internals };
};

afterEach(() => {
    releaseBoardMirror(fight);
});

describe("pointer mapping on a mirrored board", () => {
    for (const mirrored of [false, true]) {
        test(`${mirrored ? "mirrored" : "as dealt"}: the pointer maths agrees with what Pixi draws`, () => {
            const { pixiApp, internals } = buildApp();
            setBoardMirror(fight, mirrored);
            internals.applyBoardMirror();

            for (const point of [
                { x: -480, y: 96 },
                { x: 0, y: 512 },
                { x: 377, y: 900 },
            ]) {
                const drawn = internals.worldRoot.toGlobal(point);
                const screen = pixiApp.worldToScreen(point.x, point.y);
                expect(screen.x).toBeCloseTo(drawn.x, 6);
                expect(screen.y).toBeCloseTo(drawn.y, 6);

                const back = pixiApp.screenToWorld(screen.x, screen.y);
                expect(back.x).toBeCloseTo(point.x, 6);
                expect(back.y).toBeCloseTo(point.y, 6);
            }
        });
    }

    test("the board turns about the middle of the screen: the centre line stays put, the sides swap", () => {
        const { pixiApp, internals } = buildApp();
        const leftFlank = pixiApp.worldToScreen(-400, 300).x;
        expect(leftFlank).toBeLessThan(WIDTH / 2);

        setBoardMirror(fight, true);
        internals.applyBoardMirror();

        expect(pixiApp.worldToScreen(0, 300).x).toBeCloseTo(WIDTH / 2, 6);
        expect(pixiApp.worldToScreen(-400, 300).x).toBeCloseTo(WIDTH - leftFlank, 6);
        // A click where the left flank is now drawn lands on the left flank's cells.
        expect(pixiApp.screenToWorld(WIDTH - leftFlank, 0).x).toBeCloseTo(-400, 6);
    });

    test("handing the board back restores the dealt orientation", () => {
        const { pixiApp, internals } = buildApp();
        const asDealt = pixiApp.worldToScreen(-400, 300).x;
        setBoardMirror(fight, true);
        internals.applyBoardMirror();
        releaseBoardMirror(fight);
        internals.applyBoardMirror();

        expect(internals.boardRoot.scale.x).toBe(1);
        expect(internals.boardRoot.x).toBe(0);
        expect(pixiApp.worldToScreen(-400, 300).x).toBeCloseTo(asDealt, 6);
    });
});
