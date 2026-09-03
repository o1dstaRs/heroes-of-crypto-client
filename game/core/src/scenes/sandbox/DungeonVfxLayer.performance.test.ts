import { describe, expect, test } from "bun:test";

import { GridSettings } from "@heroesofcrypto/common";
import { Texture } from "pixi.js";

import { DungeonVfxLayer } from "./DungeonVfxLayer";

describe("dungeon fog idle work", () => {
    test("does not advance hidden or empty layers", () => {
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const hidden = new DungeonVfxLayer(gridSettings, Texture.WHITE);
        const empty = new DungeonVfxLayer(gridSettings);
        hidden.setVisible(false);

        hidden.update();
        empty.update();

        expect((hidden as unknown as { time: number }).time).toBe(0);
        expect((empty as unknown as { time: number }).time).toBe(0);
        hidden.destroy();
        empty.destroy();
    });
});
