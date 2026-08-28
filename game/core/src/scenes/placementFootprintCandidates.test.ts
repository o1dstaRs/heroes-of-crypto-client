import { describe, expect, test } from "bun:test";
import { placementFootprintCandidates } from "./placementFootprintCandidates";

const onBoard = (anchor: { x: number; y: number }) => anchor.x >= 1 && anchor.y >= 1 && anchor.x < 16 && anchor.y < 16;
const sig = (cells: { x: number; y: number }[]) =>
    cells
        .map((c) => `${c.x}:${c.y}`)
        .sort()
        .join("|");

/**
 * Reported: selecting a unit already on the board showed a proposed drop position somewhere ELSE, with the
 * mouse never moving.
 *
 * Cause: the candidate order is "cursor cell is the block's minimum corner" first. For a 2x2 that is only
 * true when the cursor sits on the unit's own bottom-left cell — so clicking any of its other three cells
 * proposed a block offset by up to (1,1) from where the creature actually stands. Picking a unit up must
 * propose where it IS until the cursor genuinely moves off it.
 */
describe("placementFootprintCandidates", () => {
    const current2x2 = [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
    ];

    test("every cell of a held 2x2 proposes the block it already occupies", () => {
        for (const cursor of current2x2) {
            const [best] = placementFootprintCandidates(cursor, 2, 2, onBoard, current2x2);
            expect(sig(best)).toBe(sig(current2x2));
        }
    });

    test("without a current footprint the raw cursor-as-minimum-corner order is unchanged", () => {
        // This is the order the move-candidate finder uses; repositioning is the only case that reorders.
        const [best] = placementFootprintCandidates({ x: 5, y: 5 }, 2, 2, onBoard);
        expect(sig(best)).toBe(sig(current2x2));
        const [bestFromTopRight] = placementFootprintCandidates({ x: 6, y: 6 }, 2, 2, onBoard);
        expect(sig(bestFromTopRight)).toBe(
            sig([
                { x: 6, y: 6 },
                { x: 7, y: 6 },
                { x: 6, y: 7 },
                { x: 7, y: 7 },
            ]),
        );
    });

    test("moving the cursor off the unit stops proposing the old spot", () => {
        // A block that no longer covers the cursor is never enumerated, so the preference cannot pin a
        // creature in place once the player actually aims somewhere else.
        const candidates = placementFootprintCandidates({ x: 9, y: 9 }, 2, 2, onBoard, current2x2);
        for (const footprint of candidates) {
            expect(sig(footprint)).not.toBe(sig(current2x2));
        }
        expect(candidates.length).toBeGreaterThan(0);
    });

    test("a 2x1 body prefers its own spot too", () => {
        const current2x1 = [
            { x: 8, y: 4 },
            { x: 7, y: 4 },
        ];
        for (const cursor of current2x1) {
            const [best] = placementFootprintCandidates(cursor, 2, 1, onBoard, current2x1);
            expect(sig(best)).toBe(sig(current2x1));
        }
    });

    test("a 1x1 has exactly one block, and the preference is a no-op", () => {
        const cells = [{ x: 3, y: 3 }];
        expect(placementFootprintCandidates({ x: 3, y: 3 }, 1, 1, onBoard, cells)).toEqual([cells]);
    });

    test("off-board anchors are dropped rather than hashed", () => {
        // An out-of-grid cell packs into (x << 4) | y as a key that collides with a real one.
        for (const footprint of placementFootprintCandidates({ x: 1, y: 1 }, 2, 2, onBoard)) {
            for (const cell of footprint) {
                expect(cell.x).toBeGreaterThanOrEqual(0);
                expect(cell.y).toBeGreaterThanOrEqual(0);
            }
        }
    });
});
