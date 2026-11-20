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

import { battleSidebarWidth } from "../pixi/boardFit";
import { IWindowSize } from "../scenes/VisibleState";

/**
 * The gold trim that closes the gap between the board and either sidebar.
 *
 * It is anchored to the BOARD's edge, not to a sidebar's. The canvas spans the whole window and draws the
 * board centred inside it, while each sidebar is only as wide as it needs to be — so on most window sizes the
 * bar stops short of the board and leaves a strip of bare black canvas. That strip is what this covers, which
 * is also why the trim cannot live on the sidebars: it would sit at their edge and leave the gap untouched.
 *
 * The look is the medallion bezel from the toolbar art flattened into a straight run: a dark shoulder, a
 * bright gold arris, a shadowed groove, a second dimmer gold line, then dark again. Two gold lines at
 * different brightnesses are what make it read as turned metal rather than a painted stripe.
 */
export const TRIM_WIDTH_PX = 8;

/**
 * Where the drawn board's left and right edges fall, in window pixels. This reads the same shared width as
 * both sidebars and the camera, so the trim stays on their seam after the 15% sidebar reduction.
 */
export const boardEdges = (windowSize: IWindowSize): { left: number; right: number } => {
    const margin = battleSidebarWidth(windowSize.width, windowSize.height);
    return { left: margin, right: windowSize.width - margin };
};
