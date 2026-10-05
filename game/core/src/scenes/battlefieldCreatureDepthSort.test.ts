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

// A fresh array always runs the original graph solver, bypassing the scene-array cache.
const freshlyResolved = (candidates: readonly CreatureDepthSortCandidate[]): ReadonlyMap<string, number> =>
    resolveCreatureHeadPriorityDepths(
        candidates.map((value) => ({ ...value, bounds: { ...value.bounds }, headZone: { ...value.headZone } })),
    );

const overlappingCandidates = (): CreatureDepthSortCandidate[] => [
    candidate("dragon", 3998, 0, rect(100, 20, 260, 180), 1),
    candidate("angel", 4000, 1, rect(220, 10, 320, 190), 1),
];

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

    test("reuses an unchanged result after the scene restores natural depths", () => {
        const candidates = overlappingCandidates();
        const first = resolveCreatureHeadPriorityDepths(candidates);
        expect(first.get("dragon")).not.toBe(candidates[0].baseDepth);

        // syncVisual restores these ground-line depths before the next candidate pass. The adjusted
        // result is applied to display objects, so it must never overwrite the resolver's inputs.
        candidates[0].baseDepth = 3998;
        candidates[1].baseDepth = 4000;
        expect(resolveCreatureHeadPriorityDepths(candidates)).toBe(first);
        expect(first).toEqual(freshlyResolved(candidates));

        candidates[0] = {
            ...candidates[0],
            bounds: { ...candidates[0].bounds },
            headZone: { ...candidates[0].headZone },
        };
        expect(resolveCreatureHeadPriorityDepths(candidates)).toBe(first);
    });

    const scalarMutations: [string, (value: CreatureDepthSortCandidate) => void][] = [
        ["id", (value) => (value.id = "replacement-dragon")],
        ["base depth", (value) => (value.baseDepth += 1)],
        ["stable order", (value) => (value.stableOrder += 1)],
    ];
    for (const field of ["left", "top", "right", "bottom"] as const) {
        scalarMutations.push([`bounds.${field}`, (value) => (value.bounds[field] += 1)]);
        scalarMutations.push([`head zone.${field}`, (value) => (value.headZone[field] += 1)]);
    }

    test.each(scalarMutations)("detects an in-place change to %s", (_label, mutate) => {
        const candidates = overlappingCandidates();
        const first = resolveCreatureHeadPriorityDepths(candidates);
        mutate(candidates[0]);

        const after = resolveCreatureHeadPriorityDepths(candidates);
        expect(after).not.toBe(first);
        expect(after).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates)).toBe(after);
    });

    test("recomputes movement, facing and mirrored camera geometry without delaying a frame", () => {
        const candidates = overlappingCandidates();
        resolveCreatureHeadPriorityDepths(candidates);

        candidates[0].bounds = rect(10, 20, 170, 180);
        creatureHeadPriorityZone(candidates[0].bounds, 1, candidates[0].headZone);
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates).size).toBe(0);

        candidates[0].bounds = rect(100, 20, 260, 180);
        creatureHeadPriorityZone(candidates[0].bounds, 1, candidates[0].headZone);
        const facingRight = resolveCreatureHeadPriorityDepths(candidates);
        creatureHeadPriorityZone(candidates[0].bounds, -1, candidates[0].headZone);
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates)).not.toBe(facingRight);

        creatureHeadPriorityZone(candidates[0].bounds, 1, candidates[0].headZone);
        for (const value of candidates) {
            const { left, right, top, bottom } = value.bounds;
            value.bounds = rect(500 - right, top, 500 - left, bottom);
            creatureHeadPriorityZone(value.bounds, -1, value.headZone);
        }
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates).get("dragon")).toBeGreaterThan(
            resolveCreatureHeadPriorityDepths(candidates).get("angel")!,
        );
    });

    test("detects in-place reordering, exclusion, replacement, empty frames and new arrivals", () => {
        const candidates = overlappingCandidates();
        const original = candidates.slice();
        resolveCreatureHeadPriorityDepths(candidates);

        candidates.reverse();
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        candidates.pop(); // Foreground attackers are omitted from the current candidate list.
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates).size).toBe(0);
        candidates.length = 0;
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        candidates.push(...original);
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));

        candidates[0] = candidate("new-dragon", 3998, 0, rect(100, 20, 260, 180), 1);
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
        expect(resolveCreatureHeadPriorityDepths(candidates).has("dragon")).toBe(false);
        candidates.push(candidate("new-footman", 4005, 2, rect(600, 20, 680, 160), -1));
        expect(resolveCreatureHeadPriorityDepths(candidates)).toEqual(freshlyResolved(candidates));
    });

    test("keeps independent scene arrays isolated", () => {
        const firstScene = overlappingCandidates();
        const secondScene = overlappingCandidates();
        const first = resolveCreatureHeadPriorityDepths(firstScene);
        const second = resolveCreatureHeadPriorityDepths(secondScene);
        expect(first).toEqual(second);
        expect(first).not.toBe(second);

        secondScene[0].baseDepth = 8000;
        resolveCreatureHeadPriorityDepths(secondScene);
        expect(resolveCreatureHeadPriorityDepths(firstScene)).toBe(first);
        expect(resolveCreatureHeadPriorityDepths(secondScene)).toEqual(freshlyResolved(secondScene));
    });

    test("retains original chain and cycle resolution on cache hits and dirty frames", () => {
        const chain = [
            candidate("a", 3998, 0, rect(0, 0, 100, 100), 1),
            candidate("b", 4000, 1, rect(70, 0, 170, 100), 1),
            candidate("c", 4002, 2, rect(140, 0, 240, 100), 1),
        ];
        const chainResult = resolveCreatureHeadPriorityDepths(chain);
        expect(chainResult.get("a")).toBeGreaterThan(chainResult.get("b")!);
        expect(chainResult.get("b")).toBeGreaterThan(chainResult.get("c")!);
        expect(resolveCreatureHeadPriorityDepths(chain)).toBe(chainResult);
        chain[1].baseDepth += 10;
        expect(resolveCreatureHeadPriorityDepths(chain)).toEqual(freshlyResolved(chain));

        // Deliberately cyclic head/body constraints exercise the solver's natural-depth tie breaker.
        const cycle = [
            { ...candidate("a", 3998, 0, rect(0, 0, 100, 100), 1), headZone: rect(210, 0, 230, 20) },
            { ...candidate("b", 4000, 1, rect(200, 0, 300, 100), 1), headZone: rect(410, 0, 430, 20) },
            { ...candidate("c", 4002, 2, rect(400, 0, 500, 100), 1), headZone: rect(10, 0, 30, 20) },
        ];
        const cycleResult = resolveCreatureHeadPriorityDepths(cycle);
        expect(cycleResult.size).toBe(3);
        expect(cycleResult).toEqual(freshlyResolved(cycle));
        expect(resolveCreatureHeadPriorityDepths(cycle)).toBe(cycleResult);
        cycle.reverse();
        cycle[0].baseDepth -= 20;
        expect(resolveCreatureHeadPriorityDepths(cycle)).toEqual(freshlyResolved(cycle));
    });

    test("checks each unchanged rectangle once instead of comparing every pair", () => {
        let boundsLeftReads = 0;
        const candidates = Array.from({ length: 32 }, (_, index) => {
            const value = candidate(
                `unit-${index}`,
                4000 - index,
                index,
                rect(index * 200, 0, index * 200 + 100, 100),
                1,
            );
            const left = value.bounds.left;
            Object.defineProperty(value.bounds, "left", {
                get: () => {
                    boundsLeftReads += 1;
                    return left;
                },
            });
            return value;
        });
        resolveCreatureHeadPriorityDepths(candidates);
        expect(boundsLeftReads).toBeGreaterThan(candidates.length);

        boundsLeftReads = 0;
        for (let frame = 0; frame < 120; frame += 1) resolveCreatureHeadPriorityDepths(candidates);
        expect(boundsLeftReads).toBe(120 * candidates.length);

        boundsLeftReads = 0;
        candidates[0].headZone.left += 1;
        resolveCreatureHeadPriorityDepths(candidates);
        expect(boundsLeftReads).toBeGreaterThan(candidates.length);
    });
});
