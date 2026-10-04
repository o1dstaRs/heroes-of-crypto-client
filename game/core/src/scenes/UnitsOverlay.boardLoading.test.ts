import { expect, test } from "bun:test";
import { Container, Texture } from "pixi.js";

import { BATTLEFIELD_TEXTURE_KEYS } from "../pixi/battlefieldTextureKeys";
import { UnitsOverlay } from "./UnitsOverlay";

test("starts visible-level board artwork before portraits and repeats that order when the level changes", () => {
    const requested: string[] = [];
    const app = {
        renderer: { height: 900, width: 1600 },
        stage: new Container(),
        ticker: { add: () => undefined, remove: () => undefined },
    } as unknown as ConstructorParameters<typeof UnitsOverlay>[0];
    const overlay = new UnitsOverlay(app, (key) => {
        requested.push(key);
        return Texture.EMPTY;
    });
    expect(requested).toHaveLength(0);
    overlay.build();
    const initialBoards = requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key));
    expect(initialBoards).toContain("peasant_battlefield_side_right_distance_readable_v1");
    expect(initialBoards).toContain("wolf_battlefield_side_right_distance_readable_v1");
    expect(initialBoards).not.toContain("black_dragon_battlefield_side_right_distance_readable_v5");
    expect(requested.slice(0, initialBoards.length)).toEqual(initialBoards);

    requested.length = 0;
    (overlay as unknown as { setSelectedLevel(level: number): void }).setSelectedLevel(4);
    const nextBoards = requested.filter((key) => BATTLEFIELD_TEXTURE_KEYS.has(key));
    expect(nextBoards).toContain("black_dragon_battlefield_side_right_distance_readable_v5");
    expect(nextBoards).not.toContain("peasant_battlefield_side_right_distance_readable_v1");
    expect(requested.slice(0, nextBoards.length)).toEqual(nextBoards);
    overlay.destroy();
});
