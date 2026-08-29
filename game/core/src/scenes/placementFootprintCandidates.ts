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

import { HoCMath } from "@heroesofcrypto/common";

const key = (cell: HoCMath.XY): string => `${cell.x}:${cell.y}`;
const signature = (cells: readonly HoCMath.XY[]): string => cells.map(key).sort().join("|");

/**
 * Every W x H block that covers `cursorCell`, best candidate first.
 *
 * The enumeration itself is the move-candidate finder's order: the cursor cell as the block's minimum
 * corner first, then the block sliding down and left over it.
 *
 * `currentCells` is what makes SELECTING a placed unit sane. A unit being repositioned already stands on a
 * valid block, and picking it up must propose the spot it is ALREADY on — otherwise the first click, with
 * the mouse held perfectly still, slides the proposed drop a cell away, because the raw order prefers
 * "cursor is the minimum corner" and only the unit's own bottom-left cell satisfies that. On a 2x2 that is
 * three of its four cells showing a drop position the unit is not on. So if the unit's current footprint is
 * among the blocks covering the cursor, it goes first; the cursor still chooses freely once it moves off,
 * since a block that no longer covers the cursor is not enumerated at all.
 *
 * `fits` is injected rather than taking a GridSettings so this stays a pure function the tests can drive.
 */
export const placementFootprintCandidates = (
    cursorCell: HoCMath.XY,
    width: number,
    height: number,
    fits: (anchor: HoCMath.XY) => boolean,
    currentCells?: readonly HoCMath.XY[],
): HoCMath.XY[][] => {
    const footprints: HoCMath.XY[][] = [];
    for (let cursorDx = 0; cursorDx < width; cursorDx++) {
        for (let cursorDy = 0; cursorDy < height; cursorDy++) {
            const anchor = { x: cursorCell.x - cursorDx + width - 1, y: cursorCell.y - cursorDy + height - 1 };
            // Off-board anchors are dropped before any cell is hashed: an out-of-grid cell packs into
            // (x << 4) | y as a key that collides with a real one.
            if (!fits(anchor)) {
                continue;
            }
            const footprint: HoCMath.XY[] = [];
            for (let dx = 0; dx < width; dx++) {
                for (let dy = 0; dy < height; dy++) {
                    footprint.push({ x: anchor.x - width + 1 + dx, y: anchor.y - height + 1 + dy });
                }
            }
            footprints.push(footprint);
        }
    }

    if (currentCells?.length) {
        const currentSignature = signature(currentCells);
        const index = footprints.findIndex((footprint) => signature(footprint) === currentSignature);
        if (index > 0) {
            const [own] = footprints.splice(index, 1);
            footprints.unshift(own);
        }
    }

    return footprints;
};
