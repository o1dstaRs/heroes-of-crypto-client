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

import { Light } from "@box2d/lights";

export function setRandomLightColor(light: Light) {
    // fixme: find way to choose random bright color
    light.setColor(Math.random(), Math.random(), Math.random(), 1);
}
