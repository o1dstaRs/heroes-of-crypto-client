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

export interface PlacementClickPriorityInput {
    hasActiveSelection: boolean;
    hasSelectedUnit: boolean;
    hasValidPlacementCells: boolean;
    clickedOccupiedUnit: boolean;
    clickedBenchUnit: boolean;
}

/**
 * A green placement preview is the player's immediate click target. A creature's tall artwork may
 * overlap that preview without occupying its cell, so only a unit standing on the clicked cell (or an
 * explicit bench hit target) may take selection priority from the placement.
 */
export const shouldCommitPlacementBeforeUnitSelection = (input: PlacementClickPriorityInput): boolean =>
    input.hasActiveSelection &&
    input.hasSelectedUnit &&
    input.hasValidPlacementCells &&
    !input.clickedOccupiedUnit &&
    !input.clickedBenchUnit;
