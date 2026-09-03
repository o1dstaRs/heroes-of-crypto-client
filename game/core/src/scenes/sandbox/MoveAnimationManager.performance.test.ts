import { describe, expect, test } from "bun:test";

import { Sprite, Texture } from "pixi.js";

import { MoveAnimationManager, type IMoveAnimationContext } from "./MoveAnimationManager";

interface TestAfterimage {
    sprite: Sprite;
    life: number;
    maxLife: number;
}

interface TestTrack {
    life: number;
}

interface MoveAnimationInternals {
    afterimages: TestAfterimage[];
    lingeringTracks: TestTrack[];
}

describe("movement effect allocation", () => {
    test("compacts afterimages and dust tracks without replacing their arrays", () => {
        const manager = new MoveAnimationManager({} as IMoveAnimationContext);
        const internals = manager as unknown as MoveAnimationInternals;
        const survivingSprite = new Sprite(Texture.WHITE);
        const expiredSprite = new Sprite(Texture.WHITE);
        const afterimages = [
            { sprite: survivingSprite, life: 1, maxLife: 1 },
            { sprite: expiredSprite, life: 0.1, maxLife: 1 },
        ];
        const tracks = [{ life: 1 }, { life: 0.1 }];
        internals.afterimages = afterimages;
        internals.lingeringTracks = tracks;

        manager.update(0.25);

        expect(internals.afterimages).toBe(afterimages);
        expect(afterimages).toEqual([{ sprite: survivingSprite, life: 0.75, maxLife: 1 }]);
        expect(expiredSprite.destroyed).toBe(true);
        expect(internals.lingeringTracks).toBe(tracks);
        expect(tracks).toEqual([{ life: 0.75 }]);
        survivingSprite.destroy();
    });
});
