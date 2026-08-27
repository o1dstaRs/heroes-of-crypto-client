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

/**
 * How much BOARD a creature takes, for the draft's "Size on the board" chip.
 *
 * `size` is the square ART tier, not the body. It reads 2 for every creature in the mounted class, which
 * occupies 2x1 — so deriving the label from `size` alone told a drafting player that a Wolf takes four
 * cells when it takes two. A creature states its real body in footprint_width / footprint_height, and only
 * bothers to when that body is NOT the square `size x size` block; when they are absent the square IS the
 * body and `size` is the right answer for both axes.
 */
export const boardFootprintLabel = (config: {
    size: number;
    footprint_width?: number;
    footprint_height?: number;
}): string => `${config.footprint_width ?? config.size}×${config.footprint_height ?? config.size}`;
