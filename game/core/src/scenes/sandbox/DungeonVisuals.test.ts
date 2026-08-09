import { describe, expect, test } from "bun:test";
import { Container } from "pixi.js";

import { GridSettings } from "@heroesofcrypto/common";

import { DungeonVisuals } from "./DungeonVisuals";

describe("DungeonVisuals lifecycle", () => {
    test("destroy detaches narrowing holes from the shared world root", () => {
        const stage = new Container();
        const worldRoot = new Container();
        const gridSettings = new GridSettings(16, 1024, 0, 1024, 0, 64, 32);
        const visuals = new DungeonVisuals({
            getStage: () => stage,
            getWorldRoot: () => worldRoot,
            getViewportSize: () => ({ width: 1024, height: 1024 }),
            getGridSettings: () => gridSettings,
            texAny: () => undefined,
            attachToWorldRoot: (object, zIndex = 0) => {
                object.zIndex = zIndex;
                worldRoot.addChild(object);
            },
        });

        const holes = visuals.getHoleContainer();
        worldRoot.addChild(holes);
        visuals.spawnHoleLayer(1);

        expect(worldRoot.children).toContain(holes);
        expect(holes.children).toHaveLength(1);

        visuals.destroy();

        expect(holes.destroyed).toBe(true);
        expect(worldRoot.children).not.toContain(holes);
    });
});
