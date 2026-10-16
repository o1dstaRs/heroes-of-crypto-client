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

import { useSyncExternalStore } from "react";

import { isBoardMirrored, isBoardMirroredOnServer, subscribeBoardMirror } from "../pixi/boardMirror";

/**
 * Whether the battlefield is drawn mirrored for this viewer right now (pixi/boardMirror.ts). The chrome that
 * lines up with the board's two sides (the matchup strip, the countdown frame) turns around with it.
 */
export const useBoardMirrored = (): boolean =>
    useSyncExternalStore(subscribeBoardMirror, isBoardMirrored, isBoardMirroredOnServer);
