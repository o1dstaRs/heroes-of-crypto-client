/*
 * -----------------------------------------------------------------------------
 * This file is part of the game core of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

import { TeamType, TeamVals } from "@heroesofcrypto/common";

/**
 * Whether the battlefield is currently drawn MIRRORED left-to-right for the person at this keyboard.
 *
 * A player can ask to always see their own army on the left, or always on the right
 * (settings/playerBoardSide). When their seat is on the other side, the fight scene mirrors the board for
 * them: PixiApp's board root, which holds the painted floor and the whole camera, is flipped about the
 * screen's centre. Everything drawn in world space moves with it, so a unit, its path, the terrain and the
 * floor seams all stay together, and a creature that faces the enemy still faces it. Only the picture moves.
 * The engine, the server, the log and every cell coordinate stay exactly as dealt, and clicks are mapped back
 * through the same flip (PixiApp.screenToWorld).
 *
 * What must NOT turn around is anything that is read rather than looked at: numbers, labels, the count
 * banner. Those are drawn upright by taking their horizontal scale from `glyphScaleX`, or through
 * `keepGlyphRowUpright` when several of them are laid out in a row. Code that compares a creature's facing
 * with SCREEN-space bounds asks `screenFacing`, because on a mirrored board the two point opposite ways.
 *
 * The state has one writer at a time: the scene showing the fight sets it, and only that scene's release
 * clears it, so a scene torn down late can never un-mirror the fight that replaced it.
 */
let mirrored = false;
let owner: object | undefined;
const listeners = new Set<() => void>();

export const isBoardMirrored = (): boolean => mirrored;

/** The server render has no board to mirror. */
export const isBoardMirroredOnServer = (): boolean => false;

export const subscribeBoardMirror = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const publish = (next: boolean): void => {
    if (mirrored === next) {
        return;
    }
    mirrored = next;
    for (const listener of [...listeners]) {
        listener();
    }
};

/** Set how `scene` wants the board drawn. The scene becomes the owner, so only its own release clears it. */
export const setBoardMirror = (scene: object, next: boolean): void => {
    owner = scene;
    publish(next);
};

/** A scene that is going away hands the board back unmirrored, unless another scene has taken it over. */
export const releaseBoardMirror = (scene: object): void => {
    if (owner !== scene) {
        return;
    }
    owner = undefined;
    publish(false);
};

/**
 * The horizontal scale for something drawn inside the board that has to read the same on a mirrored board:
 * text, a count banner, an icon beside a number. Pass the scale the code would use on an unmirrored board.
 */
export const glyphScaleX = (scale = 1): number => (mirrored ? -scale : scale);

/** Which way a creature that faces `worldFacing` in world space faces on screen. */
export const screenFacing = (worldFacing: -1 | 1): -1 | 1 => (mirrored ? (worldFacing === 1 ? -1 : 1) : worldFacing);

/** Whether a sprite is drawn flipped on screen, counting both its own flip and the board's. */
export const isFlippedOnScreen = (spriteScaleX: number): boolean => spriteScaleX < 0 !== mirrored;

/** The screen side a team is drawn on for this viewer. Its seat stays whatever the match dealt. */
export const drawnSideOf = (team: TeamType): TeamType => {
    if (!mirrored) {
        return team;
    }
    if (team === TeamVals.LEFT) {
        return TeamVals.RIGHT;
    }
    if (team === TeamVals.RIGHT) {
        return TeamVals.LEFT;
    }
    return team;
};

export interface IBoardGlyph {
    x: number;
    scale: { x: number };
}

/**
 * Keep a row of glyphs, laid out left-to-right around `anchorX` in world space, reading exactly as it does
 * on an unmirrored board. Call it once per layout pass, right after positioning every glyph in `glyphs`.
 *
 * On a mirrored board each glyph is reflected about the anchor and drawn upright, so an icon that sits left
 * of its number stays left of it and the pair stays centred on the anchor. Otherwise it only restores an
 * upright scale, which Pixi's width setter would keep negative from an earlier mirrored pass.
 */
export const keepGlyphRowUpright = (glyphs: readonly (IBoardGlyph | undefined)[], anchorX: number): void => {
    for (const glyph of glyphs) {
        if (!glyph) {
            continue;
        }
        const scaleX = Math.abs(glyph.scale.x);
        if (mirrored) {
            glyph.x = 2 * anchorX - glyph.x;
            glyph.scale.x = -scaleX;
        } else {
            glyph.scale.x = scaleX;
        }
    }
};
