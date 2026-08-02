/*
 * -----------------------------------------------------------------------------
 * This file is part of the common code of the Heroes of Crypto.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

/**
 * The single definition of how big the board is drawn in the window.
 *
 * Two separate things have to agree on it, and they are not drawn the same way. The grid and everything
 * standing on it live under the camera, which fits the world into the viewport minus this padding. The stone
 * backdrop is a plain screen-space sprite on the stage, sized straight from the viewport. When only the
 * camera learned about the padding, the painted squares stayed a full viewport wide while the logical grid
 * shrank inside them — the two agreed near the middle and drifted further apart toward the edges, so a unit
 * that is exactly on its cell in world space no longer looked centred on the square under it.
 *
 * So both read the padding from here.
 */
export const BOARD_FIT_PADDING_RATIO = 0;

/**
 * Breathing room around the grid, in the same pixels the viewport is measured in.
 *
 * Currently ZERO: the board is fitted edge to edge so the stone floor reaches the top and bottom of the
 * window with no bare band around it, while still showing all 16x16 squares whole. The floor is painted at
 * exactly the grid's 16 squares and drawn at exactly this fitted size, so growing the board grows both
 * together and one painted square stays one cell.
 *
 * It used to be ~4.5% (about one cell). That margin existed because a stack's art is drawn LARGER than its
 * cell, so with no padding the outermost row and column can have their art clipped by the window edge —
 * the squares themselves are all fully visible, only the figures standing on the border rows may be
 * trimmed. Raise this again if that trimming matters more than the bare band did.
 */
export const boardFitPadding = (width: number, height: number): number =>
    Math.round(Math.min(width, height) * BOARD_FIT_PADDING_RATIO);

/**
 * How far UP the board sits from the exact centre of the window, as a fraction of the board's own size.
 *
 * Currently ZERO, and that is a geometric necessity rather than a preference: with BOARD_FIT_PADDING_RATIO
 * at 0 the board already fills the window's shorter side exactly, so there is no slack to slide into. Any
 * non-zero shift trims that many pixels off the top row and opens an equally black strip along the bottom —
 * the two things this layout was explicitly asked NOT to do.
 *
 * It stays here as a knob for when the board is ever fitted smaller than the window again (padding > 0):
 * then a nudge up costs nothing, and it counteracts the board reading bottom-heavy next to the toolbar and
 * the start button. Both the camera and the stone backdrop apply it, from here, in the same screen pixels —
 * they must move as one or the painted squares slide off the logical cells.
 */
export const BOARD_FIT_VERTICAL_SHIFT_RATIO = 0;

/** Side of the square the board occupies on screen — the backdrop must match this, not the raw viewport. */
export const boardFitSize = (width: number, height: number): number =>
    Math.min(width, height) - 2 * boardFitPadding(width, height);

/** Upward offset from centre, in the same pixels the viewport is measured in. */
export const boardFitVerticalShift = (width: number, height: number): number =>
    Math.round(boardFitSize(width, height) * BOARD_FIT_VERTICAL_SHIFT_RATIO);
