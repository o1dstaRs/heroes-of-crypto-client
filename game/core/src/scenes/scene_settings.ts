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

import { GridSettings } from "@heroesofcrypto/common";

export class SceneSettings {
    private readonly gridSettings: GridSettings;

    private readonly draggable: boolean = true;

    public constructor(gridSettings: GridSettings, draggable: boolean) {
        this.gridSettings = gridSettings;
        this.draggable = draggable;
    }

    public isDraggable() {
        return this.draggable;
    }

    public getGridSettings() {
        return this.gridSettings;
    }
}
