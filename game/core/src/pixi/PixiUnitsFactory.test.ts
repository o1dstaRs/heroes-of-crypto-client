import { expect, test } from "bun:test";

import { TextureType, unitToTextureName } from "./PixiUnitsFactory";

test("uses the tall full-body texture only for Ash Moth on the board", () => {
    expect(unitToTextureName("Ash Moth", TextureType.SMALL, 1)).toBe("ash_moth_board_128");
    expect(unitToTextureName("Ash Moth", TextureType.LARGE, 1)).toBe("ash_moth_512");
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe("squire_128");
});
