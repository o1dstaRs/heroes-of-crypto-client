import { describe, expect, test } from "bun:test";
import { pickFrontmostSpriteHit, type ISpriteHitCandidate } from "./frontmostSpriteHit";

const hit = (unitId: string, depth: number): ISpriteHitCandidate<string> => ({ unit: unitId, unitId, depth });

/**
 * Reported: in ranked, hover shows the sword over an adjacent enemy but the click sometimes does nothing.
 *
 * Hover resolves its target from GRID OCCUPANCY; the click resolved it SPRITE-FIRST. Board sprites stand
 * about a cell and a half tall from the foot line (and up to ~1.7 cells wide for the wide-art creatures),
 * and draw depth is `4000 - position.y` — lower on screen is in front. So an attacker one cell BELOW its
 * target has both a sprite box covering the target's cell AND the higher depth: the click resolved to the
 * player's OWN unit, the "is this an enemy" test failed, and the attack was abandoned with nothing drawn,
 * logged or submitted. Hover kept promising it, so it read as random.
 */
describe("pickFrontmostSpriteHit", () => {
    test("without an exclusion the frontmost (lowest on screen) creature wins", () => {
        // depth = 4000 - y, so the attacker standing below has the greater depth.
        expect(pickFrontmostSpriteHit([hit("target", 3990), hit("attacker", 3995)])).toBe("attacker");
    });

    test("the acting unit never wins a click aimed past it", () => {
        expect(pickFrontmostSpriteHit([hit("target", 3990), hit("attacker", 3995)], "attacker")).toBe("target");
    });

    test("excluding the only candidate yields nothing, so the caller falls back to cell occupancy", () => {
        // Clicking your own cell must still resolve to you — via the caller's grid fallback, not this pick.
        expect(pickFrontmostSpriteHit([hit("attacker", 3995)], "attacker")).toBeUndefined();
    });

    test("still returns the frontmost of the remaining candidates, not merely the first", () => {
        const picked = pickFrontmostSpriteHit([hit("far", 3980), hit("attacker", 3999), hit("near", 3992)], "attacker");
        expect(picked).toBe("near");
    });

    test("an empty pick is undefined", () => {
        expect(pickFrontmostSpriteHit([])).toBeUndefined();
        expect(pickFrontmostSpriteHit([], "attacker")).toBeUndefined();
    });
});
