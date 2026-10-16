import { afterEach, describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    drawnSideOf,
    glyphScaleX,
    isBoardMirrored,
    isFlippedOnScreen,
    keepGlyphRowUpright,
    releaseBoardMirror,
    screenFacing,
    setBoardMirror,
    subscribeBoardMirror,
    type IBoardGlyph,
} from "./boardMirror";

const fight = {};
const nextFight = {};

afterEach(() => {
    releaseBoardMirror(fight);
    releaseBoardMirror(nextFight);
});

describe("who may turn the board around", () => {
    test("the fight that mirrored the board is the one that hands it back", () => {
        setBoardMirror(fight, true);
        expect(isBoardMirrored()).toBe(true);

        releaseBoardMirror(fight);
        expect(isBoardMirrored()).toBe(false);
    });

    test("a scene torn down late cannot un-mirror the fight that replaced it", () => {
        setBoardMirror(fight, true);
        setBoardMirror(nextFight, true);

        releaseBoardMirror(fight);
        expect(isBoardMirrored()).toBe(true);
    });

    test("listeners hear about a change, not about every re-arm", () => {
        let calls = 0;
        const unsubscribe = subscribeBoardMirror(() => {
            calls += 1;
        });
        setBoardMirror(fight, true);
        setBoardMirror(fight, true);
        setBoardMirror(fight, false);
        unsubscribe();
        setBoardMirror(fight, true);

        expect(calls).toBe(2);
    });
});

describe("what stays readable on a mirrored board", () => {
    test("glyphs take the opposite horizontal scale only while mirrored", () => {
        expect(glyphScaleX(0.6)).toBe(0.6);
        setBoardMirror(fight, true);
        expect(glyphScaleX(0.6)).toBe(-0.6);
        expect(glyphScaleX()).toBe(-1);
    });

    test("screen facing and screen flips count the board's own flip", () => {
        expect(screenFacing(1)).toBe(1);
        expect(isFlippedOnScreen(-1)).toBe(true);
        setBoardMirror(fight, true);
        expect(screenFacing(1)).toBe(-1);
        expect(screenFacing(-1)).toBe(1);
        expect(isFlippedOnScreen(-1)).toBe(false);
        expect(isFlippedOnScreen(1)).toBe(true);
    });

    test("an army is named by the side it is drawn on", () => {
        expect(drawnSideOf(TeamVals.LEFT)).toBe(TeamVals.LEFT);
        setBoardMirror(fight, true);
        expect(drawnSideOf(TeamVals.LEFT)).toBe(TeamVals.RIGHT);
        expect(drawnSideOf(TeamVals.RIGHT)).toBe(TeamVals.LEFT);
        expect(drawnSideOf(TeamVals.NO_TEAM)).toBe(TeamVals.NO_TEAM);
    });
});

/**
 * An icon-and-number row, laid out left-to-right in world space around its anchor. Anchors follow Pixi's
 * convention: a glyph covers [x - anchor * width, x + (1 - anchor) * width] along its own local axis, which
 * the world scale then stretches (and on a negative scale, flips).
 */
interface IRowGlyph extends IBoardGlyph {
    anchor: number;
    width: number;
}

/** Screen-space extent of a glyph once the board's own flip (world x -> -x) is applied. */
const screenExtent = (glyph: IRowGlyph, boardMirrored: boolean): [number, number] => {
    const worldA = glyph.x - glyph.anchor * glyph.width * glyph.scale.x;
    const worldB = glyph.x + (1 - glyph.anchor) * glyph.width * glyph.scale.x;
    const [a, b] = boardMirrored ? [-worldA, -worldB] : [worldA, worldB];
    return [Math.min(a, b), Math.max(a, b)];
};

/** Whether the glyph's own text reads left-to-right on screen. */
const readsForward = (glyph: IRowGlyph, boardMirrored: boolean): boolean =>
    (boardMirrored ? -glyph.scale.x : glyph.scale.x) > 0;

const layOutRow = (anchorX: number): { icon: IRowGlyph; count: IRowGlyph } => {
    // The damage forecast's kill row: skull icon, 5px gap, then the number, centred on the anchor.
    const icon: IRowGlyph = { x: 0, anchor: 0, width: 20, scale: { x: 1 } };
    const count: IRowGlyph = { x: 0, anchor: 0, width: 30, scale: { x: 1 } };
    const startX = anchorX - (20 + 5 + 30) / 2;
    icon.x = startX;
    count.x = startX + 20 + 5;
    return { icon, count };
};

describe("a row of glyphs on a mirrored board", () => {
    test("keeps the icon left of its number, reading forward, centred where the target is drawn", () => {
        setBoardMirror(fight, true);
        const anchorX = 100;
        const { icon, count } = layOutRow(anchorX);
        keepGlyphRowUpright([icon, count], anchorX);

        const [iconLeft, iconRight] = screenExtent(icon, true);
        const [countLeft, countRight] = screenExtent(count, true);
        expect(iconRight).toBeLessThanOrEqual(countLeft);
        expect(countLeft - iconRight).toBeCloseTo(5);
        expect(readsForward(icon, true)).toBe(true);
        expect(readsForward(count, true)).toBe(true);
        // The anchor itself is drawn at -100 on the mirrored screen; the row stays centred on it.
        expect((iconLeft + countRight) / 2).toBeCloseTo(-anchorX);
    });

    test("a centred glyph only turns upright, it does not move", () => {
        setBoardMirror(fight, true);
        const label: IRowGlyph = { x: 40, anchor: 0.5, width: 24, scale: { x: 1.5 } };
        keepGlyphRowUpright([label], 40);

        expect(label.x).toBe(40);
        expect(label.scale.x).toBe(-1.5);
        expect(readsForward(label, true)).toBe(true);
    });

    test("back on an unmirrored board a glyph left flipped by Pixi's width setter reads forward again", () => {
        // Pixi keeps the sign of scale.x when a width is assigned, so a mirrored pass would otherwise stick.
        const icon: IRowGlyph = { x: 10, anchor: 0, width: 20, scale: { x: -0.8 } };
        keepGlyphRowUpright([icon, undefined], 10);

        expect(icon.x).toBe(10);
        expect(icon.scale.x).toBe(0.8);
    });

    test("passes that repeat every frame stay stable", () => {
        setBoardMirror(fight, true);
        for (let frame = 0; frame < 3; frame += 1) {
            const { icon, count } = layOutRow(100);
            keepGlyphRowUpright([icon, count], 100);
            expect(icon.x).toBeCloseTo(2 * 100 - (100 - 27.5));
            expect(icon.scale.x).toBe(-1);
            expect(count.scale.x).toBe(-1);
        }
    });
});
