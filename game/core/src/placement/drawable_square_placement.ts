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

import { b2Color, b2Draw } from "@box2d/core";
import { HoCMath, GridSettings } from "@heroesofcrypto/common";

import { PlacementType, SquarePlacement } from "./square_placement";

export class DrawableSquarePlacement extends SquarePlacement {
    private readonly verticles: HoCMath.XY[];

    public constructor(gridSettings: GridSettings, placementType: PlacementType, size = 3) {
        super(gridSettings, placementType, size);
        // use 1 as a border to avoid collision with aura areas
        this.verticles = [
            { x: this.xLeft + 1, y: this.yUpper - 1 },
            { x: this.xRight - 1, y: this.yUpper - 1 },
            { x: this.xRight - 1, y: this.yLower + 1 },
            { x: this.xLeft + 1, y: this.yLower + 1 },
        ];
    }

    public draw(drawInstance: b2Draw): void {
        drawInstance.DrawSolidPolygon(this.verticles, 4, new b2Color(0.5, 0.5, 0.5));
    }
}
