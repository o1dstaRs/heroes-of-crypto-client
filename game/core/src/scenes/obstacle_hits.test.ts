/*
 * The "can't kill the mountain in ranked, no HP reduced" report. Ranked never runs the engine for the
 * strike, so the client's ONLY source for mountain damage is the replayed obstacle_attacked event.
 */
import { describe, expect, test } from "bun:test";

import type { GameEvent } from "@heroesofcrypto/common";

import { nextObstacleHits, obstacleStrikePositions } from "./Sandbox";

type ObstacleEvent = Extract<GameEvent, { type: "obstacle_attacked" }>;

// Real board: x spans [-1024, 1024], so the center line is 0. The LEFT mountain sits at world x=-320,
// the RIGHT one at x=192 (cells 5 and 9 of the 16-wide grid).
const CENTER_X = 0;
const LEFT_MOUNTAIN_X = -320;
const RIGHT_MOUNTAIN_X = 192;

const event = (overrides: Partial<ObstacleEvent> = {}): ObstacleEvent =>
    ({
        type: "obstacle_attacked",
        attackerId: "u1",
        targetPosition: { x: LEFT_MOUNTAIN_X, y: 960 },
        attackFrom: { x: 4, y: 6 },
        hitsBefore: 6,
        hitsAfter: 5,
        animations: [],
        ...overrides,
    }) as ObstacleEvent;

describe("mountain hits from a replayed obstacle_attacked", () => {
    test("takes both sides verbatim when the server sends them", () => {
        // Captured from a real server journal entry (three melee strikes on the left mountain).
        const server = [
            { hitsBefore: 6, hitsAfter: 5, hitsAfterLeft: 2, hitsAfterRight: 3 },
            { hitsBefore: 5, hitsAfter: 4, hitsAfterLeft: 1, hitsAfterRight: 3 },
            { hitsBefore: 4, hitsAfter: 3, hitsAfterLeft: 0, hitsAfterRight: 3 },
        ];
        let hits = { left: 3, right: 3 };
        for (const entry of server) {
            hits = nextObstacleHits(event(entry as Partial<ObstacleEvent>), hits, CENTER_X);
        }
        expect(hits).toEqual({ left: 0, right: 3 });
    });

    test("an older server's TOTAL still drains the mountain that was struck", () => {
        // The old left-first re-split reported left=3 for every one of these, so the rock the player
        // was mining never lost a pip and could not be broken — while the untouched right one drained.
        let hits = { left: 3, right: 3 };
        const seen: string[] = [];
        for (const [hitsBefore, hitsAfter] of [
            [6, 5],
            [5, 4],
            [4, 3],
        ]) {
            hits = nextObstacleHits(
                event({ hitsBefore, hitsAfter, targetPosition: { x: LEFT_MOUNTAIN_X, y: 960 } }),
                hits,
                CENTER_X,
            );
            seen.push(`${hits.left}/${hits.right}`);
        }

        expect(seen).toEqual(["2/3", "1/3", "0/3"]);
    });

    test("the same total drains the RIGHT mountain when that is the one struck", () => {
        let hits = { left: 3, right: 3 };
        for (const [hitsBefore, hitsAfter] of [
            [6, 5],
            [5, 4],
        ]) {
            hits = nextObstacleHits(
                event({ hitsBefore, hitsAfter, targetPosition: { x: RIGHT_MOUNTAIN_X, y: 960 } }),
                hits,
                CENTER_X,
            );
        }

        expect(hits).toEqual({ left: 3, right: 1 });
    });

    test("a multi-hit strike takes every landed hit off in one go", () => {
        expect(nextObstacleHits(event({ hitsBefore: 6, hitsAfter: 4 }), { left: 3, right: 3 }, CENTER_X)).toEqual({
            left: 1,
            right: 3,
        });
    });

    test("never goes negative, and a whiffed strike changes nothing", () => {
        expect(nextObstacleHits(event({ hitsBefore: 2, hitsAfter: 0 }), { left: 1, right: 1 }, CENTER_X)).toEqual({
            left: 0,
            right: 1,
        });
        expect(nextObstacleHits(event({ hitsBefore: 5, hitsAfter: 5 }), { left: 2, right: 3 }, CENTER_X)).toEqual({
            left: 2,
            right: 3,
        });
    });
});

describe("obstacle strike animation positions", () => {
    test("keeps two scattered tombstones in first-impact then second-impact order", () => {
        const first = event({
            targetPosition: { x: -64, y: 256 },
            hitsBefore: 9,
            hitsAfter: 9,
        });
        const second = event({
            targetPosition: { x: -64, y: 128 },
            hitsBefore: 9,
            hitsAfter: 9,
        });

        expect(obstacleStrikePositions([first, second], { x: 0, y: 0 })).toEqual([
            first.targetPosition,
            second.targetPosition,
        ]);
    });

    test("repeats a classic mountain target once per aggregated landed hit", () => {
        const doubleHit = event({ hitsBefore: 6, hitsAfter: 4 });

        expect(obstacleStrikePositions([doubleHit], { x: 0, y: 0 })).toEqual([
            doubleHit.targetPosition,
            doubleHit.targetPosition,
        ]);
    });
});
