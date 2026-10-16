import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    boardImageRetryDelayMs,
    createBoardFirstLoads,
    EXTRA_TEXTURE_MAX_WAIT_MS,
    isBoardImageTextureKey,
    MAX_CONCURRENT_EXTRA_TEXTURE_LOADS,
    MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS,
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

    test("four visible cards bypass a stalled board and a full optional queue, while remaining bounded", async () => {
        const loads = createBoardFirstLoads();
        const optional = Array.from({ length: 5 }, deferred);
        const started: string[] = [];
        const optionalLoads = optional.map((download, index) =>
            loads.load(EXTRA, () => {
                started.push(`optional ${index}`);
                return download.promise;
            }),
        );
        await tick();
        const board = deferred();
        const boardLoad = loads.load(BOARD, () => {
            started.push("board");
            return board.promise;
        });
        const cards = Array.from({ length: MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS + 1 }, deferred);
        const cardLoads = cards.map((download, index) =>
            loads.load(
                `card ${index}`,
                () => {
                    started.push(`card ${index}`);
                    return download.promise;
                },
                { priority: "visible" },
            ),
        );
        await tick();
        expect(started).toEqual(["optional 0", "optional 1", "board", "card 0", "card 1", "card 2", "card 3"]);
        cards[0].resolve("card");
        await tick();
        expect(started.at(-1)).toBe("card 4");
        expect(started.filter((key) => key.startsWith("optional"))).toHaveLength(2);
        board.resolve("board");
        optional.forEach((download) => download.resolve("optional"));
        cards.forEach((download) => download.resolve("card"));
        await Promise.all([...optionalLoads, ...cardLoads, boardLoad]);
    });

    test("the current level's queued portraits precede the old level and shared requests are promoted once", async () => {
        const loads = createBoardFirstLoads();
        const oldGroup = {};
        const newGroup = {};
        const oldCards = Array.from({ length: MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS + 2 }, deferred);
        const started: string[] = [];
        const oldLoads = oldCards.map((download, index) =>
            loads.load(
                `old ${index}`,
                () => {
                    started.push(`old ${index}`);
                    return download.promise;
                },
                { priority: "visible", group: oldGroup },
            ),
        );
        const newCard = deferred();
        const newLoad = loads.load(
            "new card",
            () => {
                started.push("new card");
                return newCard.promise;
            },
            { priority: "visible", group: newGroup },
        );
        loads.promote(oldLoads[5], { priority: "visible", group: newGroup });
        await tick();
        expect(started).toEqual(["old 0", "old 1", "old 2", "old 3"]);
        oldCards[0].resolve("old");
        await tick();
        expect(started.at(-1)).toBe("old 5");
        oldCards[1].resolve("old");
        await tick();
        expect(started.at(-1)).toBe("new card");
        expect(started).not.toContain("old 4");
        oldCards.forEach((download) => download.resolve("old"));
        newCard.resolve("new");
        await Promise.all([...oldLoads, newLoad]);
        expect(started.filter((key) => key === "old 5")).toHaveLength(1);
    });

    test("an optional request waiting for board images can become visible without occupying an optional slot", async () => {
        const loads = createBoardFirstLoads();
        const board = deferred();
        const boardLoad = loads.load(BOARD, () => board.promise);
        const started: string[] = [];
        const texture = deferred();
        const promoted = loads.load("portrait", () => {
            started.push("portrait");
            return texture.promise;
        });
        const extras = Array.from({ length: MAX_CONCURRENT_EXTRA_TEXTURE_LOADS }, (_, index) =>
            loads.load(EXTRA, async () => {
                started.push(`optional ${index}`);
                return "optional";
            }),
        );
        await tick();
        loads.promote(promoted, { priority: "visible" });
        await tick();
        expect(started).toEqual(["portrait"]);
        board.resolve("board");
        await Promise.all([...extras, boardLoad]);
        expect(started).toEqual(["portrait", "optional 0", "optional 1"]);
        texture.resolve("portrait");
        expect(await promoted).toBe("portrait");
    });

    test("a failed visible download releases its slot for the next card", async () => {
        const loads = createBoardFirstLoads();
        const cards = Array.from({ length: MAX_CONCURRENT_VISIBLE_TEXTURE_LOADS + 1 }, deferred);
        const started: number[] = [];
        const results = cards.map((card, index) =>
            loads
                .load(
                    "portrait",
                    () => {
                        started.push(index);
                        return card.promise;
                    },
                    { priority: "visible" },
                )
                .catch(() => "failed"),
        );
        await tick();
        expect(started).toEqual([0, 1, 2, 3]);
        cards[0].reject(new Error("decode failed"));
        await tick();
        expect(started).toEqual([0, 1, 2, 3, 4]);
        cards.slice(1).forEach((card) => card.resolve("card"));
        expect(await Promise.all(results)).toEqual(["failed", "card", "card", "card", "card"]);
    });

    test("limits optional downloads and releases a slot after a failure", async () => {
        const loads = createBoardFirstLoads();
        const downloads = Array.from({ length: MAX_CONCURRENT_EXTRA_TEXTURE_LOADS + 1 }, deferred);
        const started: number[] = [];
        const results = downloads.map((download, index) =>
            loads
                .load(EXTRA, () => {
                    started.push(index);
                    return download.promise;
                })
                .catch(() => "failed"),
        );
        await tick();
        expect(started).toEqual([0, 1]);

        downloads[0].reject(new Error("decode failed"));
        await tick();
        expect(started).toEqual([0, 1, 2]);
        downloads.slice(1).forEach((download) => download.resolve("texture"));
        expect(await Promise.all(results)).toEqual(["failed", "texture", "texture"]);
    });

    test("a new board image bypasses busy optional slots and holds queued animations", async () => {
        const loads = createBoardFirstLoads();
        const animations = Array.from({ length: MAX_CONCURRENT_EXTRA_TEXTURE_LOADS + 1 }, deferred);
        const started: string[] = [];
        const extras = animations.map((download, index) =>
            loads.load(EXTRA, () => {
                started.push(`animation ${index}`);
                return download.promise;
            }),
        );
        await tick();
        const board = deferred();
        const boardLoad = loads.load(BOARD, () => {
            started.push("new unit");
            return board.promise;
        });
        expect(started).toEqual(["animation 0", "animation 1", "new unit"]);

        animations[0].resolve("first animation");
        await tick();
        expect(started).toHaveLength(3);
        board.resolve("board texture");
        await boardLoad;
        await tick();
        expect(started.at(-1)).toBe("animation 2");
        animations.slice(1).forEach((download) => download.resolve("animation texture"));
        await Promise.all(extras);
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
        expect(scene).toContain("boardFirstTextureLoads.load(key, () => Assets.load<Texture>(url), options)");
        expect(scene).toContain("boardFirstTextureLoads.promote(pending, options)");
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
