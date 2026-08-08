import { expect, test } from "bun:test";

import { TextureType, unitToTextureName } from "./PixiUnitsFactory";

test("Ash Moth renders the regular circular chip on the board (owner call: tall model parked)", () => {
    // The full-body ash_moth_board_128 experiment was reverted on 2026-08-07 — the battlefield uses the
    // standard <unit>_128 chip again. Flip this pin together with unitToTextureName + usesTallBoardModel
    // if the board-model experiment returns.
    expect(unitToTextureName("Ash Moth", TextureType.SMALL, 1)).toBe("ash_moth_128");
    expect(unitToTextureName("Ash Moth", TextureType.LARGE, 1)).toBe("ash_moth_512");
    expect(unitToTextureName("Squire", TextureType.SMALL, 1)).toBe("squire_128");
});
