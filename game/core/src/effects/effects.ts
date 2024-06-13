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

import { GridSettings } from "../grid/grid_settings";
import { IFrameable, OnFramePosition } from "../menu/frameable";
import { Sprite } from "../utils/gl/Sprite";

export class EffectStats {
    public readonly name: string;

    public readonly laps: number;

    public readonly desc: string;

    public constructor(name: string, laps: number, desc: string) {
        this.name = name;
        this.laps = laps;
        this.desc = desc;
    }
}

export class Effect implements IFrameable {
    public readonly effectStats: EffectStats;

    private laps: number;

    private readonly sprite: Sprite;

    public constructor(effectStats: EffectStats, sprite: Sprite) {
        this.effectStats = effectStats;
        this.sprite = sprite;
        this.laps = effectStats.laps;
    }

    public renderWithinFrame(gridSettings: GridSettings, framePosition: XY, onFramePosition: OnFramePosition): void {
        const xMul = (onFramePosition - 1) % 3;
        const yMul = Math.floor((onFramePosition - 1) / 3);

        this.sprite.setRect(
            framePosition.x + gridSettings.getHalfStep() + gridSettings.getStep() * xMul,
            framePosition.y - gridSettings.getHalfStep() + gridSettings.getStep() * (3 - yMul),
            gridSettings.getStep(),
            gridSettings.getStep(),
        );
        this.sprite.render();
    }

    public getName(): string {
        return this.effectStats.name;
    }

    public getDesc(): string {
        return this.effectStats.desc;
    }

    public getLaps(): number {
        return this.laps;
    }

    public getStats(): EffectStats {
        return this.effectStats;
    }

    public extend(): void {
        this.laps += 1;
    }

    public minusLap(): void {
        if (this.laps > 0) {
            this.laps -= 1;
        }
        if (this.laps < 0) {
            this.laps = 0;
        }
    }
}
