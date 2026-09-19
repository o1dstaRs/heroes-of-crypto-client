import { describe, expect, test } from "bun:test";

import { images } from "../../generated/image_imports";
import { creatureImgSrc, imgSrc, resolveCreatureImgSrc } from "./creatureImage";

const map = images as Record<string, string>;

// One art set, supplied on purpose: CI swaps the generated manifest for a stub that answers EVERY key
// (scripts/generate_ci_stubs.js), so a size the set lacks — and an unknown creature — can only be exercised
// through an injected lookup. Asserting those against the real manifest passes locally and fails on CI.
const ART_SET: Record<string, string> = {
    peasant_512: "peasant-512.webp",
    griffin_512: "griffin-512.webp",
    wandering_mage_512: "wandering-mage-512.webp",
    hydra_board_128: "hydra-board-128.webp",
};
const artLookup = (key: string): string | undefined => ART_SET[key];

// A unit's small-texture name is derived from its creature config, and the art set does not always hold that
// SIZE — griffin_256 and wandering_mage_128 have no image, their _512 does. The casualty chart used to drop a
// death marker whenever this lookup failed, so an army that was wiped out showed fewer markers than the
// creatures that actually fell (owner report 2026-09-18).
describe("creature portrait lookup", () => {
    test("an exact key wins", () => {
        expect(creatureImgSrc("peasant_512")).toBe(map.peasant_512);
        expect(imgSrc("peasant_512")).toBe(map.peasant_512);
        expect(resolveCreatureImgSrc("peasant_512", artLookup)).toBe(ART_SET.peasant_512);
    });

    test("a size the art set lacks falls back to a size it has", () => {
        expect(ART_SET.griffin_256).toBeUndefined();
        expect(resolveCreatureImgSrc("griffin_256", artLookup)).toBe(ART_SET.griffin_512);

        expect(ART_SET.wandering_mage_128).toBeUndefined();
        expect(resolveCreatureImgSrc("wandering_mage_128", artLookup)).toBe(ART_SET.wandering_mage_512);
    });

    test("takes the board image when no portrait size exists", () => {
        expect(resolveCreatureImgSrc("hydra_256", artLookup)).toBe(ART_SET.hydra_board_128);
    });

    test("every creature portrait the fight screens ask for resolves", () => {
        const unresolved = Object.keys(map)
            .filter((key) => /_(128|256|512)$/.test(key))
            .map((key) => key.replace(/_(128|256|512)$/, ""))
            .filter((base, index, all) => all.indexOf(base) === index)
            .filter((base) => !creatureImgSrc(`${base}_256`));
        expect(unresolved).toEqual([]);
    });

    test("no name and an unknown creature stay undefined — the caller still draws the marker", () => {
        expect(creatureImgSrc(undefined)).toBeUndefined();
        expect(creatureImgSrc("")).toBeUndefined();
        expect(resolveCreatureImgSrc("not_a_creature_512", artLookup)).toBeUndefined();
        expect(resolveCreatureImgSrc("nosize", artLookup)).toBeUndefined();
    });
});
