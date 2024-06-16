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

import { XY } from "@box2d/core";
import { GridSettings } from "@heroesofcrypto/common";

import { Sprite } from "../utils/gl/Sprite";
import { IFrameable } from "./frameable";
import { FRAME_MAX_ELEMENTS_COUNT } from "../statics";

export class Frame {
    public readonly gridSettings: GridSettings;

    public readonly position: XY;

    public readonly sizeX: number;

    public readonly sizeY: number;

    public readonly frameWhite: Sprite;

    public readonly frameBlack: Sprite;

    public readonly fontWhite: Sprite;

    public readonly fontBlack: Sprite;

    public frameables: IFrameable[];

    public currentOffset = 0;

    public constructor(
        gridSettings: GridSettings,
        position: XY,
        sizeX: number,
        sizeY: number,
        frameWhite: Sprite,
        frameBlack: Sprite,
        fontWhite: Sprite,
        fontBlack: Sprite,
    ) {
        this.gridSettings = gridSettings;
        this.position = position;
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.frameWhite = frameWhite;
        this.frameBlack = frameBlack;
        this.fontWhite = fontWhite;
        this.fontBlack = fontBlack;
        this.frameWhite.setRect(this.position.x, this.position.y, this.sizeX, this.sizeY);
        this.frameBlack.setRect(this.position.x, this.position.y, this.sizeX, this.sizeY);
        this.fontWhite.setRect(
            this.position.x + 90,
            this.position.y + 450,
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        this.fontBlack.setRect(
            this.position.x + 90,
            this.position.y + 450,
            gridSettings.getStep(),
            gridSettings.getHalfStep(),
        );
        this.frameables = [];
    }

    public addFrameable(frameable: IFrameable): void {
        let alreadyExists = false;
        for (const f of this.frameables) {
            if (f.getName() === frameable.getName()) {
                alreadyExists = true;
            }
        }
        if (!alreadyExists) {
            this.frameables.push(frameable);
        }
    }

    public cleanupFrameables(): void {
        this.frameables = [];
    }

    public render(isLightMode: boolean): void {
        // render frameables first
        let i = 1;
        for (const f of this.frameables) {
            if (i > FRAME_MAX_ELEMENTS_COUNT) {
                break;
            }
            f.renderWithinFrame(this.gridSettings, this.position, i);
            i++;
        }

        // now we can render frame and font
        if (isLightMode) {
            this.frameWhite.render();
            this.fontWhite.render();
        } else {
            this.frameBlack.render();
            this.fontBlack.render();
        }
    }

    // private isNextPageAvailable(): boolean {
    // return this.frameables.length > this.currentOffset + FRAME_MAX_ELEMENTS_COUNT;
    // }
}
