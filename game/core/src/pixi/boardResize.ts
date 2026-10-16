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

export interface IBoardResizeSteps {
    /** Give the canvas its new size; the camera fit reads the renderer's size, so this goes first. */
    resizeCanvas(): void;
    /** The scene's own layout, which re-fits the painted floor (screen space) among everything else. */
    resizeScene(): void;
    /** The loading screen, while one is up. */
    resizeLoader?(): void;
    /** Re-fit the camera: every unit, zone, hover cell and click maps through it. */
    fitCamera(): void;
}

/**
 * One resize of the board, in the order the fit depends on: canvas, scene, loader, camera.
 *
 * The camera is fitted even when the scene's resize throws. The scene re-lays out the painted floor before
 * anything in it can fail, while the camera is only fitted here, so a throw in between left the two on
 * different sizes: the army and its deployment zone drifted off the painted cells and the right-hand zone
 * slid under the right sidebar until the next fit. Ranked placement did that on every resize (the roster
 * overlay it never builds threw, fixed in e07a931e). The error still propagates once the camera is fitted,
 * so the client-error report sees it.
 */
export const resizeBoard = (steps: IBoardResizeSteps): void => {
    steps.resizeCanvas();
    try {
        steps.resizeScene();
    } finally {
        try {
            steps.resizeLoader?.();
        } finally {
            steps.fitCamera();
        }
    }
};
