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
    test("can update a reusable head-zone rectangle", () => {
        const target = rect(0, 0, 0, 0);

        expect(creatureHeadPriorityZone(rect(100, 20, 200, 120), 1, target)).toBe(target);
        expect(target).toEqual(rect(152, 20, 200, 86));
        expect(creatureHeadPriorityZone(rect(40, 10, 140, 210), -1, target)).toBe(target);
        expect(target).toEqual(rect(40, 10, 88, 142));
    });

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

        const first = resolveCreatureHeadPriorityDepths([left, right]);
        expect(first.size).toBe(0);
        expect(resolveCreatureHeadPriorityDepths([left, right])).toBe(first);
    });

    // The live report: a Squire one row behind a Pikeman, both left of a Black Dragon. After the Squire
    // turned to answer a strike, its right-facing head zone clipped the top-left corner of the dragon's
    // 2x2 box (about 12% of the zone, all empty air above the dragon's back). The old 1%-of-the-smaller-
    // area rule called that a covered face, lifted the Squire above the dragon, and with it above the
    // unrelated Pikeman in between — who vanished behind the Squire.
    test("a head zone clipping the corner of a big neighbour's box does not lift anyone over it", () => {
        const squire = candidate("squire", 3600, 0, rect(50, 20, 440, 650), 1);
        const pikeman = candidate("pikeman", 3650, 1, rect(80, 400, 300, 890), 1);
        const dragon = candidate("dragon", 3700, 2, rect(320, 360, 1240, 1000), 1);

        const depths = resolveCreatureHeadPriorityDepths([squire, pikeman, dragon]);
        const depthOf = (unit: CreatureDepthSortCandidate): number => depths.get(unit.id) ?? unit.baseDepth;

        expect(depthOf(squire)).toBeLessThan(depthOf(dragon));
        expect(depthOf(pikeman)).toBeGreaterThan(depthOf(squire));
    });

    test("a face mostly behind the neighbour's box is still lifted", () => {
        // The behind creature's head zone (x 172..220, y 20..126) sits wholly inside the front body.
        const behind = candidate("behind", 3998, 0, rect(120, 20, 220, 180), 1);
        const front = candidate("front", 4000, 1, rect(160, 10, 300, 200), 1);

        const depths = resolveCreatureHeadPriorityDepths([behind, front]);

        expect(depths.get("behind")).toBeGreaterThan(depths.get("front")!);
    });

    test("a small body planted on a large face is still a covered face", () => {
        // A footman standing half inside a dragon's head zone covers only 1% of that zone, but half of
        // the footman is on the dragon's face while its own head stays clear of the dragon's box.
        const dragon = candidate("dragon", 3998, 0, rect(0, 0, 600, 400), 1);
        const footman = candidate("footman", 4000, 1, rect(580, 100, 620, 160), 1);

        const depths = resolveCreatureHeadPriorityDepths([dragon, footman]);

        expect(depths.get("dragon")).toBeGreaterThan(depths.get("footman")!);
    });

    test("keeps the natural sort when both creatures' head zones intersect", () => {
        const left = candidate("left", 3998, 0, rect(100, 20, 220, 180), 1);
        const right = candidate("right", 4000, 1, rect(180, 20, 300, 180), -1);

        expect(resolveCreatureHeadPriorityDepths([left, right]).size).toBe(0);
    });
});
