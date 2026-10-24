import { describe, expect, test } from "bun:test";

import { TeamVals } from "@heroesofcrypto/common";

import {
    OPTIMISTIC_PLACEMENT_HOLD_MS,
    placementContextKey,
    placementSnapshotWouldRewind,
    shouldHoldOptimisticPlacement,
    viewerPlacementAlreadyShown,
    type PlacementUnitView,
} from "./rankedPlacementReconcile";

const unit = (overrides: Partial<PlacementUnitView> & Pick<PlacementUnitView, "id">): PlacementUnitView => ({
    team: TeamVals.LEFT,
    placed: true,
    amountAlive: 10,
    cells: [{ x: 1, y: 1 }],
    ...overrides,
});

describe("ranked placement reconcile", () => {
    test("a snapshot that repeats the live drop does not need a board rebuild", () => {
        const live = [
            unit({
                id: "a",
                cells: [
                    { x: 2, y: 4 },
                    { x: 2, y: 5 },
                ],
            }),
            unit({ id: "b", cells: [{ x: 3, y: 4 }] }),
        ];
        // Cell order on the wire is not significant.
        const reordered = [
            unit({ id: "b", cells: [{ x: 3, y: 4 }] }),
            unit({
                id: "a",
                cells: [
                    { x: 2, y: 5 },
                    { x: 2, y: 4 },
                ],
            }),
        ];

        expect(viewerPlacementAlreadyShown(TeamVals.LEFT, live, reordered)).toBe(true);
        expect(viewerPlacementAlreadyShown(TeamVals.LEFT, live, [unit({ id: "a", cells: [{ x: 3, y: 4 }] })])).toBe(
            false,
        );
    });

    test("an earlier drop of the same stacks is a rewind, a new server stack is not", () => {
        const live = [unit({ id: "a", cells: [{ x: 3, y: 4 }] })];
        const earlier = [unit({ id: "a", cells: [{ x: 1, y: 1 }] })];
        const split = [
            unit({ id: "a", amountAlive: 6, cells: [{ x: 1, y: 1 }] }),
            unit({ id: "server-new", amountAlive: 4, cells: [{ x: 3, y: 4 }] }),
        ];

        expect(placementSnapshotWouldRewind(TeamVals.LEFT, live, earlier)).toBe(true);
        expect(placementSnapshotWouldRewind(TeamVals.LEFT, live, live)).toBe(false);
        expect(placementSnapshotWouldRewind(TeamVals.LEFT, live, split)).toBe(false);
        expect(
            shouldHoldOptimisticPlacement({
                now: 2_000,
                holdUntil: 2_000 + OPTIMISTIC_PLACEMENT_HOLD_MS,
                forceRebuild: false,
                wouldRewind: true,
            }),
        ).toBe(true);
        expect(
            shouldHoldOptimisticPlacement({
                now: 2_000,
                holdUntil: 2_000 + OPTIMISTIC_PLACEMENT_HOLD_MS,
                forceRebuild: true,
                wouldRewind: true,
            }),
        ).toBe(false);
        expect(
            shouldHoldOptimisticPlacement({
                now: 4_000,
                holdUntil: 2_000,
                forceRebuild: false,
                wouldRewind: true,
            }),
        ).toBe(false);
    });

    test("the stage and the map stay in the key even when the unit list changes", () => {
        expect(placementContextKey("split:1:private=0|grid:3|unit:1:0,1")).toBe("split:1:private=0|grid:3");
        expect(placementContextKey("legacy|grid:1|unit:1:0,1")).not.toBe(
            placementContextKey("split:1:private=0|grid:1|unit:1:0,1"),
        );
    });

    test("the opponent's hidden stacks do not count as the viewer's board", () => {
        const live = [unit({ id: "mine", team: TeamVals.LEFT })];
        const snapshot = [
            unit({ id: "mine", team: TeamVals.LEFT }),
            unit({ id: "theirs", team: TeamVals.RIGHT, placed: false, cells: [], amountAlive: 8 }),
        ];
        expect(viewerPlacementAlreadyShown(TeamVals.LEFT, live, snapshot)).toBe(true);
        expect(placementSnapshotWouldRewind(TeamVals.LEFT, live, snapshot)).toBe(false);
    });

    test("an empty board is not a rewind, and a stack-size change of the same stacks is", () => {
        const live = [unit({ id: "a", amountAlive: 10 })];
        expect(placementSnapshotWouldRewind(TeamVals.LEFT, [], live)).toBe(false);
        expect(viewerPlacementAlreadyShown(TeamVals.LEFT, [], live)).toBe(false);
        expect(placementSnapshotWouldRewind(TeamVals.LEFT, live, [unit({ id: "a", amountAlive: 6 })])).toBe(true);
        expect(viewerPlacementAlreadyShown(TeamVals.LEFT, live, [unit({ id: "a", placed: false, cells: [] })])).toBe(
            false,
        );
    });

    test("a key with no grid marker is kept whole", () => {
        expect(placementContextKey("legacy-without-grid")).toBe("legacy-without-grid");
    });
});
