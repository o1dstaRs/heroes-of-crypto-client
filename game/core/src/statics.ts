/*
 * -----------------------------------------------------------------------------
 * This file is part of the browser implementation of the Heroes of Crypto game client.
 *
 * Heroes of Crypto and Heroes of Crypto AI are registered trademarks.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * -----------------------------------------------------------------------------
 */

// animation
// Game state advances at 60 Hz. Rendering faster only repeats unchanged frames while doubling the
// renderer, filter and UI-ticker work on 120/144 Hz displays.
export const MAX_FPS = 60;
export const DAMAGE_ANIMATION_TICKS = 100;

// spawn
export const BASE_UNIT_STACK_TO_SPAWN_EXP = 1000;

export const EDGES_SIZE = 256;
