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

import { SceneEntry } from "../scenes/scene";

export const classPrefix = (main: string, prefix?: string) => (prefix ? `${main} ${prefix}-${main}` : main);

const invalidUriChars = /[^a-z0-9-]+/gi;
export const getSceneLink = ({ group, name }: SceneEntry) =>
    `/${group.replace(invalidUriChars, "_")}#${name.replace(invalidUriChars, "_")}`;
