import { describe, expect, test } from "bun:test";

import {
    creatureHeadPriorityZone,
    resolveCreatureHeadPriorityDepths,
    type CreatureDepthRect,
    type CreatureDepthSortCandidate,
} from "./battlefieldCreatureDepthSort";

const rect = (left: number, top: number, right: number, bottom: number): CreatureDepthRect => ({
    left,
    top,
    right,
    bottom,
});

const candidate = (
    id: string,
    baseDepth: number,
    stableOrder: number,
    bounds: CreatureDepthRect,
    facingDirection: -1 | 1,
): CreatureDepthSortCandidate => ({
    id,
    baseDepth,
    stableOrder,
    bounds,
    headZone: creatureHeadPriorityZone(bounds, facingDirection),
});

describe("battlefield creature head-priority depth sorting", () => {
    test("places a right-facing creature's intersecting head in front of its neighbour", () => {
        const dragon = candidate("dragon", 3998, 0, rect(100, 20, 260, 180), 1);
        const angel = candidate("angel", 4000, 1, rect(220, 10, 320, 190), 1);

        const depths = resolveCreatureHeadPriorityDepths([dragon, angel]);

        expect(depths.get("dragon")).toBeGreaterThan(depths.get("angel")!);
    });

    test("mirrors the head region for a creature facing left", () => {
        const angel = candidate("angel", 4000, 0, rect(40, 10, 140, 190), -1);
        const dragon = candidate("dragon", 3998, 1, rect(100, 20, 260, 180), -1);

        const depths = resolveCreatureHeadPriorityDepths([angel, dragon]);

        expect(depths.get("dragon")).toBeGreaterThan(depths.get("angel")!);
    });

    test("keeps the natural sort untouched when only bodies intersect", () => {
        const left = candidate("left", 3998, 0, rect(100, 20, 220, 180), -1);
        const right = candidate("right", 4000, 1, rect(180, 100, 300, 260), 1);

        expect(resolveCreatureHeadPriorityDepths([left, right]).size).toBe(0);
    });

    test("keeps the natural sort when both creatures' head zones intersect", () => {
        const left = candidate("left", 3998, 0, rect(100, 20, 220, 180), 1);
        const right = candidate("right", 4000, 1, rect(180, 20, 300, 180), -1);

        expect(resolveCreatureHeadPriorityDepths([left, right]).size).toBe(0);
    });
});
