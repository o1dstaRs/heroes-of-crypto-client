import { expect, test } from "bun:test";

import { DRAFT_BAN_FRAME_WIDTH, DRAFT_BAN_SIDE_OFFSET, draftBanLayout } from "./draftBanLayout";

const board = { width: 1340, height: 880 };
const scaleFor = (width: number, height: number) =>
    Math.min(1.05, (width - 48) / board.width, (height - 40) / board.height);

test.each([
    [1280, 720, true],
    [1366, 768, true],
    [1440, 900, false],
    [1512, 982, false],
    [1728, 1117, true],
    [1920, 1080, true],
    [2048, 1536, true],
])("ban rail uses a real gutter at %s × %s", (width, height, docked) => {
    const scale = scaleFor(width, height);
    const result = draftBanLayout({ width, height, touch: false }, scale, board);
    expect(result.docked).toBe(docked);
    expect(result.maxHeight).toBeGreaterThan(0);
    if (result.docked) {
        const right = (width + board.width * scale) / 2 + (DRAFT_BAN_FRAME_WIDTH + DRAFT_BAN_SIDE_OFFSET) * scale;
        expect(right).toBeLessThanOrEqual(width - 8);
    }
});

test.each([
    [568, 320],
    [844, 390],
    [1180, 820],
    [1366, 1024],
])("touch bans stay in the Armies panel at %s × %s", (width, height) => {
    expect(draftBanLayout({ width, height, touch: true }, scaleFor(width, height), board).docked).toBe(false);
});
