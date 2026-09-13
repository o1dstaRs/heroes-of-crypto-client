import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    boardImageRetryDelayMs,
    createBoardFirstLoads,
    EXTRA_TEXTURE_MAX_WAIT_MS,
    isBoardImageTextureKey,
} from "./boardFirstTextureLoads";

const BOARD = "peasant_battlefield_side_right_distance_readable_v1";
const EXTRA = "squire_idle_atlas_quarter";

/** A download that finishes (or fails) when the test says so. */
const deferred = () => {
    let resolve!: (value: string) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe("board-first texture loading", () => {
    test("a board image starts at once; an extra waits for the board images downloading, then starts", async () => {
        const loads = createBoardFirstLoads();
        const board = deferred();
        const started: string[] = [];

        const boardLoad = loads.load(BOARD, () => {
            started.push("board");
            return board.promise;
        });
        const extraLoad = loads.load(EXTRA, async () => {
            started.push("extra");
            return "extra texture";
        });

        await tick();
        expect(started).toEqual(["board"]);
        expect(loads.boardImagesInFlight()).toBe(1);

        board.resolve("board texture");
        expect(await boardLoad).toBe("board texture");
        expect(await extraLoad).toBe("extra texture");
        expect(started).toEqual(["board", "extra"]);
        expect(loads.boardImagesInFlight()).toBe(0);
    });

    test("an extra starts at once when no board image is downloading", async () => {
        const loads = createBoardFirstLoads();
        const started: string[] = [];
        void loads.load(EXTRA, async () => {
            started.push("extra");
            return "extra texture";
        });
        await tick();
        expect(started).toEqual(["extra"]);
    });

    test("every board image counts: extras wait for the last one, and a failed one still releases them", async () => {
        const loads = createBoardFirstLoads();
        const first = deferred();
        const second = deferred();
        const started: string[] = [];
        void loads.load(BOARD, () => first.promise).catch(() => undefined);
        void loads.load("griffin_128", () => second.promise);
        void loads.load(EXTRA, async () => {
            started.push("extra");
            return "extra texture";
        });

        first.reject(new Error("network"));
        await tick();
        expect(started).toEqual([]);

        second.resolve("griffin");
        await tick();
        expect(started).toEqual(["extra"]);
    });

    test("an extra never waits longer than the cap behind a stalled board image", async () => {
        const loads = createBoardFirstLoads(isBoardImageTextureKey, 25);
        const stalled = deferred();
        const started: string[] = [];
        void loads.load(BOARD, () => stalled.promise);
        void loads.load(EXTRA, async () => {
            started.push("extra");
            return "extra texture";
        });
        await tick(5);
        expect(started).toEqual([]);
        await tick(40);
        expect(started).toEqual(["extra"]);
        expect(EXTRA_TEXTURE_MAX_WAIT_MS).toBe(10_000);
    });

    test("what counts as a board image: every kind a creature stands on, never animation or icon art", () => {
        for (const key of [
            BOARD,
            "orc_battlefield_side_right_final_v1",
            "troll_board_128",
            "efreet_board_128",
            "arachna_queen_board_256",
            "thief_board_128",
            "griffin_128",
            "black_dragon_256",
        ]) {
            expect(isBoardImageTextureKey(key), key).toBe(true);
        }
        for (const key of [EXTRA, "orc_idle_atlas", "fire_breath_256", "spell_cell_260", "griffin_512"]) {
            expect(isBoardImageTextureKey(key), key).toBe(false);
        }
    });

    test("a failed board image is asked for again after 1s, 2s, 4s… never more than 15s apart", () => {
        expect([1, 2, 3, 4, 5, 6, 10].map(boardImageRetryDelayMs)).toEqual([
            1_000, 2_000, 4_000, 8_000, 15_000, 15_000, 15_000,
        ]);
    });
});

describe("where the board-first order is applied", () => {
    test("every on-demand scene texture loads through it, and a failed board image schedules a repaint to retry", () => {
        const scene = readFileSync(join(import.meta.dir, "PixiScene.ts"), "utf8");
        expect(scene).toContain("boardFirstTextureLoads.load(key, () => Assets.load<Texture>(url))");
        expect(scene).not.toContain("pending = Assets.load<Texture>(url);");
        expect(scene).toContain("this.scheduleBoardImageRetry(url)");
    });

    test("the idle and animation bundles start only after the board images", () => {
        const manager = readFileSync(join(import.meta.dir, "PixiGameManager.ts"), "utf8");
        const waitAt = manager.indexOf("boardFirstTextureLoads.afterBoardImages()");
        expect(waitAt).toBeGreaterThan(manager.indexOf("this.LoadGame();"));
        expect(waitAt).toBeLessThan(manager.indexOf("preloadIdleAtlasAssets((p)"));
    });
});
