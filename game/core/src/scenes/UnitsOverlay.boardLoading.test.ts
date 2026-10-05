import { expect, spyOn, test } from "bun:test";
import { Assets, Container, Texture } from "pixi.js";

import { BATTLEFIELD_TEXTURE_KEYS } from "../pixi/battlefieldTextureKeys";
import type { TextureLoadOptions } from "../pixi/boardFirstTextureLoads";
import type { UnitChip } from "./UnitChip";
import { UnitsOverlay } from "./UnitsOverlay";

test("requests visible portraits first and starts only a hovered or selected creature's board figure", () => {
    const requested: string[] = [];
    const priorities = new Map<string, TextureLoadOptions | undefined>();
    const app = {
        renderer: { height: 900, width: 1600 },
        stage: new Container(),
        ticker: { add: () => undefined, remove: () => undefined },
    } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
    const overlay = new UnitsOverlay(app, (key, options) => {
        requested.push(key);
        priorities.set(key, options);
        return Texture.EMPTY;
    });
    try {
        expect(requested).toHaveLength(0);
        overlay.build();
        expect(requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key))).toEqual([]);
        expect(requested).toContain("peasant_512");
        expect(priorities.get("peasant_512")?.priority).toBe("visible");
        const internals = overlay as unknown as {
            allChips: UnitChip[];
            setSelectedLevel(level: number): void;
            selectChip(chip: UnitChip): void;
        };
        const peasant = internals.allChips.find((chip) => chip.nameKey === "Peasant")!;
        const peasantBounds = peasant.getBounds();
        overlay.handlePointerMove(
            peasantBounds.x + peasantBounds.width / 2,
            peasantBounds.y + peasantBounds.height / 2,
        );
        expect(requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key))).toEqual([
            "peasant_battlefield_side_right_distance_readable_v1",
        ]);

        requested.length = 0;
        internals.setSelectedLevel(4);
        expect(requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key))).toEqual([]);
        expect(requested).toContain("black_dragon_portrait_full");
        expect(priorities.get("black_dragon_portrait_full")?.priority).toBe("visible");
        const dragon = internals.allChips.find((chip) => chip.nameKey === "Black Dragon")!;
        internals.selectChip(dragon);
        // Selection asks for its figure synchronously; it does not wait for any cold portrait or icon.
        expect(requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key))).toEqual([
            "black_dragon_battlefield_side_right_distance_readable_v5",
        ]);
    } finally {
        overlay.destroy();
    }
});

test("keeps a cold roster's registered portraits on the scene loading queue", () => {
    const directLoads = spyOn(Assets, "load").mockRejectedValue(new Error("Unexpected direct portrait download"));
    const app = {
        renderer: { height: 900, width: 1600 },
        stage: new Container(),
        ticker: { add: () => undefined, remove: () => undefined },
    } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
    const overlay = new UnitsOverlay(app, () => undefined);
    try {
        overlay.build();
        expect(directLoads).not.toHaveBeenCalled();
        (overlay as unknown as { setSelectedLevel(level: number): void }).setSelectedLevel(4);
        expect(directLoads).not.toHaveBeenCalled();
    } finally {
        overlay.destroy();
        directLoads.mockRestore();
    }
});
