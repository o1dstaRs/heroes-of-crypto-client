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

import React from "react";

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

// Reads from the BOARD outwards. Mirrored per side so the bright arris always faces the board.
const TRIM_BANDS = [
    "#080604 0%",
    "#080604 10%",
    "#3d2e1a 10%",
    "#5c4622 22%",
    "#caa866 34%", // bright arris
    "#a07e3c 44%",
    "#120c07 52%", // groove
    "#120c07 60%",
    "#8f7132 70%", // second, dimmer gold line
    "#5b4622 82%",
    "#080604 92%",
    "#080604 100%",
].join(", ");

/**
 * Where the drawn board's left and right edges fall, in window pixels. Mirrors the sizing the sidebars already
 * do (see LeftSideBar.adjustBarSize): the board is a 2048 square scaled to fit and centred.
 */
export const boardEdges = (windowSize: IWindowSize): { left: number; right: number } => {
    const scaleRatio = Math.min(windowSize.width / 2048, windowSize.height / 2048);
    const scaledBoardSize = 2048 * scaleRatio;
    const margin = Math.max(0, Math.round((windowSize.width - scaledBoardSize) / 2));
    return { left: margin, right: windowSize.width - margin };
};

export const BoardEdgeTrim: React.FC<{ windowSize: IWindowSize }> = ({ windowSize }) => {
    const edges = boardEdges(windowSize);
    // The trim lives entirely in the black margin beside the board, so it needs a margin wide enough to hold
    // it. Below that there is nothing to sit in, and drawing it anyway would put gold rules over the map —
    // which is exactly the clipping this guard exists to prevent.
    if (edges.left < TRIM_WIDTH_PX) {
        return null;
    }

    const common: React.CSSProperties = {
        position: "fixed",
        top: 0,
        height: "100dvh",
        width: `${TRIM_WIDTH_PX}px`,
        // Above BOTH the canvas and the sidebars (which sit at zIndex 1). The canvas is unpositioned but
        // paints later in the document, so anything lower disappeared under it; and on wide windows a
        // sidebar grows until it meets the board, so at the bars' own level the trim vanished under them
        // exactly where it was most wanted. It is an 8px rule with pointer events off, so riding on top
        // costs nothing.
        zIndex: 2,
        pointerEvents: "none",
    };

    return (
        <>
            <div
                style={{
                    ...common,
                    // Butts against the board from OUTSIDE, in the black margin. Overlapping the board even
                    // by these few pixels clipped the edge column of cells and the unit icons standing on it.
                    left: `${Math.max(0, edges.left - TRIM_WIDTH_PX)}px`,
                    backgroundImage: `linear-gradient(to left, ${TRIM_BANDS})`,
                    boxShadow: "-2px 0 10px rgba(0,0,0,.75)",
                }}
            />
            <div
                style={{
                    ...common,
                    left: `${edges.right}px`,
                    backgroundImage: `linear-gradient(to right, ${TRIM_BANDS})`,
                    boxShadow: "2px 0 10px rgba(0,0,0,.75)",
                }}
            />
        </>
    );
};
