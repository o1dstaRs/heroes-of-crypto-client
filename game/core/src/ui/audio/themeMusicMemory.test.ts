import { expect, test } from "bun:test";

import { parseThemePlaybackMemory } from "./themeMusicMemory";

test("old sessions still resume Iron and Silk, and new sessions retain The Last Stand", () => {
    expect(parseThemePlaybackMemory('{"index":1,"time":25,"matchTime":39}')).toEqual({
        index: 1,
        time: 25,
        matchTime: 39,
    });
    expect(parseThemePlaybackMemory('{"index":1,"time":25,"matchIndex":1,"matchTime":0}')).toEqual({
        index: 1,
        time: 25,
        matchIndex: 1,
        matchTime: 0,
    });
});

test("bad match indices fall back without losing valid saved menu or match time", () => {
    for (const matchIndex of [-1, 2, 999, 0.5, "1", null]) {
        expect(parseThemePlaybackMemory(JSON.stringify({ index: 0, time: 12, matchTime: 47, matchIndex }))).toEqual({
            index: 0,
            time: 12,
            matchTime: 47,
        });
    }
    expect(parseThemePlaybackMemory('{"index":0,"time":12,"matchIndex":1}')).toEqual({ index: 0, time: 12 });
});

test("invalid storage cannot break startup or replace a valid menu position", () => {
    for (const raw of [null, "", "{", "null", "[]", '{"index":3,"time":0}', '{"index":0,"time":-1}']) {
        expect(parseThemePlaybackMemory(raw)).toBeNull();
    }
    for (const matchTime of [-1, "30", null]) {
        expect(parseThemePlaybackMemory(JSON.stringify({ index: 1, time: 12, matchIndex: 1, matchTime }))).toEqual({
            index: 1,
            time: 12,
        });
    }
});
