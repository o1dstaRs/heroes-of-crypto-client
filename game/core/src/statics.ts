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

export const NO_VELOCITY = { x: 0, y: 0 };
export const GRID_SIZE = 16;
export const MAX_Y = 2048;
export const MIN_Y = 0;
export const MAX_X = 1024;
export const MIN_X = -1024;
export const STEP = MAX_Y / GRID_SIZE;
export const DOUBLE_STEP = STEP << 1;
export const HALF_STEP = STEP >> 1;
export const FOURTH_STEP = STEP >> 2;
export const UNIT_SIZE_DELTA = 0.06;
export const MOVEMENT_DELTA = 5;
export const HP_BAR_DELTA = 0.09;

// animation
export const MAX_FPS = 120;
export const DAMAGE_ANIMATION_TICKS = 100;

// sprite
export const MOUNTAIN_ENLARGE_X = 185;
export const MOUNTAIN_ENLARGE_Y = 165;
export const MOUNTAIN_ENLARGE_DOUBLE_X = 370;
export const MOUNTAIN_ENLARGE_DOUBLE_Y = 330;

// spawn
export const BASE_UNIT_STACK_TO_SPAWN_EXP = 1000;
export const SHIFT_UNITS_POSITION_Y = 3;
export const MAX_HOLE_LAYERS = 5;

// ui
export const FIGHT_BUTTONS_RIGHT_POSITION_X = 1214;
export const FIGHT_BUTTONS_LEFT_POSITION_X = -1086;
export const FRAME_MAX_ELEMENTS_COUNT = 9;
export const BAR_SIZE_PIXELS_STR = "280px";
